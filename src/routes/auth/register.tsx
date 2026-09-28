import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthShell, GoogleIcon } from "@/components/auth/AuthShell";

const schema = z.object({
  name: z.string().trim().min(2, "Name too short").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().regex(/^\+92\d{10}$/, "Use format +92XXXXXXXXXX"),
  school: z.string().trim().max(120).optional().or(z.literal("")),
  password: z.string().min(8, "At least 8 characters").max(72),
  confirm: z.string(),
  terms: z.literal(true, { errorMap: () => ({ message: "Please accept terms" }) }),
}).refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

export const Route = createFileRoute("/auth/register")({
  head: () => ({ meta: [{ title: "Create account — SchoolBooksExperts" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "+92", school: "", password: "", confirm: "" });
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/account", replace: true }); }, [user, navigate]);

  function bind<K extends keyof typeof form>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ ...form, terms });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { name: parsed.data.name, phone: parsed.data.phone, school_name: parsed.data.school },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created! Check your email to verify.");
    navigate({ to: "/auth/login" });
  }

  async function onGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/account" } });
    if (error) toast.error("Google sign-up failed");
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Save time on every order"
      footer={<>Already have an account? <Link to="/auth/login" className="text-brand-teal font-medium">Sign in</Link></>}
    >
      <Button type="button" variant="outline" onClick={onGoogle} className="w-full h-11 gap-2 mb-5">
        <GoogleIcon /> Continue with Google
      </Button>
      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
        <span className="relative bg-white px-3 text-xs uppercase tracking-wider text-muted-foreground">or with email</span>
      </div>
      <form onSubmit={onSubmit} className="space-y-3.5">
        <div className="space-y-1.5"><Label>Full name</Label><Input value={form.name} onChange={bind("name")} required /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={bind("email")} required /></div>
        <div className="space-y-1.5"><Label>Phone (+92XXXXXXXXXX)</Label><Input value={form.phone} onChange={bind("phone")} required /></div>
        <div className="space-y-1.5"><Label>School name (optional)</Label><Input value={form.school} onChange={bind("school")} placeholder="for tailored bundle suggestions" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={form.password} onChange={bind("password")} required /></div>
          <div className="space-y-1.5"><Label>Confirm</Label><Input type="password" value={form.confirm} onChange={bind("confirm")} required /></div>
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground pt-1">
          <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
          <span>I agree to the Terms of Service & Privacy Policy</span>
        </label>
        <Button type="submit" disabled={loading} className="w-full h-11 bg-brand-teal hover:bg-brand-teal-dark mt-2">
          {loading ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
