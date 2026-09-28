// Section title (left) with an optional "View all →" link (right).
import { ArrowRight } from "lucide-react";

export function SectionHeading({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = "View all",
  id,
}: {
  title: string;
  subtitle?: string | null;
  viewAllHref?: string | null;
  viewAllLabel?: string;
  /** Lets a section use aria-labelledby. */
  id?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 md:mb-6">
      <div className="min-w-0">
        <h2 id={id} className="font-sans text-lg font-bold text-store-ink md:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {viewAllHref && (
        <a
          href={viewAllHref}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-store-primary hover:underline"
        >
          {viewAllLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only"> — {title}</span>
        </a>
      )}
    </div>
  );
}
