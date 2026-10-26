# Livraisons du front

## Étape 18 : fondations, connexion, tableau de bord de lecture

**Livré** : on se connecte, et le tableau de bord affiche la valeur du portefeuille, sa répartition et ses positions, mis à jour en direct quand l'API change. Choix : `docs/DECISIONS.md` (F1 à F12). Types et SDK générés depuis l'OpenAPI de l'API.

### Ce que l'on voit

| Écran | Contenu |
|---|---|
| `/login` | Adresse e-mail et mot de passe ; messages clairs (identifiants incorrects, trop de tentatives, serveur injoignable) |
| `/` | Valeur totale, résultat depuis l'achat, répartition par actif, tableau des positions (filtre « Tous / En gain / En perte »), état du direct, œil pour masquer les montants, déconnexion |

Sans session, `/` renvoie vers `/login` et n'affiche rien de protégé.

### Organisation du code

| Dossier | Rôle |
|---|---|
| `src/lib/api/` | **Généré** (`npm run api:types`) : types et SDK de l'API. Ne pas modifier à la main |
| `src/lib/auth/` | Jeton en mémoire, gestionnaire de session (connexion, renouvellement, déconnexion), `fetch` authentifié, fournisseur React |
| `src/lib/realtime/` | Connexion WebSocket (reconnexion, jeton renouvelé), messages, clés de cache à relire, fournisseur React |
| `src/lib/queries/` | Requêtes TanStack Query (portefeuille) |
| `src/lib/format.ts`, `privacy.tsx` | Formatage des montants (fr-FR), masquage des montants |
| `src/components/dashboard/` | `WalletHeader`, `AllocationBar`, `AssetsTable`, `Dashboard` |
| `src/components/shell/` | `AppHeader`, `RequireAuth` |
| `src/components/ui/` | `Glass`, `Segmented` |
| `src/app/` | Pages : `login` et le groupe `(app)` (pages protégées) |
| `src/real/` | Test contre une vraie API |

### Lancer

```bash
npm install
cp .env.example .env.local      # NEXT_PUBLIC_API_URL = origine de l'API, sans /api
npm run dev                     # http://localhost:3000
```
L'API (`crypto-api`) doit tourner et autoriser l'origine du front (`WEB_ORIGIN`, par défaut `http://localhost:3000`). Le compte se crée par l'API (`POST /api/auth/register`) : il n'y a pas d'écran d'inscription.
**Si le port 3001 est occupé** (un autre projet de la machine l'utilise parfois), lancez l'API avec `PORT=3999` et mettez `NEXT_PUBLIC_API_URL=http://localhost:3999` et `NEXT_PUBLIC_WS_URL=ws://localhost:3999` ; ces variables sont figées à la compilation, il faut relancer `npm run dev`.

### Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Développement |
| `npm run build` / `npm start` | Production |
| `npm run typecheck`, `npm run lint` | Contrôles statiques |
| `npm test` | Tests unitaires et d'intégration en mémoire (aucune API nécessaire) |
| `npm run test:real` | Le front contre une **vraie API** : `REAL_API_URL=http://localhost:3999 NEXT_PUBLIC_API_URL=http://localhost:3999 NEXT_PUBLIC_WS_URL=ws://localhost:3999 npm run test:real` (utiliser une base de test : le test crée un compte et passe un ordre PAPER) |
| `npm run api:types` | Régénère `src/lib/api` depuis `/docs-json` (API démarrée ; adapter l'adresse si le port 3001 est pris) |

### Variables d'environnement (figées à la compilation)

| Variable | Défaut | Rôle |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Origine de l'API, **sans `/api`** |
| `NEXT_PUBLIC_WS_URL` | celle de l'API, en `ws://` ou `wss://` | Origine du WebSocket ; le chemin `/api/ws` est ajouté par le code |

### Comment la session fonctionne

1. **Connexion** : l'API renvoie le jeton d'accès (gardé en mémoire) et pose le refresh token dans un cookie `httpOnly`.
2. **Chaque requête** porte `Authorization: Bearer <jeton>`. Sur un 401, le jeton est renouvelé avec le cookie puis la requête est rejouée, une fois.
3. **Renouvellement automatique** une minute avant l'échéance du jeton (un jeton dure 15 minutes).
4. **Rechargement de la page** : le jeton en mémoire est perdu, la session est rétablie par le cookie.
5. **Déconnexion** (ou cookie révoqué) : jeton effacé, cache de données vidé, direct coupé, retour à `/login`.

### Diagnostiquer

| Symptôme | Cause probable |
|---|---|
| Retour permanent à `/login` après une connexion réussie | Le cookie n'est pas renvoyé : front et API ne sont pas sur le **même site** (domaine), ou `WEB_ORIGIN` de l'API ne correspond pas à l'adresse du front |
| « Impossible de joindre le serveur » | L'API ne tourne pas, ou `NEXT_PUBLIC_API_URL` pointe ailleurs (variable figée à la compilation : relancer) |
| Les données ne bougent pas en direct (pas de « En direct » dans l'en-tête) | WebSocket refusé : `NEXT_PUBLIC_WS_URL` incorrect, ou page en https avec une API en `ws://` (contenu mixte) |
| « Reconnexion… » qui dure | L'API est injoignable ; la connexion retente à délai croissant (jusqu'à 30 s), 1 minute après un « trop de connexions » |
| Déconnecté sans raison après avoir ouvert plusieurs onglets | Ne devrait pas arriver (verrou entre onglets) ; sinon l'API a détecté une réutilisation de refresh token : chercher `auth.refresh_reuse_detected` dans son audit |
| Totaux marqués « partiels » | Le prix d'au moins un actif est indisponible côté API |

### Vérifications

`npm run typecheck`, `npm run lint`, `npm test` (199 tests), `npm run build` : OK. Vérification contre la vraie API et front compilé servi en production : voir F11.

**Pas encore fait** : alertes, rapports, réglages, Push (service worker), ordres, courbes de prix (à ajouter côté API), test de bout en bout en navigateur.
