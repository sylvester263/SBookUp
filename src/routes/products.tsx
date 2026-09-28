import { createFileRoute, redirect } from "@tanstack/react-router";

// Old listing URL → /shop (keeps a search term if present).
export const Route = createFileRoute("/products")({
  beforeLoad: ({ search }) => {
    const q = typeof (search as Record<string, unknown>).q === "string" ? ((search as Record<string, unknown>).q as string) : undefined;
    throw redirect({ to: "/shop", search: q ? { q } : {}, statusCode: 301 });
  },
});
