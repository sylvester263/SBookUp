import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });
    const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const roles = (rolesData ?? []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("manager")) {
      throw redirect({ to: "/admin/login", search: { error: "forbidden" } });
    }
    return { user: data.user, roles };
  },
  component: () => <Outlet />,
});
