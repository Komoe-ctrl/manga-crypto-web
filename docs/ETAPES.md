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


## Étape 20 : alertes, ordres de simulation, robot et garde-fous

### Ce que l'on voit

- **Tableau de bord** : en haut, l'**état du robot** (actif / arrêté / en pause, mode Simulation ou Réel) avec le bouton **Arrêt d'urgence** ; sous les actifs, les **derniers ordres** et le bouton **Passer un ordre**.
- **Alertes** (`/alertes`) : liste (armée, déclenchée, en pause, critique), interrupteur de pause, suppression avec confirmation, et formulaire de création.
- **Réglages** : nouvelle carte **Garde-fous du robot** (exposition maximale, perte journalière maximale, stop-loss et take-profit par défaut).

### Organisation du code

| Dossier / fichier | Rôle |
|---|---|
| `src/components/bot/` | Carte d'état du robot et arrêt d'urgence |
| `src/components/orders/` | Historique des ordres, dialogue d'ordre (saisie puis confirmation) |
| `src/components/alerts/` | Page, ligne d'alerte, formulaire de création |
| `src/components/settings/RiskCard.tsx` | Garde-fous |
| `src/components/ui/modal.tsx`, `query-state.tsx` | Modale accessible ; chargement et erreur d'une carte |
| `src/lib/queries/` | `alerts`, `risk`, `orders` |
| `src/lib/orders.ts`, `alerts.ts` | Libellés, validation locale, motifs de refus en français, corps envoyés à l'API |

### Utiliser

1. **Arrêt d'urgence** : un clic, aucun ordre ne part tant que le robot est arrêté (automatique ou manuel). **Réactiver** demande une confirmation.
2. **Passer un ordre** : sens, actif, quantité, puis « Vérifier l'ordre » et « Confirmer l'ordre ». Seul le mode **Simulation** l'accepte.
3. **Créer une alerte** : choisir la condition (les champs s'adaptent), l'actif, le seuil et le canal ; « Alerte critique » la fait passer même en Mode Nuit.

### Diagnostiquer

| Symptôme | Cause probable |
|---|---|
| « Ordre refusé : Le robot est arrêté (kill switch actif) » | Arrêt d'urgence actif : réactiver le robot |
| « Ordre refusé : … perte journalière maximale atteinte » | Pause automatique ; reprise indiquée sur la carte |
| « Ordre refusé : Fonds insuffisants » ou « Exposition maximale… » | Garde-fou de l'API ; ajuster la quantité ou les garde-fous |
| « Impossible de joindre le serveur… Vérifiez l'historique » | Réseau coupé pendant l'envoi : l'ordre a pu partir, regarder « Derniers ordres » avant de recommencer |
| « Les ordres manuels ne sont disponibles qu'en mode simulation » | Le compte est en mode réel |
| Une alerte reste « Déclenchée » | La condition est toujours remplie et l'utilisateur a déjà été prévenu ; elle se réarme quand la condition cesse |

### Vérifications

`npm run typecheck`, `npm run lint`, `npm test` (497 tests), `npm run build` : OK. `npm run test:real` : 13 tests contre une vraie API (2 nouveaux : alertes ; garde-fous, kill switch et ordre refusé). Le test réel a révélé que l'API renvoie la **paire** (`BTC/USDT`) : défaut corrigé, détail dans F26.

**Pas encore fait** : courbes de prix (à ajouter côté API), réception d'un vrai Push dans un navigateur, test de bout en bout en navigateur.


## Étape 22 : courbes, variations et état du marché

### Ce que l'on voit

- **Tableau « Mes actifs »** : deux nouvelles colonnes, **24 h** (variation en %, vert ou orangé) et **7 jours** (courbe). Un stablecoin ou un actif sans données affiche des tirets.
- **Carte du portefeuille** : une pastille « Marché en hausse / en baisse / calme · BTC … sur 24 h ». C'est une description de la journée, **pas un conseil** (infobulle).
- **Corrections** : la fenêtre « Passer un ordre » couvre maintenant l'écran (elle était coincée dans sa carte) ; « En gain » et « En perte » ne passent plus sur deux lignes.

### Organisation du code

| Fichier | Rôle |
|---|---|
| `src/lib/queries/trends.ts` | `useTrends` (relue toutes les 5 minutes), `trendOf`, `marketState` |
| `src/components/ui/Sparkline.tsx` | Courbe SVG nommée, sans dépendance |
| `src/components/dashboard/AssetsTable.tsx`, `WalletHeader.tsx` | Colonnes 24 h / 7 jours, pastille de marché |
| `src/components/ui/modal.tsx` | Rendue dans `<body>` par un portail |

Prérequis : une API qui expose `GET /api/portfolio/trends` (étape 21 de `crypto-api`, fusionnée). Les types viennent de `npm run api:types`.

### Diagnostiquer

| Symptôme | Cause probable |
|---|---|
| « Les variations et courbes sont indisponibles » | L'appel `/portfolio/trends` échoue (API injoignable ou trop ancienne : sans l'étape 21, 404) |
| « Certaines courbes sont indisponibles » | Binance ne répond pas pour au moins un actif, ou l'actif n'y est pas coté |
| Un actif a une courbe mais « — » en 24 h ou 7 jours | Actif coté depuis moins de 24 h, ou de moins d'une semaine : la courbe montre ce qui existe |
| Pas de pastille de marché | Le BTC n'a pas pu être lu, ou les tendances ne sont pas encore chargées |
| Les courbes ne bougent pas pendant 5 minutes | Normal : l'API met la lecture en cache 5 minutes |

### Vérifications

`npm run typecheck`, `npm run lint`, `npm test` (529 tests), `npm run build` : OK. `npm run test:real` : 14 tests contre une vraie API (1 nouveau : tendances avec les vraies données de Binance). Détail et limites dans F33 ; le rendu visuel reste à vérifier à l'œil.

**Pas encore fait** : réception d'un vrai Push dans un navigateur, test de bout en bout en navigateur (Playwright), audit d'accessibilité.


## Étape 23 : tests dans un vrai navigateur

### Lancer

```powershell
# prérequis : Docker démarré, conteneurs de crypto-api (npm run db:up), API construite
cd ..\crypto-api; npm run build; cd ..\crypto-web
npm run test:e2e
```

La première exécution construit le front (environ une minute). Pour **itérer** sans le reconstruire quand le code du front n'a pas changé : `$env:E2E_SKIP_BUILD = "1"` avant la commande. Les captures d'écran sont dans `e2e/captures/`, les traces d'un échec dans `e2e/results/` (`npx playwright show-trace <trace.zip>`).

### Organisation

| Fichier | Rôle |
|---|---|
| `playwright.config.ts` | Un worker, un parcours ; démarre l'API et le front (`webServer`) |
| `e2e/start-api.mjs` | Base `crypto_e2e` neuve, migrations, API construite de `crypto-api` (port 3996, Redis n° 9) |
| `e2e/start-web.mjs` | Build de production dans `.next-e2e`, puis service (port 3101) |
| `e2e/global-setup.ts`, `global-teardown.ts` | Compte et portefeuille de départ ; suppression de la base |
| `e2e/env.ts` | Ports, identifiants et positions de départ |
| `e2e/parcours.spec.ts` | Les 13 étapes du parcours |

### Diagnostiquer

| Symptôme | Cause probable |
|---|---|
| « Timed out waiting … from config.webServer » | Machine chargée (mémoire) ou Docker arrêté ; fermer des serveurs de développement, vérifier `docker ps` |
| « API non construite » | Lancer `npm run build` dans `crypto-api` |
| « psql a échoué » | Le conteneur `crypto-postgres` ne tourne pas : `npm run db:up` |
| « Courbe du BTC absente » | Binance injoignable depuis la machine |
| Échec sur 429 ou « Trop de demandes » | Plus de 5 connexions ou renouvellements en une minute : attendre une minute |
| Une étape échoue, les suivantes « did not run » | Normal : le parcours est séquentiel, corriger la première |
| `tsconfig.json` modifié après un lancement | Réécriture par `next build` (F40) ; la version commitée la contient déjà |

### Vérifications

`npm run typecheck`, `npm run lint`, `npm test` (529 tests ; `--maxWorkers=2` si la mémoire manque), `npm run build` : OK. `npm run test:e2e` : 13 parcours sur 13. Détails, défauts et limites dans F35 à F40.

**Pas encore fait** : réception d'un vrai Push dans un navigateur, tests de navigateur en intégration continue, audit d'accessibilité, navigation sur deux lignes en 390 px.


## Étape 24 : le Push réel, et la navigation sur téléphone

### Ce que l'on voit

- **Push** : Réglages > Notifications Push > « Activer sur cet appareil » abonne le navigateur ; « Envoyer un message de test » affiche une vraie notification. Les erreurs sont en français et disent quoi faire (navigation privée, pare-feu…).
- **Téléphone** : la navigation tient sur une ligne, sans défiler, jusqu'à 360 px ; le premier lien s'appelle « Accueil » sous 640 px.

### Vérifier le Push

```powershell
# prérequis : l'API a VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (étape 24 de crypto-api), Edge installé
npm run test:push               # abonnement, message de test, notification affichée, désabonnement
npm run test:push -- --prive    # navigation privée : doit afficher le message « navigation privée »
```

Variables : `PUSH_WEB` (défaut `http://localhost:3100`), `PUSH_EMAIL`, `PUSH_PASSWORD`, `PUSH_HEADED=1` pour voir le navigateur. À la main : Réglages dans Edge ou Chrome en fenêtre normale (pas privée), « Activer sur cet appareil », accepter, puis « Envoyer un message de test ».

### Diagnostiquer

| Message ou symptôme | Cause probable |
|---|---|
| « Le navigateur a refusé l'abonnement. En navigation privée… » | Fenêtre privée (le Push n'y existe pas) ou autorisation du site refusée |
| « Le service de notifications du navigateur est injoignable » | Pare-feu ou réseau qui bloque le service de notifications |
| « Non configuré côté serveur » | Pas de clés VAPID dans l'API (étape 24 de crypto-api) |
| « À renouveler » | Les clés VAPID ont changé : désactiver puis réactiver |
| Rien ne s'affiche alors que le serveur dit « Push envoyé » | Notifications coupées dans Windows (concentration, « ne pas déranger ») |

### Vérifications

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` : OK. `npm run test:e2e` : 13 parcours sur 13, dont la navigation sur une seule ligne sans défilement à 390 px. `npm run test:push` : OK. Détails, défauts et limites dans F41 à F46.

**Pas encore fait** : essai sur un vrai téléphone, clic sur la notification, Chrome et Firefox, tests de navigateur en intégration continue, audit d'accessibilité.


## Étape 25 : déclarer ses positions

### Ce que l'on voit

- **Mes actifs** : un bouton « Déclarer une opération » et un crayon par ligne. Un portefeuille vide affiche « Ajouter mon premier actif » avec une explication.
- **La fenêtre « Déclarer une opération »** : trois modes (Achat, Vente, Corriger), l'actif, la quantité et le prix ; « Retirer cette position » dans le mode Corriger, avec confirmation.

### Remplir un portefeuille (mode d'emploi pour le client)

1. **Ce que l'on possède déjà** : « Ajouter mon premier actif » (ou « Déclarer une opération »), mode **Corriger**, saisir l'actif, la **quantité** et le **prix d'achat moyen** en dollars. Un actif par fois. De la trésorerie : actif USDT, prix 1.
2. **Ensuite**, chaque achat : mode **Achat** ; chaque vente : mode **Vente**. Le prix d'achat moyen et les gains suivent.
3. Une erreur : crayon sur la ligne, mode **Corriger**.

### Organisation du code

| Fichier | Rôle |
|---|---|
| `src/components/portfolio/PositionDialog.tsx` | La fenêtre (modes, validation, retrait confirmé) |
| `src/lib/positions.ts` | Règles de validation (mêmes que l'API), libellés des modes |
| `src/lib/queries/positions.ts` | Écritures `useRecordTransaction`, `useSetPosition`, `useRemovePosition` (relisent portefeuille et tendances) |
| `src/components/dashboard/AssetsTable.tsx`, `Dashboard.tsx` | Bouton, crayons, écran d'accueil d'un portefeuille vide |

### Diagnostiquer

| Message | Cause |
|---|---|
| « Quantité insuffisante pour cette vente » | On vend plus que la quantité déclarée : corriger d'abord la position, ou vérifier la saisie |
| « La position a été modifiée en parallèle, réessayez » | Deux appareils ont modifié la même position en même temps : réessayer |
| « Cette position n'existe plus » | Retirée entre-temps (autre appareil) |
| « Quantité invalide : un nombre positif, 18 décimales au plus » | Lettres, signe moins, trop de décimales ou plus de 20 chiffres entiers |
| La nouvelle ligne n'a pas de courbe | L'actif n'est pas coté chez Binance en USDT (le prix reste indisponible, les totaux sont « partiels ») |

### Vérifications

`npm run typecheck`, `npm run lint`, `npm test` (601 tests), `npm run test:real` (15), `npm run test:e2e` (14 parcours, dont les positions) : OK. Détails et limites dans F47 à F52.

**Pas encore fait** (voir la feuille de route dans « À prévoir ») : installation sur téléphone, mise en service hébergée, sauvegardes, historique des opérations (demande un changement côté API), import en bloc.


## Étape 27 : historique des opérations et fiche d'un actif

### Ce que l'on voit

- **Tableau de bord** : la carte **« Dernières opérations »** (les 8 plus récentes, le résultat réalisé cumulé, le lien « Tout l'historique »). Le nom de chaque actif est cliquable.
- **Fiche d'un actif** (toucher son nom) : prix, grande courbe, variations, position, opérations de cet actif et son résultat réalisé, alertes, boutons **Acheter, Vendre, Corriger**.
- **Page `/historique`** : toutes les opérations, filtre par actif, « Voir plus », résultat réalisé cumulé (de tout, ou de l'actif choisi).

### Mode d'emploi pour le client

1. **Voir ce qu'on a fait** : sur le tableau de bord, « Dernières opérations » ; « Tout l'historique » pour tout relire, et le menu « Actif » pour ne voir qu'un seul actif.
2. **Connaître son gain réalisé** : le chiffre « Résultat réalisé cumulé » compte les **ventes** (déclarées ou faites par l'application), pas la valeur actuelle des positions (c'est le « résultat latent » de chaque actif).
3. **Voir un actif en détail** : toucher son nom dans « Mes actifs ». De là, **Acheter**, **Vendre** ou **Corriger** ouvrent la déclaration déjà prête.

### Organisation du code

| Fichier | Rôle |
|---|---|
| `src/lib/queries/operations.ts` | `useOperations` : pages successives, cumul pris sur la première page |
| `src/lib/operations.ts` | Une opération en une phrase, résultat réalisé, mention « Ordre » |
| `src/components/portfolio/OperationsList.tsx`, `OperationsCard.tsx` | Liste partagée, cumul, carte du tableau de bord |
| `src/components/portfolio/AssetDialog.tsx` | La fiche d'un actif |
| `src/components/history/HistoryPage.tsx`, `src/app/(app)/historique/` | La page de l'historique |
| `src/test-operations-server.ts` | Faux serveur d'historique pour les tests (filtre, pagination, cumul) |

Prérequis : une API qui expose `GET /api/portfolio/operations` (étape 26 de `crypto-api`, fusionnée) et **sa migration appliquée avec `npx prisma migrate deploy`** (jamais `migrate dev`, voir D128 de l'API).

### Diagnostiquer

| Symptôme | Cause probable |
|---|---|
| « Impossible de charger l'historique des opérations » | API trop ancienne (404 sur `/portfolio/operations`) ou migration non appliquée |
| L'historique est vide alors que le portefeuille ne l'est pas | Normal : il commence à la mise en service de l'étape 26 |
| Une opération manque | Journal en panne au moment de l'opération (« Journal du portefeuille en échec » dans les journaux de l'API) : la position, elle, est juste |
| Le cumul ne change pas en paginant | Normal : il porte sur tout le journal |
| « Chargement de votre portefeuille… » long | L'API attend les prix de Binance (jusqu'à 10 s si la plateforme est lente) |
| La fiche montre « Impossible de charger les opérations » | Lecture séparée en échec ; le reste de la fiche fonctionne |

### Vérifications

`npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (656 tests ; `--maxWorkers=2` si la mémoire manque), `npm run test:real` (16), `npm run test:e2e` (15 parcours) : OK. Détails, défauts et limites dans F53 à F59.

**Pas encore fait** : étapes 28 (application installable sur téléphone, création du compte du client), 29 (mise en service hébergée, sauvegardes) et 30 (mentions, recette) de la feuille de route, import en bloc des positions.
