const fs = require('fs');
const path = require('path');
const pg = require('pg');

// Manually load .env variables if process.env.DATABASE_URL is empty
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.slice(0, index).trim();
          let value = trimmed.slice(index + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          process.env[key] = value;
        }
      });
    }
  } catch (e) {
    console.warn("Fallo al intentar leer el archivo .env de forma manual:", e);
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: La variable de entorno DATABASE_URL no está definida en el archivo .env ni en el proceso");
  process.exit(1);
}

// Append timeout and keepalive parameters
function buildConnectionString(base) {
  try {
    const url = new URL(base);
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "30");
    if (!url.searchParams.has("keepalives_idle")) url.searchParams.set("keepalives_idle", "30");
    if (!url.searchParams.has("keepalives_interval")) url.searchParams.set("keepalives_interval", "5");
    if (!url.searchParams.has("keepalives_count")) url.searchParams.set("keepalives_count", "3");
    return url.toString();
  } catch {
    return base;
  }
}

const fileArg = process.argv[2] || 'prisma/planteamiento_sala_opciones_migration.sql';
const sqlFilePath = path.isAbsolute(fileArg) ? fileArg : path.join(__dirname, '..', fileArg);

if (!fs.existsSync(sqlFilePath)) {
  console.error(`Error: Archivo SQL no encontrado en ${sqlFilePath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlFilePath, 'utf8');

async function run() {
  console.log(`[runner] Conectando al pool con DATABASE_URL...`);
  console.log(`[runner] Ejecutando migración: ${path.basename(sqlFilePath)}`);

  const pool = new pg.Pool({
    connectionString: buildConnectionString(connectionString),
    connectionTimeoutMillis: 20000,
    max: 1,
  });

  pool.on("error", (err) => {
    console.error("[pool error]", err.message);
  });

  const client = await pool.connect();
  try {
    console.log(`[runner] Conexión establecida. Ejecutando sentencias SQL...`);
    const startTime = Date.now();
    await client.query(sql);
    console.log(`[runner] ✅ Migración ejecutada con éxito en ${Date.now() - startTime}ms.`);

    // Verificación de columnas creadas
    console.log(`[runner] Verificando columnas en la tabla PlanteamientoSala...`);
    const checkRes = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'PlanteamientoSala'
      ORDER BY ordinal_position;
    `);

    console.log(`[runner] Total de columnas encontradas: ${checkRes.rows.length}`);
    const cols = checkRes.rows.map((r) => r.column_name);
    const expected = [
      "tipoOpcion",
      "cartaCompromiso",
      "fotosAlquiler",
      "cantidadFotosAlquiler",
      "referenciaBancariaAlquiler",
      "cedulaArrendador",
      "cedulaArrendatario",
      "rifArrendador",
      "rifArrendatario",
      "rifViviendaDanos",
      "fotosViviendaRenace",
      "cantidadFotosRenace",
      "sacosCemento",
      "metrosArena",
      "bloques",
      "cabillas",
      "pego",
    ];

    const missing = expected.filter((c) => !cols.includes(c));
    if (missing.length === 0) {
      console.log(`[runner] ✅ Todas las columnas de las nuevas modalidades están presentes en la base de datos.`);
    } else {
      console.warn(`[runner] ⚠️ Columnas no encontradas: ${missing.join(', ')}`);
    }

    // Comprobar índice
    const idxRes = await client.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'PlanteamientoSala' AND indexname = 'PlanteamientoSala_tipoOpcion_idx';
    `);
    if (idxRes.rows.length > 0) {
      console.log(`[runner] ✅ Índice 'PlanteamientoSala_tipoOpcion_idx' verificado.`);
    }
  } catch (err) {
    console.error(`[runner] ❌ Error al ejecutar migración:`, err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    console.log(`[runner] Conexión liberada y pool cerrado.`);
  }
}

run();
