import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Veille — Suivi crypto",
  description: "Votre portefeuille veille pour vous.",
  // iPhone : ouverte depuis l'écran d'accueil, l'application s'affiche sans barre d'adresse (et peut alors recevoir les alertes).
  appleWebApp: { capable: true, title: "Veille", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

// La barre du système prend la couleur du fond de l'application (même valeur que --color-canvas).
export const viewport: Viewport = { themeColor: "#090c11", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
