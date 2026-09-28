import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { schoolsQuery, type School } from "@/lib/schools-data";

export const Route = createFileRoute("/_admin/admin/schools")({ component: SchoolsAdminPage });

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Draft = {
  id?: string;
  name: string;
  slug: string;
  logo_url: string;
  city: string;
  is_featured: boolean;
  sort_order: number;
};

function empty(): Draft {
  return { name: "", slug: "", logo_url: "", city: "Lahore", is_featured: false, sort_order: 0 };
}

const CLASSES = ["Nursery","KG","Class 1","Class 2","Class 3","Class 4","Class 5","Class 6","Class 7","Class 8","Class 9","Class 10"];

function SchoolsAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(schoolsQuery());
  const [drawer, setDrawer] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const onClose = () => setDrawer(null);

  const save = async () => {
    if (!drawer) return;
    if (!drawer.name.trim()) { toast.error("Name is required"); return; }
    const slug = drawer.slug.trim() || slugify(drawer.name);
    setSaving(true);
    try {
      const payload = {
        name: drawer.name.trim(),
        slug,
        logo_url: drawer.logo_url.trim() || null,
        city: drawer.city.trim() || "Lahore",
        is_featured: !!drawer.is_featured,
        sort_order: Number(drawer.sort_order) || 0,
      };
      if (drawer.id) {
        const { error } = await supabase.from("schools").update(payload).eq("id", drawer.id);
        if (error) throw error;
        toast.success("School updated");
      } else {
        const { data: ins, error } = await supabase.from("schools").insert(payload).select("id").single();
        if (error) throw error;
        // Seed default classes for new school
        const schoolId = (ins as any).id;
        const rows = CLASSES.map((c, i) => ({ school_id: schoolId, class_name: c, class_order: i + 1 }));
        await supabase.from("school_classes").insert(rows);
        toast.success("School created with default classes");
      }
      qc.invalidateQueries({ queryKey: ["schools"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this school? All its classes and bundles will be removed.")) return;
    try {
      const { error } = await supabase.from("schools").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <AdminShell title="Schools">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center">
          <p className="text-sm text-muted-foreground">Manage schools that appear in "Find Books by School".</p>
          <Button onClick={() => setDrawer(empty())} className="bg-[#14B8A6] hover:bg-[#0F9488]">
            <Plus className="h-4 w-4 mr-1" /> Add School
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-3">School</th>
              <th className="text-left p-3">Slug</th>
              <th className="text-left p-3">City</th>
              <th className="text-left p-3">Order</th>
              <th className="text-left p-3">Featured</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {(data ?? []).map((s: School) => (
              <tr key={s.id} className="border-t hover:bg-slate-50">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                      {s.logo_url ? (
                        <img src={s.logo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <BookOpen className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <span className="font-medium">{s.name}</span>
                  </div>
                </td>
                <td className="p-3 text-xs font-mono text-muted-foreground">{s.slug}</td>
                <td className="p-3">{s.city}</td>
                <td className="p-3">{s.sort_order}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_featured ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {s.is_featured ? "Featured" : "—"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setDrawer({
                        id: s.id, name: s.name, slug: s.slug,
                        logo_url: s.logo_url ?? "", city: s.city,
                        is_featured: s.is_featured, sort_order: s.sort_order,
                      })}
                      className="p-1.5 hover:bg-slate-100 rounded"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => del(s.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawer?.id ? "Edit School" : "Add School"}</SheetTitle>
          </SheetHeader>
          {drawer && (
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input
                  value={drawer.name}
                  onChange={(e) => setDrawer({ ...drawer, name: e.target.value, slug: drawer.slug || slugify(e.target.value) })}
                  placeholder="Beaconhouse School System"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Slug</label>
                <Input
                  value={drawer.slug}
                  onChange={(e) => setDrawer({ ...drawer, slug: e.target.value })}
                  placeholder="beaconhouse-school-system"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Logo URL</label>
                <Input
                  value={drawer.logo_url}
                  onChange={(e) => setDrawer({ ...drawer, logo_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">City</label>
                <Input value={drawer.city} onChange={(e) => setDrawer({ ...drawer, city: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Sort Order</label>
                <Input
                  type="number"
                  value={drawer.sort_order}
                  onChange={(e) => setDrawer({ ...drawer, sort_order: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Featured on homepage</label>
                <Switch checked={drawer.is_featured} onCheckedChange={(v) => setDrawer({ ...drawer, is_featured: v })} />
              </div>
              {!drawer.id && (
                <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-2">
                  Default classes (Nursery, KG, Class 1–10) will be created automatically.
                </p>
              )}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                <Button onClick={save} disabled={saving} className="flex-1 bg-[#14B8A6] hover:bg-[#0F9488]">
                  {saving ? "Saving…" : drawer.id ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}
