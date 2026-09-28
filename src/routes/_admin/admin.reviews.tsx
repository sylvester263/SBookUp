import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Star, ShieldCheck, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager } from "@/components/admin/Pager";
import { adminListReviews, adminModerateReview } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/reviews")({ component: ReviewsPage });

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const QUICK_REASONS = [
  "Contains inappropriate language",
  "Not related to this product",
  "Spam or promotional content",
  "Fake or misleading review",
];

function Stars({ value }: { value: number }) {
  return (
    <div className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
      ))}
    </div>
  );
}

function ReviewsPage() {
  const listFn = useServerFn(adminListReviews);
  const [tab, setTab] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  // Server-side status filter + pagination; counts come from the server too.
  const reviewsQ = useQuery({
    queryKey: ["admin-reviews", tab, page],
    queryFn: () => listFn({ data: { status: tab, page, pageSize: 50 } }),
    placeholderData: (prev) => prev,
  });
  const isLoading = reviewsQ.isLoading;
  const filtered: any[] = useMemo(() => reviewsQ.data?.rows ?? [], [reviewsQ.data]);
  const counts = reviewsQ.data?.counts ?? { all: 0, pending: 0, approved: 0, rejected: 0 };
  const current = useMemo(() => filtered.find((r: any) => r.id === openId) ?? null, [filtered, openId]);

  return (
    <AdminShell title="Reviews">
      <div className="bg-white rounded-xl border">
        <div className="flex flex-wrap gap-2 p-3 border-b">
          {(["pending", "approved", "rejected", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={`px-3 py-1.5 text-xs rounded-full capitalize ${tab === t ? "bg-[#14B8A6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t} <span className="ml-1 opacity-70">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Product</th>
                <th className="text-left p-2">Reviewer</th>
                <th className="text-left p-2">Rating</th>
                <th className="text-left p-2">Title</th>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setOpenId(r.id)}>
                  <td className="p-2 max-w-[220px]">
                    <div className="flex items-center gap-2">
                      {r.products?.images?.[0] && <img src={r.products.images[0]} alt="" className="h-8 w-8 rounded object-cover" />}
                      <span className="truncate">{r.products?.name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="p-2 text-xs">{r.reviewer?.name ?? "—"}<div className="text-muted-foreground">{r.reviewer?.email}</div></td>
                  <td className="p-2"><Stars value={r.rating} /></td>
                  <td className="p-2 max-w-[200px] truncate">{r.title ?? "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[r.status] ?? "bg-slate-100"}`}>{r.status}</span></td>
                </tr>
              ))}
              {!isLoading && !filtered.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No reviews</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={50} total={reviewsQ.data?.total ?? 0} onPage={setPage} loading={reviewsQ.isFetching} />
      </div>

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {current && <ReviewDetail review={current} onClose={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function ReviewDetail({ review, onClose }: { review: any; onClose: () => void }) {
  const qc = useQueryClient();
  const modFn = useServerFn(adminModerateReview);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState(review.reject_reason ?? "");
  const [busy, setBusy] = useState(false);

  async function moderate(action: "approved" | "rejected", reject_reason?: string) {
    setBusy(true);
    try {
      await modFn({ data: { id: review.id, action, reject_reason } });
      await qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast.success(action === "approved" ? "Review approved and published" : "Review rejected");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SheetHeader><SheetTitle>Review details</SheetTitle></SheetHeader>
      <div className="space-y-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <Stars value={review.rating} />
          {review.is_verified_purchase && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
              <ShieldCheck className="h-3 w-3" /> Verified Purchase
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ml-auto ${STATUS_COLOR[review.status]}`}>{review.status}</span>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">Product</div>
          <a href={`/product/${review.products?.slug}`} target="_blank" rel="noopener" className="font-medium text-brand-teal hover:underline">{review.products?.name}</a>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">Reviewer</div>
          <div>{review.reviewer?.name ?? "Customer"}</div>
          <div className="text-xs text-muted-foreground">{review.reviewer?.email}</div>
        </div>

        {review.title && <div><div className="text-xs text-muted-foreground">Title</div><div className="font-medium">{review.title}</div></div>}
        {review.body && <div><div className="text-xs text-muted-foreground">Review</div><p className="whitespace-pre-wrap">{review.body}</p></div>}

        {review.status === "rejected" && review.reject_reason && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
            <div className="text-xs font-semibold">Rejection reason</div>
            <div className="text-xs">{review.reject_reason}</div>
          </div>
        )}

        {!rejectOpen ? (
          <div className="flex gap-2 pt-2 border-t">
            <Button onClick={() => moderate("approved")} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1">
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button onClick={() => setRejectOpen(true)} disabled={busy} variant="destructive" className="flex-1">
              <XIcon className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        ) : (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs font-medium">Reason for rejection</div>
            <div className="flex flex-wrap gap-1">
              {QUICK_REASONS.map((q) => (
                <button key={q} type="button" onClick={() => setReason(q)} className="text-[11px] px-2 py-1 rounded-full bg-slate-100 hover:bg-slate-200">{q}</button>
              ))}
            </div>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Explain why this review is being rejected…" maxLength={500} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy} className="flex-1">Cancel</Button>
              <Button onClick={() => moderate("rejected", reason.trim())} disabled={busy || !reason.trim()} variant="destructive" className="flex-1">Confirm reject</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
