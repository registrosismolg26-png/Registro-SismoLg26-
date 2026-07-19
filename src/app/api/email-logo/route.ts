import { LOGO_GOB_PNG_BASE64 } from "@/lib/logoAsset";

// Sirve el logo institucional como PNG PÚBLICO para embeberlo en los correos enviados por
// Resend (que no soporta imágenes inline `cid:` como nodemailer/Gmail). Reusa el base64 de
// logoAsset.ts → no depende de un archivo en el filesystem ni de un CDN externo.
export async function GET() {
  const b64 = LOGO_GOB_PNG_BASE64.replace(/^data:image\/\w+;base64,/, "");
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
