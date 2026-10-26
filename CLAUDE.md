@AGENTS.md

# crypto-web — Frontend Next.js

Projet « Veille ». Spécification complète : `../crypto-api/docs/SPEC.md`.

## Maquette de référence
`docs/design/CryptoDashboard.jsx` est la maquette validée par le client. C'est une RÉFÉRENCE, pas du code de production :
- la découper en composants typés dans `src/components/dashboard/` (`WalletHeader`, `AssetsTable`, `Sparkline`, `AlertCenter`, `NightModeCard`, `DigestCard`, `AddTransactionAlertDialog`) ;
- remplacer les données simulées par l'API (TanStack Query) et le temps réel (WebSocket natif, voir `src/lib/realtime`) ;
- utiliser les tokens Tailwind de `src/app/globals.css` (`bg-canvas`, `text-muted`, `text-gain`, `text-loss`, `bg-accent`…), jamais de hex en dur.

Principe UX : interface calme, pas d'animations qui clignotent.

## Stack
Next.js 16 (App Router, `src/`), React 19, TypeScript 6.0 strict, Tailwind CSS 4, lucide-react, TanStack Query, React Hook Form + Zod. Temps réel : WebSocket natif du navigateur (l'API n'utilise pas socket.io). Tests : Vitest + Testing Library.

## Contrat avec l'API
Types générés depuis la spec OpenAPI de crypto-api : `npm run api:types` (API démarrée sur le port 3001) → `src/lib/api`. Ne pas écrire les types de l'API à la main.

## Commandes
`npm run dev` (http://localhost:3000) · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run test:real` (contre une vraie API)

Documentation : `docs/DECISIONS.md` (le pourquoi), `docs/ETAPES.md` (le quoi et le comment). À mettre à jour dans la même PR que le code.

## Règles
- Session : le jeton d'accès reste **en mémoire**, jamais dans `localStorage` ni `sessionStorage` ; ne jamais lancer deux renouvellements simultanés (l'API révoque la session si un refresh token est réutilisé), toujours passer par `sessionManager.refresh()`.
- `NEXT_PUBLIC_*` se lit en toutes lettres (`process.env.NEXT_PUBLIC_NOM`), jamais par une clé calculée.
- Commits et PR : aucune mention d'attribution (« Generated with Claude », Co-Authored-By).
