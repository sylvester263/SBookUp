import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import HomePage from "@/components/home/HomePage";
import { homepageSectionsQuery, sectionProductsQuery } from "@/lib/homepage-queries";
import { defaultSectionRows } from "@/lib/homepage-default";
import { firstProductSources } from "@/lib/homepage-render";
import { adminListHomeSections } from "@/lib/homepage-admin.functions";
import { storeSettingsQueryOptions } from "@/lib/feature-flags";
import { parseSiteSettings, SOCIAL_KEYS } from "@/lib/site-settings";
import { jsonLd, siteUrl } from "@/lib/seo";
import { useAuth } from "@/lib/auth-context";
import type { SectionRow } from "@/lib/homepage-sections";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ preview: z.coerce.number().optional().catch(undefined) }),
  loader: async ({ context }) => {
    const qc = context.queryClient;
    // Sections + settings on the server (the header, hero and top of the page are
    // server-rendered). No sections yet (or the table isn't created yet): the default layout.
    const [rows, settings] = await Promise.all([
      qc.ensureQueryData(homepageSectionsQuery).catch(() => null),
      qc.ensureQueryData(storeSettingsQueryOptions).catch(() => null),
    ]);
    const layout = rows?.length ? rows : defaultSectionRows();
    // Products for the server-rendered top sections (EAGER_SECTIONS in HomeSections),
    // so they don't pop in; everything lower loads on scroll.
    await Promise.all(
      firstProductSources(layout.slice(0, 3)).map((s) =>
        qc.ensureQueryData(sectionProductsQuery(s.source, s.limit)).catch(() => null),
      ),
    );
    return { settings };
  },
  head: ({ loaderData }) => {
    const raw = (loaderData?.settings ?? {}) as Record<string, unknown>;
    const s = parseSiteSettings(raw);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const title = str(raw.meta_title) ?? `${s.storeName} — Books, Stationery, Gifts & Toys`;
    const description =
      str(raw.meta_description) ??
      `Shop books, stationery, gifts, toys, sports items and character costumes at ${s.storeName}. Delivery across Pakistan.`;
    const home = siteUrl("/");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: home },
        ...(s.logoUrl
          ? [
              {
                property: "og:image",
                content: s.logoUrl.startsWith("/") ? siteUrl(s.logoUrl) : s.logoUrl,
              },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: home }],
      scripts: [
        {
          type: "application/ld+json",
          children: jsonLd({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: s.storeName,
            url: home,
            ...(s.logoUrl
              ? { logo: s.logoUrl.startsWith("/") ? siteUrl(s.logoUrl) : s.logoUrl }
              : {}),
            ...(s.email ? { email: s.email } : {}),
            ...(s.phone ? { telephone: s.phone } : {}),
            ...(s.address
              ? {
                  address: {
                    "@type": "PostalAddress",
                    streetAddress: s.address,
                    addressCountry: "PK",
                  },
                }
              : {}),
            ...(s.phone
              ? {
                  contactPoint: [
                    {
                      "@type": "ContactPoint",
                      telephone: s.phone,
                      contactType: "customer service",
                      areaServed: "PK",
                    },
                  ],
                }
              : {}),
            ...(SOCIAL_KEYS.some((k) => s.social[k])
              ? { sameAs: SOCIAL_KEYS.map((k) => s.social[k]).filter(Boolean) }
              : {}),
          }),
        },
        {
          type: "application/ld+json",
          children: jsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: s.storeName,
            url: home,
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${siteUrl("/shop")}?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          }),
        },
      ],
    };
  },
  component: HomeRoute,
});

function HomeRoute() {
  const { preview } = Route.useSearch();
  const { user } = useAuth();
  const sections = useQuery({ ...homepageSectionsQuery, retry: 1 });
  // Staff preview (?preview=1): every section, including switched-off / scheduled ones.
  // The server function refuses non-staff, and then the normal homepage is shown.
  const listFn = useServerFn(adminListHomeSections);
  const all = useQuery({
    queryKey: ["homepage-preview", user?.id],
    queryFn: () => listFn(),
    enabled: preview === 1 && !!user,
    retry: false,
  });
  const inPreview = preview === 1 && !!all.data;
  const rows: SectionRow[] = inPreview
    ? (all.data as SectionRow[])
    : sections.data?.length
      ? sections.data
      : defaultSectionRows();
  return <HomePage rows={rows} preview={inPreview} />;
}
