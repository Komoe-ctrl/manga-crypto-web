// Vérifie le Push RÉEL de bout en bout avec le vrai Edge (service de notifications de Microsoft) : abonnement depuis
// l'écran Réglages, message de test envoyé par le serveur, notification affichée par le service worker, désabonnement.
//
//   npm run test:push                      (application de démonstration : http://localhost:3100, compte demo@veille.local)
//   npm run test:push -- --prive           (navigation privée : doit afficher le message « navigation privée », pas un abonnement)
//   PUSH_WEB=… PUSH_EMAIL=… PUSH_PASSWORD=… PUSH_HEADED=1 npm run test:push
//
// Prérequis : l'API a des clés VAPID (`npm run vapid:generate` dans crypto-api, trois variables VAPID_*), Edge est
// installé, la machine accède au service de notifications de Microsoft. Hors de la suite `test:e2e` (qui tourne sur une
// base jetable sans clés) : ce test dépend d'un service externe et laisse l'appareil désabonné à la fin.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const WEB = process.env.PUSH_WEB ?? "http://localhost:3100";
const EMAIL = process.env.PUSH_EMAIL ?? "demo@veille.local";
const PASSWORD = process.env.PUSH_PASSWORD ?? "un-mot-de-passe-solide";
const HEADED = process.env.PUSH_HEADED === "1";
const PRIVATE = process.argv.includes("--prive");
const log = (...a) => console.log("[push]", ...a);
const fail = (message, code = 1) => {
  log("ÉCHEC :", message);
  process.exitCode = code;
};

// Profil persistant : un contexte jetable de Playwright est une « navigation privée », où Chrome et Edge interdisent le Push.
const options = { channel: "msedge", headless: !HEADED, permissions: ["notifications"], locale: "fr-FR", viewport: { width: 1280, height: 800 } };
let close;
let context;
if (PRIVATE) {
  const browser = await chromium.launch({ channel: "msedge", headless: !HEADED });
  context = await browser.newContext(options);
  close = () => browser.close();
} else {
  context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "veille-edge-")), options);
  close = () => context.close();
}
const page = context.pages()[0] ?? (await context.newPage());

try {
  log(`navigateur : Edge ${context.browser()?.version() ?? ""}${PRIVATE ? " (navigation privée)" : ""}`);
  await page.goto(`${WEB}/login`);
  await page.getByLabel("Adresse e-mail").fill(EMAIL);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.getByRole("heading", { name: "Valeur totale du portefeuille" }).waitFor({ timeout: 30_000 });
  await page.getByRole("link", { name: "Réglages" }).click();

  const enable = page.getByRole("button", { name: /Activer sur cet appareil|Réactiver sur cet appareil/ });
  await enable.waitFor({ timeout: 20_000 });
  await enable.click();

  // L'annonceur de changement de page de Next est aussi un role=alert (« Réglages — Veille ») : on l'écarte.
  const alert = page.locator("[role=alert]").filter({ hasNotText: /— Veille$/ }).first();
  const outcome = await Promise.race([
    page.getByRole("button", { name: "Désactiver sur cet appareil" }).waitFor({ timeout: 45_000 }).then(() => "abonné"),
    alert.waitFor({ timeout: 45_000 }).then(async () => `erreur : ${await alert.textContent()}`),
  ]);

  if (PRIVATE) {
    log("message affiché :", outcome);
    if (!outcome.startsWith("erreur") || !/navigation privée/.test(outcome) || /Registration failed/.test(outcome)) {
      fail("en navigation privée, le message attendu est en français et parle de la navigation privée", 2);
    } else log("OK : message en français, sans texte technique du navigateur");
  } else if (outcome !== "abonné") {
    fail(`abonnement impossible (${outcome})`, 2);
  } else {
    const host = await page.evaluate(async () => {
      const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      return subscription ? new URL(subscription.endpoint).host : null;
    });
    log("service de notifications du navigateur :", host);

    await page.getByRole("button", { name: "Envoyer un message de test" }).click();
    const verdict = page.getByRole("list", { name: "Résultat du message de test" });
    await verdict.waitFor({ timeout: 30_000 });
    log("verdict du serveur :", (await verdict.innerText()).replace(/\s+/g, " "));

    let shown = [];
    for (let i = 0; i < 20 && shown.length === 0; i++) {
      await page.waitForTimeout(1_000);
      shown = await page.evaluate(async () => {
        const list = await (await navigator.serviceWorker.getRegistration())?.getNotifications();
        return (list ?? []).map((n) => ({ title: n.title, body: n.body }));
      });
    }
    log("notifications affichées par le service worker :", JSON.stringify(shown));
    if (shown.length === 0) fail("le serveur a envoyé, mais le service worker n'a rien affiché", 3);
    else log("OK : la chaîne complète fonctionne");

    // Nettoyage : l'appareil de test ne reste pas inscrit côté serveur.
    await page.getByRole("button", { name: "Désactiver sur cet appareil" }).click();
    await page.getByRole("button", { name: /Activer sur cet appareil/ }).waitFor({ timeout: 20_000 });
    log("appareil désabonné");
  }
} catch (error) {
  fail(String(error).slice(0, 400));
} finally {
  await close();
}
