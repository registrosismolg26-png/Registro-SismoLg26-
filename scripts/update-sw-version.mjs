// Genera el BUILD_TS del service worker (public/sw.js) automáticamente en cada
// build, vía el script `prebuild` de package.json. Usa el commit SHA como versión:
// así el sw.js cambia SOLO cuando hay un commit nuevo (justo cuando conviene
// invalidar el cache de los clientes), el navegador detecta el cambio del SW y lo
// actualiza. Evita tener que editar BUILD_TS a mano en cada deploy.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const swPath = fileURLToPath(new URL("../public/sw.js", import.meta.url));

// Modo DEV (`--dev`): fuerza un BUILD_TS ÚNICO por timestamp. Se usa al iterar UI
// en `next dev` (que NO corre `prebuild`), para que el Service Worker del navegador
// detecte una versión nueva y pida ACTUALIZAR — si no, sirve el CSS/JS cacheado y los
// cambios de UI no se ven. En build normal se usa el commit SHA (invalidación por deploy).
const devMode = process.argv.includes("--dev");

let version = "";
if (devMode) {
  version = `dev-${Date.now().toString(36)}`;
} else {
  // En Vercel: VERCEL_GIT_COMMIT_SHA. En local: git. Último recurso: timestamp.
  version = process.env.VERCEL_GIT_COMMIT_SHA || "";
  if (!version) {
    try {
      version = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      /* sin git disponible */
    }
  }
  version = (version || String(Date.now())).slice(0, 12);
}

const sw = readFileSync(swPath, "utf8");
if (!/const BUILD_TS = "[^"]*";/.test(sw)) {
  console.warn("[sw] No se encontró 'const BUILD_TS' en public/sw.js — nada que actualizar.");
} else {
  const updated = sw.replace(/const BUILD_TS = "[^"]*";/, `const BUILD_TS = "${version}";`);
  if (updated !== sw) {
    writeFileSync(swPath, updated);
    console.log(`[sw] BUILD_TS -> ${version}`);
  } else {
    console.log(`[sw] BUILD_TS ya es ${version}`);
  }
}
