import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminListActivityLogs, adminActivityLogFilters } from "@/lib/admin.functions";
import { Pager } from "@/components/admin/Pager";

export const Route = createFileRoute("/_admin/admin/logs")({ component: LogsPage });

function actionColor(a: string) {
  if (a.startsWith("delete") || a.startsWith("bulk_delete")) return "text-destructive bg-red-50";
  if (a.startsWith("update") || a.startsWith("bulk_")) return "text-amber-700 bg-amber-50";
  if (a.startsWith("create")) return "text-emerald-700 bg-emerald-50";
  return "text-muted-foreground bg-muted";
}

function LogsPage() {
  const fn = useServerFn(adminListActivityLogs);
  const filtersFn = useServerFn(adminActivityLogFilters);
  const [admin, setAdmin] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Filter options (all staff, recent entity types) and server-side paging.
  const options = useQuery({ queryKey: ["admin-log-filters"], queryFn: () => filtersFn() });
  const admins = useMemo(() => (options.data?.admins ?? []).map((a) => [a.id, a.label] as const), [options.data]);
  const entities = options.data?.entities ?? [];
  const filters = { adminId: admin, entity, from, to };
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [filterKey]);
  const logs = useQuery({
    queryKey: ["admin-logs", filters, page],
    queryFn: () => fn({ data: { ...filters, page, pageSize: 50 } }),
    placeholderData: (prev) => prev,
  });
  const filtered: any[] = logs.data?.rows ?? [];

  return (
    <AdminShell title="Activity Log">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex flex-wrap gap-3 items-end">
          <div className="min-w-[180px]">
            <label className="text-xs text-muted-foreground">Admin</label>
            <Select value={admin} onValueChange={setAdmin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All admins</SelectItem>
                <SelectItem value="system">System / customers</SelectItem>
                {admins.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs text-muted-foreground">Entity</label>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {entities.map((e) => <SelectItem key={e} value={e as string}>{e as string}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Admin</th>
                <th className="p-3">Action</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l: any) => (
                <tr key={l.id} className="border-t align-top">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="p-3">{l.admin?.name || l.admin?.email || (l.admin_id ? l.admin_id.slice(0, 8) + "…" : "system")}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColor(l.action)}`}>{l.action}</span>
                  </td>
                  <td className="p-3">
                    <div className="font-medium capitalize">{l.entity_type ?? "—"}</div>
                    {l.entity_id && <div className="text-xs text-muted-foreground">{l.entity_id.slice(0, 8)}…</div>}
                  </td>
                  <td className="p-3 max-w-md">
                    {l.new_value && (
                      <details>
                        <summary className="cursor-pointer text-xs text-teal-700">View payload</summary>
                        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto max-h-40">{JSON.stringify(l.new_value, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
              {!logs.isLoading && !filtered.length && <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">No activity logs</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={50} total={logs.data?.total ?? 0} onPage={setPage} loading={logs.isFetching} />
      </div>
    </AdminShell>
  );
}
