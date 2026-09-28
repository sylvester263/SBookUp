import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Mail, MailOpen, Archive, ArchiveRestore, Reply, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminListMessages, adminUpdateMessage, adminReplyMessage } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/messages")({ component: MessagesPage });

type Folder = "inbox" | "unread" | "archived";
type Msg = {
  id: string; name: string; email: string; phone: string | null; subject: string | null; message: string;
  is_read: boolean; archived_at: string | null; replied_at: string | null; reply_body: string | null; created_at: string;
};

function MessagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListMessages);
  const updFn = useServerFn(adminUpdateMessage);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Msg | null>(null);
  const list = useQuery({
    queryKey: ["admin-messages", folder, search],
    queryFn: () => listFn({ data: { folder, q: search || undefined } }),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-messages"] });
    qc.invalidateQueries({ queryKey: ["admin-unread-messages"] });
  }

  async function update(id: string, patch: { is_read?: boolean; archived?: boolean }) {
    try {
      await updFn({ data: { id, ...patch } });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  function openMessage(m: Msg) {
    setOpen(m);
    if (!m.is_read) update(m.id, { is_read: true });
  }

  const rows = (list.data ?? []) as Msg[];

  return (
    <AdminShell title="Messages">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <Tabs value={folder} onValueChange={(v) => setFolder(v as Folder)}>
            <TabsList>
              <TabsTrigger value="inbox">Inbox</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }} className="flex gap-2 md:w-80">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, text…" className="pl-8" />
            </div>
            <Button type="submit" variant="outline">Search</Button>
          </form>
        </div>
        <div className="divide-y">
          {list.isLoading && <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
          {!list.isLoading && !rows.length && <div className="p-8 text-center text-muted-foreground">No messages</div>}
          {rows.map((m) => (
            <div key={m.id} className={`p-4 flex items-start gap-3 hover:bg-slate-50 cursor-pointer ${m.is_read ? "" : "bg-teal-50/40"}`} onClick={() => openMessage(m)}>
              <div className="pt-0.5">{m.is_read ? <MailOpen className="h-4 w-4 text-muted-foreground" /> : <Mail className="h-4 w-4 text-teal-600" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className={`truncate ${m.is_read ? "" : "font-semibold"}`}>{m.name} <span className="text-xs text-muted-foreground font-normal">&lt;{m.email}&gt;</span></div>
                  <div className="text-xs text-muted-foreground shrink-0">{new Date(m.created_at).toLocaleString()}</div>
                </div>
                <div className="text-sm truncate">{m.subject || "(no subject)"}</div>
                <div className="text-xs text-muted-foreground truncate">{m.message}</div>
                {m.replied_at && <div className="text-xs text-emerald-600 mt-1">Replied {new Date(m.replied_at).toLocaleDateString()}</div>}
              </div>
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="icon" variant="ghost" title={m.is_read ? "Mark unread" : "Mark read"} onClick={() => update(m.id, { is_read: !m.is_read })}>
                  {m.is_read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" title={m.archived_at ? "Move to inbox" : "Archive"} onClick={() => update(m.id, { archived: !m.archived_at })}>
                  {m.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {open && <MessageDetail msg={open} onDone={() => { refresh(); setOpen(null); }} />}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function MessageDetail({ msg, onDone }: { msg: Msg; onDone: () => void }) {
  const replyFn = useServerFn(adminReplyMessage);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const r = await replyFn({ data: { id: msg.id, reply } });
      toast.success(r.logged ? "Reply saved (email not configured — logged on the server only)" : "Reply sent");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <SheetHeader><SheetTitle>{msg.subject || "Message"}</SheetTitle></SheetHeader>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <div className="font-medium">{msg.name}</div>
          <div className="text-muted-foreground">{msg.email}{msg.phone ? ` · ${msg.phone}` : ""}</div>
          <div className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleString()}</div>
        </div>
        <div className="whitespace-pre-wrap border rounded-lg p-3 bg-slate-50">{msg.message}</div>
        {msg.reply_body && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Your reply ({msg.replied_at ? new Date(msg.replied_at).toLocaleString() : ""})</div>
            <div className="whitespace-pre-wrap border rounded-lg p-3">{msg.reply_body}</div>
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium">Reply by email</label>
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={6} placeholder={`Hi ${msg.name},`} />
          <Button onClick={send} disabled={sending || !reply.trim()} className="bg-teal-600 hover:bg-teal-700">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Reply className="h-4 w-4 mr-2" />} Send reply
          </Button>
        </div>
      </div>
    </div>
  );
}
