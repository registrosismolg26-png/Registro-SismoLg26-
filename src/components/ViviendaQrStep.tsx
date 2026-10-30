"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { ETIQUETAS_COMISION } from "@/lib/constants";
import PlanteamientoSalaQrScannerModal from "@/components/PlanteamientoSalaQrScannerModal";

// Paso 5 del censo ITINERANTE/MIXTO: QR habitable + QR de colapso + Visita de la Comisión
// Presidencial, todo OPCIONAL y vinculado al JEFE de familia. El escaneo decodifica en el
// dispositivo (funciona sin señal); el CONTENIDO se lee con red y, si no hay, el servidor lo
// completa al sincronizar el registro.

export type ViviendaDraft = {
  habitableUrl: string;
  habitableData: unknown | null;
  colapsoUrl: string;
  colapsoData: unknown | null;
  comisionEtiqueta: string;
};

export const EMPTY_VIVIENDA: ViviendaDraft = {
  habitableUrl: "", habitableData: null, colapsoUrl: "", colapsoData: null, comisionEtiqueta: "",
};

export const viviendaVacia = (v: ViviendaDraft) => !v.habitableUrl && !v.colapsoUrl && !v.comisionEtiqueta;

type Kind = "habitable" | "colapso";
type ToastType = "success" | "error" | "info" | "warning";

interface Props {
  value: ViviendaDraft;
  onChange: (patch: Partial<ViviendaDraft>) => void;
  showToast: (message: string, type: ToastType) => void;
  jefeNombre: string;
  jefeMeta: string;
  /** Edición en Registrados: sin tarjeta del jefe ni texto de ayuda del asistente. */
  compact?: boolean;
}

const META: Record<Kind, { titulo: string; modal: string; url: keyof ViviendaDraft; data: keyof ViviendaDraft }> = {
  habitable: { titulo: "QR Habitable (censo de vivienda)", modal: "Escanear QR Habitable", url: "habitableUrl", data: "habitableData" },
  colapso: { titulo: "QR de Colapso", modal: "Escanear QR de Colapso", url: "colapsoUrl", data: "colapsoData" },
};

// Resumen corto del contenido leído (solo para mostrar; se guarda el contenido completo).
// habitable.gob.ve devuelve dos formas: `tipo:"censo"` (familia censada: vivienda + personas)
// y `tipo:"inspeccion"` (edificación evaluada: etiqueta, demolición, niveles).
function resumen(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : "");
  const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
  if (d.tipo === "inspeccion") {
    const ed = obj(d.edificacion);
    return [
      str(ed.nombre),
      d.etiqueta ? `Etiqueta ${str(d.etiqueta)}` : "",
      str(d.estatus_demolicion).replace(/_/g, " "),
    ].filter(Boolean).join(" · ");
  }
  if (d.tipo === "censo") {
    const ub = obj(d.ubicacion);
    const apto = [str(ub.piso) && `Piso ${str(ub.piso)}`, str(ub.apartamento) && `Apto ${str(ub.apartamento)}`].filter(Boolean).join(" ");
    return [
      str(ub.nombre_edificacion),
      apto,
      typeof d.cantidad_personas === "number" ? `${d.cantidad_personas} persona${d.cantidad_personas === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" · ");
  }
  return str(d.texto) ? str(d.texto).slice(0, 140) : "Contenido leído y guardado";
}

export default function ViviendaQrStep({ value, onChange, showToast, jefeNombre, jefeMeta, compact = false }: Props) {
  const [scanning, setScanning] = useState<Kind | null>(null);
  const [reading, setReading] = useState<Kind | null>(null);

  const handleDecoded = async (kind: Kind, qrText: string) => {
    const m = META[kind];
    // El texto del QR se guarda SIEMPRE, aun sin señal; el contenido es best-effort.
    onChange({ [m.url]: qrText, [m.data]: null } as Partial<ViviendaDraft>);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showToast("QR guardado. Sin conexión: su contenido se leerá al sincronizar.", "info");
      return;
    }
    setReading(kind);
    try {
      const res = await apiFetch("/api/vivienda-qr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, qr: qrText }),
        timeoutMs: 12000,
      });
      const json = await res.json().catch(() => ({}));
      const tipo = (json?.data as { tipo?: string } | null)?.tipo;
      const esperado = kind === "habitable" ? "censo" : "inspeccion";
      if (res.ok && json?.data && tipo && tipo !== esperado) {
        onChange({ [m.url]: "", [m.data]: null } as Partial<ViviendaDraft>);
        showToast(
          kind === "habitable"
            ? "Ese QR es de COLAPSO (inspección de la edificación). Escanéalo en «QR de Colapso»."
            : "Ese QR es del CENSO de la familia. Escanéalo en «QR Habitable».",
          "warning",
        );
        return;
      }
      if (res.ok && json?.data) {
        onChange({ [m.data]: json.data } as Partial<ViviendaDraft>);
        showToast(`${m.titulo}: contenido leído.`, "success");
      } else {
        showToast(json?.reason || "QR guardado; no se pudo leer su contenido (se reintentará al sincronizar).", "info");
      }
    } catch {
      showToast("QR guardado; no se pudo leer su contenido (se reintentará al sincronizar).", "info");
    } finally {
      setReading(null);
    }
  };

  const card = (kind: Kind) => {
    const m = META[kind];
    const url = value[m.url] as string;
    const data = value[m.data];
    return (
      <div className={`vqr-card${url ? " vqr-card--ok" : ""}`}>
        <div className="vqr-card__head">
          <span className="vqr-card__title">{m.titulo}</span>
          {url && <span className="vqr-card__badge">{data ? "Escaneado · contenido guardado" : "Escaneado"}</span>}
        </div>
        {url ? (
          <>
            <div className="vqr-card__url" title={url}>{url}</div>
            <div className="vqr-card__sum">
              {reading === kind ? "Leyendo contenido…" : data ? resumen(data) : "Contenido pendiente: se completará al sincronizar."}
            </div>
          </>
        ) : (
          <div className="vqr-card__sum">Opcional. Escanea el QR con la cámara, súbelo como imagen o pega su enlace.</div>
        )}
        <div className="vqr-card__actions">
          <button type="button" className="btn-secondary" onClick={() => setScanning(kind)} disabled={reading === kind}>
            {url ? "Volver a escanear" : "Escanear QR"}
          </button>
          {url && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onChange({ [m.url]: "", [m.data]: null } as Partial<ViviendaDraft>)}
            >
              Quitar
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pill-form">
      {!compact && (
        <>
        <div className="intg-jefe-card">
          <span className="intg-jefe-card__icon" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <span className="intg-jefe-card__info">
            <span className="intg-jefe-card__name">{jefeNombre?.trim() || "Jefe de familia"}</span>
            <span className="intg-jefe-card__meta">{jefeMeta || "Jefe de familia"}</span>
          </span>
        </div>
        <p className="intg-help">
          Todo es <strong>opcional</strong> y queda <strong>vinculado al jefe de familia</strong>. Se guarda el QR y su contenido.
        </p>
        </>
      )}

      <div className="vqr-grid">
        {card("habitable")}
        {card("colapso")}
      </div>

      <div className="vqr-comision">
        <div className="vqr-comision__title">Visita de la Comisión Presidencial <span className="vqr-opt">(opcional)</span></div>
        <div className="vqr-chips" role="group" aria-label="Etiqueta de la Comisión Presidencial">
          {ETIQUETAS_COMISION.map((e) => {
            const on = value.comisionEtiqueta === e.value;
            return (
              <button
                key={e.value}
                type="button"
                className={`pill-check${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => onChange({ comisionEtiqueta: on ? "" : e.value })}
              >
                <span className="vqr-dot" style={{ background: e.color }} aria-hidden />
                {e.label}
              </button>
            );
          })}
        </div>
      </div>

      {scanning && (
        <PlanteamientoSalaQrScannerModal
          isOpen
          title={META[scanning].modal}
          onClose={() => setScanning(null)}
          onSuccess={() => {}}
          onDecoded={(text) => { const k = scanning; if (k) void handleDecoded(k, text); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
