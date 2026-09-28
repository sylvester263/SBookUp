import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so tests don't load the TanStack Start plugin.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "supabase/tests/*.test.mjs"],
    // Each database suite builds a fresh in-memory Postgres; give it time.
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
