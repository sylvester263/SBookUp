import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ShoppingBag, Users, DollarSign, Download } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminReports } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/reports")({ component: ReportsPage });

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

function ReportsPage() {
  const fn = useServerFn(adminReports);
  const { data, isLoading } = useQuery({ queryKey: ["admin-reports"], queryFn: () => fn() });

  function exportTop() {
    if (!data) return;
    const csv = ["name,quantity,revenue"]
      .concat(data.topProducts.map((p) => `"${p.name.replace(/"/g, '""')}",${p.quantity},${p.revenue}`))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "top-products.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading || !data) {
    return <AdminShell title="Reports"><div className="p-6 text-muted-foreground">Loading…</div></AdminShell>;
  }

  const kpis = [
    { label: "Revenue (90d)", value: pkr(data.summary.totalRevenue), icon: DollarSign },
    { label: "Orders (90d)", value: data.summary.orderCount.toLocaleString(), icon: ShoppingBag },
    { label: "Avg Order Value", value: pkr(data.summary.aov), icon: TrendingUp },
    { label: "Unique Customers", value: data.summary.uniqueCustomers.toLocaleString(), icon: Users },
  ];

  return (
    <AdminShell title="Reports">
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-xl p-4 border">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-xl font-semibold mt-1">{k.value}</p>
                </div>
                <k.icon className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-5 border">
            <h3 className="font-semibold mb-4">Monthly Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v: any) => pkr(Number(v))} />
                <Line type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl p-5 border">
            <h3 className="font-semibold mb-4">Monthly Orders</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="orders" fill="#0d9488" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold">Top Products</h3>
            <Button variant="outline" size="sm" onClick={exportTop}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr><th className="p-3">Product</th><th className="p-3 text-right">Units Sold</th><th className="p-3 text-right">Revenue</th></tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3">{p.name}</td>
                    <td className="p-3 text-right">{p.quantity}</td>
                    <td className="p-3 text-right font-medium">{pkr(p.revenue)}</td>
                  </tr>
                ))}
                {!data.topProducts.length && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No sales data yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b"><h3 className="font-semibold">Low Stock Items</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr><th className="p-3">Product</th><th className="p-3 text-right">Stock</th><th className="p-3 text-right">Threshold</th><th className="p-3 text-right">Price</th></tr>
              </thead>
              <tbody>
                {data.lowStock.filter((p: any) => p.stock_quantity <= (p.low_stock_threshold ?? 5)).slice(0, 20).map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">{p.name}</td>
                    <td className="p-3 text-right text-destructive font-medium">{p.stock_quantity}</td>
                    <td className="p-3 text-right text-muted-foreground">{p.low_stock_threshold}</td>
                    <td className="p-3 text-right">{pkr(Number(p.price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
