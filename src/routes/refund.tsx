import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "./terms";

const SECTIONS = [
  { id: "eligibility", title: "Return Eligibility", body: "Items must be unused, in original packaging, and returned within 7 days of delivery. Books must be unmarked. Custom or personalized items are non-returnable." },
  { id: "process", title: "How to Request a Return", body: "Email hello@schoolbooksexperts.com with your order number and a photo of the item. Once approved, we'll arrange a pickup or share a drop-off address." },
  { id: "refunds", title: "Refunds", body: "Approved refunds are processed within 5–7 business days back to the original payment method. Cash on Delivery refunds are issued by bank transfer." },
  { id: "exchanges", title: "Exchanges", body: "Wrong edition or size? We'll exchange it free of charge — return shipping is on us within Lahore." },
  { id: "damaged", title: "Damaged or Wrong Items", body: "If your order arrives damaged or incorrect, contact us within 48 hours of delivery and we'll make it right immediately." },
];

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [{ title: "Refund & Return Policy — SchoolBooksExperts" }, { name: "description", content: "Refund, return and exchange policy for SchoolBooksExperts orders." }],
    links: [{ rel: "canonical", href: "/refund" }],
  }),
  component: () => <PolicyPage title="Refund & Return Policy" updated="June 2026" sections={SECTIONS} />,
});
