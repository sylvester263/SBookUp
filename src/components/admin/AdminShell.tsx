import { type ReactNode, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext, useRouter, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Package, Layers, FolderTree, ShoppingBag, Users, Ticket,
  Image as ImageIcon, Megaphone, BarChart3, Settings, History, LogOut, Menu, X, Star,
  ChevronLeft, ChevronRight, ChevronDown, School, Inbox, SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { adminUnreadMessageCount } from "@/lib/admin.functions";
import { useSchoolFeatures } from "@/lib/feature-flags";

type NavItem = { to: string; label: string; icon: any; exact?: boolean; adminOnly?: boolean; group?: "school" };
const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/attributes", label: "Attributes", icon: SlidersHorizontal },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/reviews", label: "Reviews", icon: Star },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/messages", label: "Messages", icon: Inbox },
  { to: "/admin/coupons", label: "Coupons", icon: Ticket },
  { to: "/admin/banners", label: "Banners", icon: ImageIcon },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
  { to: "/admin/logs", label: "Activity Log", icon: History },
  // School features: kept for admins in a collapsed group (hidden on the storefront
  // while "school features" is switched off in Settings).
  { to: "/admin/schools", label: "Schools", icon: School, group: "school" },
  { to: "/admin/school-bundles", label: "School Bundles", icon: Layers, group: "school" },
  { to: "/admin/bundles", label: "Bundles", icon: Layers, group: "school" },
];

export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Roles come from the /_admin route guard. Managers don't see admin-only pages.
  const { roles } = useRouteContext({ from: "/_admin" });
  const isAdmin = roles.includes("admin");
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin);
  const mainNav = nav.filter((n) => !n.group);
  const schoolNav = nav.filter((n) => n.group === "school");
  const schoolFeatures = useSchoolFeatures();
  const [schoolOpen, setSchoolOpen] = useState(() => schoolNav.some((n) => path.startsWith(n.to)));
  const unreadFn = useServerFn(adminUnreadMessageCount);
  const unread = useQuery({ queryKey: ["admin-unread-messages"], queryFn: () => unreadFn(), refetchInterval: 60_000 });
  const unreadCount = unread.data ?? 0;
  const [open, setOpen] = useState(false);
  // Tablet (md..lg): default collapsed icon rail; desktop (lg+): always expanded
  const [tabletExpanded, setTabletExpanded] = useState(false);

  async function logout() {
    await signOut();
    router.navigate({ to: "/admin/login" });
  }

  const isActive = (to: string, exact?: boolean) => (exact ? path === to : path === to || path.startsWith(to + "/"));

  function renderItem({ to, label, icon: Icon, exact }: NavItem, collapsed: boolean) {
            const active = isActive(to, exact);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                title={collapsed ? label : undefined}
                className={`group/item relative flex items-center gap-3 text-sm transition-colors ${
                  collapsed ? "justify-center px-0 py-3" : "px-5 py-2.5"
                } ${
                  active ? "bg-[#14B8A6]/15 text-[#5EEAD4]" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && <span className="absolute left-0 top-0 bottom-0 w-1 bg-white" />}
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
                {to === "/admin/messages" && unreadCount > 0 && (
                  collapsed
                    ? <span className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-[#F59E0B]" aria-label={`${unreadCount} unread`} />
                    : <span className="ml-auto rounded-full bg-[#F59E0B] text-[#1A1A2E] text-[10px] font-bold px-1.5 min-w-5 text-center">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-white text-[#1A1A2E] text-xs font-medium px-2 py-1 shadow opacity-0 group-hover/item:opacity-100 transition z-50">
                    {label}
                  </span>
                )}
              </Link>
            );
  }

  function SidebarInner({ collapsed }: { collapsed: boolean }) {
    return (
      <div className="bg-[#1A1A2E] text-white flex flex-col h-screen sticky top-0 transition-[width] duration-250 ease-out"
        style={{ width: collapsed ? 56 : 240 }}
      >
        <div className={`border-b border-white/10 ${collapsed ? "px-2 py-4 text-center" : "px-5 py-5"}`}>
          {collapsed ? (
            <div className="font-bold text-sm text-[#5EEAD4]">JS</div>
          ) : (
            <>
              <div className="font-semibold text-base leading-tight">SchoolBooksExperts</div>
              <div className="text-xs text-white/60">Admin Panel</div>
            </>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {mainNav.map((item) => renderItem(item, collapsed))}
          {schoolNav.length > 0 && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <button
                type="button"
                onClick={() => setSchoolOpen((v) => !v)}
                title={collapsed ? "School features" : undefined}
                className={`w-full flex items-center gap-3 text-xs uppercase tracking-wide text-white/50 hover:text-white/80 ${collapsed ? "justify-center px-0 py-3" : "px-5 py-2"}`}
                aria-expanded={schoolOpen}
              >
                <School className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex-1 text-left normal-case tracking-normal">
                    School features{schoolFeatures ? "" : " (hidden on store)"}
                  </span>
                )}
                {!collapsed && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${schoolOpen ? "rotate-180" : ""}`} />}
              </button>
              {schoolOpen && schoolNav.map((item) => renderItem(item, collapsed))}
            </div>
          )}
        </nav>
        <div className={`border-t border-white/10 ${collapsed ? "p-2" : "px-5 py-4"}`}>
          {!collapsed && (
            <>
              <div className="text-sm font-medium truncate">{user?.user_metadata?.name ?? "Admin"}</div>
              <div className="text-xs text-white/60 truncate mb-3">{user?.email}</div>
            </>
          )}
          <button
            onClick={logout}
            title={collapsed ? "Logout" : undefined}
            className={`w-full flex items-center justify-center gap-2 text-xs rounded-md py-2 bg-white/10 hover:bg-white/15 ${collapsed ? "px-0" : ""}`}
          >
            <LogOut className="h-3.5 w-3.5" /> {!collapsed && "Logout"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Tablet sidebar (md..lg): collapsible icon rail */}
      <div className="hidden md:block lg:hidden relative">
        <SidebarInner collapsed={!tabletExpanded} />
        <button
          onClick={() => setTabletExpanded((v) => !v)}
          className="absolute bottom-16 -right-3 h-6 w-6 rounded-full bg-white border shadow flex items-center justify-center text-[#1A1A2E] hover:bg-slate-100 z-20"
          aria-label={tabletExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {tabletExpanded ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
      {/* Desktop sidebar (lg+): always expanded */}
      <div className="hidden lg:block"><SidebarInner collapsed={false} /></div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative"><SidebarInner collapsed={false} /></div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b flex items-center px-4 md:px-6 gap-3 sticky top-0 z-30">
          <button className="md:hidden p-2 -ml-2" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Admin / {title}</div>
            <h1 className="text-base font-semibold text-slate-900 truncate">{title}</h1>
          </div>
          <div className="h-9 w-9 rounded-full bg-[#14B8A6]/15 text-[#14B8A6] flex items-center justify-center text-sm font-semibold">
            {(user?.email?.[0] ?? "A").toUpperCase()}
          </div>
        </header>
        <main className="p-4 md:p-6 flex-1">{children}</main>
      </div>
    </div>
  );
}
