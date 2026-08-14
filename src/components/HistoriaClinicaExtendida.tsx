import React from "react";
import { PosDecimalInput } from "@/components/PosDecimalInput";

// Campos de la Historia Clínica Extendida — fuente ÚNICA (se usan en el wizard y
// para detectar/mostrar en la vista de detalle). Cada `k` = clave en el objeto de
// la consulta (ConsultaMedica.data), `l` = etiqueta visible.
export const HCE_VITALES: { k: string; l: string }[] = [
  { k: "peso", l: "Peso (kg)" }, { k: "talla", l: "Talla (m)" }, { k: "imc", l: "IMC" },
  { k: "tensionArterial", l: "Tensión Arterial (mm Hg)" }, { k: "frecuenciaRespiratoria", l: "Frec. Respiratoria (rpm)" },
  { k: "temperatura", l: "Temperatura (°C)" }, { k: "saturacionOxigeno", l: "Saturación O₂ (%)" },
];
export const HCE_FUNCIONAL: { k: string; l: string }[] = [
  { k: "funGeneral", l: "General" }, { k: "funPiel", l: "Piel" },
  { k: "funCabeza", l: "Cabeza" }, { k: "funOjos", l: "Ojos" },
  { k: "funNariz", l: "Nariz" }, { k: "funOidos", l: "Oídos" },
  { k: "funBoca", l: "Boca" }, { k: "funOsteomuscular", l: "Osteomuscular" },
  { k: "funRespiratorio", l: "Respiratorio" }, { k: "funCardiovascular", l: "Cardiovascular" },
  { k: "funGastrointestinal", l: "Gastrointestinal" }, { k: "funGinecologico", l: "Ginecológico" },
  { k: "funGenitourinario", l: "Genitourinario" }, { k: "funNerviosoMental", l: "Nervioso y Mental" },
];
export const HCE_FISICO: { k: string; l: string }[] = [
  { k: "efGeneral", l: "General" }, { k: "efPiel", l: "Piel" },
  { k: "efCabeza", l: "Cabeza" }, { k: "efCuello", l: "Cuello" },
  { k: "efTorax", l: "Tórax" }, { k: "efCardiovascular", l: "Cardiovascular" },
  { k: "efAbdomen", l: "Abdomen" }, { k: "efGenital", l: "Genital" },
  { k: "efOsteomuscular", l: "Osteomuscular" }, { k: "efNeurologico", l: "Neurológico" },
  { k: "efOjos", l: "Ojos" }, { k: "efOrn", l: "ORL (Oídos, Nariz, Laringe)" },
  { k: "efOtro", l: "Otro" },
];
export const HCE_PLAN: { k: string; l: string }[] = [
  { k: "impresionDiagnostica", l: "Impresión Diagnóstica" },
  { k: "examenesParaclinicos", l: "Exámenes Paraclínicos" },
  { k: "plan", l: "Plan" },
];
// Todas las claves, para detectar si una consulta trae historia extendida.
export const HCE_FIELD_KEYS: string[] = [
  ...HCE_VITALES, ...HCE_FUNCIONAL, ...HCE_FISICO, ...HCE_PLAN,
].map((f) => f.k);
// ¿La consulta tiene AL MENOS un campo de historia extendida con valor?
export const tieneHistoriaExtendida = (data: any): boolean =>
  !!data && HCE_FIELD_KEYS.some((k) => { const v = data[k]; return v != null && String(v).trim() !== ""; });

interface Props {
  formData: any;
  onChange: (field: string, value: any) => void;
  readOnly?: boolean;
  step?: number;
}

export function HistoriaClinicaExtendida({ formData, onChange, readOnly = false, step = 0 }: Props) {
  const tProps = (key: string) => ({
    className: "morb-control",
    value: formData[key] || "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(key, e.target.value),
    readOnly,
  });

  const numProps = (key: string) => ({
    ...tProps(key),
    type: "number",
    step: "0.1",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      onChange(key, v);
      if (key === "peso" || key === "talla") {
        const peso = parseFloat(key === "peso" ? v : (formData.peso || 0));
        const talla = parseFloat(key === "talla" ? v : (formData.talla || 0));
        if (peso > 0 && talla > 0) {
          const imc = peso / (talla * talla);
          onChange("imc", imc.toFixed(1));
        } else {
          onChange("imc", "");
        }
      }
    }
  });

  // Recalcula el IMC = peso / talla². Se llama al cambiar peso o talla (talla usa el
  // POS input, así que no pasa por numProps). Acepta "," o "." como decimal.
  const recomputeImc = (peso: any, talla: any) => {
    const p = parseFloat(String(peso ?? "").replace(",", "."));
    const t = parseFloat(String(talla ?? "").replace(",", "."));
    onChange("imc", p > 0 && t > 0 ? (p / (t * t)).toFixed(1) : "");
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="morb-card__title" style={{ marginTop: "1.5rem" }}>
      <span>{children}</span>
    </div>
  );

  return (
    <div className="pill-form">
      {(step === 0 || step === 2) && (
        <>
          <SectionTitle>Antropometría y Signos Vitales</SectionTitle>
          <div className="detail-grid">
            <div className="morb-field">
              <label className="morb-field__label">Peso (kg)</label>
              <input {...numProps("peso")} placeholder="Ej. 62" />
            </div>
            <div className="morb-field">
              <label className="morb-field__label">Talla (m)</label>
              <PosDecimalInput
                className="morb-control"
                value={formData.talla || ""}
                decimals={2}
                readOnly={readOnly}
                placeholder="0.00"
                ariaLabel="Talla en metros"
                onChange={(v) => { onChange("talla", v); recomputeImc(formData.peso, v); }}
              />
            </div>
            <div className="morb-field">
              <label className="morb-field__label">IMC</label>
              <input {...tProps("imc")} readOnly placeholder="Auto-calculado" />
            </div>
            <div className="morb-field">
              <label className="morb-field__label">Tensión Arterial (mm Hg)</label>
              <input {...tProps("tensionArterial")} placeholder="Ej. 120/80" />
            </div>
            <div className="morb-field">
              <label className="morb-field__label">Frec. Respiratoria (rpm)</label>
              <input {...tProps("frecuenciaRespiratoria")} placeholder="Ej. 16" />
            </div>
            <div className="morb-field">
              <label className="morb-field__label">Temperatura (°C)</label>
              <PosDecimalInput
                className="morb-control"
                value={formData.temperatura || ""}
                decimals={1}
                readOnly={readOnly}
                placeholder="0.0"
                ariaLabel="Temperatura en grados"
                onChange={(v) => onChange("temperatura", v)}
              />
            </div>
            <div className="morb-field">
              <label className="morb-field__label">Saturación O₂ (%)</label>
              <input {...tProps("saturacionOxigeno")} placeholder="Ej. 98" />
            </div>
          </div>
        </>
      )}

      {(step === 0 || step === 3) && (
        <>
          <SectionTitle>Examen Funcional</SectionTitle>
          <div className="detail-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {HCE_FUNCIONAL.map(f => (
              <div key={f.k} className="morb-field">
                <label className="morb-field__label">{f.l}</label>
                <textarea {...tProps(f.k)} rows={2} style={{ resize: "vertical" }} />
              </div>
            ))}
          </div>

          <SectionTitle>Examen Físico Segmentario</SectionTitle>
          <div className="detail-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {HCE_FISICO.map(f => (
              <div key={f.k} className="morb-field">
                <label className="morb-field__label">{f.l}</label>
                <textarea {...tProps(f.k)} rows={2} style={{ resize: "vertical" }} />
              </div>
            ))}
          </div>
        </>
      )}

      {(step === 0 || step === 4) && (
        <>
          <SectionTitle>Impresión Diagnóstica y Plan (Adicional)</SectionTitle>
          <div className="detail-grid">
            <div className="morb-field">
              <label className="morb-field__label">Impresión Diagnóstica</label>
              <textarea {...tProps("impresionDiagnostica")} rows={3} style={{ resize: "vertical" }} />
            </div>
            <div className="morb-field">
              <label className="morb-field__label">Exámenes Paraclínicos</label>
              <textarea {...tProps("examenesParaclinicos")} rows={2} style={{ resize: "vertical" }} />
            </div>
            <div className="morb-field">
              <label className="morb-field__label">Plan</label>
              <textarea {...tProps("plan")} rows={3} style={{ resize: "vertical" }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
