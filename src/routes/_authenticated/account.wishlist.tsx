import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Trash2 } from "lucide-react";
import { listWishlist, toggleWishlist } from "@/lib/account.functions";
import { pkr } from "@/components/layout/site-chrome";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/account/wishlist")({ component: WishlistPage });

function WishlistPage() {
  const fn = useServerFn(listWishlist);
  const toggle = useServerFn(toggleWishlist);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["wishlist"], queryFn: () => fn() });
  const mut = useMutation({ mutationFn: (pid: string) => toggle({ data: { product_id: pid } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["wishlist"] }) });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-navy mb-6">Wishlist</h1>
      {isLoading ? <div className="text-muted-foreground">Loading…</div> :
        !data?.length ? (
          <div className="text-center py-12"><Heart className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">Your wishlist is empty.</p></div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((w: any) => (
              <div key={w.id} className="border rounded-lg p-3 flex gap-3">
                <img src={w.products?.images?.[0] || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200"} alt="" className="h-20 w-20 rounded object-cover bg-muted" />
                <div className="flex-1 min-w-0">
                  <Link to="/product/$slug" params={{ slug: w.products?.slug }} className="font-medium text-sm text-brand-navy line-clamp-2 hover:text-brand-teal">{w.products?.name}</Link>
                  <div className="text-brand-teal font-semibold text-sm mt-1">{pkr(Number(w.products?.price ?? 0))}</div>
                  <Button size="sm" variant="ghost" onClick={() => mut.mutate(w.product_id)} className="h-7 px-2 mt-1 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
