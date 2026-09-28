import { useEffect, useRef, useState, type ReactNode } from "react";
import { navCategoriesQuery, childrenOf, categoryHref } from "@/lib/shop";
import { isPack, packLabel } from "@/lib/pricing";
import { useSchoolFeatures, isSchoolFeatureHref, storeSettingsQueryOptions } from "@/lib/feature-flags";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ShoppingBag, Heart, User, Menu, ChevronLeft, ChevronRight,
  Star, BookOpen, Pencil, Shirt, Baby, Gamepad2, PartyPopper, Sparkles,
  Phone, MapPin, Mail, Facebook, Instagram, Youtube, MessageCircle, ChevronDown,
  Droplets, Briefcase, Search, X,
} from "lucide-react";

import { toast } from "sonner";
import { subscribeNewsletter } from "@/lib/site.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesQuery, type Bundle, type Product, getBundlePrice, getBundleOriginalTotal, getBundleSavings } from "@/lib/home-data";
import { useAuth } from "@/lib/auth-context";
import { useCart, cartTotals } from "@/lib/cart-store";
import { SearchAutocomplete } from "@/components/site/SearchAutocomplete";
import { WishlistButton, useWishlistCount } from "@/components/site/WishlistButton";

export const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&q=70";
export const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  books: BookOpen, "school-books": BookOpen, notebooks: BookOpen,
  stationery: Pencil, "school-uniforms": Shirt, uniforms: Shirt,
  "baby-items": Baby, baby: Baby,
  "board-games": Gamepad2, toys: Gamepad2,
  "party-essentials": PartyPopper, party: PartyPopper,
  "fancy-costumes": Sparkles, costumes: Sparkles,
  "lunch-boxes": Briefcase, "water-bottles": Droplets,
};
export const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

export function AnnouncementBar() {
  const msg =
    "Welcome to SchoolBooksExperts — Serving Lahore Families Since 1968   •   Free delivery on orders above PKR 2,000   •   ";
  return (
    <>
      {/* Mobile: static, 32px, xs */}
      <div className="md:hidden h-8 bg-brand-teal text-white text-xs flex items-center justify-center px-4">
        <span className="truncate">Free delivery on orders above PKR 2,000</span>
      </div>
      {/* Desktop: marquee, 40px */}
      <div className="hidden md:flex h-10 bg-brand-teal text-white text-sm items-center overflow-hidden">
        <div className="flex whitespace-nowrap animate-marquee">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="px-8 tracking-wide">{msg}</span>
          ))}
        </div>
      </div>
    </>
  );
}

const MOBILE_MENU_LINKS: { label: string; emoji: string; href: string }[] = [
  { label: "Home", emoji: "🏠", href: "/" },
  { label: "Shop by School", emoji: "🏫", href: "/schools" },
  { label: "My Orders", emoji: "📦", href: "/account/orders" },
  { label: "Wishlist", emoji: "❤️", href: "/account/wishlist" },
  { label: "Addresses", emoji: "📍", href: "/account/addresses" },
  { label: "About", emoji: "ℹ️", href: "/about" },
  { label: "Contact", emoji: "📞", href: "/contact" },
  { label: "FAQ", emoji: "❓", href: "/faq" },
  { label: "Track Order", emoji: "🚚", href: "/track" },
];

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const schoolFeatures = useSchoolFeatures();
  const { user } = useAuth();
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  return (
    <div className={`md:hidden fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute left-0 top-0 h-full w-[85vw] max-w-[320px] bg-white shadow-2xl transform transition-transform duration-300 ease-out flex flex-col ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b">
          <div className="font-display text-base font-bold text-brand-teal">Menu</div>
          <button onClick={onClose} aria-label="Close menu" className="h-11 w-11 -mr-2 flex items-center justify-center rounded-full hover:bg-muted">
            <X className="h-5 w-5 text-brand-navy" />
          </button>
        </div>
        <div className="p-4 border-b">
          {user ? (
            <Link to="/account" onClick={onClose} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-brand-teal text-white flex items-center justify-center font-semibold">
                {(user.email ?? "U").slice(0, 1).toUpperCase()}
              </div>
              <div className="text-sm font-medium text-brand-navy truncate">Hello, {user.email?.split("@")[0]}</div>
            </Link>
          ) : (
            <div className="flex gap-2">
              <Link to="/auth/login" onClick={onClose} className="flex-1 text-center border-2 border-brand-teal text-brand-teal rounded-full px-4 py-2 text-sm font-semibold">Login</Link>
              <Link to="/auth/register" onClick={onClose} className="flex-1 text-center border-2 border-brand-teal text-brand-teal rounded-full px-4 py-2 text-sm font-semibold">Register</Link>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <MobileCategoryMenu onNavigate={onClose} />
          {MOBILE_MENU_LINKS.filter((l) => schoolFeatures || !isSchoolFeatureHref(l.href)).map((l) => (
            <a key={l.label} href={l.href} onClick={onClose}
              className="flex items-center gap-3 px-4 min-h-12 text-sm font-medium text-brand-navy hover:bg-brand-cream">
              <span className="text-lg w-6 text-center">{l.emoji}</span>
              <span>{l.label}</span>
            </a>
          ))}
        </nav>
        <div className="p-4 border-t">
          <a
            href="https://wa.me/923404548850"
            target="_blank" rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-3 rounded-full text-sm font-semibold"
          >
            <MessageCircle className="h-4 w-4" /> Chat with us on WhatsApp
          </a>
        </div>
      </aside>
    </div>
  );
}

/** Categories in the mobile drawer (data-driven), each expandable to its sub-categories. */
function MobileCategoryMenu({ onNavigate }: { onNavigate: () => void }) {
  const { data: cats } = useQuery(navCategoriesQuery);
  const [openId, setOpenId] = useState<string | null>(null);
  const all = cats ?? [];
  const top = childrenOf(all, null).filter((c) => c.show_in_nav);
  if (!top.length) return null;
  return (
    <div className="border-b pb-2 mb-2">
      <a href="/shop" onClick={onNavigate} className="flex items-center gap-3 px-4 min-h-12 text-sm font-semibold text-brand-teal hover:bg-brand-cream">
        <span className="text-lg w-6 text-center">🛍️</span><span>Shop All</span>
      </a>
      {top.map((c) => {
        const kids = childrenOf(all, c.id).filter((k) => k.show_in_nav);
        const open = openId === c.id;
        return (
          <div key={c.id}>
            <div className="flex items-center">
              <a href={categoryHref(all, c.slug)} onClick={onNavigate} className="flex-1 flex items-center gap-3 px-4 min-h-12 text-sm font-medium text-brand-navy hover:bg-brand-cream">
                <span className="w-6" />{c.name}
              </a>
              {kids.length > 0 && (
                <button onClick={() => setOpenId(open ? null : c.id)} aria-label={`${open ? "Hide" : "Show"} ${c.name} sub-categories`} aria-expanded={open} className="h-12 w-12 flex items-center justify-center text-muted-foreground">
                  <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {open && kids.map((k) => (
              <a key={k.id} href={categoryHref(all, k.slug)} onClick={onNavigate} className="block pl-14 pr-4 py-2.5 text-sm text-brand-navy/80 hover:bg-brand-cream">{k.name}</a>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MobileSearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      try { setRecent(JSON.parse(localStorage.getItem("js_recent_searches") ?? "[]")); } catch { /* ignore */ }
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);
  if (!open) return null;
  const submit = (term: string) => {
    if (!term.trim()) return;
    const cur = recent.filter((x) => x.toLowerCase() !== term.toLowerCase());
    const next = [term, ...cur].slice(0, 8);
    try { localStorage.setItem("js_recent_searches", JSON.stringify(next)); } catch { /* ignore */ }
    window.location.href = `/products?q=${encodeURIComponent(term)}`;
  };
  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute top-0 inset-x-0 bg-white shadow-md p-3">
        <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search books, brands, ISBN..."
              className="w-full h-11 pl-9 pr-4 rounded-full border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
          </div>
          <button type="button" onClick={onClose} aria-label="Close search" className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-muted">
            <X className="h-5 w-5 text-brand-navy" />
          </button>
        </form>
        {recent.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            {recent.slice(0, 6).map((r) => (
              <button key={r} onClick={() => submit(r)}
                className="shrink-0 px-3 py-1.5 rounded-full bg-brand-cream border border-border text-xs text-brand-navy">
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <>
      {/* Mobile header */}
      <header className={`md:hidden sticky top-0 z-50 bg-white h-14 flex items-center px-2 ${scrolled ? "shadow-md" : "shadow-sm"}`}>
        <button
          aria-label="Menu"
          onClick={() => setMobileOpen(true)}
          className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-muted"
        >
          <Menu className="h-6 w-6 text-brand-navy" />
        </button>
        <Link to="/" className="flex-1 text-center font-display text-base font-bold text-brand-teal truncate">
          SchoolBooksExperts
        </Link>
        <button
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
          className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-muted"
        >
          <Search className="h-5 w-5 text-brand-navy" />
        </button>
        <MobileCartButton />
      </header>
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <MobileSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Desktop + Tablet header */}
      <header
        className={`hidden md:block sticky top-0 z-50 bg-white transition-shadow ${
          scrolled ? "shadow-md" : "shadow-sm"
        }`}
      >
        <div className="container mx-auto px-4 py-2 lg:py-3 flex items-center gap-3 lg:gap-4 h-16 lg:h-auto">
          <Link to="/" className="shrink-0">
            <div className="font-display text-lg lg:text-3xl text-brand-teal leading-none font-bold">
              SchoolBooksExperts
            </div>
            <div className="text-[10px] lg:text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
              A Complete Family Store
            </div>
          </Link>
          <div className="flex flex-1 max-w-2xl mx-auto">
            <SearchAutocomplete />
          </div>
          <HeaderActions />
        </div>
      </header>
    </>
  );
}

function MobileCartButton() {
  const cart = useCart();
  const { itemCount } = cartTotals(cart);
  return (
    <Link to="/cart" aria-label="Cart" className="relative h-11 w-11 flex items-center justify-center rounded-full hover:bg-muted">
      <ShoppingBag className="h-5 w-5 text-brand-navy" />
      {itemCount > 0 && (
        <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-brand-gold text-white text-[10px] flex items-center justify-center font-semibold">
          {itemCount}
        </span>
      )}
    </Link>
  );
}

function HeaderActions() {
  const { user } = useAuth();
  const cart = useCart();
  const { itemCount } = cartTotals(cart);
  const wishCount = useWishlistCount();
  return (
    <div className="flex items-center gap-2 ml-auto">
      <Link
        to={user ? "/account" : "/auth/login"}
        className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted"
        aria-label={user ? "Account" : "Login"}
      >
        <User className="h-5 w-5 text-brand-navy" />
      </Link>
      <Link
        to={user ? "/account/wishlist" : "/auth/login"}
        className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted"
        aria-label="Wishlist"
      >
        <Heart className="h-5 w-5 text-brand-navy" />
        {wishCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-semibold">
            {wishCount}
          </span>
        )}
      </Link>
      <Link
        to="/cart"
        className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted"
        aria-label="Cart"
      >
        <ShoppingBag className="h-5 w-5 text-brand-navy" />
        {itemCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-brand-gold text-white text-[10px] flex items-center justify-center font-semibold">
            {itemCount}
          </span>
        )}
      </Link>
    </div>
  );
}


export function CategoryNav() {
  // Data-driven: categories with "Show in menu" on, in their sort order.
  const { data: cats } = useQuery(navCategoriesQuery);
  const schoolFeatures = useSchoolFeatures();
  const all = cats ?? [];
  const top = childrenOf(all, null).filter((c) => c.show_in_nav);
  return (
    <div className="bg-white border-b border-border relative z-40 hidden md:block">
      <div className="container mx-auto px-4 flex items-center gap-1 h-12">
        <a href="/shop" className="flex items-center gap-2 bg-brand-teal text-white px-4 h-9 rounded-md text-sm font-medium hover:bg-brand-teal-dark transition shrink-0 mr-2">
          <Menu className="h-4 w-4" /> Shop All
        </a>
        <nav className="flex items-center h-full text-sm font-medium text-brand-navy">
          {schoolFeatures && (
            <Link to="/schools" className="whitespace-nowrap px-3 text-brand-teal font-semibold hover:text-brand-teal-dark transition">🏫 Schools</Link>
          )}
          {top.map((c) => {
            const kids = childrenOf(all, c.id).filter((k) => k.show_in_nav);
            return (
              <div key={c.id} className="relative h-full flex items-center group">
                <a href={categoryHref(all, c.slug)} className="whitespace-nowrap px-3 h-full flex items-center gap-1 hover:text-brand-teal transition">
                  {c.name}{kids.length > 0 && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
                </a>
                {kids.length > 0 && (
                  <div className="hidden group-hover:block group-focus-within:block absolute left-0 top-full min-w-[240px] bg-white border border-border shadow-xl rounded-b-lg p-3 z-50">
                    <a href={categoryHref(all, c.slug)} className="block px-3 py-2 rounded-md text-sm font-semibold text-brand-teal hover:bg-brand-cream">All {c.name}</a>
                    {kids.map((k) => {
                      const grand = childrenOf(all, k.id).filter((g) => g.show_in_nav);
                      return (
                        <div key={k.id}>
                          <a href={categoryHref(all, k.slug)} className="block px-3 py-2 rounded-md text-sm text-brand-navy hover:bg-brand-cream">{k.name}</a>
                          {grand.map((g) => (
                            <a key={g.id} href={categoryHref(all, g.slug)} className="block pl-6 pr-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-brand-cream hover:text-brand-navy">{g.name}</a>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function FooterNewsletter() {
  const [email, setEmail] = useState("");
  const mutation = useMutation({
    mutationFn: (e: string) => subscribeNewsletter({ data: { email: e } }),
    onSuccess: (res) => {
      toast.success(res.alreadySubscribed ? "You're already subscribed!" : "Thanks — you're now subscribed!");
      setEmail("");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });
  return (
    <form
      className="flex gap-2 mb-5"
      onSubmit={(e) => { e.preventDefault(); if (email.trim()) mutation.mutate(email.trim()); }}
    >
      <Input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
      />
      <Button type="submit" disabled={mutation.isPending} className="bg-brand-gold hover:bg-brand-gold-dark">
        {mutation.isPending ? "..." : "Join"}
      </Button>
    </form>
  );
}

export function Footer() {
  const schoolFeatures = useSchoolFeatures();
  // Contact details, payment methods and categories come from settings / data
  const { data: settingsData } = useQuery(storeSettingsQueryOptions);
  const st = (settingsData ?? {}) as Record<string, any>;
  const { data: navCats } = useQuery(navCategoriesQuery);
  const footerCats = childrenOf(navCats ?? [], null).filter((c) => c.show_in_nav);
  const phone = st.contact_phone || "";
  const payments = [
    st.enable_cod !== false && "Cash on Delivery",
    st.enable_bank_transfer !== false && "Bank Transfer",
    st.enable_jazzcash === true && "JazzCash",
    st.enable_easypaisa === true && "EasyPaisa",
  ].filter(Boolean) as string[];
  return (
    <footer className="bg-brand-navy text-white pt-8 md:pt-14 pb-6">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 lg:gap-10">
        <div className="text-center md:text-left">
          <div className="font-display text-xl md:text-2xl font-bold text-white">SchoolBooksExperts</div>
          <div className="text-[11px] md:text-xs text-white/60 tracking-widest uppercase mt-1 mb-3 md:mb-4">
            A Complete Family Store
          </div>
          <p className="text-sm text-white/70 mb-4">Serving Lahore families since 1968.</p>
          <ul className="space-y-1 md:space-y-2 text-sm text-white/80 inline-block text-left">
            {st.address && <li className="flex items-center gap-2 py-1"><MapPin className="h-4 w-4 text-brand-gold" /><span>{st.address}</span></li>}
            {phone && <li className="flex items-center gap-2 py-1"><Phone className="h-4 w-4 text-brand-gold" /><a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:text-brand-gold">{phone}</a></li>}
            {st.contact_email && <li className="flex items-center gap-2 py-1"><Mail className="h-4 w-4 text-brand-gold" /><a href={`mailto:${st.contact_email}`} className="hover:text-brand-gold">{st.contact_email}</a></li>}
            <li className="flex items-center gap-2 py-1"><MessageCircle className="h-4 w-4 text-green-500" /><a href="https://wa.me/923404548850" target="_blank" rel="noopener noreferrer" className="hover:text-brand-gold">WhatsApp us</a></li>
          </ul>
        </div>
        <div className="order-3 md:order-none mb-2">
          <h4 className="text-sm font-bold uppercase tracking-wide mb-3 md:mb-4 md:font-display md:text-lg md:font-semibold md:normal-case md:tracking-normal">Quick Links</h4>
          <ul className="grid grid-cols-2 md:grid-cols-1 gap-x-2 text-sm text-white/80">
            {[
              ["Returns & Exchange Policy","/refund"],["FAQs","/faq"],["Track Your Order","/track"],
              ["Terms & Conditions","/terms"],["Delivery Policy","/shipping"],["Contact Us","/contact"],
              ["About Us","/about"],["Privacy Policy","/privacy"],["Shop by School","/schools"],
            ].filter(([, h]) => schoolFeatures || !isSchoolFeatureHref(h)).map(([l,h]) => (
              <li key={l}><a href={h} className="block py-1 hover:text-brand-gold transition">{l}</a></li>
            ))}
          </ul>
        </div>
        <div className="order-2 md:order-none mb-2">
          <h4 className="text-sm font-bold uppercase tracking-wide mb-3 md:mb-4 md:font-display md:text-lg md:font-semibold md:normal-case md:tracking-normal">Categories</h4>
          <ul className="grid grid-cols-2 md:grid-cols-1 gap-x-2 text-sm text-white/80">
            {footerCats.map((c) => (
              <li key={c.id}><a href={categoryHref(navCats ?? [], c.slug)} className="block py-1 hover:text-brand-gold transition">{c.name}</a></li>
            ))}
            <li><a href="/shop" className="block py-1 hover:text-brand-gold transition">Shop all</a></li>
          </ul>
        </div>
        <div className="order-4 md:order-none">
          <h4 className="text-sm font-bold uppercase tracking-wide mb-3 md:mb-4 md:font-display md:text-lg md:font-semibold md:normal-case md:tracking-normal text-center md:text-left">Stay in Touch</h4>
          <FooterNewsletter />
          <div className="flex justify-center md:justify-start gap-3">
            {[Facebook, Instagram, Youtube, MessageCircle].map((Icon, i) => (
              <a key={i} href="#" className="h-10 w-10 rounded-full bg-white/10 hover:bg-brand-gold flex items-center justify-center transition">
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 mt-8 md:mt-10 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 text-xs md:text-sm text-white/60 text-center">
        <div>© {st.store_name || "SchoolBooksExperts"} {new Date().getFullYear()} | All Rights Reserved</div>
        <div className="flex items-center justify-center gap-2 md:gap-3 flex-wrap">
          {payments.map((p) => (
            <span key={p} className="bg-white/10 px-2.5 md:px-3 py-1 rounded text-[10px] md:text-xs font-medium text-white/80 grayscale">{p}</span>
          ))}
        </div>
      </div>
    </footer>
  );
}

export function WhatsAppFab() {
  return (
    <a
      href="https://wa.me/923404548850"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 h-12 w-12 md:h-14 md:w-14 rounded-full bg-[#25D366] hover:bg-green-600 text-white flex items-center justify-center transition hover:scale-110 wa-pulse"
      style={{ boxShadow: "0 4px 12px rgba(37,211,102,0.4)" }}
      aria-label="WhatsApp"
    >
      <MessageCircle className="h-6 w-6 md:h-7 md:w-7" />
    </a>
  );
}


export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <AnnouncementBar />
      <Header />
      <CategoryNav />
      <main className="flex-1">{children}</main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}

/* ============================ SHARED CARDS ============================ */
export function ProductCard({ p }: { p: Product }) {
  const img = p.images?.[0] ?? FALLBACK_IMG;
  const sale = p.sale_price != null && p.sale_price < p.price ? p.sale_price : null;
  const hasVariants = (p.variant_count ?? 0) > 0;
  const range = hasVariants && p.variant_min != null && p.variant_max != null && p.variant_max > p.variant_min;
  const outOfStock = hasVariants ? p.variant_in_stock === false : p.stock_quantity != null && p.stock_quantity <= 0;
  const lowStock = !hasVariants && p.stock_quantity != null && p.stock_quantity > 0 && p.stock_quantity <= 5;
  const pack = isPack(p);
  const shown = range ? p.variant_min! : hasVariants && p.variant_min != null ? p.variant_min : sale ?? p.price;
  return (
    <Link
      to="/product/$slug"
      params={{ slug: p.slug }}
      className="block bg-white rounded-xl border border-border overflow-hidden hover:shadow-xl transition group relative"
    >
      <WishlistButton productId={p.id} />
      <div className="aspect-[3/4] bg-brand-cream relative overflow-hidden">
        <img src={img} alt={p.name} className={`h-full w-full object-cover group-hover:scale-105 transition ${outOfStock ? "opacity-60" : ""}`} loading="lazy" />
        <div className="absolute left-2 top-2 flex flex-col gap-1 items-start">
          {p.is_new && <span className="text-[10px] font-semibold uppercase tracking-wide bg-brand-teal text-white px-1.5 py-0.5 rounded">New</span>}
          {pack && <span className="text-[10px] font-semibold bg-brand-gold text-white px-1.5 py-0.5 rounded">{packLabel(p)}</span>}
        </div>
        {outOfStock && <span className="absolute bottom-2 left-2 text-[10px] font-semibold bg-white/90 text-red-600 px-1.5 py-0.5 rounded">Out of stock</span>}
        {lowStock && <span className="absolute bottom-2 left-2 text-[10px] font-semibold bg-white/90 text-orange-600 px-1.5 py-0.5 rounded">Only {p.stock_quantity} left</span>}
      </div>
      <div className="p-2.5 md:p-3 space-y-1 md:space-y-1.5">
        {p.isbn && (
          <span className="hidden md:inline-block text-[10px] border border-brand-teal text-brand-teal px-1.5 py-0.5 rounded">
            ISBN {p.isbn.slice(-6)}
          </span>
        )}
        <h3 className="font-display text-xs md:text-sm font-semibold text-brand-navy line-clamp-2 leading-snug min-h-[2.25rem] md:min-h-[2.5rem]">
          {p.name}
        </h3>
        <div className="hidden md:block text-xs text-muted-foreground line-clamp-1">{p.author ?? p.brand ?? " "}</div>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <div className="text-sm md:text-base font-bold text-brand-teal">
            {range ? `${pkr(p.variant_min!)} – ${pkr(p.variant_max!)}` : pkr(shown)}
            {pack && <span className="text-[10px] md:text-xs font-medium text-muted-foreground"> / pack</span>}
          </div>
          {!hasVariants && sale && <div className="text-[10px] md:text-xs text-muted-foreground line-through">{pkr(p.price)}</div>}
        </div>
        {pack && p.pack_size && (
          <div className="text-[10px] md:text-xs text-muted-foreground">{pkr(shown / p.pack_size)} per {p.unit_label || "item"}</div>
        )}
        <Button size="sm" disabled={outOfStock} className="w-full py-2 text-xs md:text-sm bg-brand-teal hover:bg-brand-teal-dark text-white">
          {outOfStock ? "Out of stock" : hasVariants ? "Choose options" : "Add to Cart"}
        </Button>
      </div>
    </Link>
  );
}

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

export function ProductSkeleton() {
  return (
    <div className="w-full space-y-2">
      <Skeleton className="aspect-[3/4] w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}
