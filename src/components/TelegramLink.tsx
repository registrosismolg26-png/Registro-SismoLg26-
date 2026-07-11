"use client";

// ── Vincular Telegram (en "Editar mi cuenta") ───────────────────────────────
// Flujo sin webhook: el usuario pulsa "Vincular" → se genera un deep-link (y QR) →
// abre el bot y pulsa Start → "Ya pulsé Start" verifica vía getUpdates y guarda el
// chatId. Si el admin no configuró Telegram, se muestra deshabilitado. El componente
// se controla solo (consume /api/telegram/link).

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import QRCode from "qrcode";
import type { ToastType } from "@/types";

interface Props { showToast: (m: string, t: ToastType) => void; }

export default function TelegramLink({ showToast }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await apiFetch("/api/telegram/link");
      const d = await res.json().catch(() => ({}));
      setAvailable(Boolean(d.available));
      setLinked(Boolean(d.linked));
    } catch { setAvailable(false); }
  };
  useEffect(() => { loadStatus(); }, []);

  const startLink = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/telegram/link", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (d.available && d.deepLink) {
        setDeepLink(d.deepLink);
        setQr(await QRCode.toDataURL(d.deepLink, { margin: 1, width: 220 }).catch(() => null));
      } else {
        showToast("Telegram no está disponible.", "warning");
      }
    } catch { showToast("Error al generar el enlace.", "error"); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setVerifying(true);
    try {
      const res = await apiFetch("/api/telegram/link", { method: "PUT" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.linked) {
        setLinked(true); setDeepLink(null); setQr(null);
        showToast("Telegram vinculado. ✅", "success");
      } else if (d.code === "EXPIRED") {
        setDeepLink(null); setQr(null);
        showToast("El enlace expiró. Genera uno nuevo.", "warning");
      } else {
        showToast("Aún no detectamos tu Start. Abre el bot, pulsa Start y reintenta.", "info");
      }
    } catch { showToast("Error al verificar.", "error"); }
    finally { setVerifying(false); }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/telegram/link", { method: "DELETE" });
      setLinked(false);
      showToast("Telegram desvinculado.", "success");
    } catch { showToast("Error al desvincular.", "error"); }
    finally { setBusy(false); }
  };

  if (available === null) return null;
  if (!available) {
    return (
      <div className="tg-link tg-link--off">
        <TgHead linked={false} />
        <p className="tg-link__note">El respaldo por Telegram aún no está configurado por el administrador.</p>
      </div>
    );
  }

  return (
    <div className="tg-link">
      <TgHead linked={linked} />
      {linked ? (
        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={unlink} disabled={busy}>
          {busy ? "…" : "Desvincular"}
        </button>
      ) : deepLink ? (
        <div className="tg-link__steps">
          {qr && <img src={qr} alt="Código QR para vincular Telegram" className="tg-qr" />}
          <ol className="tg-steps">
            <li>Abre el bot: <a href={deepLink} target="_blank" rel="noreferrer" className="tg-open">Abrir en Telegram</a> (o escanea el QR).</li>
            <li>Pulsa <b>Start</b> (Iniciar) en el chat del bot.</li>
            <li>Vuelve aquí y confirma abajo.</li>
          </ol>
          <div className="tg-link__actions">
            <button type="button" className="btn-submit" style={{ width: "auto" }} onClick={verify} disabled={verifying}>
              {verifying ? "Verificando…" : "Ya pulsé Start"}
            </button>
            <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={startLink} disabled={busy}>
              Regenerar enlace
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-submit" style={{ width: "auto" }} onClick={startLink} disabled={busy}>
          {busy ? "Generando…" : "Vincular Telegram"}
        </button>
      )}
    </div>
  );
}

function TgHead({ linked }: { linked: boolean }) {
  return (
    <div className="tg-link__head">
      <span className="tg-link__ico" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.06-1.99 1.93c-.23.23-.42.42-.86.42z"/></svg>
      </span>
      <div>
        <h4 className="tg-link__title">
          Telegram {linked && <span className="tg-badge">Vinculado</span>}
        </h4>
        <p className="tg-link__sub">Recibe tus <b>códigos</b> y <b>avisos</b> por Telegram — llegan aunque el correo falle.</p>
      </div>
    </div>
  );
}
