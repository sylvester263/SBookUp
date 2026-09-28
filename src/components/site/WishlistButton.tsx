import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toggleWishlist, listMyWishlistIds } from "@/lib/site.functions";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const GUEST_KEY = "js_wishlist_guest";

function readGuest(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) ?? "[]"); } catch { return []; }
}
function writeGuest(ids: string[]) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("wishlist-changed"));
}

export function useWishlistIds(): string[] {
  const { user } = useAuth();
  const listFn = useServerFn(listMyWishlistIds);
  const { data } = useQuery({
    queryKey: ["my-wishlist-ids", user?.id ?? "guest"],
    queryFn: () => listFn(),
    enabled: !!user,
  });
  const [guest, setGuest] = useState<string[]>(() => readGuest());
  useEffect(() => {
    const h = () => setGuest(readGuest());
    window.addEventListener("wishlist-changed", h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener("wishlist-changed", h); window.removeEventListener("storage", h); };
  }, []);
  return user ? (data ?? []) : guest;
}

export function WishlistButton({
  productId,
  className,
  size = "icon",
  label = false,
}: {
  productId: string;
  className?: string;
  size?: "icon" | "lg";
  label?: boolean;
}) {
  const { user } = useAuth();
  const ids = useWishlistIds();
  const active = ids.includes(productId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toggleFn = useServerFn(toggleWishlist);
  const [busy, setBusy] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (user) {
        const res = await toggleFn({ data: { productId } });
        qc.invalidateQueries({ queryKey: ["my-wishlist-ids"] });
        toast.success(res.added ? "Added to wishlist" : "Removed from wishlist");
      } else {
        const cur = readGuest();
        const next = cur.includes(productId) ? cur.filter((x) => x !== productId) : [...cur, productId];
        writeGuest(next);
        toast.success(cur.includes(productId) ? "Removed from wishlist" : "Saved — log in to sync across devices", {
          action: cur.includes(productId) ? undefined : { label: "Log in", onClick: () => navigate({ to: "/auth/login" }) },
        });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (size === "lg") {
    return (
      <button
        onClick={onClick}
        className={className ?? "w-full h-12 inline-flex items-center justify-center rounded-md border border-brand-teal text-brand-teal hover:bg-brand-teal hover:text-white transition"}
        aria-pressed={active}
      >
        <Heart className={`h-4 w-4 mr-2 ${active ? "fill-current" : ""}`} />
        {active ? "In Wishlist" : "Add to Wishlist"}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={active}
      className={className ?? "absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center"}
    >
      <Heart className={`h-4 w-4 ${active ? "fill-red-500 text-red-500" : "text-brand-navy"}`} />
      {label && <span className="ml-1 text-xs">{active ? "Saved" : "Save"}</span>}
    </button>
  );
}

export function useWishlistCount(): number {
  return useWishlistIds().length;
}
