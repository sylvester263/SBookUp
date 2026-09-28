import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, useDebounced } from "@/components/admin/Pager";
import { adminListCustomers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/customers")({ component: CustomersPage });

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

function CustomersPage() {
  const listFn = useServerFn(adminListCustomers);
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const debouncedQ = useDebounced(q);
  useEffect(() => setPage(1), [debouncedQ]);
  // Server-side search and pagination
  const customers = useQuery({
    queryKey: ["admin-customers", debouncedQ, page],
    queryFn: () => listFn({ data: { q: debouncedQ || undefined, page, pageSize: 50 } }),
    placeholderData: (prev) => prev,
  });
  const filtered: any[] = customers.data?.rows ?? [];

  // Exports every matching customer (all pages), not just the page on screen.
  async function exportCsv() {
    setExporting(true);
    try {
      const all: any[] = [];
      for (let p = 1; p < 1000; p++) {
        const r = await listFn({ data: { q: debouncedQ || undefined, page: p, pageSize: 200 } });
        all.push(...r.rows);
        if (all.length >= r.total || !r.rows.length) break;
      }
      downloadCsv(all);
    } finally {
      setExporting(false);
    }
  }

  function downloadCsv(rows: any[]) {
    const headers = ["email", "name", "phone", "school_name", "count", "total", "last"];
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "customers.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell title="Customers">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, school…" className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>{exporting ? "Exporting…" : "Export CSV"}</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted-foreground">
              <tr><th className="text-left p-2">Customer</th><th className="text-left p-2">Phone</th><th className="text-left p-2">School</th><th className="text-left p-2">Orders</th><th className="text-left p-2">Spent</th><th className="text-left p-2">Last order</th><th className="text-left p-2">Joined</th></tr>
            </thead>
            <tbody>
              {customers.isLoading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
              {filtered.map((c) => (
                <tr key={c.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setDrawer(c)}>
                  <td className="p-2"><div className="font-medium">{c.name ?? "—"}</div><div className="text-xs text-muted-foreground">{c.email}</div></td>
                  <td className="p-2 text-xs">{c.phone ?? "—"}</td>
                  <td className="p-2 text-xs">{c.school_name ?? "—"}</td>
                  <td className="p-2">{c.count}</td>
                  <td className="p-2">{pkr(c.total)}</td>
                  <td className="p-2 text-xs">{c.last ? new Date(c.last).toLocaleDateString() : "—"}</td>
                  <td className="p-2 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {!customers.isLoading && !filtered.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No customers found</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={50} total={customers.data?.total ?? 0} onPage={setPage} loading={customers.isFetching} />
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>{drawer?.name ?? drawer?.email}</SheetTitle></SheetHeader>
          {drawer && (
            <div className="mt-4 space-y-3 text-sm">
              <Row label="Email" value={drawer.email} />
              <Row label="Phone" value={drawer.phone ?? "—"} />
              <Row label="School" value={drawer.school_name ?? "—"} />
              <Row label="Joined" value={new Date(drawer.created_at).toLocaleString()} />
              <div className="border-t pt-3 grid grid-cols-3 gap-3 text-center">
                <Stat label="Orders" value={String(drawer.count)} />
                <Stat label="Lifetime spend" value={pkr(drawer.total)} />
                <Stat label="Last order" value={drawer.last ? new Date(drawer.last).toLocaleDateString() : "—"} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between border-b py-1"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-slate-50 rounded p-2"><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
