// Construit puis sert le front pour les tests de navigateur : version de production, dossier de build séparé
// (`.next-e2e`) pour ne pas gêner un `npm run dev` ou un `npm run build` en cours.
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const NEXT = path.join(ROOT, "node_modules/next/dist/bin/next");
const API_PORT = process.env.E2E_API_PORT ?? "3996";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3101";

const env = {
  ...process.env,
  NEXT_DIST_DIR: ".next-e2e",
  // Figée à la compilation : le front construit ici parle à l'API de test, pas à celle de démonstration.
  NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
};

// E2E_SKIP_BUILD=1 : réutilise le dernier build (`.next-e2e`) quand le code du front n'a pas changé, pour itérer vite.
if (process.env.E2E_SKIP_BUILD !== "1") {
  const build = spawnSync(process.execPath, [NEXT, "build"], { cwd: ROOT, env, stdio: "inherit" });
  if (build.status !== 0) {
    console.error("[e2e/web] build en échec");
    process.exit(build.status ?? 1);
  }
}

const web = spawn(process.execPath, [NEXT, "start", "-p", WEB_PORT], { cwd: ROOT, env, stdio: "inherit" });
web.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => web.kill());
