import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Users, Package, Layers, MapPin, Heart, Truck, Sparkles } from "lucide-react";
import { SiteShell } from "@/components/layout/site-chrome";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About SchoolBooksExperts — Books, Stationery, Gifts, Toys & More" },
      { name: "description", content: "SchoolBooksExperts is an online store for books, stationery, gifts, toys & games, sports items and character costumes, delivering across Pakistan." },
      { property: "og:title", content: "About SchoolBooksExperts" },
      { property: "og:description", content: "Books, stationery, gifts, toys & games, sports items and character costumes — delivered across Pakistan." },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});

const STATS = [
  { value: "6", label: "Departments", icon: Layers },
  { value: "1,000+", label: "Products", icon: Package },
  { value: "10,000+", label: "Families Served", icon: Users },
  { value: "Nationwide", label: "Delivery", icon: Truck },
];

const VALUES = [
  { icon: Heart, title: "Families First", body: "Every product is picked with students, parents and gift-givers in mind." },
  { icon: BookOpen, title: "Education Matters", body: "From Class 1 to A-Levels — every book, every board, every year." },
  { icon: Sparkles, title: "Quality Promise", body: "We stock only what we'd buy for our own children." },
];

function AboutPage() {
  return (
    <SiteShell>
      <section className="relative h-[360px] md:h-[460px] overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1600&q=80"
          alt="Shelves of books at SchoolBooksExperts"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-navy/85 to-brand-navy/40" />
        <div className="relative container mx-auto px-4 h-full flex flex-col justify-center text-white">
          <p className="text-brand-gold uppercase tracking-widest text-sm font-semibold">Our Story</p>
          <h1 className="font-display text-4xl md:text-6xl font-bold mt-2 max-w-2xl">Everything for School, Play and Gifting</h1>
          <p className="mt-4 max-w-xl text-white/80">Books, stationery, gifts, toys &amp; games, sports items and character costumes — in one place.</p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 grid md:grid-cols-2 gap-12">
        <div className="prose max-w-none">
          <h2 className="font-display text-3xl text-brand-navy mb-4">Who we are</h2>
          <p className="text-muted-foreground">
            SchoolBooksExperts is a one-stop store for families, students and teachers. Our roots are in Urdu Bazaar, Lahore, and our
            online catalogue brings the same range to homes across Pakistan: the right textbook and edition, the stationery on the school
            list, and something fun for after school.
          </p>
          <p className="text-muted-foreground">
            Today we have six departments: <strong>Books</strong>, <strong>Stationery</strong>, <strong>Gifts</strong>,{" "}
            <strong>Toys &amp; Games</strong>, <strong>Sports Items</strong> and <strong>Character Costumes</strong>. From readers and
            reference books to notebooks, art supplies, board games, cricket bats and dress-up favourites, we stock what families actually
            need, all year round.
          </p>
          <p className="text-muted-foreground">
            Our promise is simple: thoughtful selection, fair prices, careful packing and friendly help whenever you need it — online, on
            WhatsApp or in person.
          </p>
        </div>
        <div className="space-y-4">
          <img
            src="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=900&q=80"
            alt="Stacks of school books"
            className="rounded-xl shadow-lg w-full h-72 object-cover"
            loading="lazy"
          />
          <img src="https://images.unsplash.com/photo-1503602642458-232111445657?w=900&q=80" alt="Stationery" className="rounded-xl h-40 w-full object-cover" loading="lazy" />
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
              pick out a board game, or recommend a thoughtful gift.
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
