import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/components/home/HomePage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SchoolBooksExperts Department Store — A Complete Family Store" },
      { name: "description", content: "Serving Lahore families since 1968. School books, bundles, stationery, uniforms, toys, baby items and more — delivered across Pakistan." },
      { property: "og:title", content: "SchoolBooksExperts Department Store" },
      { property: "og:description", content: "A complete family store. Serving Lahore since 1968." },
    ],
  }),
  component: HomePage,
});
