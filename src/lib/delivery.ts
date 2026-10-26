import type { DeliveryDto } from "@/lib/api/types.gen";

export const CHANNEL_LABEL: Record<DeliveryDto["channel"], string> = {
  PUSH: "Push",
  TELEGRAM: "Telegram",
  EMAIL: "Email",
};

/**
 * Explication, en français, du code d'échec d'un canal (`crypto-api/docs/ETAPES.md`, étape 15). Chaque code dit **ce
 * qu'il faut faire** : un message de test sert justement à trouver ce qui manque.
 */
const REASONS: Record<string, string> = {
  push_not_configured: "Le serveur n'a pas de clés Push (VAPID) : à configurer côté serveur.",
  push_no_subscription: "Aucun appareil abonné : activez le Push sur cet appareil.",
  push_subscription_gone: "L'abonnement a été révoqué par le navigateur : réactivez le Push.",
  push_http_403: "Le service Push refuse les clés du serveur : à vérifier côté serveur.",
  push_unreachable: "Le service Push est injoignable : réessayez plus tard.",
  telegram_not_configured: "Le serveur n'a pas de robot Telegram : à configurer côté serveur.",
  telegram_no_chat: "Aucune conversation Telegram renseignée.",
  telegram_unreachable: "Telegram est injoignable : réessayez plus tard.",
  email_not_configured: "Le serveur n'a pas de messagerie configurée : à configurer côté serveur.",
  email_no_recipient: "Aucune adresse de destination.",
  email_auth_failed: "La messagerie du serveur refuse ses identifiants : à vérifier côté serveur.",
  email_unreachable: "Le serveur de messagerie est injoignable : réessayez plus tard.",
  email_rejected: "Le serveur de messagerie a refusé le message.",
  email_temporary_failure: "Le serveur de messagerie a refusé le message pour l'instant : réessayez plus tard.",
};

/** Explication d'un échec ; un code inconnu (version future de l'API) reste lisible. */
export function describeFailure(reason: string | undefined): string {
  if (!reason) return "Échec de l'envoi.";
  if (REASONS[reason]) return REASONS[reason];
  if (/^push_http_\d+$/.test(reason)) return "Le service Push a refusé le message : réessayez plus tard.";
  if (/^telegram_http_\d+$/.test(reason)) return "Telegram a refusé le message : vérifiez l'identifiant de conversation.";
  return "Échec de l'envoi.";
}
