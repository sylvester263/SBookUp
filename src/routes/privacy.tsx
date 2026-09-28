import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "./terms";

const SECTIONS = [
  { id: "collect", title: "Information We Collect", body: "Name, email, phone, shipping address and order history when you place an order or create an account. Anonymous browsing and analytics data when you visit." },
  { id: "use", title: "How We Use It", body: "To process orders, communicate updates, improve our store, and (with your consent) send newsletters and seasonal reminders." },
  { id: "share", title: "Sharing", body: "We share only what's necessary with couriers and payment processors. We never sell your personal data." },
  { id: "cookies", title: "Cookies", body: "We use essential cookies for cart and login, and aggregate analytics cookies to understand site usage." },
  { id: "rights", title: "Your Rights", body: "You may request access, correction, or deletion of your data at any time by emailing hello@schoolbooksexperts.com." },
  { id: "security", title: "Security", body: "Data is encrypted in transit. Card payments are processed by Stripe; we never store full card numbers." },
  { id: "contact", title: "Contact", body: "Questions about your privacy: hello@schoolbooksexperts.com." },
];

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy — SchoolBooksExperts" }, { name: "description", content: "How SchoolBooksExperts collects, uses and protects your personal information." }],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: () => <PolicyPage title="Privacy Policy" updated="June 2026" sections={SECTIONS} />,
});
