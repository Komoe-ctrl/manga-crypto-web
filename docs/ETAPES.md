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


## Étape 19 : réglages, rapports, notifications Push

### Ce que l'on voit

- **Navigation** dans l'en-tête : Tableau de bord, Rapports, Réglages. Un point signale les rapports non lus (avec un texte pour les lecteurs d'écran).
- **Réglages** (`/reglages`) : Mode Nuit (interrupteur, heures de début et de fin), rapport du matin (interrupteur, heure), canaux Push / Telegram / E-mail, bouton « Envoyer un message de test » avec le verdict par canal.
- **Rapports** (`/rapports`) : rapport « Ce matin », « Hier » ou « 7 jours », à marquer comme lu, et l'historique des jours précédents.
- **Messages** : de petites bulles (`role=status` en information, `role=alert` en erreur, plus durables) confirment ou expliquent chaque action.

### Organisation du code

| Dossier / fichier | Rôle |
|---|---|
| `src/app/(app)/reglages`, `rapports` | Les deux pages |
| `src/components/settings/` | Mode Nuit, canaux, bouton Push, message de test |
| `src/components/reports/` | Carte de rapport (onglets) et historique |
| `src/components/shell/AppNav.tsx` | Navigation et pastille de non-lus |
| `src/components/ui/toast.tsx`, `switch.tsx` | Messages et interrupteur accessible |
| `src/lib/queries/` | `settings`, `digests`, `push` (TanStack Query ; réglages optimistes avec retour arrière) |
| `src/lib/push/` | Détection de prise en charge, abonnement / désabonnement, hook `usePush` |
| `public/sw.js` | Service worker : affiche la notification, rouvre l'application au clic |
| `src/lib/time.ts`, `api-error.ts`, `delivery.ts` | Heures et dates (fuseau de l'utilisateur), messages d'erreur de l'API, explication des échecs d'envoi |

Le temps réel invalide désormais aussi les clés `settings`, `digests`, `push` ; un événement `notification` actualise les rapports et le compteur de non-lus.

### Activer le Push (mode d'emploi)

1. **Côté API** : générer des clés VAPID et renseigner les variables de `crypto-api` (voir sa documentation). Sans elles, le bouton affiche « Non configuré côté serveur ».
2. **Côté navigateur** : ouvrir le front en `http://localhost` ou en https (le service worker l'exige), puis Réglages > Push > Activer et accepter la permission.
3. Cliquer sur **Envoyer un message de test** : le verdict de chaque canal s'affiche (limité à 3 par minute).

### Diagnostiquer

| Symptôme | Cause probable |
|---|---|
| « Non pris en charge » | Navigateur sans Push, ou page ni en https ni en `localhost` |
| « Non configuré côté serveur » | Clés VAPID absentes côté API |
| « Bloqué par le navigateur » | Permission refusée : à rétablir dans les réglages du site du navigateur |
| « À renouveler » | Le navigateur a un abonnement que l'API ne connaît plus : désactiver puis réactiver |
| Échec « hôte non reconnu » (422) | L'adresse d'abonnement n'est pas celle d'un service push connu de l'API |
| Échec `push_subscription_gone` | Le service push signale l'abonnement comme disparu : désactiver puis réactiver |
| « Trop de tentatives » sur le test | Limite de 3 messages de test par minute |
| 5 appareils déjà inscrits | Limite de l'API : en retirer un avant d'en ajouter |

### Vérifications

`npm run typecheck`, `npm run lint`, `npm test` (390 tests), `npm run build`  : OK. `npm run test:real` : 11 tests contre une vraie API (3 nouveaux : réglages, Push, rapports et message de test). Le service worker est exécuté en bac à sable pendant les tests ; il a révélé un défaut (message `null`), corrigé. Détail dans F18.

**Pas encore fait** : alertes, ordres PAPER et kill switch (étape 20), courbes de prix (à ajouter côté API), réception d'un vrai Push dans un navigateur, test de bout en bout en navigateur.
