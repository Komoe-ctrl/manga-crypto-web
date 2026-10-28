import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les tests de navigateur construisent dans un dossier à part (`.next-e2e`) pour ne pas gêner le serveur de développement.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Image Docker : serveur autonome (`server.js`) sans le dossier node_modules complet. Activé par le Dockerfile seulement :
  // sous Windows, la copie des liens symboliques de ce mode peut échouer en local.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Le service worker ne doit jamais être servi depuis un cache : une version corrigée doit s'appliquer tout de suite.
        // La politique de sécurité l'empêche de charger quoi que ce soit hors de notre origine.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
