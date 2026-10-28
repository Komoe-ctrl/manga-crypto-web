import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application installable (servi sur `/manifest.webmanifest`). Les couleurs reprennent `--color-canvas` de
 * `globals.css` : le fond de l'écran de lancement et la barre du système se fondent dans l'application.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veille — Suivi crypto",
    short_name: "Veille",
    description: "Votre portefeuille crypto veille pour vous.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#090c11",
    theme_color: "#090c11",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
