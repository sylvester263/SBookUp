import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/layout/site-chrome";

const SECTIONS = [
  { id: "use", title: "Use of Service", body: "By placing an order with SchoolBooksExperts you agree to provide accurate information and to use this site for lawful purposes only. We reserve the right to refuse service at our discretion." },
  { id: "orders", title: "Orders & Pricing", body: "Prices are listed in Pakistani Rupees and may change without notice. Orders are accepted subject to stock availability. We reserve the right to cancel orders due to pricing errors with a full refund." },
  { id: "payment", title: "Payment", body: "We accept Cash on Delivery, JazzCash, EasyPaisa, bank transfer, and Visa/Mastercard. Card payments are processed by Stripe; we do not store card details." },
  { id: "delivery", title: "Delivery", body: "Estimated delivery times are best-effort and may be affected by courier partners or weather. Risk passes to the buyer on delivery." },
  { id: "returns", title: "Returns", body: "Unused items in original packaging may be returned within 7 days. See our Refund Policy for details." },
  { id: "ip", title: "Intellectual Property", body: "All content on this site is owned by or licensed to SchoolBooksExperts. Reuse without permission is prohibited." },
  { id: "liability", title: "Liability", body: "Our liability is limited to the value of the order. We are not liable for indirect or consequential losses." },
  { id: "law", title: "Governing Law", body: "These terms are governed by the laws of the Islamic Republic of Pakistan. Disputes are subject to courts in Lahore." },
];

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — SchoolBooksExperts" },
      { name: "description", content: "Terms and conditions governing the use of SchoolBooksExperts online store." },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: () => <PolicyPage title="Terms & Conditions" updated="June 2026" sections={SECTIONS} />,
});

export function PolicyPage({ title, updated, sections }: { title: string; updated: string; sections: { id: string; title: string; body: string }[] }) {
  return (
    <SiteShell>
      <section className="bg-brand-navy text-white py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-4xl font-bold">{title}</h1>
          <p className="text-white/70 text-sm mt-2">Last updated: {updated}</p>
        </div>
      </section>
      <section className="container mx-auto px-4 py-10 grid md:grid-cols-[220px_1fr] gap-8">
        <aside className="md:sticky md:top-24 md:self-start">
          <nav className="bg-white border border-border rounded-xl p-4 text-sm">
            <div className="font-semibold text-brand-navy mb-2">Contents</div>
            <ul className="space-y-1.5">
              {sections.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} className="text-muted-foreground hover:text-brand-teal">{s.title}</a></li>
              ))}
            </ul>
          </nav>
        </aside>
        <article className="bg-white border border-border rounded-xl p-6 md:p-8 space-y-6">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2 className="font-display text-xl text-brand-navy mb-2">{s.title}</h2>
              <p className="text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </article>
      </section>
    </SiteShell>
  );
}
