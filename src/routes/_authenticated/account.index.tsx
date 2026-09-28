import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyProfile, updateMyProfile } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/account/")({
  component: ProfilePage,
});

function ProfilePage() {
  const getProfile = useServerFn(getMyProfile);
  const updateProfile = useServerFn(updateMyProfile);
  const { data, refetch } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const [form, setForm] = useState({ name: "", phone: "+92", school_name: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm({ name: data.name ?? "", phone: data.phone ?? "+92", school_name: data.school_name ?? "" });
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ data: form });
      toast.success("Profile updated");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-navy mb-6">Profile</h1>
      <form onSubmit={save} className="space-y-4 max-w-md">
        <div className="space-y-1.5"><Label>Email</Label><Input value={data?.email ?? ""} disabled /></div>
        <div className="space-y-1.5"><Label>Full name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+92XXXXXXXXXX" /></div>
        <div className="space-y-1.5"><Label>School name</Label><Input value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} /></div>
        <Button type="submit" disabled={saving} className="bg-brand-teal hover:bg-brand-teal-dark">{saving ? "Saving…" : "Save changes"}</Button>
      </form>
    </div>
  );
}
