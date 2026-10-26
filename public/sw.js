/*
 * Service worker de Veille : reçoit les notifications Push et les affiche, même quand l'application est fermée.
 *
 * Contrat du message (crypto-api/docs/SPEC.md, section 9) : { "title": string, "body": string, "critical": boolean }.
 * Ce fichier est du JavaScript brut (un service worker ne passe pas par la compilation de Next) et reste volontairement
 * minuscule : il n'a accès à aucun jeton ni aucune donnée de l'application.
 */

/** Lit le message avec prudence : un message illisible ne doit jamais empêcher d'afficher quelque chose. */
function readMessage(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  // Un contenu JSON valide mais qui n'est pas un objet (null, nombre, texte) ferait planter la lecture des champs ci-dessous,
  // et aucune notification ne s'afficherait : on le traite comme un message vide.
  if (typeof data !== "object" || data === null) data = {};
  return {
    title: typeof data.title === "string" && data.title ? data.title : "Veille",
    body: typeof data.body === "string" ? data.body : "",
    critical: data.critical === true,
  };
}

self.addEventListener("push", function (event) {
  const message = readMessage(event);
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      // Une alerte critique reste affichée jusqu'à ce qu'on la ferme ; les autres se rangent d'elles-mêmes.
      requireInteraction: message.critical,
      // Même étiquette : une alerte du même type en remplace une autre au lieu de s'empiler.
      tag: message.critical ? "veille-critique" : "veille",
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      // Une fenêtre de l'application est déjà ouverte : on la met en avant plutôt que d'en ouvrir une seconde.
      for (const client of windows) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});
