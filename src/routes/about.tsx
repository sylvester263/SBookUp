import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Users, Package, Layers, MapPin, Heart, Award, Sparkles } from "lucide-react";
import { SiteShell } from "@/components/layout/site-chrome";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About SchoolBooksExperts — Serving Lahore Families Since 1968" },
      { name: "description", content: "Three generations of Lahore's trusted family store for books, stationery, uniforms, toys and more. Our story since 1968." },
      { property: "og:title", content: "About SchoolBooksExperts" },
      { property: "og:description", content: "Serving Lahore families since 1968." },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});

const STATS = [
  { value: "50+", label: "Years of Service", icon: Award },
  { value: "10,000+", label: "Families Served", icon: Users },
  { value: "1,000+", label: "Products", icon: Package },
  { value: "5", label: "Departments", icon: Layers },
];

const VALUES = [
  { icon: Heart, title: "Family First", body: "Three generations of our family personally curating products for yours." },
  { icon: BookOpen, title: "Education Matters", body: "From Class 1 to A-Levels — every book, every board, every year." },
  { icon: Sparkles, title: "Quality Promise", body: "We stock only what we'd buy for our own children." },
];

function AboutPage() {
  return (
    <SiteShell>
      <section className="relative h-[360px] md:h-[460px] overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1600&q=80"
          alt="SchoolBooksExperts storefront in Urdu Bazaar, Lahore"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-navy/85 to-brand-navy/40" />
        <div className="relative container mx-auto px-4 h-full flex flex-col justify-center text-white">
          <p className="text-brand-gold uppercase tracking-widest text-sm font-semibold">Our Story</p>
          <h1 className="font-display text-4xl md:text-6xl font-bold mt-2 max-w-2xl">Serving Lahore Families Since 1968</h1>
          <p className="mt-4 max-w-xl text-white/80">A complete family store built on three generations of trust, care and community.</p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 grid md:grid-cols-2 gap-12">
        <div className="prose max-w-none">
          <h2 className="font-display text-3xl text-brand-navy mb-4">From a tiny shop in Urdu Bazaar</h2>
          <p className="text-muted-foreground">
            SchoolBooksExperts opened its doors in 1968 with a single shelf of textbooks and a promise: every child in Lahore deserves easy access
            to the books they need. What began as a one-room stationery shop in Urdu Bazaar quickly became a household name as families discovered
            our knack for stocking exactly the right edition, in the right size, at the right time.
          </p>
          <p className="text-muted-foreground">
            Over the decades we grew alongside the families we served — adding uniforms when their children started school, baby supplies when
            grandchildren arrived, and toys, board games and party items to keep family life joyful. Today we are five departments under one roof,
            and a curated online catalogue that ships across Pakistan.
          </p>
          <p className="text-muted-foreground">
            Three generations later we are still family-run. Our promise has never changed: thoughtful selection, fair prices, and the kind of
            service that makes you feel like you've walked into a neighbour's shop — because, for many of you, that's exactly what we are.
          </p>
        </div>
        <div className="space-y-4">
          <img
            src="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=900&q=80"
            alt="Stacks of school books"
            className="rounded-xl shadow-lg w-full h-72 object-cover"
            loading="lazy"
          />
          <div className="grid grid-cols-2 gap-4">
            <img src="https://images.unsplash.com/photo-1503602642458-232111445657?w=600&q=80" alt="Stationery" className="rounded-xl h-40 w-full object-cover" loading="lazy" />
            <img src="https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=600&q=80" alt="Uniforms" className="rounded-xl h-40 w-full object-cover" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="bg-brand-teal text-white py-12">
        <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div key={label}>
              <Icon className="h-7 w-7 mx-auto mb-2 text-brand-gold" />
              <div className="font-display text-3xl md:text-4xl font-bold">{value}</div>
              <div className="text-sm text-white/80 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="font-display text-3xl text-center text-brand-navy mb-10">What we stand for</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-white rounded-xl border border-border p-6 text-center hover:shadow-md transition">
              <span className="h-12 w-12 rounded-full bg-brand-teal/10 text-brand-teal flex items-center justify-center mx-auto mb-3">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="font-semibold text-brand-navy mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-2 gap-8 items-stretch">
          <div className="rounded-xl overflow-hidden border border-border h-80 md:h-full">
            <iframe
              title="SchoolBooksExperts location"
              src="https://www.google.com/maps?q=Urdu+Bazaar,+Lahore&output=embed"
              className="w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="bg-white rounded-xl border border-border p-8">
            <h3 className="font-display text-2xl text-brand-navy mb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-brand-teal" /> Visit our store
            </h3>
            <p className="text-muted-foreground mb-4">
              Walk in any day and you'll find one of us behind the counter — ready to help you find that one tricky textbook,
              measure a uniform, or recommend a thoughtful gift.
            </p>
            <dl className="text-sm space-y-2">
              <div><dt className="inline font-medium text-brand-navy">Address: </dt><dd className="inline text-muted-foreground">Urdu Bazaar, Lahore, Pakistan</dd></div>
              <div><dt className="inline font-medium text-brand-navy">Phone: </dt><dd className="inline text-muted-foreground">+92 300 0000000</dd></div>
              <div><dt className="inline font-medium text-brand-navy">Hours: </dt><dd className="inline text-muted-foreground">Mon–Sat: 10:00 AM – 9:00 PM, Sun: 12:00 PM – 8:00 PM</dd></div>
            </dl>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
