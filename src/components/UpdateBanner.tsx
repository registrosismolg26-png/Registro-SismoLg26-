"use client";

// Banner "Actualización disponible". No se actualiza solo: el usuario pulsa
// "Actualizar" o pospone con "Más tarde" (reaparece a los ~3 min). También se
// pospone ARRASTRÁNDOLO a cualquier lado — arrastre EN VIVO (transform imperativo
// vía useSwipeDismiss, sigue al dedo/ratón sin lag). `ignoreSelector:"button"`
// evita que agarrar un botón inicie el arrastre (los taps siguen funcionando).

import { useSwipeDismiss } from "@/lib/useSwipeDismiss";

interface Props {
  onUpdate: () => void;
  onRemindLater: () => void;
}

export default function UpdateBanner({ onUpdate, onRemindLater }: Props) {
  const swipe = useSwipeDismiss<HTMLDivElement>({
    onLeft: onRemindLater,
    onRight: onRemindLater,
    fade: true,
    ignoreSelector: "button",
  });

  return (
    <div ref={swipe.ref} className="update-banner" role="status" {...swipe.handlers}>
      <div className="update-banner__head">
        <span className="update-banner__spark" aria-hidden>✨</span>
        <div className="update-banner__copy">
          <span className="update-banner__title">Actualización disponible</span>
          <p className="update-banner__text">
            Hay una nueva versión lista. Actualiza cuando quieras
            <span className="update-banner__hint"> · arrástralo a un lado para posponer</span>.
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
