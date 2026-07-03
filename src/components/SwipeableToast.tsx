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
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const diffX = e.clientX - startXRef.current;
    const diffY = e.clientY - startYRef.current;

    // Restringir el movimiento hacia abajo para simular resistencia
    const finalY = diffY > 0 ? Math.min(diffY, 8) : diffY;

    setOffsetX(diffX);
    setOffsetY(finalY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);

    const thresholdX = 80;
    const thresholdUp = -50;

    if (offsetY < thresholdUp) {
      // Deslizar hacia arriba
      setOffsetY(-400);
      setTimeout(onDismiss, 180);
    } else if (offsetX > thresholdX) {
      // Deslizar hacia la derecha
      setOffsetX(500);
      setTimeout(onDismiss, 180);
    } else if (offsetX < -thresholdX) {
      // Deslizar hacia la izquierda
      setOffsetX(-500);
      setTimeout(onDismiss, 180);
    } else {
      // Retornar al centro
      setOffsetX(0);
      setOffsetY(0);
    }
  };

  // Calcular la opacidad basada en la distancia de arrastre (X o Y hacia arriba)
  const dragDistance = Math.max(Math.abs(offsetX), offsetY < 0 ? Math.abs(offsetY) : 0);
  const opacity = Math.max(0.15, 1 - dragDistance / 280);

  return (
    <div
      className={`toast toast--${type}`}
      style={{
        transform: `translate3d(calc(-50% + ${offsetX}px), ${offsetY}px, 0)`,
        transition: isDragging ? "none" : "transform 0.18s ease-out, opacity 0.18s ease-out",
        opacity: opacity,
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none"
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDragStart={(e) => e.preventDefault()}
      draggable={false}
    >
      <ToastIcon type={type} />
      <span className="toast-message">{message}</span>
    </div>
  );
}
