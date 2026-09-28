// Add-to-cart with feedback, shared by the product card and the quick-view
// modal. Same rules as the product page: capped at stock; the price is display
// only (the server re-prices at checkout).
import { toast } from "sonner";
import { cartStore } from "@/lib/cart-store";

export type AddInput = {
  productId: string;
  variantId?: string | null;
  name: string;
  image?: string;
  price: number;
  slug: string;
  quantity?: number;
  /** Units in stock; the cart line never goes above it. */
  stock?: number | null;
  /** Opens the cart from the toast's "View cart" button. */
  onViewCart?: () => void;
};

/** Returns the number of units added (0 = nothing added). */
export function addToCartWithFeedback(i: AddInput): number {
  const qty = i.quantity ?? 1;
  if (i.stock != null && i.stock <= 0) {
    toast.error(`${i.name} is out of stock`);
    return 0;
  }
  const added = cartStore.add(
    {
      key: i.variantId ? `${i.productId}|${i.variantId}` : i.productId,
      product_id: i.productId,
      variant_id: i.variantId ?? undefined,
      name: i.name,
      image: i.image,
      price: i.price,
      slug: i.slug,
      quantity: qty,
    },
    i.stock != null ? { max: i.stock } : undefined,
  );
  const action = i.onViewCart ? { label: "View cart", onClick: i.onViewCart } : undefined;
  if (added === 0) toast.error(`You already have all ${i.stock} available in your cart`);
  else if (added < qty) toast.warning(`Only ${i.stock} in stock — added ${added}`, { action });
  else toast.success(`Added ${added > 1 ? `${added} × ` : ""}${i.name} to cart`, { action });
  return added;
}
