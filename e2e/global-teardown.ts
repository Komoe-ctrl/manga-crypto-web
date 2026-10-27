import { spawnSync } from "node:child_process";
import { DB_NAME } from "./env";

/** Supprime la base de test (les connexions de l'API encore ouvertes sont coupées). Sans conséquence si elle n'existe plus. */
export default function globalTeardown(): void {
  spawnSync("docker", ["exec", "crypto-postgres", "psql", "-U", "crypto", "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`], {
    encoding: "utf8",
  });
}
