import { defineConfig, devices } from "@playwright/test";
import { API_PORT, API_URL, WEB_PORT, WEB_URL } from "./e2e/env";

/**
 * Tests de navigateur : un vrai Chromium contre le front construit en production et une vraie API sur une base
 * neuve. Ils attrapent ce que jsdom ne voit pas (mise en page, focus réel, cookie de session, temps réel).
 * Prérequis : conteneurs `npm run db:up` démarrés, API construite (`npm run build` dans crypto-api), accès à Binance
 * pour les courbes. Voir `docs/ETAPES.md`, étape 23.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",
  // Un seul parcours, dans l'ordre, comme un utilisateur : l'API limite connexions et renouvellements à 5 par minute.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: WEB_URL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } }],
  webServer: [
    {
      command: "node e2e/start-api.mjs",
      url: `${API_URL}/api`,
      timeout: 300_000, // large : sur une machine chargée, le premier démarrage de l'API est lent
      reuseExistingServer: false,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_PORT: String(WEB_PORT) },
    },
    {
      command: "node e2e/start-web.mjs",
      url: `${WEB_URL}/login`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_PORT: String(WEB_PORT) },
    },
  ],
});
