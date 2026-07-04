"use client";

// ── Selector de HORA (pill) ─────────────────────────────────────────────────
// Dos StyledSelect (hora 00–23 · minutos por paso) que emiten/reciben "HH:MM".
// Mismo alto/pill que el resto de controles. Si el valor entrante tiene un minuto
// fuera del paso (p. ej. 14:37), igual se muestra como opción.

import StyledSelect, { type StyledOption } from "@/components/StyledSelect";

interface Props {
  value: string;                 // "HH:MM" o ""
  onChange: (hhmm: string) => void;
  minuteStep?: number;           // por defecto 5
  disabled?: boolean;
  ariaLabel?: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function TimePicker({ value, onChange, minuteStep = 5, disabled = false, ariaLabel = "Hora" }: Props) {
  const valid = /^\d{1,2}:\d{2}$/.test(value || "");
  const h = valid ? pad2(Number(value.split(":")[0])) : "";
  const m = valid ? pad2(Number(value.split(":")[1])) : "";

  const hours: StyledOption[] = Array.from({ length: 24 }, (_, i) => ({ value: pad2(i), label: pad2(i) }));
  const mins: StyledOption[] = [];
  for (let i = 0; i < 60; i += minuteStep) mins.push({ value: pad2(i), label: pad2(i) });
  if (m && !mins.some((o) => o.value === m)) {
    mins.push({ value: m, label: m });
    mins.sort((a, b) => Number(a.value) - Number(b.value));
  }

  const setH = (hh: string) => onChange(`${hh}:${m || "00"}`);
  const setM = (mm: string) => onChange(`${h || "00"}:${mm}`);

  return (
    <div className="timepicker">
      <StyledSelect value={h} onChange={setH} options={hours} placeholder="HH" ariaLabel={`${ariaLabel} · hora`} disabled={disabled} />
      <span className="timepicker__sep" aria-hidden>:</span>
      <StyledSelect value={m} onChange={setM} options={mins} placeholder="MM" ariaLabel={`${ariaLabel} · minutos`} disabled={disabled} />
    </div>
  );
}
