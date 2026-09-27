const fs = require('fs');
const path = require('path');
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
  console.error("Error: DATABASE_URL no está definida.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 2 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CAMPAMENTO = "Gustavo Olivares Bosque (Sector Oeste)";

// Raw data provided by the user
const RAW_DATA = `
1.446.136	4142493493
18.324.248	4149016903
12.459.271	4241463602
18.692.046	4242331811
19.303.053	4121103378
12.460.668	4242572964
14.073.551	4241228103
5.574.715	4129910976
5.578.984	4123078690
16.106.225	4129335284
6.479.295	4142780881
643819	4123364659
12.165.788	41255528268
7.462.933	4160338413
10.576.231	4129005456
16.308.906	4141507681
19.998.249	4142048681
6498826	4143107992
1.133.191	4241259937
12.716.320	4269188527
16.105.376	4142268310
12.715.305	4241162674
17.960.962	4120323179
6.478.652	4129720498
6.491.757	4129000941
2.958.210	4169066020
14.277.161	4241325766
6.496.928	4123873401
4562938	4129996283
5577471	4241556437
10.581.991	4127065275
12.717.176	4242969733
9.994.401	4129118819
11.058.530	4141445768
22.500.628	4241773151
5.578.945	4142233511
9.629.432	4129021219
3.891.753	4129021219
13.673.884	4241550556
5.589.745	4264962075
13.827.812	4125438411
4.120.158	4129634955
3.410.809	4242909626
20.191.194	4123064648
5576714	4127528076
4.560.795	4242050757
2.902.183	4129406913
5.569.058	4128056854
6.490.540	4143109499
21291886	4241888569
6.490.282	4128030642
11.058.970	4242716265
10.688.703	
5.578.971	4124747018
6.472.323	4241378216
6.481.122	4141257537
10565981	4142444539
5.578.692	4220314955
7.997.057	4242727589
3.888.792	4129106121
5.569.682	4123924006
5.090.876	4241980692
12.459.610	4120116041
11.637.416	4129161006
14.768.303	4123089092
3.610.357	4143159516
15831485	414327456
3.367.836	4241711803
11038085	4142907312
6.498.151	4120129298
2.902.090	4125758823
8.177.789	4241950684
3949518	4127492532
7.996.601	4142144854
4.119.499	4143897501
3.889.573	
11.993.078	4127247521
4.115.085	4241965594
16.309.782	4242683608
11.615.232	4128293565
6.497.126	4149073830
5.574.837	4120213697
11.084.550	4242063754
1.415.041	4146631334
4.558.686	4144799465
13.069.601	4241287611
9.995.221	4242299709
5.578.770	4123765297
20.058.264	
4.115.585	
4.589.176	
6.490.345	
26.283.604	
1.459.246	
16.086.904	
5.033.404	
6.482.225	
14.072.218	
8.178.036	
22.282.218	
17.426.708	
9.993.531	
9.993.600	
6.133.820	
6.486.591	
6.478.218	4242022179
16.726.887	4128099563
25.253.538	4120136884
9.998.030	4143694546
17.140.217	4129207163
4.559.406	4141548728
14.567.297	4143024266
4.561.029	4122986585
11061703	4141445768
9.994.250	4142051777
7.992.459	4242394401
1.734.011	4242394033
5.893.106	4220053790
4.116.292	4142762720
14.073.672	4262400682
6.482.378	4122983045
15.025.348	4241818670
5.574.789	4242674383
10.092.885	4142038834
5.090.477	4127709592
9.993.532	4146631334
7.997.105	4242031114
6.494.126	4262205866
12.910.318	4123919452
`;

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("4")) {
    return "0" + digits;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits;
  }
  return digits;
}

function calculateAge(fechaNacStr) {
  if (!fechaNacStr) return null;
  const d = new Date(fechaNacStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

async function fetchRepExterno(cedulaDigits) {
  const API_BASE = "https://api.cedula.com.ve/api/v1";
  const appId = process.env.CEDULA_API_APP_ID || "9306";
  const token = process.env.CEDULA_API_TOKEN || "089a0ac861dadfe75a4c7ce0af5f94b0";
  const apiUrl = `${API_BASE}?app_id=${encodeURIComponent(appId)}&token=${encodeURIComponent(token)}&nacionalidad=V&cedula=${cedulaDigits}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(apiUrl, { signal: controller.signal, headers: { Accept: "application/json" } });
    const json = await res.json().catch(() => null);
    if (json && json.error === false && json.data) {
      const data = json.data;
      const nombreApellido = [data.primer_nombre, data.segundo_nombre, data.primer_apellido, data.segundo_apellido]
        .map(s => (s == null ? "" : String(s).trim()))
        .filter(Boolean)
        .join(" ")
        .toUpperCase();
      const sexoRaw = String(data.sexo ?? data.genero ?? "").trim().toUpperCase();
      const genero = sexoRaw.startsWith("F") ? "FEMENINO" : sexoRaw.startsWith("M") ? "MASCULINO" : null;
      const fn = String(data.fecha_nac ?? "").trim().slice(0, 10);
      const fechaNacimiento = /^\d{4}-\d{2}-\d{2}$/.test(fn) ? fn : null;
      const edad = calculateAge(fechaNacimiento);
      return {
        nombreApellido,
        genero,
        fechaNacimiento,
        edad,
        source: "REP_EXTERNO",
      };
    }
  } catch (err) {
    // ignore
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function main() {
  console.log(`Iniciando carga masiva para: "${CAMPAMENTO}"...`);

  // 1. Obtener refugioId si existe
  let refugioId = null;
  const refugioDb = await prisma.refugio.findFirst({
    where: {
      nombre: {
        contains: "Gustavo Olivares",
        mode: "insensitive",
      },
    },
  });
  if (refugioDb) {
    refugioId = refugioDb.id;
    console.log(`Refugio encontrado en BD: ${refugioDb.nombre} (ID: ${refugioId})`);
  } else {
    console.log(`Aviso: Refugio no encontrado con nombre exacto en tabla Refugio, se guardará solo como string.`);
  }

  // 2. Parsear líneas de datos
  const lines = RAW_DATA.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const parts = line.split(/[\t\s]+/).filter(Boolean);
    if (!parts.length) continue;
    const cedula = parts[0].replace(/\D/g, "");
    if (!cedula) continue;
    const rawPhone = parts[1] || "";
    const telefono = normalizePhone(rawPhone);
    items.push({ cedula, telefono, rawPhone });
  }

  console.log(`Total registros leídos: ${items.length}`);

  let countPadron = 0;
  let countRegistro = 0;
  let countRepExterno = 0;
  let countNoIdentificado = 0;
  let countProcesados = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { cedula, telefono } = item;

    let nombreApellido = "";
    let genero = null;
    let fechaNacimiento = null;
    let edad = null;
    let registroId = null;
    let phoneFinal = telefono;
    let source = "DESCONOCIDO";

    // 1) Buscar en Padron local
    const padronMatch = await prisma.padron.findFirst({
      where: { cedula },
    });

    if (padronMatch && padronMatch.nombreCompleto) {
      nombreApellido = padronMatch.nombreCompleto.trim().toUpperCase();
      genero = (padronMatch.sexo === "M" || padronMatch.sexo === "MASCULINO") ? "MASCULINO" : "FEMENINO";
      if (padronMatch.fechaNacimiento) {
        fechaNacimiento = padronMatch.fechaNacimiento.toISOString().slice(0, 10);
        edad = calculateAge(fechaNacimiento);
      }
      source = "PADRON_LOCAL";
      countPadron++;
    }

    // 2) Buscar en Registro (Censo local)
    const regMatch = await prisma.registro.findFirst({
      where: {
        OR: [
          { cedula: cedula },
          { cedula: `V-${cedula}` },
          { cedula: `E-${cedula}` },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (regMatch) {
      registroId = regMatch.id;
      if (!phoneFinal && regMatch.telefono) {
        phoneFinal = normalizePhone(regMatch.telefono);
      }
      if (!nombreApellido && regMatch.nombreApellido) {
        nombreApellido = regMatch.nombreApellido.trim().toUpperCase();
        genero = regMatch.genero || genero;
        if (regMatch.fechaNacimiento) {
          fechaNacimiento = regMatch.fechaNacimiento.toISOString().slice(0, 10);
        }
        edad = regMatch.edad || calculateAge(fechaNacimiento);
        source = "CENSO_LOCAL";
        countRegistro++;
      }
    }

    // 3) Si no se encontró el nombre, buscar en REP externo
    if (!nombreApellido) {
      await new Promise(r => setTimeout(r, 200)); // pequeño throttling
      const repMatch = await fetchRepExterno(cedula);
      if (repMatch && repMatch.nombreApellido) {
        nombreApellido = repMatch.nombreApellido;
        genero = repMatch.genero;
        fechaNacimiento = repMatch.fechaNacimiento;
        edad = repMatch.edad;
        source = "REP_EXTERNO";
        countRepExterno++;
      }
    }

    // 4) Si aún no tiene nombre
    if (!nombreApellido) {
      nombreApellido = `V-${cedula} (POR IDENTIFICAR)`;
      source = "SIN_IDENTIFICACION";
      countNoIdentificado++;
    }

    // 5) Guardar en PlanteamientoSala
    const dataToSave = {
      refugioId,
      refugio: CAMPAMENTO,
      cedula,
      nombreApellido,
      telefono: phoneFinal,
      genero,
      fechaNacimiento,
      edad,
      registroId,
      tipoOpcion: "MERCADO_SECUNDARIO",
      estatus: "EN PROCESO",
      porcentajeProgreso: 0,
      createdBy: "CARGA_MASIVA",
    };

    await prisma.planteamientoSala.upsert({
      where: {
        cedula_refugio: {
          cedula,
          refugio: CAMPAMENTO,
        },
      },
      create: {
        id: crypto.randomUUID(),
        ...dataToSave,
      },
      update: {
        nombreApellido,
        telefono: phoneFinal,
        genero: genero || undefined,
        fechaNacimiento: fechaNacimiento || undefined,
        edad: edad || undefined,
        registroId: registroId || undefined,
      },
    });

    countProcesados++;
    console.log(`[${countProcesados}/${items.length}] V-${cedula} -> ${nombreApellido} (${source}) ${phoneFinal ? 'Tel: ' + phoneFinal : 'Sin Tel'}`);
  }

  console.log("\n================ RESUMEN DE CARGA ================");
  console.log(`Total procesados: ${countProcesados}`);
  console.log(`- Encontrados en Padrón Local: ${countPadron}`);
  console.log(`- Encontrados en Censo Local:  ${countRegistro}`);
  console.log(`- Encontrados en REP Externo:  ${countRepExterno}`);
  console.log(`- Sin identificación:          ${countNoIdentificado}`);
  console.log("===================================================\n");
}

main()
  .catch(e => {
    console.error("Error ejecutando carga masiva:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
