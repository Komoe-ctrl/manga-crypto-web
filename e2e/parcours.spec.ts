import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { USER } from "./env";

/**
 * Un utilisateur, un seul parcours, dans l'ordre : l'API limite connexions et renouvellements de session à 5 par minute,
 * et c'est ainsi qu'on se sert de l'application. Chaque test s'appuie sur l'état laissé par le précédent.
 * Les captures vont dans `e2e/captures/` (ignoré par git) : à regarder à l'œil.
 */
test.describe.configure({ mode: "serial" });

const VIEWPORT = { width: 1366, height: 768 };
// Charger le portefeuille ou valider un ordre oblige l'API à lire les prix chez Binance (jusqu'à 10 s par appel si la
// plateforme est lente, davantage sur une machine chargée) : ces attentes sont plus longues que celles qui ne dépendent
// que de l'application.
const SLOW_EXTERNAL = { timeout: 30_000 };
const QUANTITY_LABEL = "Quantité d’actif";
let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  // Un contexte explicite : le second onglet du test « temps réel » partage ses cookies, comme dans un vrai navigateur.
  context = await browser.newContext({ viewport: VIEWPORT });
  page = await context.newPage();
});
test.afterAll(async () => {
  await context.close();
});

const shot = (name: string) => page.screenshot({ path: `e2e/captures/${name}.png` });
const shotFull = (name: string) => page.screenshot({ path: `e2e/captures/${name}.png`, fullPage: true });
const heading = (name: string | RegExp) => page.getByRole("heading", { name });
const openOrderDialog = async () => {
  await page.getByRole("button", { name: "Passer un ordre" }).click();
  const dialog = page.getByRole("dialog", { name: "Passer un ordre de simulation" });
  await expect(dialog).toBeVisible();
  return dialog;
};
const fillOrder = async (dialog: Locator, symbol: string, quantity: string) => {
  await dialog.getByLabel("Actif", { exact: true }).fill(symbol);
  await dialog.getByLabel(QUANTITY_LABEL).fill(quantity);
  await dialog.getByRole("button", { name: /Vérifier l.ordre/ }).click();
};
const noHorizontalScroll = () =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("connexion : un mauvais mot de passe est refusé, puis la bonne connexion ouvre le tableau de bord en direct", async () => {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(USER.email);
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
  await shot("01-connexion-refusee");

  await page.getByLabel("Mot de passe").fill(USER.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(heading("Valeur totale du portefeuille")).toBeVisible(SLOW_EXTERNAL);
  await expect(page.getByText("En direct")).toBeVisible(); // le WebSocket est ouvert
});

test("session : le jeton n'est dans aucun stockage, le cookie de renouvellement est httpOnly et SameSite=Strict", async () => {
  const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]));
  expect(stored).not.toContain("eyJ"); // préfixe d'un JWT
  expect(stored).not.toMatch(/refresh/i);

  const cookie = (await page.context().cookies()).find((c) => c.name === "refresh_token");
  expect(cookie).toBeDefined();
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/auth" });
});

test("tableau de bord : portefeuille, courbes de 7 jours, variations et état du marché", async () => {
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "24 h" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "7 jours" })).toBeVisible();
  for (const symbol of ["USDT", "BTC", "ETH"]) await expect(table.getByRole("row", { name: new RegExp(symbol) })).toBeVisible();

  // Les courbes viennent de Binance via l'API : si elles manquent ici, vérifier l'accès réseau.
  const btcCurve = table.getByRole("img", { name: /BTC sur 7 jours/ });
  await expect(btcCurve, "Courbe du BTC absente : Binance est-il joignable depuis cette machine ?").toBeVisible({ timeout: 20_000 });
  await expect(table.getByRole("img", { name: /ETH sur 7 jours/ })).toBeVisible();
  const curve = await btcCurve.boundingBox();
  expect(curve!.width).toBeGreaterThan(60);
  expect(curve!.height).toBeGreaterThan(20);
  expect(await btcCurve.locator("polyline").getAttribute("points")).toMatch(/^[\d.]+,[\d.]+( [\d.]+,[\d.]+){41}$/); // 42 points : le premier, puis 41

  await expect(page.getByText(/Marché (en hausse|en baisse|calme)/)).toBeVisible();
  await expect(table.getByRole("row", { name: /USDT/ }).getByText("—").first()).toBeVisible(); // pas de courbe pour un stablecoin

  // La grande courbe de valeur (positions actuelles, 42 points) et l'anneau de répartition.
  const chart = page.getByRole("group", { name: "Valeur du portefeuille sur 7 jours" });
  await expect(chart).toBeVisible();
  await expect(chart.locator("polyline")).toHaveAttribute("points", /^[\d.]+,[\d.]+( [\d.]+,[\d.]+){41}$/);
  expect((await chart.boundingBox())!.width).toBeGreaterThan(300);
  await expect(page.getByText(/Avec vos positions actuelles/)).toBeVisible();
  await expect(page.getByRole("img", { name: /^Répartition du portefeuille : / })).toBeVisible();

  expect(await noHorizontalScroll()).toBe(true);
  await shot("02-tableau-de-bord");
});

test("courbe de valeur : « maintenant » au repos, lecture d'un point au survol et au clavier", async () => {
  const chart = page.getByRole("group", { name: "Valeur du portefeuille sur 7 jours" });
  // La lecture est le paragraphe qui suit la courbe (les pages déjà visitées restent dans le DOM, cachées : on cadre).
  const readout = chart.locator("xpath=following-sibling::p[@aria-live='polite']");
  await expect(readout).toContainText("maintenant");

  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2); // tout à gauche : il y a 7 jours
  await expect(readout).toContainText("il y a 7 j");
  await expect(readout).not.toContainText("maintenant");
  await shot("02-courbe-survol");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 160); // hors de la courbe : retour à « maintenant »
  await expect(readout).toContainText("maintenant");

  await chart.focus();
  await page.keyboard.press("Home");
  await expect(readout).toContainText("il y a 7 j");
  await page.keyboard.press("End");
  await expect(readout).toContainText("maintenant");
});

test("les prix se rafraîchissent seuls toutes les 30 secondes, sans recharger la page", async () => {
  test.setTimeout(120_000);
  const isPortfolio = (r: import("@playwright/test").Request) => r.method() === "GET" && new URL(r.url()).pathname === "/api/portfolio";
  // Rien d'autre ne relit le portefeuille ici : la requête qui arrive est la relecture automatique.
  await page.waitForRequest(isPortfolio, { timeout: 60_000 });
});

test("mise en page : les filtres tiennent sur une ligne (« En gain » ne passe plus à la ligne)", async () => {
  const group = page.getByRole("group", { name: "Filtrer les actifs" });
  const all = await group.getByRole("button", { name: "Tous" }).boundingBox();
  const gain = await group.getByRole("button", { name: "En gain" }).boundingBox();
  const loss = await group.getByRole("button", { name: "En perte" }).boundingBox();
  expect(gain!.height).toBeLessThan(48);
  expect(Math.abs(gain!.height - all!.height)).toBeLessThan(2);
  expect(Math.abs(loss!.height - all!.height)).toBeLessThan(2);
});

test("ordre : la fenêtre couvre l'écran, centrée et entière, et son clavier est piégé dedans", async () => {
  const dialog = await openOrderDialog();

  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThan(380); // elle était minuscule, coincée dans sa carte
  expect(box.width).toBeLessThanOrEqual(448 + 1);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width);
  expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT.height);
  expect(Math.abs(box.x + box.width / 2 - VIEWPORT.width / 2)).toBeLessThan(4);

  // Le fond d'écran assombri couvre toute la fenêtre du navigateur.
  const overlay = (await dialog.locator("xpath=..").boundingBox())!;
  expect(overlay).toMatchObject({ x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height });
  // La fenêtre n'est pas dans une carte : un `backdrop-filter` parent l'y enfermerait.
  await expect(dialog.locator("xpath=ancestor::section")).toHaveCount(0);
  await shot("03-fenetre-ordre");

  // Tab ne sort jamais de la fenêtre, dans les deux sens.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
  }
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
  }

  // Échap ferme et rend le focus au bouton d'origine.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Passer un ordre" })).toBeFocused();
});

test("ordre : refus d'un garde-fou expliqué, puis ordre accepté qui met le portefeuille à jour", async () => {
  let dialog = await openOrderDialog();
  await fillOrder(dialog, "btc", "1000"); // bien au-delà des fonds
  await expect(dialog.getByText("Au prix du marché", { exact: true })).toBeVisible(); // récapitulatif à confirmer
  await dialog.getByRole("button", { name: /Confirmer l.ordre/ }).click();
  await expect(dialog.getByText(/Ordre refusé : /)).toBeVisible(SLOW_EXTERNAL);
  await expect(dialog).toBeVisible(); // retour à la saisie, rien n'est perdu
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByText("Refusé", { exact: true })).toBeVisible(); // l'ordre refusé est dans l'historique

  // Un achat de BTC de plus serait refusé à juste titre (le BTC pèse déjà 24 % du portefeuille pour un plafond de 10 %) :
  // on vend, ce qui est accepté et réduit l'exposition.
  dialog = await openOrderDialog();
  await dialog.locator("label", { hasText: "Vente" }).click();
  await fillOrder(dialog, "btc", "0,001");
  await dialog.getByRole("button", { name: /Confirmer l.ordre/ }).click();
  await expect(dialog).toBeHidden(SLOW_EXTERNAL);
  await expect(page.getByText(/Vente de 0\.001 BTC : exécuté/)).toBeVisible();
  await expect(page.getByText("Exécuté", { exact: true })).toBeVisible();
  // 0,05 − 0,001 : le portefeuille s'est relu tout seul après l'ordre.
  await expect(page.getByRole("table").getByRole("row", { name: /BTC/ })).toContainText("0,049");
  await shot("04-apres-ordre");
});

test("arrêt d'urgence : un clic, plus aucun ordre possible, reprise confirmée", async () => {
  await page.getByRole("button", { name: "Arrêt d'urgence" }).click();
  await expect(heading("Le robot est arrêté")).toBeVisible();

  const dialog = await openOrderDialog();
  await expect(dialog.getByRole("status")).toContainText("arrêté ou en pause");
  await expect(dialog.getByRole("button", { name: /Vérifier l.ordre/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await shot("05-robot-arrete");

  await page.getByRole("button", { name: "Réactiver le robot" }).click();
  await page.getByRole("button", { name: "Oui, reprendre" }).click();
  await expect(heading("Le robot est actif")).toBeVisible();
});

test("alertes : créer, mettre en pause, supprimer ; les champs suivent la condition", async () => {
  await page.getByRole("link", { name: "Alertes" }).click();
  await expect(heading("Vos alertes")).toBeVisible();
  await expect(page.getByText(/Aucune alerte/)).toBeVisible();

  await page.getByLabel("Me prévenir quand").selectOption({ label: "Prix au-dessus de" });
  await expect(page.getByLabel("Sur une durée de")).toHaveCount(0); // un franchissement n'a pas de durée
  await expect(page.getByLabel("Prix (en USD)")).toBeVisible();
  await page.getByLabel("Me prévenir quand").selectOption({ label: "Baisse du prix" });

  await page.getByLabel("Actif", { exact: true }).fill("btc");
  await page.getByLabel("Seuil (en %)").fill("5");
  await page.getByRole("button", { name: "Créer l'alerte" }).click();
  await expect(page.getByText("BTC perd 5 % en 1 jour")).toBeVisible();
  await expect(page.getByText("Armée")).toBeVisible();
  await shot("06-alertes");

  await page.getByRole("switch", { name: "BTC perd 5 % en 1 jour" }).click();
  await expect(page.getByText("En pause")).toBeVisible();

  await page.getByRole("button", { name: /Supprimer l.alerte/ }).click();
  await page.getByRole("button", { name: "Oui, supprimer" }).click();
  await expect(page.getByText(/Aucune alerte/)).toBeVisible();
});

test("positions : déclarer un achat, corriger, vendre avec résultat réalisé, refus lisible, retirer", async () => {
  await page.getByRole("link", { name: "Tableau de bord" }).click();
  await expect(heading("Valeur totale du portefeuille")).toBeVisible();
  const row = page.getByRole("table").getByRole("row", { name: /SOL/ });
  const quantity = row.getByRole("cell").nth(1); // la colonne « Quantité »
  const dialog = page.getByRole("dialog", { name: "Déclarer une opération" });
  // La bulle de confirmation (role=status) : l'historique affiché plus bas répète parfois les mêmes mots.
  const saved = (text: RegExp) => expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();

  // Achat d'un actif que le portefeuille ne contient pas.
  await page.getByRole("button", { name: "Déclarer une opération" }).click();
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width);
  expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT.height);
  await dialog.getByLabel("Actif", { exact: true }).fill("sol");
  await dialog.getByLabel("Quantité", { exact: true }).fill("10");
  await dialog.getByLabel(/Prix unitaire/).fill("150");
  await shot("07-declaration-achat");
  await dialog.getByRole("button", { name: "Enregistrer l'achat" }).click();
  await expect(dialog).toBeHidden();
  await saved(/Achat de 10 SOL enregistré/);
  await expect(quantity).toHaveText("10"); // le portefeuille s'est relu : la ligne SOL existe

  // Correction depuis le crayon de la ligne : la fenêtre part de la position actuelle.
  await page.getByRole("button", { name: "Modifier la position SOL" }).click();
  await expect(dialog.getByRole("button", { name: "Corriger" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("Quantité", { exact: true })).toHaveValue("10");
  await dialog.getByLabel("Quantité", { exact: true }).fill("8");
  await dialog.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(dialog).toBeHidden();
  await saved(/Position SOL mise à jour/);
  await expect(quantity).toHaveText("8");

  // Vente : le gain réalisé est annoncé (3 × (200 − 150) = 150 $US).
  await page.getByRole("button", { name: "Déclarer une opération" }).click();
  await dialog.getByRole("button", { name: "Vente" }).click();
  await dialog.getByLabel("Actif", { exact: true }).fill("SOL");
  await expect(dialog.getByText("Vous détenez 8 SOL.")).toBeVisible();
  await dialog.getByLabel("Quantité", { exact: true }).fill("3");
  await dialog.getByLabel(/Prix unitaire/).fill("200");
  await dialog.getByRole("button", { name: "Enregistrer la vente" }).click();
  await expect(dialog).toBeHidden();
  await saved(/Vente de 3 SOL enregistrée\. Résultat réalisé : \+150/);
  await expect(quantity).toHaveText("5");

  // Vente supérieure à la quantité détenue : refus expliqué, la fenêtre reste ouverte.
  await page.getByRole("button", { name: "Déclarer une opération" }).click();
  await dialog.getByRole("button", { name: "Vente" }).click();
  await dialog.getByLabel("Actif", { exact: true }).fill("SOL");
  await dialog.getByLabel("Quantité", { exact: true }).fill("99");
  await dialog.getByLabel(/Prix unitaire/).fill("200");
  await dialog.getByRole("button", { name: "Enregistrer la vente" }).click();
  await expect(dialog.getByText("Quantité insuffisante pour cette vente")).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler" }).click();

  // Retrait, avec confirmation.
  await page.getByRole("button", { name: "Modifier la position SOL" }).click();
  await dialog.getByRole("button", { name: "Retirer cette position" }).click();
  await expect(dialog.getByText(/Retirer SOL de votre portefeuille/)).toBeVisible();
  await dialog.getByRole("button", { name: "Oui, retirer" }).click();
  await expect(dialog).toBeHidden();
  await saved(/Position SOL retirée/);
  await expect(row).toHaveCount(0);
  await shot("08-apres-positions");
});

test("historique et fiche d'un actif : les opérations déclarées, le gain réalisé, la fiche cliquable", async () => {
  await page.getByRole("link", { name: "Tableau de bord" }).click();
  await expect(heading("Valeur totale du portefeuille")).toBeVisible();

  // La carte du tableau de bord : les dernières opérations, celles du parcours précédent.
  const recent = page.getByRole("list", { name: "Dernières opérations" });
  await expect(recent).toContainText("Position SOL retirée");
  await expect(recent).toContainText("Vente de 3 SOL");
  await expect(recent.getByLabel(/Résultat réalisé : \+150/)).toBeVisible();
  await expect(page.getByTestId("realized-total").first()).toBeVisible();

  // Tout l'historique, filtré sur un actif : quatre opérations, et son propre cumul exact (3 × (200 − 150) = +150).
  await page.getByRole("link", { name: /Tout l.historique/ }).click();
  await expect(page).toHaveURL(/\/historique/);
  await expect(heading("Historique des opérations")).toBeVisible();
  // Next garde les pages déjà visitées dans le DOM, cachées (cacheComponents) : on cadre sur celle qui est affichée.
  const history = page.getByRole("region", { name: "Historique des opérations" });
  await history.getByLabel("Actif", { exact: true }).selectOption("SOL");
  await expect(history.getByRole("list", { name: "Opérations" }).getByRole("listitem")).toHaveCount(4);
  await expect(history.getByText("Résultat réalisé sur SOL")).toBeVisible();
  await expect(history.getByTestId("realized-total")).toContainText("+150,00");
  await shot("08-historique");

  // La fiche d'un actif : cliquable depuis le tableau.
  await page.getByRole("link", { name: "Tableau de bord" }).click();
  await page.getByRole("button", { name: "Voir le détail de ETH" }).click();
  const detail = page.getByRole("dialog", { name: "ETH" });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("img", { name: /ETH sur 7 jours/ })).toBeVisible({ timeout: 20_000 });
  await expect(detail).toContainText("Ma position");
  await expect(detail).toContainText("1,2"); // la quantité déclarée
  const box = (await detail.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT.height);
  await shot("08-fiche-actif");

  // De la fiche à l'achat : une seule fenêtre à la fois, déjà sur le bon actif et le bon mode.
  await detail.getByRole("button", { name: "Acheter" }).click();
  await expect(detail).toBeHidden();
  const dialog = page.getByRole("dialog", { name: "Déclarer une opération" });
  await expect(dialog.getByRole("button", { name: "Achat", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("Actif", { exact: true })).toHaveValue("ETH");
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(dialog).toBeHidden();
});

test("réglages : le Mode Nuit et les garde-fous sont enregistrés et la session survit au rechargement de la page", async () => {
  await page.getByRole("link", { name: "Réglages" }).click();
  const night = page.getByRole("switch", { name: "Mode Nuit / Tranquillité" });
  await expect(night).toHaveAttribute("aria-checked", "true");
  await night.click();
  await expect(night).toHaveAttribute("aria-checked", "false");

  const exposure = page.getByLabel(/Exposition maximale/);
  await exposure.fill("12,5");
  await exposure.blur();
  await expect(page.getByText("Garde-fous enregistrés.")).toBeVisible();
  await shot("09-reglages");

  // Rechargement : le jeton en mémoire est perdu, la session est rétablie par le cookie, les réglages sont ceux du serveur.
  await page.reload();
  await expect(heading("Mode Nuit / Tranquillité")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Mode Nuit / Tranquillité" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel(/Exposition maximale/)).toHaveValue("12,5");

  await page.getByRole("switch", { name: "Mode Nuit / Tranquillité" }).click(); // on remet comme avant
  await expect(page.getByRole("switch", { name: "Mode Nuit / Tranquillité" })).toHaveAttribute("aria-checked", "true");
});

test("rapports : état vide expliqué", async () => {
  await page.getByRole("link", { name: "Rapports" }).click();
  await expect(page.getByText(/Aucun rapport pour l.instant/)).toBeVisible();
  await shot("10-rapports");
});

test("installation sur téléphone : manifeste, icônes, métadonnées et aide dans les Réglages", async () => {
  const response = await context.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ short_name: "Veille", display: "standalone", start_url: "/", lang: "fr", theme_color: "#090c11", background_color: "#090c11" });
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);

  // Chaque icône est servie, en PNG, avec du contenu (sinon le navigateur refuse l'installation).
  for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png" }]) {
    const res = await context.request.get(icon.src);
    expect(res.ok(), icon.src).toBe(true);
    expect(res.headers()["content-type"], icon.src).toContain("image/png");
    expect((await res.body()).length, icon.src).toBeGreaterThan(1_000);
  }

  // Ce que le navigateur lit dans la page.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
  await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute("href", /apple-icon/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#090c11");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Veille");

  await page.getByRole("link", { name: "Réglages" }).click();
  const card = page.getByRole("region", { name: "Application sur téléphone" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("icône d’installation"); // ordinateur : l'icône de la barre d'adresse
  await shot("10-installation");
});

test("temps réel : un arrêt d'urgence décidé dans un onglet apparaît tout seul dans l'autre", async () => {
  await page.getByRole("link", { name: "Tableau de bord" }).click();
  await expect(heading("Le robot est actif")).toBeVisible();

  const other = await context.newPage(); // même navigateur : même cookie, session rétablie sans nouvelle connexion
  await other.setViewportSize(VIEWPORT);
  await other.goto("/");
  await expect(other.getByRole("heading", { name: "Le robot est actif" })).toBeVisible();

  await other.getByRole("button", { name: "Arrêt d'urgence" }).click();
  await expect(other.getByRole("heading", { name: "Le robot est arrêté" })).toBeVisible();
  await expect(heading("Le robot est arrêté")).toBeVisible(); // sans recharger le premier onglet

  await other.getByRole("button", { name: "Réactiver le robot" }).click();
  await other.getByRole("button", { name: "Oui, reprendre" }).click();
  await expect(heading("Le robot est actif")).toBeVisible();
  await other.close();
});

test("petit écran : pas de défilement horizontal de la page, la fenêtre d'ordre tient dans l'écran", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(heading("Valeur totale du portefeuille")).toBeVisible();
  expect(await noHorizontalScroll()).toBe(true);

  // La navigation tient sur une seule ligne (« Réglages » passait à la ligne) et sans avoir à défiler.
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  const tops = await nav.getByRole("link").evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().top)));
  expect(tops).toHaveLength(4);
  expect(new Set(tops).size, `Les liens de navigation sont sur plusieurs lignes : ${tops.join(", ")}`).toBe(1);
  expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

  // Sur téléphone : une carte par actif au lieu d'un tableau qui défile ; la courbe et l'anneau tiennent dans l'écran.
  await expect(page.getByRole("table")).toHaveCount(0);
  const cards = page.getByRole("list", { name: "Mes actifs" });
  await expect(cards.getByRole("listitem")).toHaveCount(3);
  await expect(cards.getByRole("button", { name: "Voir le détail de ETH" })).toBeVisible();
  const chartBox = (await page.getByRole("group", { name: "Valeur du portefeuille sur 7 jours" }).boundingBox())!;
  expect(chartBox.x).toBeGreaterThanOrEqual(0);
  expect(chartBox.x + chartBox.width).toBeLessThanOrEqual(390);
  expect(await noHorizontalScroll()).toBe(true);
  await shot("11-mobile-tableau-de-bord");
  await shotFull("11-mobile-page-entiere");

  const dialog = await openOrderDialog();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await shot("12-mobile-fenetre-ordre");
  await page.keyboard.press("Escape");
  await page.setViewportSize(VIEWPORT);
});

test("déconnexion : retour à la connexion, le cookie est révoqué et la page protégée n'est plus accessible", async () => {
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login/);
  // La page change dès le clic ; la réponse de l'API qui efface le cookie arrive un instant après : on attend, sans deviner.
  await expect
    .poll(async () => (await context.cookies()).some((c) => c.name === "refresh_token"), {
      message: "Le cookie de renouvellement devrait être effacé après la déconnexion",
      timeout: 5_000,
    })
    .toBe(false);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(heading("Valeur totale du portefeuille")).toHaveCount(0);
});
