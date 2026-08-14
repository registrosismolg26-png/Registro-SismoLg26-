import React from "react";

// Barra de pasos del wizard de consulta médica (compartida por Morbilidad —crear/
// editar/ver— e Historia Clínica —ver—). Paso 1 = Básicos/Diagnóstico; 2 = Signos
// Vitales; 3 = Examen Médico; 4 = Paraclínicos/Plan. Fuente ÚNICA para que todos
// los modales naveguen igual.
const WIZARD_STEPS = [
  { i: 1, l: "1. Básicos y Diag" },
  { i: 2, l: "2. Signos Vitales" },
  { i: 3, l: "3. Examen Médico" },
  { i: 4, l: "4. Paraclínicos / Plan" },
];

export function WizardNav({ step, setStep }: { step: number; setStep: (s: number) => void }) {
  return (
    <div className="btn-seg-group" style={{ marginBottom: "1.5rem", display: "flex", width: "100%", overflowX: "auto" }}>
      {WIZARD_STEPS.map((s) => (
        <button
          key={s.i}
          type="button"
          className={`toolbar-btn ${step === s.i ? "is-active" : ""}`}
          onClick={() => setStep(s.i)}
          style={{ flex: 1, whiteSpace: "nowrap", padding: "0.6rem 1rem", minWidth: "120px" }}
        >
          {s.l}
        </button>
      ))}
    </div>
  );
}
