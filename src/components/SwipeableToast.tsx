"use client";

import { useState, useRef } from "react";
import { ToastIcon } from "./ToastIcon";
import type { ToastType } from "@/types";

interface SwipeableToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
}

export function SwipeableToast({ message, type, onDismiss }: SwipeableToastProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const currentX = e.clientX;
    const diffX = currentX - startXRef.current;
    setOffsetX(diffX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    // Si el deslizamiento supera los 80 píxeles, quitar la notificación
    if (Math.abs(offsetX) > 80) {
      setOffsetX(offsetX > 0 ? 500 : -500);
      setTimeout(onDismiss, 200);
    } else {
      setOffsetX(0);
    }
  };

  const opacity = Math.max(0.2, 1 - Math.abs(offsetX) / 300);

  return (
    <div
      className={`toast toast--${type}`}
      style={{
        transform: `translate3d(calc(-50% + ${offsetX}px), 0, 0)`,
        transition: isDragging ? "none" : "transform 0.2s ease-out, opacity 0.2s ease-out",
        opacity: opacity,
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "grab"
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <ToastIcon type={type} />
      <span className="toast-message" style={{ userSelect: "none" }}>{message}</span>
    </div>
  );
}
