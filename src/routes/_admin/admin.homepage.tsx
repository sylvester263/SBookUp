import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { SectionEditor, type EditableSection } from "@/components/admin/homepage/SectionEditor";
import {
  adminDeleteHomeSection,
  adminDuplicateHomeSection,
  adminListHomeSections,
  adminReorderHomeSections,
  adminToggleHomeSection,
} from "@/lib/homepage-admin.functions";
import {
  SECTION_LABELS,
  SECTION_TYPES,
  defaultConfig,
  isKnownType,
  sectionStatus,
  type SectionStatus,
  type SectionType,
} from "@/lib/homepage-sections";

export const Route = createFileRoute("/_admin/admin/homepage")({
  component: HomepageAdmin,
});

type Row = Awaited<ReturnType<typeof adminListHomeSections>>[number];

const STATUS: Record<SectionStatus, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-green-100 text-green-800" },
  off: { label: "Off", cls: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-800" },
  ended: { label: "Ended", cls: "bg-amber-100 text-amber-800" },
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : null;

function HomepageAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListHomeSections);
  const reorderFn = useServerFn(adminReorderHomeSections);
  const toggleFn = useServerFn(adminToggleHomeSection);
  const dupFn = useServerFn(adminDuplicateHomeSection);
  const delFn = useServerFn(adminDeleteHomeSection);
  const q = useQuery({ queryKey: ["admin-home-sections"], queryFn: () => listFn() });
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<EditableSection | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    if (q.data) setRows(q.data);
  }, [q.data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-home-sections"] });
    qc.invalidateQueries({ queryKey: ["homepage-sections"] });
  };

  async function saveOrder(next: Row[]) {
    const prev = rows;
    setRows(next);
    try {
      await reorderFn({ data: { ids: next.map((r) => r.id) } });
      refresh();
    } catch (e) {
      setRows(prev);
      toast.error(e instanceof Error ? e.message : "Couldn't save the order");
    }
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    void saveOrder(next);
  };

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const add = (type: SectionType) =>
    setEditing({
      type,
      title: SECTION_LABELS[type],
      subtitle: null,
      config: defaultConfig(type),
      is_active: true,
      starts_at: null,
      ends_at: null,
    });

  return (
    <AdminShell title="Homepage">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every block on the homepage, top to bottom. Drag to reorder (or use the arrows). Sections
          whose products list is empty are hidden automatically.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/?preview=1" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Preview homepage
            </a>
          </Button>
          <Select value="" onValueChange={(t) => add(t as SectionType)}>
            <SelectTrigger className="w-44 bg-teal-600 text-white hover:bg-teal-700">
              <Plus className="mr-1 h-4 w-4" />
              <SelectValue placeholder="Add section" />
            </SelectTrigger>
            <SelectContent>
              {SECTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {SECTION_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {q.error instanceof Error ? q.error.message : "Couldn't load sections"}
        </div>
      )}

      <ol className="divide-y rounded-xl border bg-white">
        {q.isLoading && <li className="p-6 text-center text-sm text-muted-foreground">Loading…</li>}
        {!q.isLoading && !rows.length && !q.error && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            No sections yet. Use "Add section".
          </li>
        )}
        {rows.map((r, i) => {
          const status = sectionStatus(r);
          const type = isKnownType(r.type) ? r.type : null;
          return (
            <li
              key={r.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => setDrag(null)}
              onDrop={() => {
                if (drag != null) move(drag, i);
                setDrag(null);
              }}
              className={`flex flex-wrap items-center gap-3 px-3 py-3 ${drag === i ? "bg-teal-50 opacity-60" : ""}`}
            >
              <GripVertical
                className="h-5 w-5 shrink-0 cursor-grab text-muted-foreground"
                aria-hidden="true"
              />
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, i + 1)}
                  className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {r.title || (type ? SECTION_LABELS[type] : r.type)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[status].cls}`}
                  >
                    {STATUS[status].label}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {type ? SECTION_LABELS[type] : `Unknown type "${r.type}"`}
                  {(r.starts_at || r.ends_at) &&
                    ` · ${r.starts_at ? `from ${fmt(r.starts_at)}` : ""}${r.starts_at && r.ends_at ? " " : ""}${r.ends_at ? `until ${fmt(r.ends_at)}` : ""}`}
                </div>
              </div>
              <Switch
                checked={r.is_active}
                aria-label={`${r.is_active ? "Turn off" : "Turn on"} ${r.title ?? "section"}`}
                onCheckedChange={(v) =>
                  act(
                    () => toggleFn({ data: { id: r.id, is_active: v } }),
                    v ? "Section on" : "Section off",
                  )
                }
              />
              <div className="flex shrink-0">
                {type && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edit"
                    onClick={() =>
                      setEditing({
                        id: r.id,
                        type,
                        title: r.title,
                        subtitle: r.subtitle,
                        config: r.config,
                        is_active: r.is_active,
                        starts_at: r.starts_at,
                        ends_at: r.ends_at,
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Duplicate"
                  onClick={() =>
                    act(() => dupFn({ data: { id: r.id } }), "Duplicated (switched off)")
                  }
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => {
                    if (confirm(`Delete "${r.title ?? r.type}"? This can't be undone.`))
                      void act(() => delFn({ data: { id: r.id } }), "Deleted");
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      {editing && (
        <SectionEditor
          section={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </AdminShell>
  );
}
