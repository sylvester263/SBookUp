// Horizontal row of cards: 2 visible on mobile, 3 on tablet, 4 on laptop, 6 on
// desktop. Native scroll-snap, so it swipes on touch with no carousel library;
// round prev / next buttons overlap the edges on larger screens.
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Slide width = (row width − gaps) / visible count. Gaps: 0.75rem mobile, 1rem from md.
const SLIDE = {
  full: "shrink-0 snap-start basis-[calc((100%-0.75rem)/2)] md:basis-[calc((100%-2rem)/3)] lg:basis-[calc((100%-3rem)/4)] xl:basis-[calc((100%-5rem)/6)]",
  // Next to a side banner (about 2/3 of the row): 2 / 3 / 3 / 4
  narrow: "shrink-0 snap-start basis-[calc((100%-0.75rem)/2)] md:basis-[calc((100%-2rem)/3)] xl:basis-[calc((100%-3rem)/4)]",
  // Category circles: 3 / 5 / 7 / 10
  circles: "shrink-0 snap-start basis-[calc((100%-1.5rem)/3)] md:basis-[calc((100%-4rem)/5)] lg:basis-[calc((100%-6rem)/7)] xl:basis-[calc((100%-9rem)/10)]",
} as const;

export function ProductCarousel({
  children,
  label,
  width = "full",
}: {
  children: ReactNode;
  /** For screen readers, e.g. the section title. */ label: string;
  width?: keyof typeof SLIDE;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, children]);

  // One "page" (the visible width) per click
  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  const arrow =
    "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-store-ink shadow-md transition hover:bg-store-primary hover:text-store-primary-foreground md:flex disabled:pointer-events-none disabled:opacity-0";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Previous — ${label}`}
        onClick={() => page(-1)}
        disabled={edges.start}
        className={`${arrow} left-0 -translate-x-1/2`}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div
        ref={track}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 md:gap-4"
      >
        {Children.map(children, (child) =>
          child == null || child === false ? null : <div className={SLIDE[width]}>{child}</div>,
        )}
      </div>
      <button
        type="button"
        aria-label={`Next — ${label}`}
        onClick={() => page(1)}
        disabled={edges.end}
        className={`${arrow} right-0 translate-x-1/2`}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
