import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const ROOT = path.resolve(__dirname, "../..");
const CSS = readFileSync(path.join(__dirname, "globals.css"), "utf8");
// layout.tsx charge la police de Next, qui ne tourne pas dans les tests : on lit sa source plutôt que de l'importer.
const LAYOUT = readFileSync(path.join(__dirname, "layout.tsx"), "utf8");
const CANVAS = CSS.match(/--color-canvas:\s*(#[0-9a-fA-F]{6})/)![1].toLowerCase();

/** Largeur et hauteur d'un PNG, lues dans son en-tête (octets 16 à 23, grand-boutiste). */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("manifeste de l'application installable", () => {
  const m = manifest();

  it("une application autonome, en français, qui démarre sur l'accueil", () => {
    expect(m).toMatchObject({ short_name: "Veille", lang: "fr", start_url: "/", scope: "/", display: "standalone" });
    expect(m.name).toContain("Veille");
  });

  it("les couleurs du manifeste, de la barre du système et de l'application sont les mêmes (jeton --color-canvas)", () => {
    expect(m.background_color?.toLowerCase()).toBe(CANVAS);
    expect(m.theme_color?.toLowerCase()).toBe(CANVAS);
    expect(LAYOUT.match(/themeColor:\s*"(#[0-9a-fA-F]{6})"/)![1].toLowerCase()).toBe(CANVAS);
  });

  it("des icônes pour tous les usages : 192, 512 et une « maskable » (recadrée par le système)", () => {
    const sizes = m.icons!.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    expect(m.icons!.every((i) => i.type === "image/png")).toBe(true);
  });

  it("chaque icône déclarée existe et a exactement la taille annoncée (sinon le navigateur refuse l'installation)", () => {
    for (const icon of m.icons!) {
      const file = path.join(ROOT, "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const [w, h] = icon.sizes!.split("x").map(Number);
      expect(pngSize(file), icon.src).toEqual({ width: w, height: h });
    }
  });

  it("les icônes de l'iPhone et du site existent à la bonne taille", () => {
    expect(pngSize(path.join(ROOT, "public/icons/apple-touch-icon.png"))).toEqual({ width: 180, height: 180 });
    expect(pngSize(path.join(ROOT, "src/app/apple-icon.png"))).toEqual({ width: 180, height: 180 });
    expect(pngSize(path.join(ROOT, "src/app/icon.png"))).toEqual({ width: 512, height: 512 });
  });

  it("le favicon par défaut de Next n'est plus là : l'icône du site est la nôtre", () => {
    expect(existsSync(path.join(__dirname, "favicon.ico"))).toBe(false);
  });
});

describe("mouvement : toujours coupé pour qui demande moins d'animations", () => {
  it("chaque animation de l'application figure dans la règle prefers-reduced-motion", () => {
    const animated = [...CSS.matchAll(/^\.([a-z-]+)\s*\{\s*animation:/gm)].map((m) => m[1]);
    expect(animated.sort()).toEqual(["breathe", "rise", "tick-down", "tick-up"]);

    const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const name of animated) expect(reduced, name).toContain(`.${name}`);
    expect(reduced).toContain("animation: none");
  });
});
