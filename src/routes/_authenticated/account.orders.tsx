import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { listOrders, cancelOrder } from "@/lib/account.functions";
import { pkr } from "@/components/layout/site-chrome";

export const Route = createFileRoute("/_authenticated/account/orders")({ component: OrdersPage });

function statusColor(s: string) {
  const k = s.toLowerCase();
  if (k.includes("deliv") || k.includes("complete")) return "bg-green-100 text-green-700";
  if (k.includes("cancel") || k.includes("fail")) return "bg-red-100 text-red-700";
  if (k.includes("ship")) return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
}

function OrdersPage() {
  const fn = useServerFn(listOrders);
  const { data, isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fn() });
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelOrder);
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    // The server explains why (already shipped, already paid, …)
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not cancel this order"),
  });
  return (
    <div>
      <h1 className="font-display text-xl md:text-2xl font-bold text-brand-navy mb-4 md:mb-6">My Orders</h1>
      {isLoading ? <div className="text-muted-foreground">Loading…</div> :
        !data?.length ? (
          <div className="text-center py-12"><Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No orders yet.</p></div>
        ) : (
          <div className="space-y-3">
            {data.map((o) => (
              <div key={o.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-brand-navy text-sm md:text-base">{o.order_number}</div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full uppercase ${statusColor(o.status)}`}>{o.status}</span>
                </div>
                <div className="text-xs md:text-sm text-muted-foreground mt-1">
                  {new Date(o.created_at).toLocaleDateString()} · {o.order_items.length} items · <span className="font-semibold text-brand-teal">{pkr(Number(o.total))}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="flex-1">View Details</Button>
                  {o.payment_method === "bank_transfer" && (o.payment_status === "pending" || o.payment_status === "failed") && o.status !== "cancelled" && (
                    <Link to="/checkout/success/$orderNumber" params={{ orderNumber: o.order_number }} search={{ payment: undefined }}>
                      <Button variant="outline" size="sm">Upload payment proof</Button>
                    </Link>
                  )}
                  {(o.status === "pending" || o.status === "confirmed") && o.payment_status !== "paid" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10" disabled={cancel.isPending}>
                          Cancel order
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel order {o.order_number}?</AlertDialogTitle>
                          <AlertDialogDescription>This can't be undone. You'll need to place a new order if you change your mind.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep order</AlertDialogCancel>
                          <AlertDialogAction onClick={() => cancel.mutate(o.id)} className="bg-destructive hover:bg-destructive/90">Yes, cancel</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      <Link to="/shop" className="inline-block mt-6 text-brand-teal text-sm hover:underline">← Continue shopping</Link>
    </div>
  );
}
