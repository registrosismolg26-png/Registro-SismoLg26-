"use client";

// Banner "Actualización disponible" reformateado. No se actualiza solo: el usuario
// pulsa "Actualizar" o pospone con "Más tarde" (reaparece a los ~3 min). En móvil,
// además, se puede posponer DESLIZÁNDOLO hacia cualquier lado (izquierda o derecha).

import { useEffect, useRef, useState } from "react";

interface Props {
  onUpdate: () => void;
  onRemindLater: () => void;
}

export default function UpdateBanner({ onUpdate, onRemindLater }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Swipe TÁCTIL horizontal → posponer (izquierda o derecha). Solo se toma como
  // gesto si el movimiento es claramente horizontal, para no romper el tap en los
  // botones ni el scroll vertical.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0, startY = 0, curX = 0, horizontal = false, active = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      curX = 0; horizontal = false; active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!horizontal && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        horizontal = true;
        setDragging(true);
      }
      if (horizontal) {
        e.preventDefault();
        curX = dx;
        setOffsetX(dx);
      }
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      setDragging(false);
      if (Math.abs(curX) > 80) {
        // Deslizado a cualquier lado → posponer (reaparece luego)
        setOffsetX(curX > 0 ? 600 : -600);
        setTimeout(onRemindLater, 200);
      } else {
        setOffsetX(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [onRemindLater]);

  const opacity = Math.max(0.2, 1 - Math.abs(offsetX) / 320);

  return (
    <div
      ref={ref}
      className="update-banner"
      role="status"
      style={{
        transform: `translateX(${offsetX}px)`,
        transition: dragging ? "none" : "transform 0.2s ease, opacity 0.2s ease",
        opacity,
      }}
    >
      <div className="update-banner__head">
        <span className="update-banner__spark" aria-hidden>✨</span>
        <div className="update-banner__copy">
          <span className="update-banner__title">Actualización disponible</span>
          <p className="update-banner__text">
            Hay una nueva versión lista. Actualiza cuando quieras
            <span className="update-banner__hint"> · en móvil, desliza para posponer</span>.
          </p>
        </div>
      </div>
      <div className="update-banner__actions">
        <button type="button" className="update-banner__btn update-banner__btn--ghost" onClick={onRemindLater}>
          Más tarde
        </button>
        <button type="button" className="update-banner__btn update-banner__btn--primary" onClick={onUpdate}>
          Actualizar ahora
        </button>
      </div>
    </div>
  );
}
