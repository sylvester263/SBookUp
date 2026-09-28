import { createFileRoute, Link } from "@tanstack/react-router";
import { requireSchoolFeatures } from "@/lib/feature-flags";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, BookOpen, MessageCircle } from "lucide-react";
import { SiteShell } from "@/components/layout/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { schoolsQuery, WHATSAPP_LINK, type School } from "@/lib/schools-data";

export const Route = createFileRoute("/schools")({
  // Hidden (404) while school features are switched off in admin Settings.
  beforeLoad: ({ context }) => requireSchoolFeatures(context.queryClient),
  head: () => ({
    meta: [
      { title: "Shop by School — SchoolBooksExperts" },
      {
        name: "description",
        content:
          "Browse complete book bundles by your school. Beaconhouse, The City School, LGS, Allied School and more — class-wise books delivered in Lahore.",
      },
      { property: "og:title", content: "Shop by School — SchoolBooksExperts" },
      {
        property: "og:description",
        content: "Find your school and get the complete book bundle for every class.",
      },
    ],
  }),
  component: SchoolsPage,
});

function SchoolsPage() {
  const { data, isLoading } = useQuery(schoolsQuery());
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <SiteShell>
      {/* Hero */}
      <section className="bg-gradient-to-r from-brand-teal to-brand-teal/80 text-white py-10 md:py-16">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <h1 className="font-display text-3xl md:text-5xl font-bold mb-3">Shop by School</h1>
          <p className="text-white/90 text-sm md:text-lg">
            Pick your school, choose your class, and get every book + notebook in one bundle —
            delivered across Lahore.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-12">
        {/* Search */}
        <div className="max-w-xl mx-auto mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search schools..."
              className="w-full h-12 pl-11 pr-4 rounded-full border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[200px] rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center max-w-md mx-auto">
            <p className="text-sm text-brand-navy mb-4">Don't see your school? Contact us!</p>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp us
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((s: School) => (
              <Link
                key={s.id}
                to="/schools/$slug"
                params={{ slug: s.slug }}
                className="bg-white rounded-xl border border-border hover:border-brand-teal hover:shadow-md transition p-5 group"
              >
                <div className="h-20 w-20 mx-auto mb-3 rounded-full bg-gradient-to-br from-brand-teal/10 to-brand-gold/10 flex items-center justify-center overflow-hidden">
                  {s.logo_url ? (
                    <img src={s.logo_url} alt={s.name} className="h-full w-full object-cover" />
                  ) : (
                    <BookOpen className="h-8 w-8 text-brand-teal" />
                  )}
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-sm md:text-base text-brand-navy mb-1 line-clamp-2 min-h-[2.5rem]">
                    {s.name}
                  </h3>
                  <div className="text-xs text-muted-foreground">{s.city}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </SiteShell>
  );
}
