import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — SchoolBooksExperts" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/account" });
  }

  return (
    <AuthShell
      title="Set new password"
      subtitle="Choose a strong password"
      footer={<Link to="/auth/login" className="text-brand-teal font-medium">Back to login</Link>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5"><Label>New password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <div className="space-y-1.5"><Label>Confirm password</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
        <Button type="submit" disabled={loading} className="w-full h-11 bg-brand-teal hover:bg-brand-teal-dark">
          {loading ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
