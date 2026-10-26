import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // JSX automatique, comme dans `tsconfig.json` (« react-jsx ») : les tests n'ont pas besoin du compilateur de Next.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
