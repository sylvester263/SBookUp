// A banner: separate desktop / mobile images (width + height set, so no layout
// shift), optional overlay heading, subheading and CTA, and a link to a
// category, product, filtered listing or external URL.
import { useQuery } from "@tanstack/react-query";
import { navCategoriesQuery } from "@/lib/shop";
import { resolveBannerLink, type BannerLink } from "@/lib/banner-link";

export type BannerSource = { src: string; width: number; height: number };

export type BannerImageProps = {
  /** null = no image uploaded yet: a placeholder in the store colours is shown. */
  desktop: BannerSource | null;
  /** Placeholder shape (use the recommended upload size), desktop and below 768px. */
  placeholderSize?: { width: number; height: number };
  placeholderMobileSize?: { width: number; height: number } | null;
  /** Used below 768px; falls back to the desktop image. */
  mobile?: BannerSource | null;
  alt: string;
  heading?: string | null;
  subheading?: string | null;
  cta?: string | null;
  link?: BannerLink | null;
  /** Text position over the image. */
  align?: "left" | "center" | "right";
  /** Above the fold (e.g. the first hero slide): load eagerly, high priority. */
  priority?: boolean;
  rounded?: boolean;
  className?: string;
};

const ALIGN = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
} as const;
// Darkens the side the text sits on, so white text stays readable on any photo
const SCRIM = {
  left: "bg-gradient-to-r from-black/50 via-black/20 to-transparent",
  center: "bg-black/30",
  right: "bg-gradient-to-l from-black/50 via-black/20 to-transparent",
} as const;

/**
 * Stand-in until the client uploads a real image: store-colour gradient with
 * soft shapes, in the recommended size's proportions (so nothing jumps when the
 * real image arrives). Never a third-party image.
 */
export function BannerPlaceholder({
  size,
  mobileSize,
}: {
  size: { width: number; height: number };
  mobileSize?: { width: number; height: number } | null;
}) {
  const m = mobileSize ?? size;
  return (
    <div
      aria-hidden="true"
      className="relative w-full overflow-hidden bg-gradient-to-br from-store-primary to-store-primary-hover [aspect-ratio:var(--ph-m)] md:[aspect-ratio:var(--ph-d)]"
      style={{
        ["--ph-d" as string]: `${size.width} / ${size.height}`,
        ["--ph-m" as string]: `${m.width} / ${m.height}`,
      }}
    >
      <span className="absolute -right-[8%] -top-[30%] h-[120%] w-[45%] rounded-full bg-white/10" />
      <span className="absolute -bottom-[40%] right-[20%] h-[90%] w-[30%] rounded-full bg-white/10" />
    </div>
  );
}

export function BannerImage({
  desktop,
  placeholderSize = { width: 1600, height: 400 },
  placeholderMobileSize = null,
  mobile,
  alt,
  heading,
  subheading,
  cta,
  link,
  align = "left",
  priority = false,
  rounded = true,
  className = "",
}: BannerImageProps) {
  // Shared, cached query (the header already loads it); only needed for category links.
  const cats = useQuery({ ...navCategoriesQuery, enabled: link?.type === "category" });
  const target = resolveBannerLink(link, cats.data ?? []);
  const placeholder = !desktop;
  // A placeholder always says what it is and invites a click
  if (placeholder) {
    heading = heading || alt || null;
    cta = cta || (target ? "Shop Now" : null);
  }
  const hasText = !!(heading || subheading || cta);

  const body = (
    <>
      {placeholder ? (
        <BannerPlaceholder size={placeholderSize} mobileSize={placeholderMobileSize} />
      ) : (
        <picture>
          {mobile && (
            <source
              media="(max-width: 767px)"
              srcSet={mobile.src}
              width={mobile.width}
              height={mobile.height}
            />
          )}
          <img
            src={desktop.src}
            alt={alt}
            width={desktop.width}
            height={desktop.height}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding={priority ? "sync" : "async"}
            className="block h-auto w-full object-cover"
          />
        </picture>
      )}
      {hasText && !placeholder && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${SCRIM[align]}`}
        />
      )}
      {hasText && (
        <div
          className={`absolute inset-0 flex flex-col justify-center gap-2 p-5 md:gap-3 md:p-10 lg:p-14 ${ALIGN[align]}`}
        >
          {heading && (
            <p className="max-w-[18ch] font-sans text-xl font-extrabold leading-tight text-white drop-shadow-md sm:text-2xl md:text-4xl">
              {heading}
            </p>
          )}
          {subheading && (
            <p className="max-w-[40ch] text-sm text-white/95 drop-shadow md:text-lg">
              {subheading}
            </p>
          )}
          {cta && (
            <span
              className={`mt-1 inline-flex h-9 items-center rounded-full px-5 text-xs font-bold uppercase tracking-wide shadow transition md:h-11 md:px-7 md:text-sm ${placeholder ? "bg-white text-store-primary group-hover:bg-store-soft" : "bg-store-primary text-store-primary-foreground group-hover:bg-store-primary-hover"}`}
            >
              {cta}
            </span>
          )}
        </div>
      )}
    </>
  );

  const shell = `group relative block overflow-hidden bg-muted ${rounded ? "rounded-xl" : ""} ${className}`;
  if (!target) return <div className={shell}>{body}</div>;
  return (
    <a
      href={target.href}
      className={shell}
      {...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      aria-label={heading ? undefined : alt}
    >
      {body}
    </a>
  );
}
