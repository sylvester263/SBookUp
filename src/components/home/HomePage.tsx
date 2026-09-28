// The homepage: sections from Admin → Homepage, in order (see HomeSections).
// School bundles / "find books by school" appear after the hero only while
// school features are switched on.
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { bundlesQuery } from "@/lib/home-data";
import { useSchoolFeatures } from "@/lib/feature-flags";
import { SiteShell, HScroller, BundleCard } from "@/components/layout/site-chrome";
import FindBooksBySchool from "@/components/home/FindBooksBySchool";
import { HomeSections } from "@/components/home/HomeSections";
import type { SectionRow } from "@/lib/homepage-sections";
import { useSiteSettings } from "@/lib/site-settings";

function BundlesSection() {
  const { data, isLoading } = useQuery(bundlesQuery);
  return (
    <div id="bundles">
      <HScroller title="School Book Bundles" viewAllHref="/shop">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[340px] w-[280px] shrink-0 rounded-xl" />
            ))
          : (data ?? []).map((b) => (
              <div key={b.id} className="shrink-0">
                <BundleCard b={b} />
              </div>
            ))}
      </HScroller>
    </div>
  );
}

export default function HomePage({
  rows,
  preview = false,
}: {
  rows: SectionRow[];
  preview?: boolean;
}) {
  const schoolFeatures = useSchoolFeatures();
  const { storeName } = useSiteSettings();
  return (
    <SiteShell>
      {preview && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Homepage preview: sections that are switched off or scheduled are shown with a label.
          Shoppers don't see them.
        </div>
      )}
      <h1 className="sr-only">{storeName}</h1>
      <HomeSections
        rows={rows}
        preview={preview}
        afterHero={
          schoolFeatures ? (
            <>
              <BundlesSection />
              <FindBooksBySchool />
            </>
          ) : null
        }
      />
    </SiteShell>
  );
}
