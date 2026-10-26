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
**Écarts assumés avec la maquette :** pas de courbes de 7 jours, pas de variation sur 24 h, pas de pastille « Marché : Haussier/Baissier », parce que **l'API ne les expose pas** (voir « À prévoir »). Le résultat affiché est celui **depuis l'achat**, libellé comme tel.

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

---

## À prévoir

| Sujet | Pourquoi |
|---|---|
| Alertes (liste, création, suppression) | Reste de la maquette ; l'API est prête (`/alerts`). Rapports, Mode Nuit et réglages : faits à l'étape 19 |
| Réception Push vérifiée dans un vrai navigateur | Service worker et abonnement faits (étape 19), mais jamais exercés avec un vrai service push |
| Ordres PAPER, kill switch, état du robot | L'API est prête ; les événements `order` et `risk` arrivent déjà en direct |
| Courbes de 7 jours, variation sur 24 h, état du marché | Absents de l'API : il faut un endpoint d'historique de prix et de variation, côté `crypto-api` |
| Test de bout en bout en navigateur (Playwright) | Seul moyen de vérifier rendu, hydratation et clavier ; dépendance à proposer |
| Audit d'accessibilité (lecteur d'écran, contrastes) | Non fait au-delà des libellés et rôles testés |
