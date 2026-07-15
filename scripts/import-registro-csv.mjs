// Importa un CSV (export de la tabla Registro) al modelo Registro en Supabase.
//
// USO:
//   node scripts/import-registro-csv.mjs                    -> DRY-RUN (analiza, NO inserta)
//   node scripts/import-registro-csv.mjs --commit           -> INSERTA de verdad
//   node scripts/import-registro-csv.mjs --file "otro.csv" [--commit]
//
// - Separador ';' (verificado, sin comillas). Mapea por NOMBRE de columna del encabezado.
// - Idempotente: ON CONFLICT ("cedula","refugio") DO NOTHING -> re-ejecutar no duplica.
// - Recupera el punto decimal perdido del GPS (divide /10 hasta caer en rango válido).
// - Requiere DATABASE_URL en .env (Supabase). El DRY-RUN NO necesita la DB.
// - OJO: el CSV lleva PII (cédulas/nombres) -> NO lo subas al repo.

import pg from "pg";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const fileArg = (() => { const i = args.indexOf("--file"); return i >= 0 ? args[i + 1] : null; })();
const FILE = fileArg || "Registro_rows (1).csv";

function getDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(".env", "utf8");
    const m = env.match(/DATABASE_URL\s*=\s*"?([^"\n]+)"?/);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

// ── Parse CSV ──
const rawFile = readFileSync(FILE, "utf8").replace(/^﻿/, "");
const lines = rawFile.split(/\r?\n/).filter((l) => l.length > 0);
const header = lines[0].split(";").map((h) => h.trim());
const col = {};
header.forEach((h, i) => (col[h] = i));
const rows = lines.slice(1).map((l) => l.split(";"));

// ── Conversores ──
const s = (v) => (v ?? "").trim();
const orNull = (v) => (s(v) === "" ? null : s(v));
const orDef = (v, def) => (s(v) === "" ? def : s(v));
const toInt = (v) => { const n = parseInt(s(v), 10); return Number.isFinite(n) ? n : 0; };
const toDate = (v) => {
  const t = s(v);
  if (!t) return null;
  const iso = t.replace(" ", "T") + (/[zZ+]/.test(t) ? "" : "Z");
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};
const toJson = (v) => { const t = s(v); if (!t) return "[]"; try { JSON.parse(t); return t; } catch { return "[]"; } };
// Recupera el decimal perdido de una coordenada: divide /10 hasta caer en el rango válido.
const toCoord = (v, max) => {
  const t = s(v); if (!t) return null;
  let n = parseFloat(t); if (!isFinite(n) || n === 0) return null;
  const neg = n < 0; n = Math.abs(n);
  while (n > max) n /= 10;
  return neg ? -n : n;
};

const COLS = ["id","parroquia","sector","comunidad","direccionExacta","nombreApellido","cedula","jefeFamilia","genero","fechaNacimiento","edad","perteneceNucleo","cedulaJefeFamilia","estadoFisico","embarazo","patologia","patologiaDescripcion","gpsLat","gpsLng","telefono","cuarto","medicamentos","patologiaIds","medicamentoIds","retirado","retiradoRazon","retiradoFecha","createdAt","syncedAt","intermitente","motivoIntermitente","refugio"];
const JSONB = new Set(["medicamentos", "patologiaIds", "medicamentoIds"]);

let gpsFixed = 0;
function mapRow(r) {
  const g = (name) => r[col[name]];
  const rawLat = s(g("gpsLat")), rawLng = s(g("gpsLng"));
  const gpsLat = toCoord(rawLat, 90), gpsLng = toCoord(rawLng, 180);
  if ((rawLat && Math.abs(parseFloat(rawLat)) > 90) || (rawLng && Math.abs(parseFloat(rawLng)) > 180)) gpsFixed++;
  return {
    id: orNull(g("id")) || randomUUID(),
    parroquia: s(g("parroquia")),
    sector: s(g("sector")),
    comunidad: s(g("comunidad")),
    direccionExacta: s(g("direccionExacta")),
    nombreApellido: s(g("nombreApellido")),
    cedula: s(g("cedula")),
    jefeFamilia: orDef(g("jefeFamilia"), "NO"),
    genero: s(g("genero")),
    fechaNacimiento: toDate(g("fechaNacimiento")),
    edad: toInt(g("edad")),
    perteneceNucleo: orDef(g("perteneceNucleo"), "NO"),
    cedulaJefeFamilia: orNull(g("cedulaJefeFamilia")),
    estadoFisico: orDef(g("estadoFisico"), "ILESO"),
    embarazo: orDef(g("embarazo"), "NO"),
    patologia: orDef(g("patologia"), "NO"),
    patologiaDescripcion: orNull(g("patologiaDescripcion")),
    gpsLat, gpsLng,
    telefono: orNull(g("telefono")),
    cuarto: orNull(g("cuarto")),
    medicamentos: toJson(g("medicamentos")),
    patologiaIds: toJson(g("patologiaIds")),
    medicamentoIds: toJson(g("medicamentoIds")),
    retirado: orDef(g("retirado"), "NO"),
    retiradoRazon: orNull(g("retiradoRazon")),
    retiradoFecha: toDate(g("retiradoFecha")),
    createdAt: toDate(g("createdAt")) || new Date(),
    syncedAt: toDate(g("syncedAt")),
    intermitente: orDef(g("intermitente"), "NO"),
    motivoIntermitente: orNull(g("motivoIntermitente")),
    refugio: s(g("refugio")),
  };
}

const mapped = rows.map(mapRow);
const invalid = mapped.filter((m) => !m.cedula || !m.nombreApellido || !m.fechaNacimiento || !m.refugio);
const toInsert = mapped.filter((m) => m.cedula && m.nombreApellido && m.fechaNacimiento && m.refugio);
const refugios = [...new Set(mapped.map((m) => m.refugio))];

console.log(`Archivo:            ${FILE}`);
console.log(`Filas leídas:       ${mapped.length}`);
console.log(`Refugios:           ${refugios.map((r) => `"${r}"`).join(", ")}`);
console.log(`GPS recuperado:     ${gpsFixed} filas (se les reinsertó el punto decimal)`);
console.log(`Inválidas (omit.):  ${invalid.length} (sin cédula/nombre/fecha/refugio)`);
console.log(`A insertar:         ${toInsert.length}`);
console.log(`\nEjemplo (1ª fila mapeada):`);
console.log(JSON.stringify(mapped[0], null, 2));

if (!COMMIT) {
  console.log(`\n[DRY-RUN] No se insertó nada. Revisa el ejemplo de arriba.`);
  console.log(`Para insertar de verdad:  node scripts/import-registro-csv.mjs --commit`);
  process.exit(0);
}

const url = getDbUrl();
if (!url) { console.error("No hay DATABASE_URL en .env."); process.exit(1); }
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await client.connect();
try {
  const quotedCols = COLS.map((c) => `"${c}"`).join(", ");
  const BATCH = 200;
  let inserted = 0;
  await client.query("BEGIN");
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const valuesSql = [];
    const params = [];
    chunk.forEach((rec, ri) => {
      const ph = COLS.map((c, ci) => `$${ri * COLS.length + ci + 1}${JSONB.has(c) ? "::jsonb" : ""}`);
      valuesSql.push(`(${ph.join(", ")})`);
      COLS.forEach((c) => params.push(rec[c]));
    });
    const sql = `INSERT INTO "Registro" (${quotedCols}) VALUES ${valuesSql.join(", ")} ON CONFLICT ("cedula", "refugio") DO NOTHING`;
    const res = await client.query(sql, params);
    inserted += res.rowCount;
    process.stdout.write(`\r  Insertadas ${inserted} / ${toInsert.length}...`);
  }
  await client.query("COMMIT");
  console.log(`\n✓ Listo. Insertadas ${inserted}. Omitidas (ya existían por (cedula,refugio)): ${toInsert.length - inserted}.`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\nERROR — ROLLBACK, no se insertó nada:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
