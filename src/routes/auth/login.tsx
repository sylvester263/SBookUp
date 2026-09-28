import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthShell, GoogleIcon } from "@/components/auth/AuthShell";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
});

export const Route = createFileRoute("/auth/login")({
  // Only same-site paths are accepted ("/account", not "//evil.com" or "@evil.com"),
  // otherwise the Google sign-in return URL could be pointed at another site.
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof s.redirect === "string" && isSafeRedirect(s.redirect) ? s.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Login — SchoolBooksExperts" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { user } = useAuth();
  const { redirect = "/account" } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: redirect, replace: true });
  }, [user, navigate, redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    router.invalidate();
    navigate({ to: redirect, replace: true });
  }

  async function onGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + redirect } });
    if (error) toast.error("Google sign-in failed");
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your account"
      footer={<>Don't have an account? <Link to="/auth/register" className="text-brand-teal font-medium">Register</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
            Remember me
          </label>
          <Link to="/auth/forgot-password" className="text-brand-teal hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" disabled={loading} className="w-full h-11 bg-brand-teal hover:bg-brand-teal-dark">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
        <span className="relative bg-white px-3 text-xs uppercase tracking-wider text-muted-foreground">or</span>
      </div>
      <Button type="button" variant="outline" onClick={onGoogle} className="w-full h-11 gap-2">
        <GoogleIcon /> Continue with Google
      </Button>
    </AuthShell>
  );
}
