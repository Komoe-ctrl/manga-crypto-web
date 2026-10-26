import { describe, expect, it } from "vitest";
import { apiErrorMessage, hasStatus } from "./api-error";
import { CHANNEL_LABEL, describeFailure } from "./delivery";

describe("apiErrorMessage", () => {
  it("affiche le message de l'API tel quel (c'est déjà une phrase en français)", () => {
    expect(apiErrorMessage({ statusCode: 422, message: "Renseignez telegramChatId pour activer Telegram" }, "x")).toBe(
      "Renseignez telegramChatId pour activer Telegram",
    );
  });

  it("assemble les erreurs de validation (tableau de messages)", () => {
    expect(apiErrorMessage({ statusCode: 400, message: ["email invalide", "mot de passe trop court"] }, "x")).toBe(
      "email invalide · mot de passe trop court",
    );
  });

  it("réseau coupé : un message qui dit quoi faire, pas « Failed to fetch »", () => {
    expect(apiErrorMessage(new TypeError("Failed to fetch"), "x")).toContain("Impossible de joindre le serveur");
  });

  it("429 et 401 ont leur propre message", () => {
    expect(apiErrorMessage({ statusCode: 429, message: "ThrottlerException: Too Many Requests" }, "x")).toContain("Patientez");
    expect(apiErrorMessage({ statusCode: 401, message: "Unauthorized" }, "x")).toContain("session a expiré");
  });

  it.each([null, undefined, "texte brut", 42, {}, { message: "" }, { message: 5 }, { message: [] }, { message: [1, 2] }])(
    "erreur inexploitable (%j) : le message de repli, jamais un texte technique",
    (error) => expect(apiErrorMessage(error, "Repli.")).toBe("Repli."),
  );
});

describe("hasStatus", () => {
  it("reconnaît un statut précis", () => {
    expect(hasStatus({ statusCode: 422 }, 422)).toBe(true);
    expect(hasStatus({ statusCode: 500 }, 422)).toBe(false);
    expect(hasStatus(null, 422)).toBe(false);
    expect(hasStatus("422", 422)).toBe(false);
  });
});

describe("describeFailure", () => {
  it.each([
    "push_not_configured",
    "push_no_subscription",
    "push_subscription_gone",
    "push_http_403",
    "push_unreachable",
    "telegram_not_configured",
    "telegram_no_chat",
    "telegram_unreachable",
    "email_not_configured",
    "email_no_recipient",
    "email_auth_failed",
    "email_unreachable",
    "email_rejected",
    "email_temporary_failure",
  ])("%s est expliqué, et jamais par le code brut", (code) => {
    const text = describeFailure(code);
    expect(text).not.toContain(code);
    expect(text.length).toBeGreaterThan(15);
  });

  it("dit ce qu'il faut faire pour les cas que l'utilisateur peut régler", () => {
    expect(describeFailure("push_no_subscription")).toContain("activez le Push");
    expect(describeFailure("telegram_no_chat")).toContain("conversation");
    expect(describeFailure("push_not_configured")).toContain("côté serveur");
  });

  it("les codes avec statut variable sont expliqués", () => {
    expect(describeFailure("push_http_413")).toContain("Push");
    expect(describeFailure("telegram_http_400")).toContain("identifiant");
  });

  it("un code inconnu (version future de l'API) ou absent reste lisible", () => {
    expect(describeFailure("code_du_futur")).toBe("Échec de l'envoi.");
    expect(describeFailure(undefined)).toBe("Échec de l'envoi.");
  });

  it("nomme les trois canaux", () => {
    expect(CHANNEL_LABEL).toEqual({ PUSH: "Push", TELEGRAM: "Telegram", EMAIL: "Email" });
  });
});
