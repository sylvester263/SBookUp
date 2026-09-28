import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminListBanners, adminUpsertBanner, adminDeleteBanner, adminGetUploadUrl } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_admin/admin/banners")({ component: BannersPage });

function empty() {
  return { id: undefined as string | undefined, title: "", subtitle: "", image_url: "", link_url: "", position: "hero" as const, display_order: 0, is_active: true, valid_from: "", valid_until: "" };
}

function BannersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListBanners);
  const upsertFn = useServerFn(adminUpsertBanner);
  const deleteFn = useServerFn(adminDeleteBanner);
  const uploadFn = useServerFn(adminGetUploadUrl);
  const banners = useQuery({ queryKey: ["admin-banners"], queryFn: () => listFn() });
  const [drawer, setDrawer] = useState<any | null>(null);

  async function del(id: string) {
    if (!confirm("Delete banner?")) return;
    try { await deleteFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["admin-banners"] }); toast.success("Deleted"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <AdminShell title="Banners">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center">
          <p className="text-sm text-muted-foreground">Hero, secondary, sidebar and popup banners.</p>
          <Button onClick={() => setDrawer(empty())} className="bg-[#14B8A6] hover:bg-[#0F9488]"><Plus className="h-4 w-4 mr-1" /> New Banner</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          {banners.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {(banners.data ?? []).map((b: any) => (
            <div key={b.id} className="border rounded-lg overflow-hidden bg-white">
              {b.image_url ? <img src={b.image_url} className="w-full h-40 object-cover" alt={b.title} /> : <div className="h-40 bg-slate-100" />}
              <div className="p-3 flex justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{b.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{b.position} · order {b.display_order} · {b.is_active ? "Active" : "Hidden"}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setDrawer({ ...b, subtitle: b.subtitle ?? "", link_url: b.link_url ?? "", valid_from: b.valid_from?.slice(0, 10) ?? "", valid_until: b.valid_until?.slice(0, 10) ?? "" })} className="p-1.5 hover:bg-slate-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => del(b.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
          {!banners.isLoading && !(banners.data ?? []).length && <p className="text-sm text-muted-foreground col-span-2 text-center py-8">No banners yet</p>}
        </div>
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{drawer?.id ? "Edit banner" : "New banner"}</SheetTitle></SheetHeader>
          {drawer && <BannerForm banner={drawer} uploadFn={uploadFn} onCancel={() => setDrawer(null)} onSave={async (v: any) => {
            try { await upsertFn({ data: v }); toast.success("Saved"); setDrawer(null); qc.invalidateQueries({ queryKey: ["admin-banners"] }); }
            catch (e: any) { toast.error(e?.message ?? "Failed"); }
          }} />}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function BannerForm({ banner, uploadFn, onSave, onCancel }: any) {
  const [b, setB] = useState(banner);
  const set = (k: string, v: any) => setB((p: any) => ({ ...p, [k]: v }));

  async function uploadImage(file: File) {
    try {
      const { prepareUpload, toWebpPath } = await import("@/lib/image-upload");
      const { blob, contentType } = await prepareUpload(file);
      const safeName = toWebpPath(file.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
      const res = await uploadFn({ data: { bucket: "banner-images", filename: safeName } });
      const { error } = await supabase.storage.from("banner-images").uploadToSignedUrl(res.path, res.token, blob, { contentType } as any);
      if (error) return toast.error(error.message);
      set("image_url", res.publicUrl);
      toast.success("Uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  }

  return (
    <div className="space-y-3 mt-4">
      <div><label className="text-xs">Title</label><Input value={b.title} onChange={(e) => set("title", e.target.value)} /></div>
      <div><label className="text-xs">Subtitle</label><Input value={b.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></div>
      <div>
        <label className="text-xs">Image</label>
        {b.image_url && <img src={b.image_url} className="w-full h-32 object-cover rounded mb-2" alt="" />}
        <div className="flex gap-2">
          <Input value={b.image_url} onChange={(e) => set("image_url", e.target.value)} placeholder="https://…" />
          <label className="shrink-0 inline-flex items-center gap-1 text-xs border rounded px-3 py-2 cursor-pointer hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5" /> Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
          </label>
        </div>
      </div>
      <div><label className="text-xs">Link URL</label><Input value={b.link_url} onChange={(e) => set("link_url", e.target.value)} placeholder="/shop/gifts" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs">Position</label>
          <Select value={b.position} onValueChange={(v) => set("position", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hero">Hero</SelectItem>
              <SelectItem value="secondary">Secondary</SelectItem>
              <SelectItem value="sidebar">Sidebar</SelectItem>
              <SelectItem value="popup">Popup</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><label className="text-xs">Display order</label><Input type="number" value={b.display_order} onChange={(e) => set("display_order", Number(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs">Valid from</label><Input type="date" value={b.valid_from} onChange={(e) => set("valid_from", e.target.value)} /></div>
        <div><label className="text-xs">Valid until</label><Input type="date" value={b.valid_until} onChange={(e) => set("valid_until", e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={b.is_active} onCheckedChange={(v) => set("is_active", v)} /> Active</label>
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({
          ...b,
          subtitle: b.subtitle || undefined,
          link_url: b.link_url || undefined,
          valid_from: b.valid_from ? new Date(b.valid_from).toISOString() : null,
          valid_until: b.valid_until ? new Date(b.valid_until).toISOString() : null,
        })} className="bg-[#14B8A6] hover:bg-[#0F9488]">Save</Button>
      </div>
    </div>
  );
}
