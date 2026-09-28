import { useMemo, useState } from "react";
import { useSchoolFeatures } from "@/lib/feature-flags";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SiteShell } from "@/components/layout/site-chrome";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — SchoolBooksExperts" },
      { name: "description", content: "Frequently asked questions about ordering, payments, delivery, returns and books." },
      { property: "og:url", content: "/faq" },
    ],
    links: [{ rel: "canonical", href: "/faq" }],
  }),
  component: FAQPage,
});

const FAQS: { category: string; items: { q: string; a: string; school?: boolean }[] }[] = [
  {
    category: "Ordering",
    items: [
      { q: "How do I place an order?", a: "Browse to a product, add it to your cart, and check out. You can pay on delivery, by bank transfer, JazzCash, EasyPaisa, or card." },
      { q: "Can I order without an account?", a: "Yes. Guest checkout is supported — we'll send order updates to your email." },
      { q: "Can I order books for a full class list?", a: "Yes. Search for your school name on our home page or browse Bundles for ready-made class kits at a discount.", school: true },
    ],
  },
  {
    category: "Payments",
    items: [
      { q: "What payment methods do you accept?", a: "Cash on Delivery, JazzCash, EasyPaisa, Bank Transfer, and Visa/Mastercard." },
      { q: "Is online payment safe?", a: "All card payments are processed by Stripe over an encrypted connection. We never see your card details." },
      { q: "Do you offer invoices?", a: "Every order comes with a printable invoice. Schools and offices can request a stamped copy by email." },
    ],
  },
  {
    category: "Delivery",
    items: [
      { q: "How long does delivery take?", a: "Lahore: 1–2 days. Punjab: 2–3 days. Rest of Pakistan: 3–5 days." },
      { q: "Do you offer free delivery?", a: "Yes — free delivery on orders above PKR 2,000." },
      { q: "Can I track my order?", a: "Yes. Use the /track page with your order number and email." },
    ],
  },
  {
    category: "Returns",
    items: [
      { q: "What is your return policy?", a: "Unused items in original packaging may be returned within 7 days. Books must be unmarked." },
      { q: "How do refunds work?", a: "Approved refunds are processed within 5–7 business days back to your original payment method." },
    ],
  },
  {
    category: "Books",
    items: [
      { q: "Do you carry all boards?", a: "Yes — Federal, Punjab, Sindh, Cambridge (O/A-Levels) and Edexcel." },
      { q: "I have the ISBN — can I search by that?", a: "Absolutely. Paste the ISBN in the search bar and you'll jump straight to the right edition." },
      { q: "Do you stock past papers?", a: "Yes, for most boards and major subjects. Check the Past Papers category." },
    ],
  },
];

function FAQPage() {
  const [query, setQuery] = useState("");
  const schoolFeatures = useSchoolFeatures();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // School-bundle answers are hidden while school features are off.
    const visible = FAQS.map((g) => ({ ...g, items: g.items.filter((it) => schoolFeatures || !it.school) }));
    if (!q) return visible;
    return visible.map((g) => ({ ...g, items: g.items.filter((it) => (it.q + " " + it.a).toLowerCase().includes(q)) })).filter((g) => g.items.length);
  }, [query, schoolFeatures]);

  return (
    <SiteShell>
      <section className="bg-brand-teal text-white py-14">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Frequently Asked Questions</h1>
          <p className="mt-3 text-white/85">Quick answers to the things our customers ask most often.</p>
          <div className="relative mt-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search FAQs..."
              className="pl-9 h-11 rounded-full bg-white text-brand-navy"
            />
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-12 max-w-3xl">
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No FAQs match your search.</p>
        )}
        {filtered.map((g) => (
          <div key={g.category} id={g.category.toLowerCase()} className="mb-8 scroll-mt-40">
            <h2 className="font-display text-xl text-brand-navy mb-3">{g.category}</h2>
            <Accordion type="single" collapsible className="bg-white rounded-xl border border-border">
              {g.items.map((it, i) => (
                <AccordionItem key={i} value={`${g.category}-${i}`}>
                  <AccordionTrigger className="px-4 text-left">{it.q}</AccordionTrigger>
                  <AccordionContent className="px-4 text-muted-foreground">{it.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </section>
    </SiteShell>
  );
}
