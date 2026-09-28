// Footer / mobile-drawer links (pages that exist in src/routes).

export type SiteLink = { label: string; href: string };

/** Policy & information pages (footer column 3, mobile drawer). */
export const INFO_LINKS: SiteLink[] = [
  { label: "About Us", href: "/about" },
  { label: "Returns & Exchange Policy", href: "/refund" },
  { label: "Delivery Policy", href: "/shipping" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Payment Information", href: "/faq#payments" },
];

/** Customer help links (footer column 4, mobile drawer). */
export const HELP_LINKS: SiteLink[] = [
  { label: "My Account", href: "/account" },
  { label: "FAQs", href: "/faq" },
  { label: "Track Your Order", href: "/track" },
  { label: "Cash on Delivery", href: "/faq#payments" },
  { label: "Contact Us", href: "/contact" },
];

/** "Shop Deals": products on sale. */
export const DEALS_HREF = "/shop?on_sale=true";
