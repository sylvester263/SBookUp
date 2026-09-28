// Full-width hero slider: autoplay (configurable, paused on hover / focus / when
// the user prefers reduced motion), arrows, dots, swipe. The first slide is
// server-rendered and loaded eagerly with high priority; the others lazily.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BannerImage } from "@/components/store/BannerImage";
import { IMAGE_SIZES, type Banner } from "@/lib/homepage-sections";

export function HeroSlider({
  slides,
  interval,
  label = "Featured",
}: {
  slides: Banner[];
  interval: number;
  label?: string;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const startX = useRef<number | null>(null);
  const n = slides.length;
  const go = (k: number) => setI(((k % n) + n) % n);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (n < 2 || paused || reduced) return;
    const t = setInterval(() => setI((k) => (k + 1) % n), interval * 1000);
    return () => clearInterval(t);
  }, [n, paused, reduced, interval]);

  if (!n) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="group/hero relative overflow-hidden bg-muted"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onPointerDown={(e) => {
        startX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (startX.current == null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
      }}
    >
      <div
        className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${i * 100}%)` }}
      >
        {slides.map((s, k) => (
          <div
            key={k}
            className="w-full shrink-0"
            role="group"
            aria-roledescription="slide"
            aria-label={`${k + 1} of ${n}`}
            aria-hidden={k !== i}
            inert={k !== i}
          >
            <BannerImage
              desktop={s.image}
              mobile={s.mobile_image}
              placeholderSize={IMAGE_SIZES.hero}
              placeholderMobileSize={IMAGE_SIZES.heroMobile}
              alt={s.alt}
              heading={s.heading}
              subheading={s.subheading}
              cta={s.cta}
              link={s.link}
              priority={k === 0}
              rounded={false}
            />
          </div>
        ))}
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(i - 1)}
            className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-store-ink shadow-md transition hover:bg-white md:flex md:opacity-0 md:group-hover/hero:opacity-100 md:focus-visible:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(i + 1)}
            className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-store-ink shadow-md transition hover:bg-white md:flex md:opacity-0 md:group-hover/hero:opacity-100 md:focus-visible:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1 md:bottom-5">
            {slides.map((_, k) => (
              <button
                key={k}
                type="button"
                aria-label={`Go to slide ${k + 1}`}
                aria-current={k === i ? "true" : undefined}
                onClick={() => go(k)}
                className="flex h-6 w-6 items-center justify-center"
              >
                <span
                  className={`block h-2 rounded-full transition-all ${k === i ? "w-6 bg-white" : "w-2 bg-white/60"}`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
