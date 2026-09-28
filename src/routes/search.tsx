import { createFileRoute, redirect } from "@tanstack/react-router";

// Search results live on /shop?q=… (same filters, sort and pagination as listings).
export const Route = createFileRoute("/search")({
  beforeLoad: ({ search }) => {
    const q = typeof (search as Record<string, unknown>).q === "string" ? ((search as Record<string, unknown>).q as string).trim() : "";
    throw redirect({ to: "/shop", search: q ? { q } : {}, statusCode: 301 });
  },
});
