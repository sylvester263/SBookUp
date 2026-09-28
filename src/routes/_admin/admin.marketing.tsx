import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, useDebounced } from "@/components/admin/Pager";
import {
  adminExportNewsletters,
  adminSendNewsletter,
  adminListCampaigns,
  adminListNewsletters,
  adminListReminders,
  adminUpsertReminder,
  adminDeleteReminder,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/marketing")({ component: MarketingPage });

function emptyReminder() {
  return {
    id: undefined as string | undefined,
    user_id: "",
    reminder_type: "school_supplies",
    trigger_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    message: "",
  };
}

function MarketingPage() {
  const qc = useQueryClient();
  const newsFn = useServerFn(adminListNewsletters);
  const remFn = useServerFn(adminListReminders);
  const upsertFn = useServerFn(adminUpsertReminder);
  const delFn = useServerFn(adminDeleteReminder);

  const exportNewsFn = useServerFn(adminExportNewsletters);
  const [subQ, setSubQ] = useState("");
  const [subStatus, setSubStatus] = useState<"all" | "active" | "unsubscribed">("all");
  const [subPage, setSubPage] = useState(1);
  const debouncedSubQ = useDebounced(subQ);
  useEffect(() => setSubPage(1), [debouncedSubQ, subStatus]);
  // Server-side search / status filter / pagination
  const newsletters = useQuery({
    queryKey: ["admin-newsletters", debouncedSubQ, subStatus, subPage],
    queryFn: () => newsFn({ data: { q: debouncedSubQ || undefined, status: subStatus, page: subPage, pageSize: 50 } }),
    placeholderData: (prev) => prev,
  });
  const reminders = useQuery({ queryKey: ["admin-reminders"], queryFn: () => remFn() });
  const [drawer, setDrawer] = useState<any | null>(null);

  // Exports ALL subscribers (not just the page on screen); values are quoted.
  async function exportCsv() {
    const rows = await exportNewsFn();
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["email,name,subscribed_at,unsubscribed_at"]
      .concat(rows.map((r: any) => [r.email, r.name, r.subscribed_at, r.unsubscribed_at].map(q).join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "newsletter-subscribers.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function save() {
    try {
      await upsertFn({
        data: {
          ...drawer,
          trigger_date: new Date(drawer.trigger_date).toISOString(),
        },
      });
      qc.invalidateQueries({ queryKey: ["admin-reminders"] });
      toast.success("Saved");
      setDrawer(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function del(id: string) {
    if (!confirm("Delete reminder?")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["admin-reminders"] });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <AdminShell title="Marketing">
      <Tabs defaultValue="newsletter" className="space-y-4">
        <TabsList>
          <TabsTrigger value="newsletter">Newsletter</TabsTrigger>
          <TabsTrigger value="campaign">Send Campaign</TabsTrigger>
          <TabsTrigger value="reminders">Seasonal Reminders</TabsTrigger>
        </TabsList>

        <TabsContent value="newsletter">
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-semibold">Subscribers</h3>
                <p className="text-sm text-muted-foreground">{newsletters.data?.total ?? 0} contacts · {newsletters.data?.activeCount ?? 0} active</p>
              </div>
              <div className="flex gap-2 flex-1 justify-end mx-4">
                <Input value={subQ} onChange={(e) => setSubQ(e.target.value)} placeholder="Search email or name…" className="max-w-xs" />
                <select value={subStatus} onChange={(e) => setSubStatus(e.target.value as any)} className="border rounded-md px-2 text-sm">
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="unsubscribed">Unsubscribed</option>
                </select>
              </div>
              <Button onClick={exportCsv} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3">Email</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Subscribed</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(newsletters.data?.rows ?? []).map((n: any) => (
                    <tr key={n.id} className="border-t">
                      <td className="p-3 font-medium flex items-center gap-2"><Mail className="w-3 h-3 text-muted-foreground" />{n.email}</td>
                      <td className="p-3">{n.name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{new Date(n.subscribed_at).toLocaleDateString()}</td>
                      <td className="p-3">{n.unsubscribed_at ? <span className="text-destructive">Unsubscribed</span> : <span className="text-emerald-600">Active</span>}</td>
                    </tr>
                  ))}
                  {!newsletters.isLoading && !newsletters.data?.rows.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No subscribers found</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager page={subPage} pageSize={50} total={newsletters.data?.total ?? 0} onPage={setSubPage} loading={newsletters.isFetching} />
          </div>
        </TabsContent>

        <TabsContent value="campaign">
          <CampaignComposer activeCount={newsletters.data?.activeCount ?? 0} />
        </TabsContent>

        <TabsContent value="reminders">
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-semibold">Seasonal Reminders</h3>
                <p className="text-sm text-muted-foreground">Schedule restock, back-to-school and exam reminders</p>
              </div>
              <Button onClick={() => setDrawer(emptyReminder())} className="bg-teal-600 hover:bg-teal-700">
                <Plus className="w-4 h-4 mr-2" /> New Reminder
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3">Type</th>
                    <th className="p-3">User</th>
                    <th className="p-3">Trigger</th>
                    <th className="p-3">Sent</th>
                    <th className="p-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {(reminders.data ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 font-medium capitalize">{r.reminder_type.replace(/_/g, " ")}</td>
                      <td className="p-3 text-muted-foreground text-xs">{r.user_id.slice(0, 8)}…</td>
                      <td className="p-3">{new Date(r.trigger_date).toLocaleDateString()}</td>
                      <td className="p-3">{r.sent_at ? <span className="text-emerald-600">{new Date(r.sent_at).toLocaleDateString()}</span> : <span className="text-muted-foreground">Pending</span>}</td>
                      <td className="p-3">
                        <Button size="icon" variant="ghost" onClick={() => del(r.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!reminders.data?.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No reminders scheduled</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>New Reminder</SheetTitle></SheetHeader>
          {drawer && (
            <div className="space-y-4 mt-6">
              <div>
                <label className="text-sm font-medium">User ID</label>
                <Input value={drawer.user_id} onChange={(e) => setDrawer({ ...drawer, user_id: e.target.value })} placeholder="UUID of customer" />
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <Input value={drawer.reminder_type} onChange={(e) => setDrawer({ ...drawer, reminder_type: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Trigger Date</label>
                <Input type="date" value={drawer.trigger_date.slice(0, 10)} onChange={(e) => setDrawer({ ...drawer, trigger_date: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Message</label>
                <Textarea value={drawer.message} onChange={(e) => setDrawer({ ...drawer, message: e.target.value })} rows={4} />
              </div>
              <Button onClick={save} className="w-full bg-teal-600 hover:bg-teal-700">Save</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function CampaignComposer({ activeCount }: { activeCount: number }) {
  const qc = useQueryClient();
  const sendFn = useServerFn(adminSendNewsletter);
  const listFn = useServerFn(adminListCampaigns);
  const campaigns = useQuery({ queryKey: ["admin-campaigns"], queryFn: () => listFn() });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(test: boolean) {
    if (!test && !confirm(`Send "${subject}" to ${activeCount} subscribers? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await sendFn({ data: { subject, body, testEmail: test ? testEmail : undefined } });
      if (r.logged) toast.warning(`Email is not configured: ${r.sent} email(s) were only logged on the server`);
      else if (r.failed) toast.error(`Sent ${r.sent}, failed ${r.failed}`);
      else toast.success(test ? `Test sent to ${testEmail}` : `Sent to ${r.sent} subscribers`);
      if (!test) {
        qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
        setSubject("");
        setBody("");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  const ready = subject.trim().length >= 3 && body.trim().length >= 10;
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <h3 className="font-semibold">New newsletter</h3>
          <p className="text-sm text-muted-foreground">Goes to {activeCount} active subscribers. Each email includes a personal unsubscribe link.</p>
        </div>
        <div>
          <label className="text-sm font-medium">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} placeholder="Back-to-school book lists are here" />
        </div>
        <div>
          <label className="text-sm font-medium">Message (plain text — blank line starts a new paragraph)</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} />
        </div>
        <div className="flex flex-col md:flex-row gap-2 md:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium">Send a test first</label>
            <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <Button variant="outline" disabled={busy || !ready || !testEmail} onClick={() => send(true)}>Send test</Button>
          <Button disabled={busy || !ready || activeCount === 0} onClick={() => send(false)} className="bg-teal-600 hover:bg-teal-700">
            <Mail className="w-4 h-4 mr-2" /> Send to {activeCount}
          </Button>
        </div>
      </div>
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b font-semibold">Sent campaigns</div>
        <div className="divide-y text-sm">
          {(campaigns.data ?? []).map((c: any) => (
            <div key={c.id} className="p-3">
              <div className="font-medium truncate">{c.subject}</div>
              <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()} · {c.sent_count} sent{c.failed_count ? `, ${c.failed_count} failed` : ""}</div>
            </div>
          ))}
          {!campaigns.data?.length && <div className="p-6 text-center text-muted-foreground">None yet</div>}
        </div>
      </div>
    </div>
  );
}
