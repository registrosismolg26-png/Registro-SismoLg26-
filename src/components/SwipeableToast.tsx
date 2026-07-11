"use client";

// Toast deslizable: se agarra y se mueve EN VIVO con el dedo/ratón (transform
// imperativo vía useSwipeDismiss, sin re-render). Fling a cualquier lado (izq o
// der) → se descarta. El toast está centrado con translateX(-50%), que se conserva
// como base del transform para que no salte al arrastrar.

import { useSwipeDismiss } from "@/lib/useSwipeDismiss";
import { ToastIcon } from "./ToastIcon";
import type { ToastType } from "@/types";

interface SwipeableToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
}

export function SwipeableToast({ message, type, onDismiss }: SwipeableToastProps) {
  const swipe = useSwipeDismiss<HTMLDivElement>({
    onLeft: onDismiss,
    onRight: onDismiss,
    baseTransform: "translateX(-50%)",
    fade: true,
  });

  return (
    <div
      ref={swipe.ref}
      className={`toast toast--${type}`}
      {...swipe.handlers}
      style={{ ...swipe.handlers.style, cursor: "grab", userSelect: "none" }}
    >
      <ToastIcon type={type} />
      <span className="toast-message">{message}</span>
    </div>
  );
}
