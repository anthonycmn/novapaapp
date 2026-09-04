import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The real package is a Next.js client-bundle guard; under vitest there
      // is no client bundle to guard. Same stand-in the adapter scripts use.
      "server-only": path.resolve(__dirname, "./scripts/server-only-stub.ts"),
    },
  },
});
