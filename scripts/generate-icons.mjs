// Genera TODOS los iconos de la app (favicon + PWA) a partir de public/logo_gob.webp.
// Reutilizable: cuando cambie el logo, reemplaza public/logo_gob.webp y corre:
//   node scripts/generate-icons.mjs
// Luego SUBE la versión (?v=N) en src/app/layout.tsx y public/manifest.json para
// invalidar los cachés de favicon / iconos instalados (navegador, HTTP, service worker).
//
// Los iconos se generan CON TRANSPARENCIA (sin fondo): el logo es un emblema circular
// con fondo transparente y así se conserva. Requiere `sharp` (dependencia de Next); no
// agrega dependencias: el favicon.ico se arma a mano (PNG-en-ICO, en RGBA, que es lo que
// exige el decodificador de Next y a la vez preserva la transparencia).

import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "logo_gob.webp");
const PUB = (f) => path.join(ROOT, "public", f);
const APP = (f) => path.join(ROOT, "src", "app", f);

const src = await fs.readFile(SRC);
const meta = await sharp(src).metadata();
console.log(`Fuente: ${meta.width}x${meta.height}  hasAlpha=${meta.hasAlpha}  format=${meta.format}`);

// Cuadrado transparente (sin fondo). ensureAlpha garantiza 4 canales (RGBA), necesario
// para que el favicon.ico decodifique en Next y para conservar el canal alfa del logo.
async function square(size) {
  return await sharp(src)
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// PNGs de salida (todos transparentes)
const outputs = {
  "icon-192.png": await square(192),
  "icon-512.png": await square(512),
  "apple-icon-180.png": await square(180),
  "logo_gob_push.png": await square(256), // regenera el de push (era un webp renombrado)
  "favicon-32.png": await square(32),
};
for (const [name, buf] of Object.entries(outputs)) {
  await fs.writeFile(PUB(name), buf);
  console.log(`  ✓ public/${name}  (${buf.length} b)`);
}

// favicon.ico multi-tamaño (16/32/48), PNG dentro de contenedor ICO (hand-encoded).
const icoSizes = [16, 32, 48];
const icoPngs = [];
for (const s of icoSizes) icoPngs.push(await square(s));
function buildIco(sizes, images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  images.forEach((img, i) => {
    const s = sizes[i];
    const e = i * 16;
    entries.writeUInt8(s >= 256 ? 0 : s, e + 0); // ancho (0 = 256)
    entries.writeUInt8(s >= 256 ? 0 : s, e + 1); // alto
    entries.writeUInt8(0, e + 2); // nº colores (0 = truecolor)
    entries.writeUInt8(0, e + 3); // reservado
    entries.writeUInt16LE(1, e + 4); // planos
    entries.writeUInt16LE(32, e + 6); // bits por pixel
    entries.writeUInt32LE(img.length, e + 8); // tamaño de la imagen
    entries.writeUInt32LE(offset, e + 12); // offset
    offset += img.length;
  });
  return Buffer.concat([header, entries, ...images]);
}
await fs.writeFile(APP("favicon.ico"), buildIco(icoSizes, icoPngs));
console.log("  ✓ src/app/favicon.ico  (16/32/48)");

// Logo embebido en base64 (lo usan los correos vía nodemailer, src/lib/mailer.ts,
// donde no se puede depender de una URL). Se regenera desde el PNG de push nuevo.
const b64 = outputs["logo_gob_push.png"].toString("base64");
const logoAssetTs =
  `// Logo institucional embebido en base64 (PNG). Fuente: public/logo_gob_push.png.\n` +
  `// Se embebe para NO depender de un dominio ni del sistema de archivos al adjuntarlo\n` +
  `// en los correos (nodemailer, cid "logogob"). AUTOGENERADO por scripts/generate-icons.mjs\n` +
  `// — NO editar a mano; re-corre el script cuando cambie el logo.\n` +
  `export const LOGO_GOB_PNG_BASE64 =\n  "${b64}";\n`;
await fs.writeFile(path.join(ROOT, "src", "lib", "logoAsset.ts"), logoAssetTs);
console.log(`  ✓ src/lib/logoAsset.ts  (base64, ${b64.length} chars)`);

console.log("Listo. Recuerda subir ?v=N en layout.tsx y manifest.json.");
