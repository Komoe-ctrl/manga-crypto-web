// Dessine les icônes de l'application (l'œil de la marque, turquoise sur fond sombre) : `npm run icons`.
// Les PNG produits sont commités ; ce script ne sert que si le dessin change. Il utilise le Chromium de Playwright.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ACCENT = "#7dd3c0"; // --color-accent
const CANVAS = "#090c11"; // --color-canvas

/**
 * L'œil (tracé de l'icône « Eye » de lucide, 24 × 24) centré sur un carré de 512. `eyeWidth` : largeur de l'œil en
 * unités de 512. Une icône « maskable » est recadrée par le système (cercle, carré arrondi…) : son dessin reste dans la
 * zone sûre, au centre, et son fond couvre tout le carré.
 */
function svg({ size, eyeWidth, rounded }) {
  const scale = eyeWidth / 20; // l'œil occupe 20 unités de large (de x = 2 à x = 22)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="28%" cy="18%" r="95%">
      <stop offset="0" stop-color="#17302f"/>
      <stop offset="0.55" stop-color="#0d151b"/>
      <stop offset="1" stop-color="${CANVAS}"/>
    </radialGradient>
    <!-- Le flou est exprimé dans l'unité de l'œil (24 × 24), agrandie ~16 fois : 0,8 donne un halo de ~13 px. La zone du filtre est large pour que son bord ne se voie jamais. -->
    <filter id="glow" x="-80%" y="-120%" width="260%" height="340%"><feGaussianBlur stdDeviation="0.8"/></filter>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${scale}) translate(-12 -12)" fill="none" stroke="${ACCENT}" stroke-linecap="round" stroke-linejoin="round">
    <g filter="url(#glow)" opacity="0.55" stroke-width="2.4">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
    </g>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke-width="1.7"/>
    <circle cx="12" cy="12" r="3" stroke-width="1.7" fill="${ACCENT}" fill-opacity="0.18"/>
  </g>
</svg>`;
}

const ICONS = [
  // Icônes « any » : carré arrondi sur fond transparent.
  { file: "public/icons/icon-192.png", size: 192, eyeWidth: 318, rounded: true },
  { file: "public/icons/icon-512.png", size: 512, eyeWidth: 318, rounded: true },
  // « maskable » : fond plein, dessin dans la zone sûre (80 % central).
  { file: "public/icons/icon-maskable-512.png", size: 512, eyeWidth: 250, rounded: false },
  // iPhone : le système arrondit lui-même, le fond est plein.
  { file: "public/icons/apple-touch-icon.png", size: 180, eyeWidth: 290, rounded: false },
  // Conventions de fichiers de Next (icône du site, icône Apple).
  { file: "src/app/icon.png", size: 512, eyeWidth: 318, rounded: true },
  { file: "src/app/apple-icon.png", size: 180, eyeWidth: 290, rounded: false },
];

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, size, eyeWidth, rounded } of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg({ size, eyeWidth, rounded })}`);
    await page.screenshot({ path: file, omitBackground: true });
    console.log(`${path.normalize(file)} (${size} × ${size})`);
  }
} finally {
  await browser.close();
}
