import React from "react";

interface Props {
  formData: any;
  onChange: (field: string, value: any) => void;
  readOnly?: boolean;
  step?: number;
}

export function HistoriaClinicaExtendida({ formData, onChange, readOnly = false, step = 0 }: Props) {
  const tProps = (key: string) => ({
    className: "detail-value detail-value--pill",
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

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="detail-section-title" style={{ marginTop: "1.5rem" }}>
      <span>{children}</span>
    </div>
  );

  return (
    <div className="pill-form">
      {(step === 0 || step === 2) && (
        <>
          <SectionTitle>Antropometría y Signos Vitales</SectionTitle>
          <div className="detail-grid">
            <div className="detail-field">
              <label>Peso (kg)</label>
              <input {...numProps("peso")} placeholder="Ej. 62" />
            </div>
            <div className="detail-field">
              <label>Talla (m)</label>
              <input {...numProps("talla")} placeholder="Ej. 1.80" />
            </div>
            <div className="detail-field">
              <label>IMC</label>
              <input {...tProps("imc")} readOnly placeholder="Auto-calculado" />
            </div>
            <div className="detail-field">
              <label>Tensión Arterial</label>
              <input {...tProps("tensionArterial")} placeholder="Ej. 120/80" />
            </div>
            <div className="detail-field">
              <label>Frec. Respiratoria (rpm)</label>
              <input {...tProps("frecuenciaRespiratoria")} placeholder="Ej. 16" />
            </div>
            <div className="detail-field">
              <label>Temperatura (°C)</label>
              <input {...numProps("temperatura")} placeholder="Ej. 37.5" />
            </div>
            <div className="detail-field">
              <label>Saturación O₂ (%)</label>
              <input {...tProps("saturacionOxigeno")} placeholder="Ej. 98" />
            </div>
          </div>
        </>
      )}

      {(step === 0 || step === 3) && (
        <>
          <SectionTitle>Examen Funcional</SectionTitle>
          <div className="detail-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {[
              { k: "funGeneral", l: "General" }, { k: "funPiel", l: "Piel" },
              { k: "funCabeza", l: "Cabeza" }, { k: "funOjos", l: "Ojos" },
              { k: "funNariz", l: "Nariz" }, { k: "funOidos", l: "Oídos" },
              { k: "funBoca", l: "Boca" }, { k: "funOsteomuscular", l: "Osteomuscular" },
              { k: "funRespiratorio", l: "Respiratorio" }, { k: "funCardiovascular", l: "Cardiovascular" },
              { k: "funGastrointestinal", l: "Gastrointestinal" }, { k: "funGinecologico", l: "Ginecológico" },
              { k: "funGenitourinario", l: "Genitourinario" }, { k: "funNerviosoMental", l: "Nervioso y Mental" }
            ].map(f => (
              <div key={f.k} className="detail-field detail-field--full">
                <label>{f.l}</label>
                <textarea {...tProps(f.k)} rows={2} style={{ resize: "vertical" }} />
              </div>
            ))}
          </div>

          <SectionTitle>Examen Físico Segmentario</SectionTitle>
          <div className="detail-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {[
              { k: "efGeneral", l: "General" }, { k: "efPiel", l: "Piel" },
              { k: "efCabeza", l: "Cabeza" }, { k: "efCuello", l: "Cuello" },
              { k: "efTorax", l: "Tórax" }, { k: "efCardiovascular", l: "Cardiovascular" },
              { k: "efAbdomen", l: "Abdomen" }, { k: "efGenital", l: "Genital" },
              { k: "efOsteomuscular", l: "Osteomuscular" }, { k: "efNeurologico", l: "Neurológico" },
              { k: "efOjos", l: "Ojos" }, { k: "efOrn", l: "ORL (Oídos, Nariz, Laringe)" },
              { k: "efOtro", l: "Otro" }
            ].map(f => (
              <div key={f.k} className="detail-field detail-field--full">
                <label>{f.l}</label>
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
            <div className="detail-field detail-field--full">
              <label>Impresión Diagnóstica</label>
              <textarea {...tProps("impresionDiagnostica")} rows={3} style={{ resize: "vertical" }} />
            </div>
            <div className="detail-field detail-field--full">
              <label>Exámenes Paraclínicos</label>
              <textarea {...tProps("examenesParaclinicos")} rows={2} style={{ resize: "vertical" }} />
            </div>
            <div className="detail-field detail-field--full">
              <label>Plan</label>
              <textarea {...tProps("plan")} rows={3} style={{ resize: "vertical" }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
