# Décisions du front (crypto-web)

Le pourquoi des choix. Le contrat avec l'API est dans `../crypto-api/docs/SPEC.md` ; le mode d'emploi est dans `docs/ETAPES.md`.

## Étape 18 : fondations, connexion, tableau de bord de lecture

### F1. Périmètre de la première étape du front
Fondations (session, client HTTP, temps réel, thème), page de connexion et tableau de bord **en lecture** (valeur du portefeuille, répartition, positions). Les alertes, les rapports, les réglages, l'abonnement Push et les ordres viennent aux étapes suivantes : mieux vaut une base vérifiée de bout en bout qu'une maquette entière câblée à moitié.

### F2. Session : jeton en mémoire, cookie `httpOnly` géré par l'API, aucun relais serveur
Le jeton d'accès (courte durée) vit **en mémoire seulement** : jamais dans `localStorage` ni `sessionStorage`, que n'importe quel script injecté peut lire. Un rechargement le perd ; la session est alors rétablie par le **refresh token**, que l'API pose elle-même dans un cookie `httpOnly` (inaccessible au JavaScript), `SameSite=Strict`, limité au chemin `/api/auth`. Comme l'API le fait déjà, aucun relais côté serveur Next n'est nécessaire (c'est le pari inverse d'un « backend for frontend » : moins de pièces, pas de second endroit où un jeton circule).
**Condition de déploiement :** le cookie `SameSite=Strict` n'est envoyé que si le front et l'API sont sur le **même site** (même domaine enregistrable) : `localhost:3000` et `localhost:3001` en développement, `app.exemple.fr` et `api.exemple.fr` en production, ou un reverse proxy qui sert les deux sous une même adresse. L'API doit aussi autoriser l'origine du front (`WEB_ORIGIN`, avec les cookies).

### F3. Renouvellement du jeton : une seule requête à la fois, partout
L'API détecte la **réutilisation** d'un refresh token (présenté deux fois) et révoque alors toute la session. Deux renouvellements simultanés déconnecteraient donc l'utilisateur. Garde-fous :
- **une seule requête par onglet** : les appels simultanés partagent la même promesse (cela couvre le double appel des effets de React en développement et les requêtes qui expirent ensemble) ;
- **verrou entre onglets** (Web Locks) : deux onglets ne renouvellent jamais en même temps, le second présente le cookie déjà renouvelé ;
- renouvellement **une minute avant l'échéance** (au moins 5 s d'attente, jamais de boucle serrée), et sur tout 401 ;
- une **panne réseau ne déconnecte pas** : la session en mémoire est conservée et le renouvellement est retenté ; seuls un 401 ou un 403 du renouvellement ferment la session.

### F4. Client HTTP : le SDK généré, un `fetch` qui porte le jeton
Les types et le SDK sont **générés** depuis l'OpenAPI de l'API (`src/lib/api`, jamais édités à la main, committés pour que le build ne dépende pas d'une API lancée ; ignorés par le lint). Le client est configuré une fois (`src/lib/auth/index.ts`) avec un `fetch` qui ajoute le jeton et, sur un **401**, renouvelle puis rejoue la requête **une fois** (le corps est cloné avant l'envoi : il ne se lit qu'une fois). Un second 401 est un vrai refus, renvoyé tel quel. `NEXT_PUBLIC_API_URL` est l'**origine** de l'API, sans `/api` (le SDK ajoute le préfixe) ; `.env.example` a été corrigé en ce sens. Ces variables sont figées à la compilation.

### F5. Temps réel : WebSocket natif, `socket.io-client` retiré de la stack
L'API expose un WebSocket natif sur `/api/ws` (D97 de l'API : pas de socket.io, pas de client dédié). `socket.io-client` figurait dans la stack du front : il est **retiré** (il n'aurait pas pu parler à l'API). La connexion s'authentifie par un premier message (jamais dans l'adresse), se **reconnecte** à délai croissant (1 s, 2 s… plafonné à 30 s, avec un peu d'aléa), patiente une minute après un 4429 (trop de connexions), renouvelle le jeton sur un 4401 sans boucler, et **prolonge** la connexion avec un nouveau `auth` quand le jeton change.
**Aucun événement n'est rejoué par le serveur** : chaque événement invalide les données qu'il rend périmées (on **relit par l'API**, qui reste la seule source de vérité), et **tout est relu à chaque (re)connexion**.

### F6. Données : TanStack Query, cache vidé à la déconnexion
`staleTime` de 30 s (les données arrivent aussi par le temps réel). Le cache est **vidé dès que la session disparaît** (déconnexion, cookie révoqué) : l'utilisateur suivant sur le même navigateur ne doit jamais voir les données du précédent.

### F7. Masquage des montants
L'œil de la maquette masque les montants (valeur, quantités, résultats), pas les prix du marché ni les pourcentages. La préférence est gardée dans le navigateur (`useSyncExternalStore` : pas de décalage à l'hydratation) ; si le stockage est indisponible (navigation privée), elle vit en mémoire pour la page.

### F8. Design : les jetons du thème, une interface calme
Couleurs de l'interface uniquement par les jetons de `globals.css` (`bg-canvas`, `text-gain`, `text-loss`…), aucun hex en dur. La teinte d'un actif (barre de répartition, pastille) est calculée de façon **stable à partir de son symbole**, sans palette codée en dur. Aucune animation qui clignote ; en dessous d'un centime, un résultat n'est ni vert ni orange.
**Écarts assumés avec la maquette :** pas de courbes de 7 jours, pas de variation sur 24 h, pas de pastille « Marché : Haussier/Baissier », parce que **l'API ne les expose pas** — **écart levé à l'étape 22 (F28)**. Le résultat affiché est celui **depuis l'achat**, libellé comme tel.

### F9. Next.js 16 : pages statiques, garde côté client
`cacheComponents` est actif : les pages sont des coques statiques, les données arrivent côté client. La page protégée est entourée d'une garde (`RequireAuth`) qui n'affiche **rien de protégé** tant que la session n'est pas rétablie, et renvoie vers `/login` sinon. Le groupe de routes `(app)` porte l'en-tête et la garde communs.

### F10. Tests : Vitest et Testing Library (dépendances de développement)
Le front n'avait aucun outil de test. Ajoutés en **dépendances de développement** : `vitest`, `jsdom`, `@testing-library/react` et `@testing-library/dom` (l'API utilise déjà Vitest), validés par délégation. Trois niveaux : unitaires (formatage, session, jeton, reconnexion, composants), **intégration en mémoire** (le vrai client généré avec une couche réseau simulée) et **test contre la vraie API** (`npm run test:real`, ignoré sans `REAL_API_URL`).

### F11. Vérification et défauts trouvés
**Contre la vraie API** (PostgreSQL de test) : connexion, jeton porté par le client généré, 401 puis renouvellement par le cookie puis requête rejouée, **trois renouvellements simultanés = une seule requête et 0 réutilisation détectée côté API** (audit), un ordre PAPER qui arrive en direct (`PENDING`, `SUBMITTED`, `FILLED`) suivi du portefeuille à jour, le kill switch en direct, la coupure du direct à la déconnexion, le cookie révoqué. **Front compilé et servi en production** : page de connexion complète, aucune donnée de portefeuille dans le rendu serveur, adresse de l'API et chemin WebSocket inlinés, aucun secret de l'API dans le JavaScript servi.
Défauts trouvés en chemin :
- **Accessibilité** : le message d'erreur d'un champ était *dans* son `<label>`, donc le nom accessible du champ devenait « Adresse e-mail Saisissez une adresse… » et le message était lu deux fois. Le message est désormais séparé du libellé.
- **React 19** : modifier l'état directement dans un effet est interdit par le lint ; la préférence de masquage et l'état du direct passent par `useSyncExternalStore`.
- **Boucle possible** : après un 4401, une session valide mais refusée en boucle aurait fait « renouveler, reconnecter » sans délai ; le premier essai est immédiat, les suivants passent par le délai croissant (testé).
- **Pastille d'actif** : tronquer « LINK » à trois lettres donnait « LIN » ; `assetBadge` donne « LI » au-delà de trois lettres.
- **Fichiers de test** : sous Windows, `Dashboard.test.tsx` et `dashboard.test.tsx` sont le même fichier ; le second a écrasé le premier. Détecté au décompte des tests, restauré sous des noms distincts.
*Non couvert :* **aucun navigateur n'a été piloté** (rendu visuel, hydratation, clavier, lecteur d'écran) ; le rendu visuel reste à regarder à l'œil (`npm run dev`).

### F12. Limites
Pas de page d'inscription (l'inscription de l'API est fermée une fois le compte créé), pas de « mot de passe oublié » (hors SPEC MVP) ; une panne réseau au chargement de la page affiche l'écran de connexion (on ne peut pas distinguer « pas connecté » de « serveur injoignable » sans session en mémoire) ; le test de bout en bout en navigateur reste à faire.

## Étape 19 : réglages, rapports, notifications Push

### F13. Périmètre
Navigation (Tableau de bord, Rapports, Réglages), page Réglages (Mode Nuit, rapport du matin, canaux, message de test), page Rapports (matin, hier, 7 jours, historique) et abonnement Push avec service worker. **Alertes et ordres : étape 20.** Aucune dépendance ajoutée : le service worker est un fichier statique, les tests tournent sur Vitest déjà en place.

### F14. Réglages : modification immédiate, optimiste, avec retour arrière
Chaque réglage s'applique au clic (pas de bouton « Enregistrer » à oublier). La valeur change tout de suite dans le cache ; si l'API refuse, elle est remise et un message lisible s'affiche (les 400 et 422 de l'API sont traduits par `apiErrorMessage`). Les champs texte (Telegram, e-mail) s'enregistrent à la sortie du champ ou sur Entrée, après une validation locale légère ; l'API reste l'autorité. Activer Telegram sans identifiant de conversation est refusé avant même l'appel.

### F15. Push : l'état réel de l'appareil prime sur ce que dit l'API
Le bouton ne se fie pas au seul compteur serveur : il croise l'état du navigateur (permission, abonnement local) et celui de l'API. Cela donne des états distincts et expliqués : non pris en charge, non configuré côté serveur, bloqué par le navigateur, désactivé, **à renouveler** (abonnement local sans équivalent serveur) et actif. L'abonnement navigateur est supprimé si l'API refuse l'inscription (hôte de service push inconnu : 422), pour ne pas laisser un abonnement orphelin ; à la désactivation, il est supprimé même si l'API ne répond pas.

### F16. Service worker : minimal et défensif
`public/sw.js` affiche la notification et rouvre ou ramène l'application au clic. Il n'a pas de cache et n'intercepte aucune requête. Les alertes critiques restent affichées jusqu'à action (`requireInteraction`) et ont leur propre `tag`, pour qu'une alerte normale ne les remplace pas. Servi avec `Cache-Control: no-cache` et une CSP stricte (recommandation Next.js) : une mise à jour du fichier est vue au prochain chargement.

### F17. Rapports : la lecture, pas le tableau de bord
Trois onglets (Ce matin, Hier, 7 jours), chacun avec un état vide expliqué (« pas encore de rapport, le premier arrive à 08:00 »), la durée de lecture annoncée et le décompte des alertes regroupées par le Mode Nuit. Le nombre de non-lus de la navigation vient du `unreadCount` de la liste quotidienne : **vérifié dans le code de l'API**, il compte tous les rapports non lus quelle que soit la période (une première version recomposait ce total côté front, inutilement).

### F18. Vérification et défaut trouvé
- **Défaut trouvé par un test** : `sw.js` plantait si le message Push était le JSON `null` (rien n'était affiché, et l'événement échouait). Une charge utile qui n'est pas un objet est maintenant traitée comme vide ; la notification s'affiche avec le texte par défaut.
- Le service worker est exécuté tel quel dans un bac à sable `vm` pendant les tests (pas une copie réécrite pour le test).
- **Contre la vraie API** (base temporaire, API lancée sur un autre port) : lecture et modification partielle des réglages, refus d'une valeur invalide avec message, état Push, abonnement accepté, hôte inconnu refusé (422), retrait, listes de rapports vides sur compte neuf, message de test accepté. Front compilé servi en production : `/rapports`, `/reglages` et `/sw.js` répondent 200, avec les en-têtes prévus pour ce dernier.
- Tests : 390 passent en mémoire, 11 « réels » ignorés sans API.
*Non couvert :* **aucun navigateur n'a été piloté** et **aucune vraie notification Push n'a été reçue** : cela demande un navigateur, `localhost` ou https, et des clés VAPID configurées côté API. Le rendu visuel reste à regarder à l'œil.

### F19. Limites
`pushsubscriptionchange` n'est pas géré (si le navigateur renouvelle l'abonnement de lui-même, l'état « à renouveler » le signale à la prochaine visite, rien n'est refait en arrière-plan) ; l'identifiant Telegram doit être saisi à la main ; pas de choix de la sonnerie ni du détail des alertes (hors SPEC MVP).

## Étape 20 : alertes, ordres de simulation, robot et garde-fous

### F20. Périmètre
Page Alertes, carte « état du robot » avec arrêt d'urgence, historique des ordres et dialogue d'ordre manuel (tableau de bord), garde-fous de risque (Réglages). Aucune dépendance ajoutée. **Le passage en LIVE n'est pas proposé** : le backtest a conclu que la stratégie n'a pas d'avantage démontré (API, étape 16) et le passage en réel reste un acte explicite et audité, à faire par l'API. L'écran affiche le mode, il ne le change pas.

### F21. Kill switch : jamais optimiste
Les réglages bougent tout de suite (F14), pas l'arrêt d'urgence : l'écran n'affiche « robot arrêté » que lorsque l'API l'a **confirmé**, car c'est le moment où l'on a besoin de savoir la vérité. Pendant l'envoi, le bouton annonce « Arrêt en cours… » et l'état reste « actif ». Si la confirmation échoue, le message le dit et le robot reste affiché actif, avec le bouton pour réessayer. **L'arrêt est un clic ; la reprise demande une confirmation** : l'action sûre est rapide, l'action risquée est lente.

### F22. Ordre manuel : deux temps, et un refus n'est pas une panne
Saisie, puis récapitulatif à confirmer, même en simulation. Le bouton est inactif pendant l'envoi (pas de double ordre). Trois issues distinctes : **succès** (le dialogue se ferme, l'historique se met à jour), **refus d'un garde-fou** (422 : le message de l'API, déjà en français, est affiché et la saisie est conservée ; l'API *enregistre* l'ordre refusé, donc l'historique est relu), **échec réseau** (on ne dit pas « refusé », car l'ordre a pu partir : le message renvoie vers l'historique). Quantités et seuils restent des chaînes décimales, jamais des nombres à virgule ; seule la virgule est remplacée par un point.

### F23. Modale accessible sans dépendance
`ui/modal.tsx` : rôle `dialog`, Échap, focus placé dedans à l'ouverture, **gardé dedans** (Tab boucle), rendu à la fermeture. Le bouton d'origine est donné explicitement : Safari ne donne pas le focus à un bouton cliqué à la souris, le retrouver par l'élément actif ne marcherait pas.

### F24. Alertes : un formulaire qui suit la condition
Les champs affichés dépendent de la condition (variation : actif, % et durée ; franchissement : actif et prix, **sans** durée ; portefeuille : % et durée, sans actif). Le corps envoyé ne contient que ce que la condition accepte, car l'API refuse une durée sur un franchissement. Suppression avec confirmation, mise en pause immédiate avec retour arrière. Le temps réel relit aussi les alertes à chaque notification (une alerte déclenchée passe de « armée » à « déclenchée »).

### F25. Garde-fous : on affiche ce que l'API a retenu
Pas d'optimisme : ce sont des limites de sécurité. Chaque champ s'enregistre en sortant, avec une validation locale des bornes (0,01 à 100 %, 1000 % pour le take-profit) ; la valeur affichée après enregistrement est celle de la réponse.

### F26. Vérification et défauts trouvés
- **La paire, pas l'actif** : l'API reçoit « BTC » mais enregistre et renvoie « BTC/USDT ». Les tests unitaires, écrits avec des données que j'avais imaginées, passaient ; **le test contre la vraie API l'a révélé**. L'historique affichait « Achat BTC/USDT » ; `baseAsset` ramène à l'actif et les fixtures reprennent maintenant la forme réelle.
- **Test réel qui laissait le robot arrêté** : une assertion échouée avant la reprise du kill switch faisait échouer tous les tests suivants en cascade. La reprise est maintenant dans un `finally`.
- **Typecheck rouge à l'étape 19** : les tests réels ajoutés à la fin de l'étape 19 (`refused.response`, `foreign.response` possiblement `undefined`) n'avaient pas été re-contrôlés ; la PR #2 a été fusionnée avec `npm run typecheck` en échec sur ce fichier. Corrigé ici (`?.`). Les tests, eux, passaient.
- **Libellés** : un correctif d'apostrophes (règle de lint sur le texte JSX) a changé des libellés que les tests cherchaient ; les tests ont été alignés.
- **Contre la vraie API** (base temporaire, API sur un autre port) : création de trois alertes avec le corps construit par le front, mise en pause, refus d'une durée sur un franchissement, suppression ; lecture et modification des garde-fous, refus de 250 %; état du robot, **arrêt d'urgence confirmé, ordre refusé en 422 avec « kill switch » dans le message, enregistré comme refusé**, reprise.
- Tests : 497 passent en mémoire, 13 « réels » ignorés sans API.
*Non couvert :* **aucun navigateur n'a été piloté** (rendu, clavier réel, lecteur d'écran, piège à focus de la modale en vrai), et l'ordre accepté puis exécuté n'est vérifié par le front que via le test temps réel de l'étape 18.

### F27. Limites
Pas de modification du seuil d'une alerte existante (seulement pause et suppression, bien que l'API sache modifier) ; pas de pagination de l'historique des ordres (les 15 derniers) ; pas d'annulation d'ordre depuis l'écran (les ordres de marché PAPER sont exécutés immédiatement) ; pas d'ordre limite.

## Étape 22 : courbes, variations, état du marché, et corrections de la recette visuelle

### F28. Périmètre
Variation sur 24 h et courbe de 7 jours par actif, pastille d'état du marché, et deux défauts relevés par l'utilisateur sur ses captures d'écran (F32). Les écarts avec la maquette listés en F8 (courbes, variation, état du marché) sont **levés** : l'API les expose depuis son étape 21 (`GET /api/portfolio/trends`, D116 à D119). Types régénérés depuis l'API fusionnée. Aucune dépendance ajoutée.

### F29. Les tendances ne bloquent jamais le portefeuille
`useTrends` est une requête à part : tant qu'elle n'a pas répondu, le tableau s'affiche sans courbes ni message ; si elle échoue, un message calme (« Les variations et courbes sont indisponibles pour le moment ») remplace les courbes, **sans alarme** : ce n'est pas l'essentiel. Un échec de rafraîchissement ne retire pas les courbes déjà affichées. Réponse partielle de l'API (`complete: false`) : message « Certaines courbes sont indisponibles », les autres lignes restent. La clé de cache commence par celle du portefeuille (tout ce qui relit le portefeuille relit les tendances) ; relecture toutes les 5 minutes, car l'API met ces données en cache 5 minutes.

### F30. Courbe en SVG, sans bibliothèque de graphiques
`ui/Sparkline.tsx` : une `<polyline>`, sans axes (la maquette n'en a pas). Verte si la courbe monte, orangée si elle baisse, grise si plate, **mais la couleur ne porte pas seule l'information** : l'image est nommée (« BTC sur 7 jours : +8,10 % ») pour les lecteurs d'écran et la colonne « 24 h » donne le chiffre. Les prix, chaînes décimales, ne sont convertis en nombres **que pour le tracé**. Sans au moins deux points lisibles : un tiret, pas d'image vide. Pour un actif coté depuis moins d'une semaine (pas de variation sur 7 jours), le nom de la courbe ne prétend pas qu'elle couvre 7 jours. Stablecoins et actifs sans données : tirets.

### F31. État du marché : descriptif, et valeur possiblement absente
Pastille « Marché en hausse / en baisse / calme · BTC −1,01 % sur 24 h », avec une infobulle qui dit que ce n'est pas un conseil (cohérent avec D118 de l'API : le backtest n'a démontré aucun avantage des indicateurs). **Contrat à surveiller :** l'API peut renvoyer `state: null` (BTC injoignable) mais le schéma généré le donne comme non nul, car le générateur ignore `nullable` sur une énumération. Le front relit donc la valeur lui-même (`marketState`) et n'affiche rien pour `null` ou une valeur inconnue : on ne devine pas. À corriger côté API (schéma) quand l'occasion se présente.

### F32. Recette visuelle : deux défauts que les tests ne pouvaient pas voir
L'utilisateur a parcouru l'application et envoyé des captures. Deux défauts réels :
- **La fenêtre « Passer un ordre » restait enfermée dans sa carte**, minuscule, avec sa propre barre de défilement. Cause : les cartes (`Glass`) ont un `backdrop-filter`, et un tel parent devient le repère d'un élément `position: fixed`. La fenêtre est maintenant rendue dans `<body>` par un portail. **Les 497 tests de l'étape 20 ne pouvaient pas le voir** : jsdom ne fait aucune mise en page, il ne sait pas qu'un parent piège un élément fixe. Un test vérifie désormais que la fenêtre n'est pas dans la carte qui l'ouvre, mais seul un navigateur confirme le rendu.
- **« En gain » et « En perte » passaient sur deux lignes** dans le filtre des actifs : `whitespace-nowrap`.
Le reste (alertes, rapports, réglages, robot) a été jugé cohérent à la lecture des captures. Aucun navigateur n'est piloté par l'assistant : c'est la recette de l'utilisateur qui a trouvé ces défauts.

### F33. Vérification et défaut trouvé
- **Défaut trouvé par un test** : une valeur vide dans la série valait 0 pour `Number()` et aurait été tracée comme un vrai point à zéro. Les valeurs vides sont écartées.
- **Contre la vraie API** (application construite depuis `main` de l'API, base temporaire, vrai Binance) : 42 points décimaux, variations 24 h et 7 jours, état du marché reconnu, **courbe qui finit à moins de 2 % du prix de la valorisation**, BTC non détenu absent des actifs.
- Tests : 529 passent en mémoire, 14 « réels » ignorés sans API.
*Non couvert :* **le rendu des courbes et de la fenêtre corrigée n'a pas été regardé** (aucun navigateur côté assistant) ; à vérifier à l'œil après avoir rechargé la page.

### F34. Limites
Pas de courbe pour les stablecoins (1 USD fixe) ; pas d'axes ni d'infobulle au survol ; la variation 24 h compare des clôtures horaires (D119) ; pas de choix de période.

## Étape 23 : tests dans un vrai navigateur (Playwright)

### F35. Pourquoi, et ce qui est ajouté
Les deux défauts relevés par l'utilisateur à l'étape 22 (fenêtre d'ordre coincée dans sa carte, filtres sur deux lignes) étaient invisibles pour des centaines de tests : jsdom ne fait aucune mise en page. Ajout de `@playwright/test`, **en dépendance de développement uniquement** (proposée et validée avant l'ajout). Aucun navigateur à télécharger : le Chromium attendu (révision 1248) était déjà installé sur la machine. Hors périmètre : intégration continue, test du Push réel.

### F36. Un environnement jetable et isolé
`npm run test:e2e` construit le front en production dans `.next-e2e` (variable `NEXT_DIST_DIR`, pour ne pas gêner un `npm run dev`), démarre l'API construite de `crypto-api` sur une **base neuve** `crypto_e2e` (créée, migrée puis supprimée) et le **Redis n° 9**, avec des ports dédiés (API 3996, front 3101) : ni la base de développement ni l'application de démonstration ne sont touchées. Le compte et le portefeuille de départ sont créés par l'API avant les tests. Prérequis : conteneurs `npm run db:up`, API construite (`npm run build` dans `crypto-api`, sur la branche à tester), accès à Binance (les courbes), et de la mémoire libre (F40).

### F37. Un seul parcours, dans l'ordre
Les tests forment **un parcours d'utilisateur** (13 étapes, un seul contexte de navigateur, un seul worker), pas des cas isolés. Raison : l'API limite connexion, inscription et renouvellement de session à **5 par minute** (limite `@Throttle` de ces routes dans `crypto-api`) ; se reconnecter à chaque test les dépasserait, et réutiliser le cookie de session dans plusieurs contextes déclencherait la détection de réutilisation du refresh token (qui révoque toute la session). Contrepartie : un échec arrête les étapes suivantes.

### F38. Ce que le navigateur vérifie et que jsdom ne pouvait pas voir
- **Mise en page mesurée** : filtres sur une seule ligne (hauteurs égales), fenêtre d'ordre entière dans l'écran, **centrée**, fond assombri couvrant toute la fenêtre, **pas dans une carte**, **sans défilement horizontal** ni à 1366 px ni à 390 px, courbe de 42 points réellement dessinée.
- **Clavier réel** : Tab et Maj+Tab ne sortent jamais de la fenêtre, Échap la ferme et rend le focus au bouton d'origine.
- **Session réelle** : le jeton n'est dans **aucun stockage** (ni localStorage, ni sessionStorage, ni cookie lisible) ; le cookie de renouvellement est `httpOnly`, `SameSite=Strict`, chemin `/api/auth` ; le rechargement de la page rétablit la session par ce cookie ; la déconnexion l'efface.
- **Temps réel entre deux onglets** : un arrêt d'urgence décidé dans l'un apparaît dans l'autre sans rechargement.
- Parcours fonctionnels : refus puis acceptation d'un ordre avec mise à jour du portefeuille, arrêt d'urgence et reprise, alertes (création, pause, suppression), réglages enregistrés et relus après rechargement. Des captures d'écran sont écrites dans `e2e/captures/` (ignoré par git).

### F39. Défauts de l'application : aucun nouveau, et ce que les essais ont montré
Treize parcours sur treize passent, dont ceux qui auraient échoué avant les corrections de l'étape 22 (fenêtre d'ordre, filtres). **La suite n'a révélé aucun nouveau défaut de l'application.** Ce qu'elle a révélé :
- **Mes scénarios, pas l'application** : un achat de BTC supplémentaire est refusé à juste titre (le BTC pèse déjà 24 % du portefeuille pour un plafond de 10 %, « Exposition maximale par position dépassée ») ; le parcours vend donc. Et plusieurs sélecteurs trop larges (« Actif » correspondait aussi à « Quantité d'actif »).
- **Une course sans conséquence** : à la déconnexion, la page change avant que la réponse de l'API qui efface le cookie soit arrivée ; le cookie disparaît dans l'instant qui suit (le test attend jusqu'à 5 s).
- **Cosmétique relevé sur les captures, non corrigé** : en 390 px, la navigation passe sur deux lignes (« Réglages » à la ligne).

### F40. Fragilités de l'environnement
- **Mémoire** : sur cette machine (7,8 Go, souvent 0,2 à 0,5 Go libres avec d'autres serveurs de développement), le démarrage de l'API a dépassé 180 s une fois (délai porté à 300 s), et des processus de test Vitest ne démarrent pas (« Failed to start forks worker ») : ces exécutions sont incomplètes et ne comptent pas ; `npx vitest run --maxWorkers=2` donne un résultat complet.
- **Coupure à la toute première requête** : l'API qui vient de démarrer a réinitialisé une fois la première connexion ; la préparation du compte rejoue les erreurs **réseau** (jamais une réponse HTTP).
- **`next build` réécrit `tsconfig.json`** (tableaux réindentés, deux lignes d'inclusion pour `.next-e2e`) : la version écrite par Next est conservée pour qu'elle ne change plus.
- Couverture : le **Push réel** et l'**audit d'accessibilité** restent non faits ; les tests ne tournent pas en intégration continue.

## Étape 24 : le Push vérifié pour de vrai, et trois défauts qu'il a révélés

### F41. Périmètre
Vérifier le Push de bout en bout avec un vrai service de notifications, corriger ce que cela révèle, et régler les deux défauts connus : le schéma de l'API pour `market.state` (côté `crypto-api`, D120) et la navigation sur téléphone. Aucune dépendance ajoutée.

### F42. Le Push réel fonctionne, avec Edge
`npm run test:push` (`e2e/push-reel.mjs`) pilote le **vrai Edge**, profil persistant, contre l'application de démonstration dont l'API a des clés VAPID : abonnement depuis l'écran Réglages, enregistrement par l'API, message de test, verdict « Push envoyé », **notification réellement affichée par le service worker**, désabonnement (l'appareil de test ne reste pas inscrit). Edge s'abonne via le service de Microsoft (`wns2-par02p.notify.windows.com`), pas via FCM. Le test n'est **pas** dans `npm run test:e2e` : il dépend d'un service externe et de clés VAPID, que la base jetable n'a pas. **Piège de l'outil :** un contexte jetable de Playwright est une navigation privée, où Chrome et Edge interdisent le Push ; il faut un profil persistant (`launchPersistentContext`).

### F43. Défauts trouvés par cette vérification
- **Un message d'erreur en anglais.** L'écran affichait « Registration failed - permission denied » : `apiErrorMessage` renvoyait la propriété `message` de **n'importe quel** objet, y compris l'exception du navigateur. Désormais une vraie exception (`Error`, `DOMException`) n'expose jamais son texte technique : seules les erreurs de l'API, objets JSON simples, sont affichées.
- **Des causes lisibles à la place.** Les échecs de l'abonnement sont traduits en français avec ce qu'il faut faire : navigation privée ou autorisation refusée, service de notifications injoignable (pare-feu), échec générique.
- **Ma supposition était fausse, le test réel l'a corrigée.** Je pensais qu'un refus du navigateur était une `NotAllowedError`. En navigation privée, Edge renvoie une `AbortError` dont le message est « permission denied » ; une vraie panne du service de notifications est aussi une `AbortError`, mais « push service error ». Sans le test réel, l'utilisateur en navigation privée aurait lu « service injoignable ». On distingue donc les deux par le message (fragile par nature : ce sont des textes internes au navigateur, connus ici pour Chrome et Edge ; un autre navigateur retombera sur « échec générique », qui reste correct).

### F44. Navigation sur téléphone : deux essais avant le bon
En 390 px, « Réglages » passait à la ligne. Un premier correctif (une seule ligne, marges réduites) la faisait tenir sur une ligne, mais **« Réglages » restait coupé** (16 px de débordement) : le contrôle strict ajouté au parcours navigateur (défilement horizontal de la barre) l'a vu, le contrôle de position seul non. Mesuré ensuite : réduire encore la police aurait nui à la lisibilité. Solution : sous 640 px, le premier lien affiche **« Accueil »** au lieu de « Tableau de bord », avec `aria-label="Tableau de bord"` (le nom accessible ne change pas, les lecteurs d'écran et les tests non plus). Mesuré dans Edge : la barre tient sans défiler à 430, 390, 375 et 360 px. La barre reste défilable en dernier recours.

### F45. Schéma de l'API régénéré
`market.state` est maintenant typé `'UP' | 'DOWN' | 'CALM' | null` : le contournement de F31 n'a plus lieu d'être ; `marketState` garde seulement la protection contre une valeur inconnue (version future de l'API).

### F46. Vérification et limites
- Parcours navigateur : 13 sur 13 (voir `docs/ETAPES.md` pour les chiffres). Push réel : OK avec Edge sur Windows ; message de navigation privée vérifié dans le vrai navigateur.
- *Non couvert :* **un vrai téléphone** (Android, iOS/Safari), Chrome (FCM) et Firefox ; la notification est affichée par le service worker (vérifié), mais le **clic** sur la notification et la réception écran verrouillé ne sont pas vérifiés.
- Le test réel utilise le compte de démonstration (`demo@veille.local`) et laisse l'appareil désabonné.

## Étape 25 : déclarer ses positions

### F47. Pourquoi cette étape passe avant le reste
Jusqu'ici, le portefeuille ne pouvait être rempli que **par des appels directs à l'API** : les positions des captures et des tests, je les avais créées moi-même. Un vrai client n'aurait rien pu faire de l'application. Le portefeuille est **déclaratif** (l'application ne lit pas les soldes de la plateforme) : cette fenêtre est donc le seul moyen d'y mettre ce que l'on possède. Aucune dépendance ajoutée.

### F48. Une fenêtre, trois modes, chacun expliqué
**Achat** (ajoute et recalcule le prix d'achat moyen), **Vente** (retire ; le prix moyen ne change pas ; le résultat réalisé est annoncé), **Corriger** (remplace quantité et prix moyen : import initial ou rectification). Chaque mode affiche sa phrase d'explication, parce que la confusion entre « acheter » et « corriger » fausserait le prix moyen sans que l'écran ne le dise. En vente, l'écran dit combien on détient (« Vous détenez 0,05 BTC ») ou que l'actif n'est pas détenu. Changer de mode repart des valeurs utiles : le prix du marché pour un achat ou une vente, la position actuelle pour une correction. Un actif absent peut être « corrigé » : c'est l'import initial. Les positions en USDT (trésorerie) se déclarent comme les autres, contrairement aux ordres où USDT est la monnaie de règlement.

### F49. Accès : sans ajouter de colonne, avec un vrai point d'entrée
Bouton « Déclarer une opération » dans « Mes actifs », et un crayon « Modifier la position X » sur chaque ligne (ouvre la correction de cette position, déjà remplie des valeurs exactes de l'API). Le crayon est dans la cellule de l'actif : le tableau garde ses 8 colonnes. **Portefeuille vide :** l'ancien texte promettait « les actifs que vous déclarerez » sans permettre d'en déclarer ; il est remplacé par une explication (« se remplit à la main ») et un bouton « Ajouter mon premier actif ».

### F50. Les mêmes règles que l'API, vérifiées avant l'envoi, et des refus lisibles
`lib/positions.ts` reprend la règle de l'API (strictement positif, **20 chiffres entiers, 18 décimales au plus**) ; la virgule devient un point, rien d'autre : les montants restent des chaînes, jamais des nombres à virgule. Pas d'optimisme : ces écritures changent le prix d'achat moyen, on affiche ce que l'API a retenu. Une vente supérieure à la quantité détenue (422, « Quantité insuffisante pour cette vente »), une modification simultanée (409) et un réseau coupé s'affichent dans la fenêtre, **sans perdre la saisie**. Un retrait d'une position déjà disparue répond 404 « Not Found » en anglais côté API : le front le traduit (« Cette position n'existe plus »). Retirer demande confirmation et précise que l'historique des ordres n'est pas effacé.

### F51. Vérification
- **Contre la vraie API** (base temporaire) : achat, second achat qui recalcule le prix moyen ((10×150 + 10×170)/20 = 160), vente avec résultat réalisé (3 × (200 − 150) = 150, prix moyen inchangé), correction avec 18 décimales exactes, vente excessive refusée en français, quantités refusées par le front **refusées aussi par l'API** (même règle), retrait puis retrait d'une position absente (404).
- **Dans le vrai navigateur** : achat d'un nouvel actif, correction depuis le crayon, vente avec « Résultat réalisé : +150 $US » annoncé, refus d'une vente de 99, retrait confirmé ; fenêtre entière dans l'écran ; la colonne Quantité vérifiée par texte exact.
- Tests : 601 passent en mémoire ; 15 « réels » ignorés sans API ; parcours navigateur : 14 sur 14.
*Non couvert :* **une quantité très grande ou très précise saisie à la main sur téléphone** (clavier numérique, séparateur décimal selon la langue du téléphone : le front accepte la virgule et le point) ; l'import de plusieurs positions d'un coup (CSV).

### F52. Limites à connaître avant de confier l'outil à un client
- **Pas d'historique des opérations déclarées.** L'API renvoie le résultat réalisé d'une vente **mais ne le conserve pas** (D33 de l'API : « audité, pas persisté » ; les positions déclarées sont D32). L'écran ne peut donc pas lister ses achats et ventes déclarés, ni cumuler un gain réalisé. Seuls les **ordres passés par l'application** ont un historique.
- **Le portefeuille est déclaratif** : il ne bouge pas tout seul si le client achète ailleurs, et ne détecte aucune erreur de saisie (une quantité fausse donne un portefeuille faux).
- Pas d'import en bloc.

## Étape 27 : l'historique des opérations et la fiche d'un actif

### F53. Périmètre
Écrans de l'historique (étape 26 de `crypto-api`) et **fiche d'un actif cliquable**, demandée à la lecture des captures : « les actifs ne doivent pas être cliquables ? ». Types régénérés depuis l'API fusionnée. Aucune dépendance ajoutée.

### F54. L'historique : une carte et une page, pas d'entrée dans la navigation
La carte **« Dernières opérations »** du tableau de bord (les 8 plus récentes, avec le résultat réalisé cumulé) renvoie vers la page `/historique` : filtre par actif, bouton « Voir plus », cumul. **Pas de cinquième lien dans la barre de navigation** : elle tient tout juste sur un téléphone (F44), un lien de plus la ferait déborder à nouveau. Le cumul vient de l'API, qui le calcule sur tout le journal : il **ne change pas quand on charge d'autres pages** (testé). Une page exactement pleine propose « Voir plus » ; si la suivante est vide, le bouton disparaît (l'API ne dit pas combien il en reste, on le déduit d'une page pleine).
**Honnêteté sur le contenu :** l'historique **commence à la mise en service de l'étape 26** ; l'écran le dit dans son état vide. Les positions déjà déclarées n'y ont pas de passé.

### F55. Une opération se lit comme une phrase
« Achat de 0,05 BTC à 60 000,00 $US », « Position SOL fixée à 8 (prix moyen 150,00 $US) », « Position SOL retirée (5 SOL au prix moyen 150,00 $US) », avec le **résultat réalisé** d'une vente à droite (vert pour un gain, orangé pour une perte, vrai signe moins). Les opérations nées d'un **ordre** portent la mention « Ordre » ; l'API masque déjà la jambe en USDT d'un ordre. Le masquage des montants cache quantités, prix et gains, mais laisse lisibles l'actif et la nature de l'opération.

### F56. La fiche d'un actif
Le nom de l'actif devient un bouton (`aria-label="Voir le détail de BTC"`). La fiche montre le prix, une **grande courbe** nommée pour les lecteurs d'écran, les variations 24 h et 7 jours, **la position** (quantité, prix d'achat moyen, valeur, part, résultat latent), **les 5 dernières opérations de cet actif avec son résultat réalisé**, **ses alertes** (état armée, déclenchée ou en pause) et trois boutons **Acheter, Vendre, Corriger**. Ces boutons **remplacent** la fiche par la fenêtre de déclaration, déjà sur le bon actif et le bon mode, avec le prix du marché proposé : jamais deux fenêtres à la fois. Si la position est retirée ou corrigée pendant que sa fiche est ouverte et que l'actif n'existe plus, la fiche disparaît au lieu d'afficher une position fantôme. Les lectures de la fiche (opérations, alertes) échouent **séparément** : un message à la place de la section, le reste de la fiche et les boutons restent utilisables.

### F57. Défaut trouvé en préparant l'affichage : une petite quantité s'affichait « 0 »
`formatQuantity` arrondissait à 4 décimales partout : 0,00001234 BTC (environ 1 $) s'affichait « 0 ». Une position non nulle ne doit jamais sembler vide. Désormais **4 décimales à partir d'une unité, jusqu'à 8 en dessous** (0,05 et 0,842 ne changent pas). Le test qui figeait l'ancien arrondi (0,123456 affiché 0,1235) a été mis à jour. Corrige aussi le tableau, la fenêtre d'ordre et les confirmations, qui utilisent la même fonction.

### F58. Ce que les essais ont montré sur l'outil, pas sur l'application
- **Next garde les pages déjà visitées dans le DOM, cachées** (`cacheComponents`). Le formulaire d'alerte de la page « Alertes » était encore présent sur la page « Historique » : un sélecteur « Actif » trouvait deux champs. C'est le comportement attendu de l'application (l'état des pages est conservé) ; les sélecteurs des parcours sont désormais **limités à la page affichée** (`region` nommée). À savoir pour tout futur parcours.
- **Les messages de confirmation répètent parfois les mots de l'historique** (« Position SOL retirée. » et « Position SOL retirée (5 SOL…) ») : le parcours cible la bulle par son rôle `status`.
- **Charger le portefeuille attend les prix de Binance** (jusqu'à 10 s si la plateforme est lente, davantage sur la machine chargée) : la première attente du parcours est passée à 30 s. L'application, elle, affichait correctement « Chargement de votre portefeuille… ». Ce n'est pas un défaut de l'application, mais **le premier écran dépend d'un service externe** : si Binance est très lent, le client attend.

### F59. Vérification
- **Contre la vraie API** (base temporaire, vrai PostgreSQL) : 16 tests réels passent, dont l'historique (achat 100 @ 0,1, ventes de 30 @ 0,12 et 10 @ 0,08 : **+0,6 puis −0,2, cumul exact +0,4** lu avec les fonctions du front), la pagination par date, et un vrai ordre de simulation : son opération porte l'identifiant de l'ordre, sa jambe en USDT n'apparaît pas.
- **Dans le vrai navigateur** : 15 parcours sur 15, dont le nouveau (carte, page filtrée sur SOL avec ses quatre lignes et ses **+150,00 $US**, fiche d'ETH dans l'écran, de la fiche à un achat sur ETH). Captures relues.
- Tests unitaires : voir `docs/ETAPES.md`.
*Non couvert :* la fiche et l'historique sur un vrai téléphone (la fiche est une longue fenêtre qui défile) ; un historique de plusieurs centaines de lignes.

## Étape 28 : installable sur téléphone, vivante, plus forte à l'œil

### F60. Périmètre et principe
« Vivante, belle et forte » (demande du propriétaire) **sans trahir la maquette validée par le client** : interface calme, rien qui clignote. Les exemples de tableaux de bord de trader montrés (neon, bougies, panneaux denses) ne sont pas repris : le client « ne surveille pas les marchés ». Repris, en version calme : une **grande courbe de valeur**, un **anneau de répartition**, des chiffres plus marqués, des **cartes** sur téléphone. Aucune dépendance ajoutée. Côté API, les comptes du client (PR « étape 28 » de `crypto-api`).

### F61. Installable : manifeste, icônes, métadonnées
`app/manifest.ts` (application autonome, en français, démarre sur l'accueil), couleurs identiques au jeton `--color-canvas` (**un test vérifie que manifeste, barre du système et feuille de style ne dérivent pas**), et trois icônes (192, 512, et une « maskable » recadrable par le système) plus celle de l'iPhone, **dessinées par un script reproductible** (`npm run icons` : l'œil de la marque, turquoise sur fond sombre). Un test lit l'en-tête de chaque PNG : **la taille annoncée doit être la taille réelle**, sinon le navigateur refuse l'installation. Le favicon par défaut de Next est supprimé. Sur iPhone, la barre d'état est noire et le titre est « Veille ».
**Pourquoi c'est important :** sur iPhone, le Push ne fonctionne que si l'application est installée sur l'écran d'accueil (iOS 16.4 ou plus récent).

### F62. Une carte d'aide dans les Réglages, honnête sur ce qui est possible
« Application sur téléphone » : déjà installée → le dit ; Chrome ou Edge ont proposé l'installation → un bouton qui ouvre **leur** invite ; sinon le geste à faire selon la plateforme (Safari : Partager puis « Sur l'écran d'accueil » ; Chrome : menu ; ordinateur : l'icône de la barre d'adresse). **Safari n'a pas d'invite : on explique, on ne simule pas un bouton.** Le navigateur n'annonce l'installation possible qu'**une seule fois**, souvent avant l'ouverture des Réglages : l'écoute démarre dès le lancement de l'application et garde l'événement (testé : une invite arrivée avant l'ouverture de l'écran est retrouvée, elle ne sert qu'une fois, `appinstalled` la retire). La plateforme est devinée par l'agent utilisateur (approximatif, d'où seulement un texte d'aide).

### F63. La grande courbe : honnête sur ce qu'elle montre
Valeur du portefeuille sur 7 jours **avec les positions ACTUELLES** : Σ quantité actuelle × prix de l'époque, calculé à partir des courbes déjà chargées (aucun appel de plus). **Ce n'est pas l'historique réel** (l'API ne le conserve pas) et l'écran le dit en toutes lettres sous la courbe. Un actif sans courbe complète est **laissé de côté et nommé** (« Sans ETH : courbe indisponible ») plutôt que mal aligné ; une trésorerie en USDT seule ne fait pas de courbe. Lecture d'un point **au survol, au toucher et au clavier** (flèches, Début, Fin), « maintenant » au repos, avec l'ancienneté approximative (« ≈ il y a 3 j ») ; le pourcentage de la période est écrit ; la couleur ne porte pas seule l'information ; le montant lu est masqué avec les autres.

### F64. Vivante, sans clignoter
- **Les prix se rafraîchissent seuls** toutes les 30 secondes (l'API met ses prix en cache 15 s), onglet visible seulement. Avant cela, les prix restaient figés jusqu'à un rechargement.
- **Un chiffre qui bouge se teinte une seconde** (vert pâle, orangé pâle) puis revient au repos : fond qui s'estompe, jamais de clignotement. **Pas de teinte quand les montants sont masqués** (elle révélerait le sens de la variation).
- Les cartes **entrent en douceur** (0,3 s), le point « En direct » **respire** lentement, des **squelettes** remplacent « Chargement… » (le texte reste pour les lecteurs d'écran).
- **Tout est coupé pour qui demande moins d'animations** (`prefers-reduced-motion`) ; un test garantit que chaque animation de la feuille de style figure dans cette règle.

### F65. Défauts trouvés en chemin
- **Un raté de lecture aurait effacé le tableau de bord.** Une erreur (même d'une relecture d'arrière-plan) remplaçait tout l'écran par « Impossible de charger votre portefeuille », **même avec des chiffres récents à l'écran**. Avec une relecture toutes les 30 s, le premier raté réseau l'aurait fait. Désormais : l'écran d'erreur n'apparaît que s'il n'y a **aucune** donnée ; sinon on garde les derniers chiffres et on écrit « Actualisation impossible… les chiffres affichés datent de la dernière lecture réussie ».
- **`Number(null)` vaut 0** : passer d'une valeur absente à une valeur aurait teinté le chiffre comme une hausse. Corrigé (trouvé par un test).
- **Icône : un rectangle plus clair derrière l'œil.** Le flou du halo était exprimé dans l'unité de l'œil, agrandie 16 fois : un voile uniforme coupé net par la zone du filtre. Vu en regardant l'image, corrigé.
- Un test d'une page (l'ancienne `AllocationBar`) est supprimé avec le composant remplacé.

### F66. Sur téléphone : des cartes, pas un tableau qui défile
Sous 768 px, une carte par actif (nom cliquable, valeur, résultat, variation 24 h avec flèche, courbe, quantité, part, crayon) au lieu d'un tableau de 860 px qui défilait horizontalement. Mêmes actions, même filtre. La mise en page est choisie par une requête de média lue côté client (sans elle, ou avant l'hydratation : le tableau) pour ne pas dupliquer le contenu dans la page.

### F67. Vérification
- **Contre un vrai navigateur** : 18 parcours sur 18, dont : la courbe (42 points décimaux, lecture au survol « il y a 7 j » puis retour à « maintenant », au clavier), **la relecture automatique des prix (une requête arrive seule en moins de 60 s)**, le manifeste et chaque icône **réellement servis** (PNG, contenu non vide), les métadonnées de la page, la carte d'aide, et sur 390 px : plus de tableau, trois cartes, la courbe dans l'écran, aucun défilement horizontal. Captures relues.
- Tests unitaires : voir `docs/ETAPES.md`.
*Non couvert (honnêtement) :*
- **L'installation sur un vrai téléphone**, Android ou iPhone : seuls le manifeste, les icônes et les métadonnées sont vérifiés, dans Chromium. L'invite d'installation (`beforeinstallprompt`) n'est que simulée en test. Le Push sur iPhone installé n'est pas essayé.
- **La teinte d'un prix qui change n'a pas été vue à l'écran** : les prix bougent trop peu pendant un parcours ; elle est testée en unité.
- Le respect de `prefers-reduced-motion` n'est vérifié que dans la feuille de style, pas dans un navigateur configuré ainsi.
- Cosmétique : sur grand écran, la colonne de l'anneau laisse de l'espace vide sous la légende.

## Étape 29 : mise en page et identité visuelle

### F68. En-tête fixé, contenu centré, un seul `h1` par page
Demande du client, sur capture : « fixer le header, centrer les cartes ». Cause du décentrage : chaque page posait un `max-w-*` sans `mx-auto`, donc collé à gauche. Désormais `PageColumn` (colonne centrée, trois largeurs) et `PageHeader` (icône, titre, phrase) sont le seul gabarit des pages ; l'en-tête est `sticky top-0`, translucide et flouté. Le titre de page est l'unique `h1` (avant : aucun). Le titre et la phrase restent visibles pendant le chargement et l'erreur : le contenu seul change.

### F69. Téléphone : une barre en bas, et jamais deux navigations
Sur écran étroit la navigation devient une barre fixée en bas (icône + libellé, pastille des rapports non lus, marge de la zone sûre de l'iPhone), l'en-tête ne garde que la marque, l'état « En direct » et deux boutons. Un seul exemplaire de `AppNav` est rendu à la fois (`useMediaQuery(NARROW)`) : deux navigations dans la page seraient annoncées deux fois par un lecteur d'écran. La barre du bas est **hors** de l'en-tête : un parent avec `backdrop-filter` enferme les éléments `fixed` (piège déjà rencontré avec les fenêtres). Le nom accessible du premier lien reste « Tableau de bord » ; « Accueil » n'est qu'un affichage court.

### F70. Identité : icônes décoratives, pages de secours, mention légale
Toutes les icônes ont `aria-hidden` : le texte porte le sens. Pages `not-found` et `error` (jamais d'écran blanc, aucun détail technique affiché). Pied de page « elle ne donne pas de conseil financier » sur chaque page connectée, et sur la connexion. Le fond est fixe (`background-attachment: fixed`) : sans cela, une page plus haute que l'écran montrait une bande de couleur différente en bas. La bulle de confirmation passe sous l'en-tête fixe (`top-20 z-50`) : à `top-6`, elle serait cachée derrière.

### F71. Vérification et limites
`npm run typecheck`, `npm run lint` : OK. Tests unitaires de la coque, des deux variantes de navigation, des pages de secours et du gabarit ; e2e : nouveau parcours (en-tête à y = 0 après défilement, marges gauche et droite égales à 2 px près sur Rapports, Alertes et Réglages, une seule navigation) et barre du bas collée au bas de l'écran à 390 px. Captures relues.
**Non vérifié** : sur un vrai iPhone, la barre du bas et la zone sûre (`env(safe-area-inset-bottom)`) ne sont vues que dans l'émulation ; la page de connexion refaite n'a pas été comparée sur capture à plusieurs largeurs ; le tableau de bord lui-même n'a pas de titre de page (il a ses cartes) : à décider avec le client.

## Étape 30 : boîte de réception des notifications

### F72. Une page, pas un menu volant
L'API savait déjà lister, paginer, filtrer les non lues et marquer comme lu ; le front n'avait **aucun écran** : une alerte envoyée pendant la nuit n'était visible nulle part. Une cloche dans l'en-tête (compteur de non lues) mène à `/notifications`. Une page plutôt qu'un menu volant : pas de piège de focus, pas de défilement dans un défilement, même écran sur téléphone. La cloche n'est pas dans la barre du bas (quatre onglets, déjà serrés à 390 px).

### F73. Dire où la notification est arrivée
Chaque ligne répond à « est-ce que je l'ai bien reçue ? » : envoyée (canal par canal, Push / Telegram / Email), **non envoyée avec la raison en français** (mêmes explications que le message de test, `lib/delivery.ts`), **retenue par le Mode Nuit**, ou **reprise dans le rapport du matin** (lien vers les rapports). Une notification critique est signalée. Sans canal activé, la ligne le dit au lieu de rester muette.

### F74. Marquer comme lu : toujours explicite
Pas de marquage à l'ouverture de la page : on pourrait manquer une alerte en passant. « Marquer comme lue » par ligne, « Tout marquer comme lu » en haut. Le compteur de la cloche est une requête à part (`limit=1&unread=true`, on ne lit que le compte) : il reste exact quelle que soit la page ouverte. Le temps réel invalidait déjà `notifications` : une notification qui arrive met à jour la cloche et la liste sans recharger. Le compte est écrit dans le nom accessible de la cloche (« Notifications, 3 non lues ») : la pastille seule ne dirait rien à un lecteur d'écran.

### F75. Vérification et limites
`npm run typecheck`, `npm run lint` : OK. Tests : cloche (singulier, zéro, 99+, page courante), page (vide, non lues, critique, canal, échec expliqué, Mode Nuit, rapport, marquer, tout marquer, filtre, page suivante, erreur). Parcours e2e réel : message de test envoyé depuis les Réglages, la cloche le compte, la page le liste, une marquée lue (le compte baisse d'une), tout marqué lu, filtre « Non lues » vide.
**Non vérifié** : une notification **retenue par le Mode Nuit** ou **reprise dans un rapport** n'est vue qu'en test unitaire (le parcours e2e n'en fabrique pas : cela demande l'horloge du serveur) ; pas de suppression ni d'archivage des notifications (l'API n'en propose pas) ; pas d'essai sur un vrai téléphone.

## Étape 31 : mise en service (site)

### F76. Une image Docker du site, une image par environnement
Le site est compilé avec `output: "standalone"` (serveur autonome `server.js`, image de 417 Mo au lieu d'un `node_modules` complet), activé **seulement par le Dockerfile** (`NEXT_OUTPUT=standalone`) : sous Windows la copie des liens symboliques de ce mode peut échouer en local. `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_WS_URL` sont **figées dans le code compilé** : changer d'adresse demande de reconstruire. La construction **refuse** de se faire sans `NEXT_PUBLIC_API_URL` (sinon l'application viserait `localhost:3001` en production). Processus non privilégié, sonde de santé sur `/login` (page publique).

### F77. Défauts trouvés en essayant l'image
Chacun a été trouvé en **faisant tourner l'image**, pas en la relisant :
- `.dockerignore` excluait `e2e/`, mais `playwright.config.ts` l'importe et `next build` vérifie ses types : la construction échouait. Seules les sorties (`e2e/captures`, `e2e/results`) sont exclues.
- **Arrêt forcé** : à l'arrêt, le conteneur ne réagissait pas à SIGTERM (code 137 après 20 s). Node est le processus n° 1 du conteneur et le noyau n'applique pas l'action par défaut des signaux à ce processus. Sur une plateforme, chaque déploiement aurait attendu le délai d'arrêt forcé. `scripts/docker-start.mjs` installe le gestionnaire (sans nouveau paquet) ; arrêt en 1,3 s, code 0. Le site ne garde aucun état en mémoire : s'arrêter tout de suite est sans conséquence.
- Sonde de santé : 5 s était trop court pour le premier appel à froid sur une machine chargée ; portée à 10 s (aussi côté API).
- `npm ci` : plusieurs tentatives (un téléchargement coupé, vu deux fois, ne doit pas faire échouer un déploiement).

### F78. Vérification et limites
**Image du site construite puis exécutée** : `/login` 200 (titre attendu), processus non root, adresse de l'API figée dans les 13 fichiers servis et **aucune** adresse de développement, manifeste, trois icônes, service worker (jamais en cache, politique de sécurité), 404 avec notre page, état `healthy`, arrêt propre. Les parcours e2e (18 puis 20) ne portent pas sur l'image : ils tournent sur un serveur de production local.
**Non vérifié** : l'image **derrière un vrai proxy https** ; la connexion réelle site → API depuis l'image (adresses d'exemple, sans domaine) ; le comportement des WebSocket `wss://` chez l'hébergeur ; aucune plateforme ni domaine choisis. Le mode d'emploi complet est dans `crypto-api/docs/DEPLOIEMENT.md`.

---

## À prévoir

| Sujet | Pourquoi |
|---|---|
| **Feuille de route vers un client réel** | Étape 28 (**faite**) : application installable sur téléphone et comptes du client (F60 à F67), **à essayer sur un vrai téléphone**. Étape 29 (**faite**) : mise en page et identité (F68 à F71). Étape 30 (**faite**) : boîte de réception des notifications (F72 à F75). Étape 31 (**préparée, pas déployée**) : images Docker de l'API et du site, sonde de santé, sauvegarde et restauration vérifiées, mode d'emploi (F76 à F78 ici, D133 à D139 côté API) ; **le déploiement demande un hébergement et un nom de domaine, choisis par le client** (le domaine est obligatoire : cookie `SameSite=Strict`). Étape 32 : recette avec le client (les numéros 26 et 27 ont servi à l'historique des opérations) |
| Import en bloc des positions | Saisir dix actifs un par un est long ; un import CSV serait utile |
| Push sur un téléphone, Chrome et Firefox ; clic sur la notification | Seul Edge sur Windows a été exercé (F42) ; la notification s'affiche, mais le clic et l'écran verrouillé ne sont pas vérifiés |
| Modifier le seuil d'une alerte, paginer les ordres, ordre limite | Volontairement laissés de côté à l'étape 20 (F27) ; l'API sait modifier une alerte |
| Tests de navigateur en intégration continue | Faits à l'étape 23 mais lancés à la main (Docker, API construite, mémoire libre) ; à brancher quand une intégration continue existera |
| Audit d'accessibilité (lecteur d'écran, contrastes) | Non fait au-delà des libellés et rôles testés |
