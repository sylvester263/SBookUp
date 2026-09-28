import { useEffect, useRef, useState } from "react";

/**
 * True once the element comes within `margin` of the viewport (stays true).
 * Used to load below-the-fold homepage sections only when they're needed.
 */
export function useInView<T extends Element>(margin = "400px", initial = false) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(initial);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}
