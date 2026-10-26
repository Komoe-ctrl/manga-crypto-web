/**
 * Message lisible à partir d'une erreur de l'API. Avec `throwOnError`, le client généré lève le **corps de la réponse**
 * d'erreur (`{ statusCode, message }`, où `message` peut être un tableau pour les erreurs de validation), ou une
 * `TypeError` quand le réseau est coupé. Le texte d'une erreur technique inconnue n'est jamais affiché tel quel.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return "Impossible de joindre le serveur. Vérifiez votre connexion.";
  if (typeof error !== "object" || error === null) return fallback;

  const { message, statusCode } = error as { message?: unknown; statusCode?: unknown };
  if (statusCode === 429) return "Trop de demandes. Patientez une minute avant de réessayer.";
  if (statusCode === 401) return "Votre session a expiré. Reconnectez-vous.";
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const texts = message.filter((m): m is string => typeof m === "string" && m.trim() !== "");
    if (texts.length) return texts.join(" · ");
  }
  return fallback;
}

/** Vrai si l'erreur est un statut HTTP précis (par exemple 422 : l'API refuse la valeur). */
export function hasStatus(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null && (error as { statusCode?: unknown }).statusCode === status;
}
