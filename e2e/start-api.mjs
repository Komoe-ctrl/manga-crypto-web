// Démarre l'API pour les tests de navigateur : base neuve, migrations, puis l'application construite de `crypto-api`.
// Lancé par Playwright (`webServer`) ; l'arrêt est assuré par Playwright, la base est supprimée par `global-teardown`.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const API_DIR = path.resolve(import.meta.dirname, "../../crypto-api");
const API_PORT = process.env.E2E_API_PORT ?? "3996";
const WEB_ORIGIN = `http://localhost:${process.env.E2E_WEB_PORT ?? "3101"}`;
const DB_NAME = process.env.E2E_DB_NAME ?? "crypto_e2e";
const REDIS_DB = process.env.E2E_REDIS_DB ?? "9";

function fail(message) {
  console.error(`[e2e/api] ${message}`);
  process.exit(1);
}

if (!existsSync(path.join(API_DIR, "dist", "main.js"))) {
  fail(`API non construite : lancez « npm run build » dans ${API_DIR} (sur la branche à tester).`);
}

// L'adresse de la base de développement donne l'utilisateur, le mot de passe et le port ; seul le nom change.
const envFile = readFileSync(path.join(API_DIR, ".env"), "utf8");
const dbUrl = envFile.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!dbUrl) fail("DATABASE_URL introuvable dans crypto-api/.env");
const url = new URL(dbUrl);
url.pathname = `/${DB_NAME}`;
const DATABASE_URL = url.toString();

function psql(sql) {
  const result = spawnSync("docker", ["exec", "crypto-postgres", "psql", "-U", decodeURIComponent(url.username), "-d", "postgres", "-c", sql], {
    encoding: "utf8",
  });
  if (result.status !== 0) fail(`psql a échoué (le conteneur crypto-postgres tourne-t-il ? « npm run db:up ») :\n${result.stderr}`);
}

psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
psql(`CREATE DATABASE ${DB_NAME}`);

const env = {
  ...process.env,
  DATABASE_URL,
  REDIS_URL: `redis://localhost:6379/${REDIS_DB}`,
  PORT: API_PORT,
  WEB_ORIGIN,
  // Pas de tâches de fond : le test ne doit dépendre ni de l'heure ni d'ordres déclenchés tout seuls.
  BACKGROUND_JOBS_ENABLED: "false",
};

const migrate = spawnSync(process.execPath, [path.join(API_DIR, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
  cwd: API_DIR,
  env,
  encoding: "utf8",
});
if (migrate.status !== 0) fail(`migrations en échec :\n${migrate.stdout}\n${migrate.stderr}`);

const api = spawn(process.execPath, ["dist/main"], { cwd: API_DIR, env, stdio: "inherit" });
api.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => api.kill());
