import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — SchoolBooksExperts" }] }),
  component: Page,
});

function Page() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = z.string().email().safeParse(email);
    if (!v.success) return toast.error("Enter a valid email");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success("Reset link sent to your email");
  }

  return (
    <AuthShell
      title="Forgot password?"
      subtitle="We'll email you a reset link"
      footer={<Link to="/auth/login" className="text-brand-teal font-medium">Back to login</Link>}
    >
      {sent ? (
        <div className="text-center text-sm text-muted-foreground py-4">
          If an account exists for <span className="text-brand-navy font-medium">{email}</span>, a reset link has been sent.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <Button type="submit" disabled={loading} className="w-full h-11 bg-brand-teal hover:bg-brand-teal-dark">
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
