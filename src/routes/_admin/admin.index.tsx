import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { ShoppingBag, DollarSign, Package, Users, ArrowUp, ArrowDown } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getDashboardStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/")({
  component: DashboardPage,
});

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;
const COLORS = ["#14B8A6", "#3B82F6", "#F59E0B", "#1A1A2E", "#EF4444", "#8B5CF6"];

function KPI({ label, value, change, icon: Icon, color }: any) {
  const up = change >= 0;
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1 text-slate-900">{value}</div>
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center`} style={{ background: color + "20", color }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {change !== undefined && (
        <div className={`text-xs mt-2 flex items-center gap-1 ${up ? "text-emerald-600" : "text-red-600"}`}>
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(change)}% vs yesterday
        </div>
      )}
    </div>
  );
}

function DashboardPage() {
  const fn = useServerFn(getDashboardStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-dash"], queryFn: () => fn() });

  return (
    <AdminShell title="Dashboard">
      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">Loading dashboard…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Today's Orders" value={data.kpis.todayOrders} change={data.kpis.ordersChange} icon={ShoppingBag} color="#3B82F6" />
            <KPI label="Today's Revenue" value={pkr(data.kpis.todayRevenue)} change={data.kpis.revenueChange} icon={DollarSign} color="#14B8A6" />
            <KPI label="Active Products" value={data.kpis.totalProducts} icon={Package} color="#F59E0B" />
            <KPI label="Customers" value={data.kpis.activeCustomers} icon={Users} color="#1A1A2E" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-4 lg:col-span-2">
              <div className="text-sm font-semibold mb-3">Revenue · last 30 days</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.revenueSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => pkr(v)} />
                  <Line type="monotone" dataKey="revenue" stroke="#14B8A6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-sm font-semibold mb-3">Payment methods · 30d</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.paymentSeries} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {data.paymentSeries.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <div className="text-sm font-semibold mb-3">Orders by category · last 7 days</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.categorySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="text-sm font-semibold">Recent orders</div>
                <Link to="/admin/orders" className="text-xs text-[#14B8A6] hover:underline">View all</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-muted-foreground">
                    <tr><th className="text-left p-2">Order</th><th className="text-left p-2">Customer</th><th className="text-left p-2">Total</th><th className="text-left p-2">Status</th></tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o: any) => (
                      <tr key={o.id} className="border-t">
                        <td className="p-2 font-mono text-xs">{o.order_number}</td>
                        <td className="p-2 truncate max-w-[140px]">{o.shipping_address?.name ?? "—"}</td>
                        <td className="p-2">{pkr(Number(o.total))}</td>
                        <td className="p-2"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 capitalize">{o.status}</span></td>
                      </tr>
                    ))}
                    {!data.recentOrders.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No orders yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white rounded-xl border">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="text-sm font-semibold">Low stock alerts</div>
                <Link to="/admin/products" className="text-xs text-[#14B8A6] hover:underline">Manage</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-muted-foreground">
                    <tr><th className="text-left p-2">Product</th><th className="text-left p-2">Category</th><th className="text-left p-2">Stock</th><th className="text-left p-2">Threshold</th></tr>
                  </thead>
                  <tbody>
                    {data.lowStock.map((p: any) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2 truncate max-w-[180px]">{p.name}</td>
                        <td className="p-2 text-xs text-muted-foreground">{p.category_name ?? p.categories?.name ?? "—"}</td>
                        <td className="p-2"><span className={`text-xs font-semibold ${p.stock_quantity === 0 ? "text-red-600" : "text-amber-600"}`}>{p.stock_quantity}</span></td>
                        <td className="p-2 text-xs text-muted-foreground">{p.low_stock_threshold}</td>
                      </tr>
                    ))}
                    {!data.lowStock.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">All stocked up</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
