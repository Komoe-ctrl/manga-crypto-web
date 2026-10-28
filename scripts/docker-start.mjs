// Lanceur de l'image Docker : démarre le serveur autonome de Next et s'arrête dès qu'on le demande.
//
// Dans un conteneur, Node est le processus n° 1 : le noyau n'applique pas l'action par défaut des signaux à ce
// processus, donc sans gestionnaire un SIGTERM (envoyé par la plateforme à chaque déploiement) est ignoré, et le
// conteneur n'est arrêté de force qu'à la fin du délai (constaté à l'essai : code 137 après 20 s). Le site ne tient
// aucun état en mémoire : s'arrêter tout de suite est sans conséquence.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => process.exit(0));
}

await import('./server.js');
