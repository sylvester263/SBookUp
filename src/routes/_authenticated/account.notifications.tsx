import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMyProfile, updateNotificationPrefs } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/account/notifications")({ component: NotificationsPage });

const ROWS: { key: keyof Prefs; label: string; desc: string }[] = [
  { key: "school_reminders", label: "School reminders", desc: "Back-to-school book list alerts" },
  { key: "order_updates", label: "Order updates", desc: "Status changes for your orders" },
  { key: "restock_alerts", label: "Restock alerts", desc: "When wishlist items return" },
  { key: "newsletter", label: "Newsletter", desc: "Weekly highlights" },
  { key: "promotions", label: "Promotions", desc: "Discounts and offers" },
];

type Prefs = { school_reminders: boolean; newsletter: boolean; order_updates: boolean; promotions: boolean; restock_alerts: boolean };

function NotificationsPage() {
  const getProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateNotificationPrefs);
  const { data } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const [prefs, setPrefs] = useState<Prefs>({ school_reminders: true, newsletter: true, order_updates: true, promotions: false, restock_alerts: false });

  useEffect(() => {
    if (data?.notification_prefs) setPrefs(data.notification_prefs as Prefs);
  }, [data]);

  const save = useMutation({
    mutationFn: () => update({ data: prefs }),
    onSuccess: () => toast.success("Preferences saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-navy mb-6">Notifications</h1>
      <div className="divide-y max-w-xl">
        {ROWS.map((r) => (
          <div key={r.key} className="py-4 flex items-start justify-between gap-4">
            <div>
              <div className="font-medium text-brand-navy">{r.label}</div>
              <div className="text-sm text-muted-foreground">{r.desc}</div>
            </div>
            <Switch checked={prefs[r.key]} onCheckedChange={(v) => setPrefs((p) => ({ ...p, [r.key]: v }))} />
          </div>
        ))}
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="mt-6 bg-brand-teal hover:bg-brand-teal-dark">{save.isPending ? "Saving…" : "Save preferences"}</Button>
    </div>
  );
}
