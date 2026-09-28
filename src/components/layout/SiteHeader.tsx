// Site-wide header: logo · delivery / pickup pill · big search · account,
// wishlist, cart. Below it the nav row: "Shop by Departments" mega menu, "Shop
// Deals" and the top categories (show_in_nav). Sticky, and more compact once
// scrolled. Mobile: hamburger drawer, search under the logo row.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Menu,
  ChevronDown,
  Tag,
  User,
  Heart,
  ShoppingBag,
  X,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SearchAutocomplete } from "@/components/site/SearchAutocomplete";
import { useWishlistCount } from "@/components/site/WishlistButton";
import {
  DeliveryLocationButton,
  DeliveryLocationDialog,
} from "@/components/layout/DeliveryLocation";
import { navCategoriesQuery, childrenOf, categoryHref, type NavCategory } from "@/lib/shop";
import { useSiteSettings, whatsappHref } from "@/lib/site-settings";
import { useSchoolFeatures } from "@/lib/feature-flags";
import { useAuth } from "@/lib/auth-context";
import { useCart, useCartBump, cartTotals } from "@/lib/cart-store";
import { categoryIcon } from "@/lib/category-icons";
import { DEALS_HREF, HELP_LINKS, INFO_LINKS } from "@/lib/site-links";
import { useDeliveryChoice } from "@/lib/delivery-location";

export function SiteHeader() {
  const [compact, setCompact] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const on = () => setCompact(window.scrollY > 120);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <>
      <header
        className={`sticky top-0 z-50 bg-white transition-shadow ${compact ? "shadow-md" : "shadow-sm"}`}
      >
        <div className="container mx-auto px-4">
          <div
            className={`flex items-center gap-2 transition-[height] duration-200 md:gap-4 lg:gap-6 ${compact ? "h-14 md:h-16" : "h-14 md:h-20"}`}
          >
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted md:hidden"
            >
              <Menu className="h-6 w-6 text-store-ink" />
            </button>
            <Logo compact={compact} />
            {/* Tablet: pin only (room for search); desktop: two-line pill */}
            <div className="hidden md:block lg:hidden">
              <DeliveryLocationButton iconOnly />
            </div>
            <div className="hidden lg:block">
              <DeliveryLocationButton compact={compact} />
            </div>
            <div className="hidden min-w-0 flex-1 md:block">
              <div className="mx-auto max-w-3xl">
                <SearchAutocomplete compact={compact} />
              </div>
            </div>
            <HeaderActions />
          </div>
          {/* Mobile: search moves below the logo row */}
          <div className="space-y-1.5 pb-2 md:hidden">
            <SearchAutocomplete compact />
            {!compact && <MobileDeliveryLine />}
          </div>
        </div>
        <NavRow />
      </header>
      <MobileDrawer open={drawer} onOpenChange={setDrawer} />
    </>
  );
}

function Logo({ compact }: { compact: boolean }) {
  const s = useSiteSettings();
  return (
    <Link
      to="/"
      className="flex min-w-0 shrink-0 items-center"
      aria-label={`${s.storeName} — home`}
    >
      {s.logoUrl ? (
        <img
          src={s.logoUrl}
          alt={s.storeName}
          height={44}
          className={`w-auto transition-[height] ${compact ? "h-8 md:h-9" : "h-9 md:h-11"}`}
        />
      ) : (
        <span
          className={`truncate font-display font-bold leading-none text-store-primary ${compact ? "text-lg md:text-xl" : "text-lg md:text-2xl"}`}
        >
          {s.storeName}
        </span>
      )}
    </Link>
  );
}

function MobileDeliveryLine() {
  const [open, setOpen] = useState(false);
  const choice = useDeliveryChoice();
  const s = useSiteSettings();
  const label =
    choice?.method === "pickup"
      ? "Store pickup"
      : choice?.method === "delivery"
        ? `Deliver to ${choice.city}`
        : s.pickup.enabled
          ? "Choose delivery or pickup"
          : "Set your delivery city";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 text-xs font-medium text-store-ink"
      >
        <MapPin className="h-3.5 w-3.5 text-store-primary" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </button>
      <DeliveryLocationDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function CountBadge({ n, bump = false }: { n: number; bump?: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      className={`absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-store-primary px-1 text-[10px] font-bold text-store-primary-foreground ${bump ? "animate-cart-bump" : ""}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function HeaderActions() {
  const { user } = useAuth();
  const { itemCount } = cartTotals(useCart());
  const bump = useCartBump();
  const wishCount = useWishlistCount();
  const icon = "relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted";
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 md:gap-1">
      <Link
        to={user ? "/account" : "/auth/login"}
        className={`${icon} lg:w-auto lg:gap-2 lg:px-3`}
        aria-label={user ? "My account" : "Sign in"}
      >
        <User className="h-5 w-5 text-store-ink" aria-hidden="true" />
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-[11px] text-muted-foreground">
            {user ? "Hello" : "Sign in"}
          </span>
          <span className="block text-xs font-semibold text-store-ink">My Account</span>
        </span>
      </Link>
      <Link
        to={user ? "/account/wishlist" : "/auth/login"}
        className={`${icon} hidden sm:flex`}
        aria-label={`Wishlist${wishCount ? `, ${wishCount} items` : ""}`}
      >
        <Heart className="h-5 w-5 text-store-ink" aria-hidden="true" />
        <CountBadge n={wishCount} />
      </Link>
      <Link
        to="/cart"
        className={icon}
        aria-label={`Cart${itemCount ? `, ${itemCount} items` : ""}`}
      >
        <ShoppingBag className="h-5 w-5 text-store-ink" aria-hidden="true" />
        <CountBadge n={itemCount} bump={bump} />
      </Link>
    </div>
  );
}

/** Desktop / tablet nav row with the departments mega menu. */
function NavRow() {
  const { data: cats } = useQuery(navCategoriesQuery);
  const schoolFeatures = useSchoolFeatures();
  const all = cats ?? [];
  const top = childrenOf(all, null).filter((c) => c.show_in_nav);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const hoverOpen = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  return (
    <div
      ref={wrap}
      className="relative hidden border-t border-border bg-white md:block"
      onMouseLeave={hoverClose}
    >
      <nav aria-label="Main" className="container mx-auto flex h-12 items-center gap-1 px-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="departments-menu"
          onClick={() => setOpen((o) => !o)}
          onMouseEnter={hoverOpen}
          className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-bold transition ${open ? "bg-store-primary text-store-primary-foreground" : "text-store-ink hover:bg-muted"}`}
        >
          <Menu className="h-4 w-4" aria-hidden="true" /> Shop by Departments
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        <span className="mx-2 h-6 w-px shrink-0 bg-border" aria-hidden="true" />
        <a
          href={DEALS_HREF}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-bold text-store-deal hover:bg-store-deal/10"
        >
          <Tag className="h-4 w-4" aria-hidden="true" /> Shop Deals
        </a>
        <div className="hide-scrollbar flex min-w-0 items-center overflow-x-auto">
          {schoolFeatures && (
            <a
              href="/schools"
              className="whitespace-nowrap px-3 py-2 text-sm font-medium text-store-ink hover:text-store-primary"
            >
              Schools
            </a>
          )}
          {top.map((c) => (
            <a
              key={c.id}
              href={categoryHref(all, c.slug)}
              className="whitespace-nowrap px-3 py-2 text-sm font-medium text-store-ink hover:text-store-primary"
            >
              {c.name}
            </a>
          ))}
        </div>
      </nav>
      {open && (
        <div
          id="departments-menu"
          onMouseEnter={hoverOpen}
          className="absolute inset-x-0 top-full border-t border-border bg-white shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="container mx-auto grid grid-cols-3 gap-x-6 gap-y-8 px-4 py-6 lg:grid-cols-6">
            {top.map((c) => (
              <Department key={c.id} c={c} all={all} onNavigate={() => setOpen(false)} />
            ))}
          </div>
          <div className="border-t bg-muted/30">
            <div className="container mx-auto flex items-center gap-4 px-4 py-3 text-sm">
              <a
                href="/shop"
                onClick={() => setOpen(false)}
                className="font-semibold text-store-primary hover:underline"
              >
                Shop all products →
              </a>
              <a
                href={DEALS_HREF}
                onClick={() => setOpen(false)}
                className="font-semibold text-store-deal hover:underline"
              >
                Today's deals →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Department({
  c,
  all,
  onNavigate,
}: {
  c: NavCategory;
  all: NavCategory[];
  onNavigate: () => void;
}) {
  const kids = childrenOf(all, c.id).filter((k) => k.show_in_nav);
  const Icon = categoryIcon(c.slug);
  return (
    <div>
      <a
        href={categoryHref(all, c.slug)}
        onClick={onNavigate}
        className="group flex flex-col items-start gap-2"
      >
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-store-soft">
          {c.image_url ? (
            <img
              src={c.image_url}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <Icon className="h-7 w-7 text-store-primary" aria-hidden="true" />
          )}
        </span>
        <span className="text-sm font-bold text-store-ink group-hover:text-store-primary">
          {c.name}
        </span>
      </a>
      {kids.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {kids.map((k) => (
            <li key={k.id}>
              <a
                href={categoryHref(all, k.slug)}
                onClick={onNavigate}
                className="text-sm text-muted-foreground hover:text-store-primary"
              >
                {k.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mobile drawer: account, deals, departments, help and policy links. */
function MobileDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const s = useSiteSettings();
  const { user } = useAuth();
  const { data: cats } = useQuery(navCategoriesQuery);
  const all = cats ?? [];
  const top = childrenOf(all, null).filter((c) => c.show_in_nav);
  const [expanded, setExpanded] = useState<string | null>(null);
  const close = () => onOpenChange(false);
  const row =
    "flex min-h-12 items-center gap-3 px-4 text-sm font-medium text-store-ink hover:bg-muted";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[86vw] max-w-[340px] flex-col gap-0 p-0 [&>button]:hidden"
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <SheetTitle className="font-display text-base font-bold text-store-primary">
            {s.storeName}
          </SheetTitle>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b p-4">
          {user ? (
            <Link to="/account" onClick={close} className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-store-primary font-semibold text-store-primary-foreground">
                {(user.email ?? "U").slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate text-sm font-medium">My Account</span>
            </Link>
          ) : (
            <div className="flex gap-2">
              <Link
                to="/auth/login"
                onClick={close}
                className="flex-1 rounded-full bg-store-primary px-4 py-2 text-center text-sm font-semibold text-store-primary-foreground"
              >
                Sign in
              </Link>
              <Link
                to="/auth/register"
                onClick={close}
                className="flex-1 rounded-full border-2 border-store-primary px-4 py-2 text-center text-sm font-semibold text-store-primary"
              >
                Register
              </Link>
            </div>
          )}
        </div>
        <nav aria-label="Mobile" className="flex-1 overflow-y-auto py-2">
          <a href={DEALS_HREF} onClick={close} className={`${row} font-bold text-store-deal`}>
            <Tag className="h-4 w-4" aria-hidden="true" /> Shop Deals
          </a>
          <a href="/shop" onClick={close} className={`${row} font-semibold`}>
            <ShoppingBag className="h-4 w-4 text-store-primary" aria-hidden="true" /> Shop all
          </a>
          <div className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Departments
          </div>
          {top.map((c) => {
            const kids = childrenOf(all, c.id).filter((k) => k.show_in_nav);
            const Icon = categoryIcon(c.slug);
            const isOpen = expanded === c.id;
            return (
              <div key={c.id}>
                <div className="flex items-center">
                  <a href={categoryHref(all, c.slug)} onClick={close} className={`${row} flex-1`}>
                    <Icon className="h-4 w-4 text-store-primary" aria-hidden="true" /> {c.name}
                  </a>
                  {kids.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} ${c.name} sub-categories`}
                      className="flex h-12 w-12 items-center justify-center text-muted-foreground"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  )}
                </div>
                {isOpen &&
                  kids.map((k) => (
                    <a
                      key={k.id}
                      href={categoryHref(all, k.slug)}
                      onClick={close}
                      className="block py-2.5 pl-11 pr-4 text-sm text-muted-foreground hover:bg-muted"
                    >
                      {k.name}
                    </a>
                  ))}
              </div>
            );
          })}
          <div className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Help
          </div>
          {HELP_LINKS.map((l) => (
            <a key={l.href + l.label} href={l.href} onClick={close} className={row}>
              {l.label}
            </a>
          ))}
          <div className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Policies
          </div>
          {INFO_LINKS.map((l) => (
            <a key={l.href + l.label} href={l.href} onClick={close} className={row}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="border-t p-4">
          <a
            href={whatsappHref(s.whatsapp.number, s.whatsapp.message)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1E8E4E] py-3 text-sm font-semibold text-white hover:bg-[#177A42]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat with us on WhatsApp
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
