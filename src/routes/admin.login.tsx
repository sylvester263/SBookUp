import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/login")({
  validateSearch: (s: Record<string, unknown>): { error?: string } => ({ error: typeof s.error === "string" ? s.error : undefined }),
  component: AdminLoginPage,
});

const schema = z.object({ email: z.string().email(), password: z.string().min(6).max(72) });

function AdminLoginPage() {
  const router = useRouter();
  const { error: forbidden } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error("Enter valid email and password");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw error ?? new Error("Login failed");
      const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const roles = (rolesData ?? []).map((r: any) => r.role);
      if (!roles.includes("admin") && !roles.includes("manager")) {
        await supabase.auth.signOut();
        toast.error("This account is not authorized for the admin panel.");
        return;
      }
      toast.success("Welcome back");
      router.navigate({ to: "/admin" });
    } catch (err: any) {
      toast.error(err?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-xl shadow-2xl p-7 space-y-5">
        <div className="text-center">
          <div className="text-lg font-bold text-slate-900">SchoolBooksExperts</div>
          <div className="text-xs text-muted-foreground">Admin Panel</div>
        </div>
        {forbidden === "forbidden" && (
          <div className="text-xs rounded-md bg-amber-50 text-amber-800 px-3 py-2 border border-amber-200">
            Your account does not have admin access.
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="e">Email</Label>
          <Input id="e" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p">Password</Label>
          <Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" disabled={busy} className="w-full bg-[#14B8A6] hover:bg-[#0F9488]">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <div className="text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-[#14B8A6]">← Back to store</Link>
        </div>
      </form>
    </div>
  );
}
