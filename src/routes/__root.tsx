import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { jsonLd } from "@/lib/seo";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-cream px-4">
      <div className="max-w-lg text-center">
        <div className="font-display text-[120px] leading-none font-bold text-brand-teal">404</div>
        <h1 className="font-display text-2xl font-bold text-brand-navy mt-2">Page not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you're looking for may have moved or no longer exists. Try one of these instead:
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-brand-teal px-5 py-2 text-sm font-medium text-white hover:bg-brand-teal/90">
            Go Home
          </Link>
          <Link to="/shop" className="inline-flex items-center justify-center rounded-md border border-brand-teal px-5 py-2 text-sm font-medium text-brand-teal hover:bg-brand-teal hover:text-white">
            Browse Products
          </Link>
          <Link to="/contact" className="inline-flex items-center justify-center rounded-md border border-input px-5 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context }) => {
    const { getStoreSettings } = await import("@/lib/site.functions");
    try {
      const settings = await context.queryClient.ensureQueryData({
        queryKey: ["store-settings"],
        queryFn: () => getStoreSettings(),
      });
      return { settings };
    } catch {
      return { settings: null };
    }
  },
  head: ({ loaderData }) => {
    const s: any = (loaderData as any)?.settings ?? {};
    const title = s.meta_title || "SchoolBooksExperts — A Complete Family Store, Lahore Since 1968";
    const description = s.meta_description || "Shop books, stationery, uniforms, toys, baby items and party supplies. Free delivery in Lahore on orders above PKR 2,000.";
    const siteName = s.store_name || "SchoolBooksExperts";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        { name: "description", content: description },
        { name: "author", content: siteName },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: siteName },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "theme-color", content: "#1A6B6B" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "apple-mobile-web-app-title", content: siteName },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      ],
      links: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap",
        },
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", href: "/favicon.svg" },
        { rel: "mask-icon", href: "/favicon.svg", color: "#1A6B6B" },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: jsonLd({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: siteName,
            description: "A Complete Family Store serving Lahore since 1968.",
            foundingDate: "1968",
            email: s.contact_email || undefined,
            telephone: s.contact_phone || undefined,
            address: { "@type": "PostalAddress", streetAddress: s.address || undefined, addressLocality: "Lahore", addressCountry: "PK" },
          }),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="bottom-right" richColors visibleToasts={3} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
