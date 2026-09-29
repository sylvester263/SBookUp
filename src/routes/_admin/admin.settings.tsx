import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  adminListShippingZones,
  adminUpsertShippingZone,
  adminDeleteShippingZone,
  adminUpdateStoreSettings,
  adminGetPrivateSettings,
  adminUpdatePrivateSettings,
} from "@/lib/admin.functions";
import { getStoreSettings } from "@/lib/site.functions";
import { SiteChromeSettings } from "@/components/admin/SiteChromeSettings";

export const Route = createFileRoute("/_admin/admin/settings")({
  // Store settings and shipping zones are admin-only (managers are redirected).
  beforeLoad: ({ context }) => {
    if (!context.roles.includes("admin")) throw redirect({ to: "/admin" });
  },
  component: SettingsPage,
});

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

function emptyZone() {
  return {
    id: undefined as string | undefined,
    name: "",
    cities: [] as string[],
    base_rate: 200,
    per_kg_rate: 50,
    estimated_days: 3,
    free_shipping_threshold: null as number | null,
    is_active: true,
  };
}

const STORE_DEFAULTS = {
  store_name: "SchoolBooksExperts",
  legal_name: "SchoolBooksExperts",
  footer_text: "© 2026 SchoolBooksExperts. All Rights Reserved.",
  invoice_header: "SchoolBooksExperts",
  order_number_prefix: "SBE",
  contact_email: "worldtimes07@gmail.com",
  contact_phone: "+92 300 0000000",
  address: "Lahore, Pakistan",
  currency: "PKR",
  tax_rate: 0,
  meta_title: "SchoolBooksExperts — Books, Stationery, Gifts, Toys & More in Pakistan",
  meta_description:
    "Shop books, stationery, gifts, toys & games, sports items and character costumes online at SchoolBooksExperts. Delivery across Pakistan.",
  sender_name: "SchoolBooksExperts",
  sender_email: "",
  logo_url: "",
  bank_name: "",
  bank_account_title: "",
  bank_account_number: "",
  bank_iban: "",
  bank_instructions: "",
  enable_cod: true,
  enable_bank_transfer: true,
  school_features_enabled: false,
};

function SettingsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListShippingZones);
  const upsertFn = useServerFn(adminUpsertShippingZone);
  const delFn = useServerFn(adminDeleteShippingZone);
  const settingsFn = useServerFn(getStoreSettings);
  const updateSettingsFn = useServerFn(adminUpdateStoreSettings);
  const zones = useQuery({ queryKey: ["admin-zones"], queryFn: () => listFn() });
  const settingsQuery = useQuery({ queryKey: ["store-settings"], queryFn: () => settingsFn() });
  const [drawer, setDrawer] = useState<any | null>(null);
  const [citiesInput, setCitiesInput] = useState("");

  const [store, setStore] = useState<any>(STORE_DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      const d = settingsQuery.data as any;
      setStore({
        store_name: d.store_name ?? STORE_DEFAULTS.store_name,
        legal_name: d.legal_name ?? "",
        footer_text: d.footer_text ?? "",
        invoice_header: d.invoice_header ?? "",
        order_number_prefix: d.order_number_prefix ?? STORE_DEFAULTS.order_number_prefix,
        contact_email: d.contact_email ?? "",
        contact_phone: d.contact_phone ?? "",
        address: d.address ?? "",
        currency: d.currency ?? "PKR",
        tax_rate: Number(d.tax_rate ?? 0),
        meta_title: d.meta_title ?? "",
        meta_description: d.meta_description ?? "",
        sender_name: d.sender_name ?? "",
        sender_email: d.sender_email ?? "",
        logo_url: d.logo_url ?? "",
        bank_name: d.bank_name ?? "",
        bank_account_title: d.bank_account_title ?? "",
        bank_account_number: d.bank_account_number ?? "",
        bank_iban: d.bank_iban ?? "",
        bank_instructions: d.bank_instructions ?? "",
        enable_cod: d.enable_cod !== false,
        enable_bank_transfer: d.enable_bank_transfer !== false,
        school_features_enabled: d.school_features_enabled === true,
      });
    }
  }, [settingsQuery.data]);

  async function saveStore() {
    setSaving(true);
    try {
      await updateSettingsFn({ data: store });
      qc.invalidateQueries({ queryKey: ["store-settings"] });
      toast.success("Store settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function openZone(z?: any) {
    if (z) {
      setDrawer({ ...z });
      setCitiesInput((z.cities ?? []).join(", "));
    } else {
      setDrawer(emptyZone());
      setCitiesInput("");
    }
  }

  async function saveZone() {
    try {
      const cities = citiesInput.split(",").map((c) => c.trim()).filter(Boolean);
      await upsertFn({
        data: {
          id: drawer.id,
          name: drawer.name,
          cities,
          base_rate: Number(drawer.base_rate) || 0,
          per_kg_rate: Number(drawer.per_kg_rate) || 0,
          estimated_days: Number(drawer.estimated_days) || 3,
          free_shipping_threshold: drawer.free_shipping_threshold == null ? null : Number(drawer.free_shipping_threshold),
          is_active: !!drawer.is_active,
        },
      });
      qc.invalidateQueries({ queryKey: ["admin-zones"] });
      toast.success("Saved");
      setDrawer(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function delZone(id: string) {
    if (!confirm("Delete shipping zone?")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["admin-zones"] });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <AdminShell title="Settings">
      <Tabs defaultValue="store" className="space-y-4">
        <TabsList>
          <TabsTrigger value="store">Store Info</TabsTrigger>
          <TabsTrigger value="chrome">Header &amp; Footer</TabsTrigger>
          <TabsTrigger value="shipping">Shipping Zones</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="homepage">Homepage</TabsTrigger>
          <TabsTrigger value="seo">SEO & Email</TabsTrigger>
        </TabsList>

        <TabsContent value="store">
          <div className="bg-white rounded-xl border p-6 max-w-2xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Store Name</label>
                <Input value={store.store_name} onChange={(e) => setStore({ ...store, store_name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Legal Name</label>
                <Input value={store.legal_name} onChange={(e) => setStore({ ...store, legal_name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Order Number Prefix (new orders only)</label>
                <Input
                  value={store.order_number_prefix}
                  onChange={(e) => setStore({ ...store, order_number_prefix: e.target.value.toUpperCase() })}
                  maxLength={8}
                />
                <p className="text-xs text-muted-foreground mt-1">e.g. SBE → SBE-20260929-0001. Existing orders keep their numbers.</p>
              </div>
              <div>
                <label className="text-sm font-medium">Currency</label>
                <Input value={store.currency} onChange={(e) => setStore({ ...store, currency: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Contact Email</label>
                <Input type="email" value={store.contact_email} onChange={(e) => setStore({ ...store, contact_email: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Contact Phone</label>
                <Input value={store.contact_phone} onChange={(e) => setStore({ ...store, contact_phone: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Address</label>
                <Textarea value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} rows={2} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Logo URL (header, footer and emails; about 400×110 px, PNG or SVG)</label>
                <Input value={store.logo_url} onChange={(e) => setStore({ ...store, logo_url: e.target.value })} placeholder="https://…/logo.png" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Footer Copyright Text</label>
                <Input value={store.footer_text} onChange={(e) => setStore({ ...store, footer_text: e.target.value })} placeholder="© 2026 SchoolBooksExperts. All Rights Reserved." />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Invoice Header (printed invoices)</label>
                <Textarea value={store.invoice_header} onChange={(e) => setStore({ ...store, invoice_header: e.target.value })} rows={2} />
              </div>
              <div>
                <label className="text-sm font-medium">Tax Rate (%)</label>
                <Input type="number" value={store.tax_rate} onChange={(e) => setStore({ ...store, tax_rate: Number(e.target.value) })} />
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 border rounded-lg p-3">
              <span>
                <span className="font-medium text-sm">Show school features on the store</span>
                <span className="block text-xs text-muted-foreground">
                  School bundles, bundles, "Find books by school" and school/class pages. When off they are hidden
                  (pages return 404, bundles can't be ordered) but nothing is deleted.
                </span>
              </span>
              <Switch checked={!!store.school_features_enabled} onCheckedChange={(v) => setStore({ ...store, school_features_enabled: v })} />
            </label>
            <Button onClick={saveStore} disabled={saving} className="bg-teal-600 hover:bg-teal-700">{saving ? "Saving..." : "Save Store Settings"}</Button>
          </div>
        </TabsContent>


        <TabsContent value="chrome">
          <SiteChromeSettings settings={settingsQuery.data as Record<string, unknown> | undefined} />
        </TabsContent>

        <TabsContent value="shipping">
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold">Shipping Zones</h3>
              <Button onClick={() => openZone()} className="bg-teal-600 hover:bg-teal-700">
                <Plus className="w-4 h-4 mr-2" /> New Zone
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Cities</th>
                    <th className="p-3 text-right">Base</th>
                    <th className="p-3 text-right">Per kg</th>
                    <th className="p-3 text-right">Days</th>
                    <th className="p-3 text-right">Free over</th>
                    <th className="p-3">Active</th>
                    <th className="p-3 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {(zones.data ?? []).map((z: any) => (
                    <tr key={z.id} className="border-t">
                      <td className="p-3 font-medium">{z.name}</td>
                      <td className="p-3 text-muted-foreground text-xs max-w-xs truncate">{(z.cities ?? []).join(", ") || "—"}</td>
                      <td className="p-3 text-right">{pkr(Number(z.base_rate))}</td>
                      <td className="p-3 text-right">{pkr(Number(z.per_kg_rate))}</td>
                      <td className="p-3 text-right">{z.estimated_days}</td>
                      <td className="p-3 text-right">{z.free_shipping_threshold != null ? pkr(Number(z.free_shipping_threshold)) : "—"}</td>
                      <td className="p-3">{z.is_active ? <span className="text-emerald-600">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openZone(z)}><Pencil className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => delZone(z.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!zones.data?.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No zones configured</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <div className="bg-white rounded-xl border p-6 max-w-2xl space-y-5">
            <div>
              <h3 className="font-semibold">Payment methods at checkout</h3>
              <p className="text-sm text-muted-foreground">The database refuses orders for any method switched off here.</p>
            </div>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-4 border rounded-lg p-3">
                <span><span className="font-medium text-sm">Cash on Delivery</span><span className="block text-xs text-muted-foreground">PKR 150 COD fee is added at checkout</span></span>
                <Switch checked={store.enable_cod} onCheckedChange={(v) => setStore({ ...store, enable_cod: v })} />
              </label>
              <label className="flex items-center justify-between gap-4 border rounded-lg p-3">
                <span><span className="font-medium text-sm">Bank Transfer</span><span className="block text-xs text-muted-foreground">Customer uploads a payment screenshot; staff mark the order paid</span></span>
                <Switch checked={store.enable_bank_transfer} onCheckedChange={(v) => setStore({ ...store, enable_bank_transfer: v })} />
              </label>
              {["JazzCash", "EasyPaisa"].map((w) => (
                <div key={w} className="flex items-center justify-between gap-4 border rounded-lg p-3 opacity-60">
                  <span><span className="font-medium text-sm">{w}</span><span className="block text-xs text-muted-foreground">Not connected yet — needs merchant credentials and gateway setup</span></span>
                  <Switch checked={false} disabled />
                </div>
              ))}
            </div>
            <div className="border-t pt-5 space-y-4">
              <h3 className="font-semibold">Bank account (shown to customers who choose Bank Transfer)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Bank name</label>
                  <Input value={store.bank_name} onChange={(e) => setStore({ ...store, bank_name: e.target.value })} placeholder="e.g. Meezan Bank" />
                </div>
                <div>
                  <label className="text-sm font-medium">Account title</label>
                  <Input value={store.bank_account_title} onChange={(e) => setStore({ ...store, bank_account_title: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Account number</label>
                  <Input value={store.bank_account_number} onChange={(e) => setStore({ ...store, bank_account_number: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">IBAN</label>
                  <Input value={store.bank_iban} onChange={(e) => setStore({ ...store, bank_iban: e.target.value })} placeholder="PK00XXXX…" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium">Instructions (optional)</label>
                  <Textarea value={store.bank_instructions} onChange={(e) => setStore({ ...store, bank_instructions: e.target.value })} rows={2} placeholder="Use your order number as the payment reference." />
                </div>
              </div>
            </div>
            <Button onClick={saveStore} disabled={saving} className="bg-teal-600 hover:bg-teal-700">{saving ? "Saving..." : "Save Payment Settings"}</Button>
          </div>
        </TabsContent>

        <TabsContent value="homepage">
          <div className="bg-white rounded-xl border p-6 max-w-2xl space-y-3">
            <p className="text-sm">The homepage is now built from sections: hero slider, product carousels, banners, "Shop by Price" and more.</p>
            <Button asChild className="bg-teal-600 hover:bg-teal-700"><Link to="/admin/homepage">Open Admin → Homepage</Link></Button>
          </div>
        </TabsContent>

        <TabsContent value="seo">
          <div className="bg-white rounded-xl border p-6 max-w-2xl space-y-4">
            <h3 className="font-semibold">Default SEO</h3>
            <div>
              <label className="text-sm font-medium">Meta Title Template</label>
              <Input value={store.meta_title} onChange={(e) => setStore({ ...store, meta_title: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Meta Description</label>
              <Textarea value={store.meta_description} onChange={(e) => setStore({ ...store, meta_description: e.target.value })} rows={3} />
            </div>
            <h3 className="font-semibold pt-4">Email Notifications</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Sender Name</label>
                <Input value={store.sender_name} onChange={(e) => setStore({ ...store, sender_name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Sender Email</label>
                <Input type="email" value={store.sender_email} onChange={(e) => setStore({ ...store, sender_email: e.target.value })} />
              </div>
            </div>
            <Button onClick={saveStore} disabled={saving} className="bg-teal-600 hover:bg-teal-700">{saving ? "Saving..." : "Save Settings"}</Button>
          </div>
          <PrivateSettingsCard />
        </TabsContent>

      </Tabs>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader><SheetTitle>{drawer?.id ? "Edit Zone" : "New Shipping Zone"}</SheetTitle></SheetHeader>
          {drawer && (
            <div className="space-y-4 mt-6">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={drawer.name} onChange={(e) => setDrawer({ ...drawer, name: e.target.value })} placeholder="e.g. Karachi Metro" />
              </div>
              <div>
                <label className="text-sm font-medium">Cities (comma-separated)</label>
                <Textarea value={citiesInput} onChange={(e) => setCitiesInput(e.target.value)} rows={3} placeholder="Karachi, Hyderabad, Sukkur" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Base Rate</label>
                  <Input type="number" value={drawer.base_rate} onChange={(e) => setDrawer({ ...drawer, base_rate: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Per kg</label>
                  <Input type="number" value={drawer.per_kg_rate} onChange={(e) => setDrawer({ ...drawer, per_kg_rate: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Days</label>
                  <Input type="number" value={drawer.estimated_days} onChange={(e) => setDrawer({ ...drawer, estimated_days: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Free delivery when order is at least (PKR)</label>
                <Input
                  type="number"
                  value={drawer.free_shipping_threshold ?? ""}
                  onChange={(e) => setDrawer({ ...drawer, free_shipping_threshold: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="Leave empty for no free delivery"
                />
                <p className="text-xs text-muted-foreground mt-1">Delivery = base rate + total weight (kg) × per-kg rate. Checked against the subtotal after discounts. The COD fee still applies.</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={drawer.is_active} onCheckedChange={(v) => setDrawer({ ...drawer, is_active: v })} />
                <span className="text-sm">Active</span>
              </div>
              <Button onClick={saveZone} className="w-full bg-teal-600 hover:bg-teal-700">Save Zone</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

/** Admin-only: admin emails and notification recipients (store_private_settings). */
function PrivateSettingsCard() {
  const getFn = useServerFn(adminGetPrivateSettings);
  const saveFn = useServerFn(adminUpdatePrivateSettings);
  const q = useQuery({ queryKey: ["admin-private-settings"], queryFn: () => getFn() });
  const [f, setF] = useState({ admin_emails: "", order_notification_email: "", contact_form_email: "", reply_to_email: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data) {
      setF({
        admin_emails: (q.data.admin_emails ?? []).join("\n"),
        order_notification_email: q.data.order_notification_email ?? "",
        contact_form_email: q.data.contact_form_email ?? "",
        reply_to_email: q.data.reply_to_email ?? "",
      });
    }
  }, [q.data]);

  async function save() {
    setSaving(true);
    try {
      const admin_emails = f.admin_emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
      const r = await saveFn({ data: { ...f, admin_emails } });
      q.refetch();
      toast.success(r.granted ? `Saved — ${r.granted} account(s) given admin access` : "Notification settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: "order_notification_email" | "contact_form_email" | "reply_to_email", label: string) => (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <Input type="email" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </div>
  );

  return (
    <div className="bg-white rounded-xl border p-6 max-w-2xl space-y-4 mt-4">
      <div>
        <h3 className="font-semibold">Notifications &amp; admin access</h3>
        <p className="text-sm text-muted-foreground">Private: only admins can see these. Empty fields fall back to the store contact email.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {field("order_notification_email", "New order alerts to")}
        {field("contact_form_email", "Contact form messages to")}
        {field("reply_to_email", "Reply-to on customer emails")}
      </div>
      <div>
        <label className="text-sm font-medium">Admin emails (one per line)</label>
        <Textarea value={f.admin_emails} onChange={(e) => setF({ ...f, admin_emails: e.target.value })} rows={3} />
        <p className="text-xs text-muted-foreground mt-1">
          An account with one of these emails gets admin access once its email is verified (Google sign-in or the
          confirmation link). Removing an email here does not remove anyone's access.
        </p>
      </div>
      <Button onClick={save} disabled={saving || q.isLoading} className="bg-teal-600 hover:bg-teal-700">
        {saving ? "Saving..." : "Save Notification Settings"}
      </Button>
    </div>
  );
}
