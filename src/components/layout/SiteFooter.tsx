// Site-wide footer (light-teal band): contact + socials + app badges | category
// links | newsletter with two link columns. All details come from store
// settings. Also the floating WhatsApp button.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Phone,
  Mail,
  MessageCircle,
  Clock,
  Facebook,
  Instagram,
  Youtube,
  Music2,
  Twitter,
} from "lucide-react";
import { toast } from "sonner";
import { subscribeNewsletter } from "@/lib/site.functions";
import { navCategoriesQuery, childrenOf, categoryHref } from "@/lib/shop";
import {
  SOCIAL_KEYS,
  SOCIAL_LABELS,
  telHref,
  useSiteSettings,
  whatsappHref,
  type SocialKey,
} from "@/lib/site-settings";
import { HELP_LINKS, INFO_LINKS } from "@/lib/site-links";

const SOCIAL_ICONS: Record<SocialKey, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Music2,
  x: Twitter,
};
const heading = "mb-3 text-sm font-bold uppercase tracking-wide text-store-soft-foreground md:mb-4";
const link = "text-sm text-store-soft-foreground/80 hover:text-store-primary hover:underline";

export function SiteFooter() {
  const s = useSiteSettings();
  const { data: cats } = useQuery(navCategoriesQuery);
  const all = cats ?? [];
  const top = childrenOf(all, null).filter((c) => c.show_in_nav);
  const socials = SOCIAL_KEYS.filter((k) => s.social[k]);
  const hasApps = !!(s.appStoreUrl || s.playStoreUrl);

  return (
    <footer className="mt-10 bg-store-soft text-store-soft-foreground">
      <div className="container mx-auto grid grid-cols-1 gap-10 px-4 py-10 md:grid-cols-2 md:py-14 lg:grid-cols-4 lg:gap-8">
        {/* 1: brand + contact */}
        <div>
          {s.logoUrl ? (
            <img
              src={s.logoUrl}
              alt={s.storeName}
              height={44}
              loading="lazy"
              className="h-11 w-auto"
            />
          ) : (
            <div className="font-display text-2xl font-bold text-store-primary">{s.storeName}</div>
          )}
          <ul className="mt-5 space-y-4 text-sm">
            {s.phone && (
              <li>
                <div className="font-semibold">For Queries and Complaints</div>
                <a
                  href={telHref(s.phone)}
                  className="mt-1 flex items-center gap-2 hover:text-store-primary"
                >
                  <Phone className="h-4 w-4 text-store-primary" aria-hidden="true" />
                  {s.phone}
                </a>
                {s.supportHours && (
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-store-soft-foreground/70">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {s.supportHours}
                  </div>
                )}
              </li>
            )}
            <li>
              <div className="font-semibold">WhatsApp</div>
              <a
                href={whatsappHref(s.whatsapp.number, s.whatsapp.message)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-2 hover:text-store-primary"
              >
                <MessageCircle className="h-4 w-4 text-store-primary" aria-hidden="true" />+
                {s.whatsapp.number}
              </a>
              {s.whatsapp.hours && (
                <div className="mt-0.5 flex items-center gap-2 text-xs text-store-soft-foreground/70">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {s.whatsapp.hours}
                </div>
              )}
            </li>
            {s.email && (
              <li>
                <a
                  href={`mailto:${s.email}`}
                  className="flex items-center gap-2 hover:text-store-primary"
                >
                  <Mail className="h-4 w-4 text-store-primary" aria-hidden="true" />
                  {s.email}
                </a>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 text-sm font-semibold">Follow us on</div>
              <div className="flex gap-2">
                {socials.map((k) => {
                  const Icon = SOCIAL_ICONS[k];
                  return (
                    <a
                      key={k}
                      href={s.social[k]}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={SOCIAL_LABELS[k]}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-store-primary shadow-sm transition hover:bg-store-primary hover:text-store-primary-foreground"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          {hasApps && (
            <div className="mt-6">
              <div className="mb-2 text-sm font-semibold">Download the App</div>
              <div className="flex flex-wrap gap-2">
                {s.appStoreUrl && (
                  <StoreBadge href={s.appStoreUrl} small="Download on the" big="App Store" />
                )}
                {s.playStoreUrl && (
                  <StoreBadge href={s.playStoreUrl} small="Get it on" big="Google Play" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2: categories */}
        <div>
          <h2 className={heading}>Categories</h2>
          <ul className="space-y-2">
            {top.map((c) => (
              <li key={c.id}>
                <a href={categoryHref(all, c.slug)} className={link}>
                  {c.name}
                </a>
              </li>
            ))}
            <li>
              <a href="/shop" className={link}>
                Shop all
              </a>
            </li>
          </ul>
        </div>

        {/* 3–4: newsletter + two link columns */}
        <div className="md:col-span-2">
          <h2 className={heading}>{s.newsletterHeading}</h2>
          <p className="mb-3 text-sm text-store-soft-foreground/80">{s.newsletterText}</p>
          <NewsletterForm />
          <div className="mt-8 grid grid-cols-2 gap-6">
            <ul className="space-y-2">
              {INFO_LINKS.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className={link}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              {HELP_LINKS.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className={link}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-store-soft-foreground/10">
        <div className="container mx-auto flex flex-col items-center gap-1 px-4 py-4 text-center text-xs text-store-soft-foreground/80">
          <p>
            © {new Date().getFullYear()} {s.storeName} All Rights Reserved
          </p>
          {s.poweredBy && (
            <p>
              {s.poweredBy.url ? (
                <a
                  href={s.poweredBy.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-store-primary hover:underline"
                >
                  {s.poweredBy.text}
                </a>
              ) : (
                s.poweredBy.text
              )}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

function StoreBadge({ href, small, big }: { href: string; small: string; big: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-11 min-w-[140px] flex-col justify-center rounded-lg bg-black px-3 leading-tight text-white hover:bg-neutral-800"
    >
      <span className="text-[10px]">{small}</span>
      <span className="text-sm font-semibold">{big}</span>
    </a>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const mutation = useMutation({
    mutationFn: (e: string) => subscribeNewsletter({ data: { email: e } }),
    onSuccess: (res) => {
      toast.success(
        res.alreadySubscribed ? "You're already subscribed!" : "Thanks — you're now subscribed!",
      );
      setEmail("");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });
  return (
    <form
      className="flex max-w-lg gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) mutation.mutate(email.trim());
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Email address</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          autoComplete="email"
          className="h-11 w-full rounded-full border border-border bg-white px-4 text-sm text-store-ink focus:outline-none focus:ring-2 focus:ring-store-primary"
        />
      </label>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="h-11 shrink-0 rounded-full bg-store-primary px-5 text-xs font-bold uppercase tracking-wide text-store-primary-foreground hover:bg-store-primary-hover disabled:opacity-60"
      >
        {mutation.isPending ? "…" : "Subscribe"}
      </button>
    </form>
  );
}

/** Floating WhatsApp button (bottom-right, every page). */
export function WhatsAppFab() {
  const s = useSiteSettings();
  return (
    <a
      href={whatsappHref(s.whatsapp.number, s.whatsapp.message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="wa-pulse fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white transition hover:scale-110 md:bottom-6 md:right-6 md:h-14 md:w-14"
    >
      <MessageCircle className="h-6 w-6 md:h-7 md:w-7" aria-hidden="true" />
    </a>
  );
}
