import { useEffect, useState } from "react";
import { useSchoolFeatures, isSchoolFeatureHref } from "@/lib/feature-flags";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  bannersQuery, categoriesQuery, bundlesQuery, productsByCategoryQuery,
  type Banner, type Category,
} from "@/lib/home-data";
import {
  SiteShell, HScroller, ProductCard, ProductSkeleton, BundleCard,
  CATEGORY_ICONS,
} from "@/components/layout/site-chrome";
import FindBooksBySchool from "@/components/home/FindBooksBySchool";
import { HomeCatalogSections } from "@/components/home/CatalogSections";

const HERO_SLIDES = [
  {
    bg: "linear-gradient(135deg, #1A6B6B 0%, #135252 100%)",
    eyebrow: "Season 2026",
    title: "Back to School 2026",
    subtitle: "Complete book bundles for all classes — handpicked by Lahore's most trusted booksellers.",
    cta: "Find Your School Books", ctaHref: "/schools",
  },
  {
    bg: "linear-gradient(135deg, #1A1A2E 0%, #2a2a4a 100%)",
    eyebrow: "Limited Time",
    title: "Save up to 30% on Book Bundles",
    subtitle: "Federal Board, Punjab Board & Cambridge — all in one place.",
    cta: "View All Bundles", ctaHref: "#bundles",
  },
  {
    bg: "linear-gradient(135deg, #C8960C 0%, #A57B09 100%)",
    eyebrow: "New Arrivals",
    title: "Toys, Games & Costumes",
    subtitle: "Board games, sports gear and character costumes for every age.",
    cta: "Shop Now", ctaHref: "/shop/toys-games",
  },
];

function HeroSlider() {
  const { data: allBanners, isLoading } = useQuery(bannersQuery);
  const schoolFeatures = useSchoolFeatures();
  // While school features are hidden, drop banners/slides that link to them.
  const dbBanners = (allBanners ?? []).filter((b: Banner) => schoolFeatures || !isSchoolFeatureHref(b.link_url));
  const staticSlides = HERO_SLIDES.filter((s) => schoolFeatures || !isSchoolFeatureHref(s.ctaHref));
  const slides = dbBanners.length > 0
    ? dbBanners.map((b: Banner, i) => ({
        bg: HERO_SLIDES[i % 3].bg,
        eyebrow: "Featured",
        title: b.title,
        subtitle: b.subtitle ?? "",
        cta: "Shop Now",
        ctaHref: b.link_url ?? "#",
      }))
    : staticSlides;
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);
  if (isLoading) return <Skeleton className="w-full h-[220px] md:h-[340px] lg:h-[460px]" />;
  return (
    <section className="relative w-full h-[220px] md:h-[340px] lg:h-[460px] overflow-hidden">
      {slides.map((s, i) => (
        <div key={i} className="absolute inset-0 transition-opacity duration-1000 flex items-center"
          style={{ background: s.bg, opacity: i === idx % slides.length ? 1 : 0 }}>
          <div className="container mx-auto px-5 md:px-10 lg:px-12 text-white max-w-3xl">
            <div className="text-[10px] md:text-xs lg:text-sm uppercase tracking-[0.2em] lg:tracking-[0.3em] text-white/80 mb-1.5 md:mb-2 lg:mb-3">{s.eyebrow}</div>
            <h1 className="font-display text-xl md:text-3xl lg:text-6xl font-bold leading-tight mb-2 md:mb-3 lg:mb-4 line-clamp-2">{s.title}</h1>
            <p className="text-xs md:text-sm lg:text-lg text-white/90 mb-3 md:mb-4 lg:mb-6 max-w-xl line-clamp-2">{s.subtitle}</p>
            <a href={s.ctaHref} className="inline-flex items-center gap-2 bg-brand-gold hover:bg-brand-gold-dark text-white px-5 md:px-6 lg:px-7 py-2 md:py-2.5 lg:py-3 rounded-full font-semibold text-sm lg:text-base transition shadow-lg">
              {s.cta} <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      ))}
      <button onClick={() => setIdx((i) => (i - 1 + slides.length) % slides.length)} className="hidden md:flex absolute left-3 md:left-6 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/30 transition items-center justify-center" aria-label="Previous">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button onClick={() => setIdx((i) => (i + 1) % slides.length)} className="hidden md:flex absolute right-3 md:right-6 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/30 transition items-center justify-center" aria-label="Next">
        <ChevronRight className="h-5 w-5" />
      </button>
      <div className="absolute bottom-3 md:bottom-5 left-0 right-0 flex justify-center gap-1.5 md:gap-2">
        {slides.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} className={`h-1.5 md:h-2 rounded-full transition-all ${i === idx % slides.length ? "w-6 md:w-8 bg-white" : "w-1.5 md:w-2 bg-white/50"}`} aria-label={`Slide ${i + 1}`} />
        ))}
      </div>
    </section>
  );
}


function BundlesSection() {
  const { data, isLoading } = useQuery(bundlesQuery);
  return (
    <div id="bundles">
      <HScroller title="School Book Bundles" viewAllHref="/shop">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="w-[280px] h-[340px] rounded-xl shrink-0" />)
          : (data ?? []).map((b) => <div key={b.id} className="shrink-0"><BundleCard b={b} /></div>)}
      </HScroller>
    </div>
  );
}

// "Find Books by Class" pill picker was replaced by FindBooksBySchool component.


function Newsletter() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error("Please enter a valid email"); return; }
    setLoading(true);
    const { error } = await supabase.from("newsletters").insert({ email });
    setLoading(false);
    if (error) toast.error(error.message.includes("duplicate") ? "You're already subscribed!" : "Couldn't subscribe");
    else { toast.success("Subscribed! We'll keep you posted."); setEmail(""); }
  };
  return (
    <section className="bg-brand-teal text-white py-8 md:py-12 lg:py-14">
      <div className="container mx-auto px-4 max-w-5xl flex flex-col md:flex-row md:items-center md:gap-8 text-center md:text-left">
        <div className="md:flex-1">
          <h2 className="font-display text-xl md:text-2xl lg:text-4xl font-bold mb-2 md:mb-3">Get School Season Reminders</h2>
          <p className="text-white/90 text-sm md:text-base mb-5 md:mb-0 line-clamp-2">We'll remind you before exams — never miss a book again.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col md:flex-row gap-3 md:flex-1 md:max-w-md mx-auto md:mx-0">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="h-12 bg-white text-brand-navy rounded-xl md:rounded-full px-5 w-full md:flex-1" required />
          <Button type="submit" disabled={loading} className="h-12 px-7 rounded-xl md:rounded-full bg-brand-gold hover:bg-brand-gold-dark text-white font-semibold w-full md:w-auto md:shrink-0">{loading ? "..." : "Subscribe"}</Button>
        </form>
      </div>
    </section>

  );
}

export default function HomePage() {
  const schoolFeatures = useSchoolFeatures();
  return (
    <SiteShell>
      <HeroSlider />
      {/* School features: hidden (not deleted) until switched on in admin Settings */}
      {schoolFeatures && <BundlesSection />}
      {schoolFeatures && <FindBooksBySchool />}
      {/* Order and visibility are set in admin → Settings → Homepage */}
      <HomeCatalogSections />
      <Newsletter />
    </SiteShell>
  );
}
