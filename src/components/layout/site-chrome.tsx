import { useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Bundle, getBundlePrice, getBundleOriginalTotal, getBundleSavings } from "@/lib/home-data";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter, WhatsAppFab } from "@/components/layout/SiteFooter";

export const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&q=70";
export { CATEGORY_ICONS } from "@/lib/category-icons";
export const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-cream">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[100] focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow">Skip to content</a>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" className="flex-1 overflow-x-clip">{children}</main>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}

/* ============================ SHARED CARDS ============================ */
// The product card lives in @/components/store/ProductCard.

export function BundleCard({ b }: { b: Bundle }) {
  const price = getBundlePrice(b);
  const original = getBundleOriginalTotal(b);
  const saving = getBundleSavings(b);
  const bookCount = b.items?.length ?? 0;
  const avg = bookCount > 0 ? Math.round(price / bookCount) : 0;
  return (
    <Link
      to="/bundle/$slug"
      params={{ slug: b.slug }}
      className="block w-[200px] md:w-[260px] lg:w-[280px] shrink-0 snap-start bg-white rounded-xl border border-border overflow-hidden hover:shadow-xl transition group"
    >
      <div className="h-36 bg-gradient-to-br from-brand-teal to-brand-teal-dark p-4 text-white relative">
        <div className="inline-flex bg-brand-gold text-white text-xs font-semibold px-2.5 py-1 rounded-full">
          {b.class_level ?? "All Classes"} • {b.exam_board ?? "Multi-Board"}
        </div>
        <BookOpen className="absolute right-4 bottom-4 h-16 w-16 text-white/15" />
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-display font-semibold text-lg text-brand-navy line-clamp-1">{b.name}</h3>
        <div className="text-xs text-muted-foreground">{b.school_name ?? "Federal Board"}</div>
        <div className="text-xs font-medium text-brand-teal">{bookCount} {bookCount === 1 ? "Book" : "Books"} Included</div>
        <div className="flex items-baseline gap-2 pt-1 flex-wrap">
          <div className="text-xl font-bold text-brand-teal">{pkr(price)}</div>
          {saving > 0 && <div className="text-sm text-muted-foreground line-through">{pkr(original)}</div>}
        </div>
        {saving > 0 && (
          <div className="inline-flex bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">
            Save {pkr(saving)}
          </div>
        )}
        {avg > 0 && (
          <div className="text-xs text-muted-foreground">Avg {pkr(avg)} per book</div>
        )}
        <Button className="w-full mt-2 bg-brand-teal hover:bg-brand-teal-dark text-white">
          View Bundle
        </Button>
      </div>
    </Link>
  );
}

export function HScroller({ children, title, viewAllHref, emoji }: {
  children: ReactNode; title: string; viewAllHref?: string; emoji?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  return (
    <section className="container mx-auto px-4 py-6 md:py-10">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h2 className="font-display text-lg md:text-3xl font-bold text-brand-navy flex items-center gap-2">
          {emoji && <span>{emoji}</span>} {title}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => scroll(-1)} className="hidden md:flex h-9 w-9 rounded-full border border-border hover:bg-brand-teal hover:text-white hover:border-brand-teal transition items-center justify-center">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => scroll(1)} className="hidden md:flex h-9 w-9 rounded-full border border-border hover:bg-brand-teal hover:text-white hover:border-brand-teal transition items-center justify-center">
            <ChevronRight className="h-4 w-4" />
          </button>
          {viewAllHref && (
            <a href={viewAllHref} className="md:ml-3 text-xs md:text-sm font-semibold text-brand-teal hover:underline">View All →</a>
          )}
        </div>
      </div>

      <div ref={ref} className="flex gap-3 md:gap-4 overflow-x-auto hide-scrollbar scroll-smooth snap-x snap-mandatory pb-2 pr-8 md:pr-0">
        {children}
      </div>
    </section>
  );
}

