import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { User as UserIcon, Package, Heart, MapPin, Bell, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteShell } from "@/components/layout/site-chrome";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth/login" });
    return { user: data.user };
  },
  component: AccountLayout,
});

const NAV = [
  { to: "/account", label: "Profile", icon: UserIcon },
  { to: "/account/orders", label: "My Orders", icon: Package },
  { to: "/account/wishlist", label: "Wishlist", icon: Heart },
  { to: "/account/addresses", label: "Addresses", icon: MapPin },
  { to: "/account/notifications", label: "Notifications", icon: Bell },
] as const;

function AccountLayout() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  async function logout() {
    await signOut();
    router.navigate({ to: "/" });
  }
  return (
    <SiteShell>
      {/* Mobile: top tab bar */}
      <div className="md:hidden bg-white border-b sticky top-14 z-30">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-10 w-10 rounded-full bg-brand-teal/10 text-brand-teal flex items-center justify-center font-semibold shrink-0">
            {(user?.email?.[0] ?? "U").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-brand-navy truncate text-sm">{user?.user_metadata?.name ?? "Account"}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button onClick={logout} className="p-2 text-destructive" aria-label="Logout">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex overflow-x-auto hide-scrollbar">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/account" }}
              activeProps={{ className: "border-brand-teal text-brand-teal" }}
              className="flex flex-col items-center gap-1 px-4 py-3 text-xs whitespace-nowrap border-b-2 border-transparent text-brand-navy shrink-0 min-w-[72px]"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="container mx-auto px-4 py-4 md:py-8">
        <div className="md:grid md:grid-cols-[240px_1fr] md:gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden md:block bg-white rounded-xl border p-5 h-fit md:sticky md:top-24">
            <div className="flex items-center gap-3 pb-4 border-b">
              <div className="h-11 w-11 rounded-full bg-brand-teal/10 text-brand-teal flex items-center justify-center font-semibold">
                {(user?.email?.[0] ?? "U").toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-brand-navy truncate text-sm">{user?.user_metadata?.name ?? "Account"}</div>
                <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
              </div>
            </div>
            <nav className="mt-3 flex flex-col gap-1">
              {NAV.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} activeOptions={{ exact: to === "/account" }}
                  activeProps={{ className: "bg-brand-teal/10 text-brand-teal" }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-brand-navy hover:bg-muted whitespace-nowrap">
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              ))}
              <button onClick={logout} className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 whitespace-nowrap">
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </nav>
          </aside>
          <main className="bg-white rounded-xl border p-4 md:p-6"><Outlet /></main>
        </div>
      </div>
    </SiteShell>
  );
}

