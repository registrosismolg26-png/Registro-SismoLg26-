"use client";

// ── Contador "Día N" desde el sismo de La Guaira ────────────────────────────
// Ancla: 24 de junio de 2026, 00:00 hora de Venezuela (UTC-4, sin horario de verano).
// Se fija en UTC para que el conteo sea EL MISMO sin importar la zona horaria del
// dispositivo que lo mira. El 24-jun es el "Día 1" y suma uno en cada medianoche VET.
// Se reprograma solo para la próxima medianoche → se actualiza SIN recargar la página.
// (Fecha fija del evento — no es config; se mantiene en un solo lugar.)

import { useEffect, useState } from "react";

const SISMO_UTC_MS = Date.UTC(2026, 5, 24, 4, 0, 0); // 24-jun-2026 00:00 VET
const DAY_MS = 86_400_000;

function diaDesdeSismo(): number {
  return Math.max(1, Math.floor((Date.now() - SISMO_UTC_MS) / DAY_MS) + 1);
}

export default function SismoDayBadge({ className = "" }: { className?: string }) {
  const [dia, setDia] = useState(diaDesdeSismo);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setDia(diaDesdeSismo());
      const msToMidnight = DAY_MS - ((Date.now() - SISMO_UTC_MS) % DAY_MS) + 1000;
      timer = setTimeout(tick, msToMidnight);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  return (
    <span
      className={`sismo-daybadge ${className}`.trim()}
      title={`Día ${dia} desde el sismo · 24 de junio de 2026`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      Día {dia}
    </span>
  );
}
