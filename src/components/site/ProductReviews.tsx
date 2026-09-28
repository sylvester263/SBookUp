import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { listReviewsForProduct, submitReview, getMyReviewForProduct } from "@/lib/site.functions";
import { Link } from "@tanstack/react-router";

function StarRating({ value, onChange, size = 5 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          disabled={!onChange}
          className={`${onChange ? "cursor-pointer" : "cursor-default"}`}
          aria-label={`${n} star`}
        >
          <Star className={`h-${size} w-${size} ${n <= value ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/40"}`} />
        </button>
      ))}
    </div>
  );
}

export function ProductReviews({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const listFn = useServerFn(listReviewsForProduct);
  const submitFn = useServerFn(submitReview);
  const myReviewFn = useServerFn(getMyReviewForProduct);
  const { data, isLoading } = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => listFn({ data: { productId } }),
  });
  const { data: mine } = useQuery({
    queryKey: ["my-review", productId, user?.id],
    queryFn: () => myReviewFn({ data: { productId } }),
    enabled: !!user,
  });

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sort, setSort] = useState<"recent" | "rating">("recent");
  const [submitting, setSubmitting] = useState(false);

  const reviews = useMemo(() => {
    const list = [...(data?.reviews ?? [])];
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [data, sort]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { toast.error("Please log in to leave a review"); return; }
    setSubmitting(true);
    try {
      await submitFn({ data: { product_id: productId, rating, title, body } });
      toast.success("Review submitted — pending approval");
      setTitle(""); setBody(""); setRating(5);
      qc.invalidateQueries({ queryKey: ["reviews", productId] });
      qc.invalidateQueries({ queryKey: ["my-review", productId, user?.id] });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const total = data?.total ?? 0;
  const avg = data?.average ?? 0;
  const breakdown = data?.breakdown ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="text-center">
          <div className="text-5xl font-bold text-brand-teal">{avg.toFixed(1)}</div>
          <StarRating value={Math.round(avg)} />
          <div className="text-xs text-muted-foreground mt-1">{total} {total === 1 ? "review" : "reviews"}</div>
        </div>
        <div className="md:col-span-2 space-y-2">
          {breakdown.map((b) => {
            const pct = total ? Math.round((b.count / total) * 100) : 0;
            return (
              <div key={b.star} className="flex items-center gap-2 text-xs">
                <span className="w-3">{b.star}</span><Star className="h-3 w-3 fill-brand-gold text-brand-gold" />
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-brand-gold" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-muted-foreground text-right">{b.count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* My review status */}
      {user && mine?.review && (
        <div className="border-t border-border pt-6">
          <div className="font-semibold text-brand-navy mb-2">Your review</div>
          {mine.review.status === "pending" && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
              <span className="font-medium">Under Review</span> — your review is awaiting moderation.
            </div>
          )}
          {mine.review.status === "approved" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm text-emerald-800">
              <span className="font-medium">Published</span> — thanks for sharing your feedback!
            </div>
          )}
          {mine.review.status === "rejected" && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              <span className="font-medium">Not approved</span>
              {mine.review.reject_reason ? <> — {mine.review.reject_reason}</> : null}
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
            <StarRating value={mine.review.rating} />
            {mine.review.title && <span>· {mine.review.title}</span>}
          </div>
        </div>
      )}

      {/* Submit form */}
      {!(user && mine?.review) && (
        <form className="border-t border-border pt-6 space-y-3" onSubmit={onSubmit}>
          <div className="font-semibold text-brand-navy">Write a review</div>
          {!user && (
            <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3">
              <Link to="/auth/login" className="underline font-medium">Log in</Link> to share your experience.
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Your rating:</span>
            <StarRating value={rating} onChange={user ? setRating : undefined} />
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={120} disabled={!user} />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share your thoughts..." rows={3} maxLength={2000} disabled={!user} />
          <Button type="submit" disabled={!user || submitting} className="bg-brand-teal hover:bg-brand-teal-dark">
            {submitting ? "Submitting..." : "Submit Review"}
          </Button>
        </form>
      )}

      {/* Reviews list */}
      <div className="border-t border-border pt-6 space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-semibold text-brand-navy">Customer Reviews</h4>
          <Select value={sort} onValueChange={(v: any) => setSort(v)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="rating">Highest Rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground">Loading reviews…</p>}
        {!isLoading && !reviews.length && (
          <p className="text-sm text-muted-foreground italic">No reviews yet. Be the first to share your thoughts!</p>
        )}
        {reviews.map((r) => (
          <div key={r.id} className="bg-brand-cream/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <StarRating value={r.rating} />
              {r.is_verified_purchase && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                  <ShieldCheck className="h-3 w-3" /> Verified Purchase
                </span>
              )}
            </div>
            {r.title && <div className="font-semibold text-brand-navy text-sm">{r.title}</div>}
            {r.body && <p className="text-sm text-muted-foreground mt-1">{r.body}</p>}
            <div className="text-xs text-muted-foreground mt-2">— {r.author_name}, {new Date(r.created_at).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
