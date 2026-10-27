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

---

## À prévoir

| Sujet | Pourquoi |
|---|---|
| **Feuille de route vers un client réel** | Étape 26 : application installable sur téléphone (manifeste, icônes ; sur iPhone le Push exige l'installation) et scripts pour créer le compte du client et fermer l'inscription. Étape 27 : mise en service (Docker, https automatique, sauvegardes, supervision, mode d'emploi) : **demande un hébergement et un domaine choisis par le client**. Étape 28 : mentions (« pas un conseil financier ») et recette avec le client |
| Historique des opérations déclarées | L'API ne conserve pas les achats et ventes déclarés (F52) : il faut une table côté `crypto-api`, puis un écran |
| Import en bloc des positions | Saisir dix actifs un par un est long ; un import CSV serait utile |
| Push sur un téléphone, Chrome et Firefox ; clic sur la notification | Seul Edge sur Windows a été exercé (F42) ; la notification s'affiche, mais le clic et l'écran verrouillé ne sont pas vérifiés |
| Modifier le seuil d'une alerte, paginer les ordres, ordre limite | Volontairement laissés de côté à l'étape 20 (F27) ; l'API sait modifier une alerte |
| Tests de navigateur en intégration continue | Faits à l'étape 23 mais lancés à la main (Docker, API construite, mémoire libre) ; à brancher quand une intégration continue existera |
| Audit d'accessibilité (lecteur d'écran, contrastes) | Non fait au-delà des libellés et rôles testés |
