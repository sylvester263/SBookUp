// Store-wide feature flags, read from store_settings (editable in admin Settings).
// School features = school bundles, regular bundles, "find books by school",
// school/class pages. Hidden (not deleted) while school_features_enabled is false.
import { notFound } from "@tanstack/react-router";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getStoreSettings } from "@/lib/site.functions";

export const storeSettingsQueryOptions = {
  queryKey: ["store-settings"] as const,
  queryFn: () => getStoreSettings(),
};

/** Missing / unknown settings mean OFF (the safe default). */
export function schoolFeaturesEnabled(settings: unknown): boolean {
  return !!settings && (settings as { school_features_enabled?: unknown }).school_features_enabled === true;
}

/** Links that lead to school-feature pages (hidden while the flag is off). */
export function isSchoolFeatureHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const path = href.replace(/^https?:\/\/[^/]+/i, "");
  return /^\/(schools|bundle|bundles)(\/|$|\?|#)/i.test(path) || /^#bundles?$/i.test(path);
}

/** React hook: true only when school features are switched on. */
export function useSchoolFeatures(): boolean {
  const { data } = useQuery(storeSettingsQueryOptions);
  return schoolFeaturesEnabled(data);
}

/** Throws the router's notFound() (404) when the feature is hidden. */
export function assertSchoolFeaturesOrNotFound(enabled: boolean) {
  if (!enabled) throw notFound();
}

/** Route guard for school/bundle routes: 404 while school features are hidden. */
export async function requireSchoolFeatures(queryClient: QueryClient) {
  const settings = await queryClient.ensureQueryData(storeSettingsQueryOptions);
  assertSchoolFeaturesOrNotFound(schoolFeaturesEnabled(settings));
}
