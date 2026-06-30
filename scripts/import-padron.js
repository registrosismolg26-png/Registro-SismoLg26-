const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

// Manually load .env variables if process.env.DATABASE_URL is empty
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.slice(0, index).trim();
          let value = trimmed.slice(index + 1).trim();
          // Remove wrapping quotes
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

// Instantiate Prisma 7 client with the Pg driver adapter
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: La variable de entorno DATABASE_URL no está definida en el archivo .env ni en el proceso");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CSV_FILE = path.join(__dirname, '..', 'padron.csv');
const BATCH_SIZE = 5000;

function detectEncoding(filePath) {
  const buffer = fs.readFileSync(filePath);
  
  // Check for UTF-8 BOM
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf8';
  }

  // Inspect first 8000 bytes for UTF-8 sequence compliance
  let isUtf8 = true;
  let i = 0;
  const len = Math.min(buffer.length, 8000);
  
  while (i < len) {
    const byte = buffer[i];
    if (byte > 127) {
      if ((byte & 0xE0) === 0xC0) { // 2-byte UTF-8 sequence
        if (i + 1 < len && (buffer[i + 1] & 0xC0) === 0x80) {
          i += 2;
          continue;
        }
      } else if ((byte & 0xF0) === 0xE0) { // 3-byte UTF-8 sequence
        if (i + 2 < len && (buffer[i + 1] & 0xC0) === 0x80 && (buffer[i + 2] & 0xC0) === 0x80) {
          i += 3;
          continue;
        }
      }
      isUtf8 = false;
      break;
    }
    i++;
  }
  return isUtf8 ? 'utf8' : 'latin1'; // 'latin1' handles ANSI/Windows-1252 perfectly in Node
}

async function run() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`Error: No se encontró el archivo 'padron.csv' en la raíz del proyecto.`);
    console.log(`Por favor, exporta tu Excel a CSV y guárdalo en la raíz como 'padron.csv'.`);
    process.exit(1);
  }

  const encoding = detectEncoding(CSV_FILE);
  console.log(`Codificación del archivo detectada: ${encoding.toUpperCase()}`);

  console.log("Iniciando importación masiva de padrón...");
  
  // Clean old records first to avoid mixing with incorrect fallback dates
  console.log("Limpiando registros antiguos del padrón en Supabase...");
  await prisma.padron.deleteMany();
  console.log("Base de datos limpia.");


  const fileStream = fs.createReadStream(CSV_FILE, { encoding });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  let batch = [];
  let totalInserted = 0;
  let duplicatesCount = 0;
  let delimiter = ','; // default
  const seenCedulas = new Set();

  // Read line by line
  for await (const line of rl) {
    lineCount++;
    if (!line.trim()) continue;

    // Detect delimiter on header line (first line)
    if (lineCount === 1) {
      if (line.includes('\t')) delimiter = '\t';
      else if (line.includes(';')) delimiter = ';';
      console.log(`Delimitador detectado: [${delimiter === '\t' ? '\\t (Tabulador)' : delimiter}]`);
      continue; // Skip headers
    }

    // Split row columns
    const columns = line.split(delimiter).map(col => col.replace(/^["']|["']$/g, '').trim());
    if (columns.length < 6) {
      console.warn(`Línea ${lineCount} ignorada por no tener las 6 columnas mínimas.`);
      continue;
    }

    // Map: PARROQUIA | NACIONALIDAD | CEDULA | NOMBRE COMPLETO | SEXO | FECHA
    const parroquia = columns[0].toUpperCase();
    const nacionalidad = columns[1].toUpperCase().slice(0, 1);
    const cedula = columns[2].replace(/\D/g, ""); // extract only digits
    const nombreCompleto = columns[3].toUpperCase();
    const sexo = columns[4].toUpperCase().slice(0, 1);
    const rawDate = columns[5];

    if (!cedula || !nombreCompleto) continue;

    // De-duplicate client-side to prevent PK violation within the CSV or batch
    if (seenCedulas.has(cedula)) {
      duplicatesCount++;
      continue;
    }
    seenCedulas.add(cedula);

    // Parse DD/MM/AAAA format with padding for single digits to ensure valid ISO-8601 parsing
    let dateObj;
    try {
      if (rawDate && rawDate.includes('/')) {
        const [day, month, year] = rawDate.split('/');
        const paddedDay = day.trim().padStart(2, '0');
        const paddedMonth = month.trim().padStart(2, '0');
        dateObj = new Date(`${year.trim()}-${paddedMonth}-${paddedDay}T00:00:00.000Z`);
      } else if (rawDate) {
        dateObj = new Date(rawDate);
      } else {
        dateObj = new Date('1900-01-01');
      }
      if (isNaN(dateObj.getTime())) {
        dateObj = new Date('1900-01-01');
      }
    } catch (e) {
      dateObj = new Date('1900-01-01');
    }

    batch.push({
      cedula,
      nacionalidad,
      nombreCompleto,
      sexo,
      fechaNacimiento: dateObj,
      parroquia
    });

    // Write to Supabase when batch size is reached
    if (batch.length >= BATCH_SIZE) {
      totalInserted += await insertBatch(batch);
      process.stdout.write(`\rProcesados: ${totalInserted.toLocaleString()} registros...`);
      batch = [];
    }
  }

  // Insert remaining records
  if (batch.length > 0) {
    totalInserted += await insertBatch(batch);
    process.stdout.write(`\rProcesados: ${totalInserted.toLocaleString()} registros...`);
  }

  console.log(`\n¡Completado!`);
  console.log(`- Registros nuevos importados a Supabase: ${totalInserted.toLocaleString()}`);
  console.log(`- Filas duplicadas omitidas en el CSV: ${duplicatesCount.toLocaleString()}`);
  await prisma.$disconnect();
  await pool.end();
}

async function insertBatch(records) {
  try {
    const res = await prisma.padron.createMany({
      data: records,
      skipDuplicates: true
    });
    return res.count;
  } catch (err) {
    console.error("\nError al insertar lote en base de datos:", err.message);
    return 0;
  }
}

run().catch(err => {
  console.error("Error crítico durante la importación:", err);
});
