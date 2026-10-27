import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "e2e/results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Code généré par `npm run api:types` : jamais édité à la main, régénéré à chaque changement de l'API.
    "src/lib/api/**",
  ]),
]);

export default eslintConfig;
