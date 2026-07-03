"use client";

import { useState, useRef, useEffect } from "react";
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
  const toastRef = useRef<HTMLDivElement | null>(null);

  // --- GESTOS EN MÓVIL (Táctil): Control manual con preventDefault no pasivo ---
  useEffect(() => {
    const el = toastRef.current;
    if (!el) return;

    let startTouchX = 0;
    let startTouchY = 0;
    let currentOffsetX = 0;
    let currentOffsetY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startTouchX = e.touches[0].clientX;
      startTouchY = e.touches[0].clientY;
      setIsDragging(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Prevenir el scroll nativo y el rebote en móvil
      e.preventDefault();

      const diffX = e.touches[0].clientX - startTouchX;
      const diffY = e.touches[0].clientY - startTouchY;

      // Restricción elástica hacia abajo
      const finalY = diffY > 0 ? Math.min(diffY, 8) : diffY;

      currentOffsetX = diffX;
      currentOffsetY = finalY;

      setOffsetX(diffX);
      setOffsetY(finalY);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);

      const thresholdX = 80;
      const thresholdUp = -50;

      if (currentOffsetY < thresholdUp) {
        // Deslizar hacia arriba
        setOffsetY(-400);
        setTimeout(onDismiss, 180);
      } else if (currentOffsetX > thresholdX) {
        // Deslizar hacia la derecha
        setOffsetX(500);
        setTimeout(onDismiss, 180);
      } else if (currentOffsetX < -thresholdX) {
        // Deslizar hacia la izquierda
        setOffsetX(-500);
        setTimeout(onDismiss, 180);
      } else {
        // Retornar al centro
        setOffsetX(0);
        setOffsetY(0);
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [onDismiss]);

  // --- GESTOS EN PC (Ratón): Arrastre mediante eventos de ventana ---
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Solo clic izquierdo
    setIsDragging(true);
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diffX = moveEvent.clientX - startXRef.current;
      const diffY = moveEvent.clientY - startYRef.current;

      // Restricción elástica hacia abajo
      const finalY = diffY > 0 ? Math.min(diffY, 8) : diffY;

      setOffsetX(diffX);
      setOffsetY(finalY);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const diffX = upEvent.clientX - startXRef.current;
      const diffY = upEvent.clientY - startYRef.current;
      const finalY = diffY > 0 ? Math.min(diffY, 8) : diffY;

      const thresholdX = 80;
      const thresholdUp = -50;

      if (finalY < thresholdUp) {
        setOffsetY(-400);
        setTimeout(onDismiss, 180);
      } else if (diffX > thresholdX) {
        setOffsetX(500);
        setTimeout(onDismiss, 180);
      } else if (diffX < -thresholdX) {
        setOffsetX(-500);
        setTimeout(onDismiss, 180);
      } else {
        setOffsetX(0);
        setOffsetY(0);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Calcular opacidad en base a la distancia recorrida
  const dragDistance = Math.max(Math.abs(offsetX), offsetY < 0 ? Math.abs(offsetY) : 0);
  const opacity = Math.max(0.15, 1 - dragDistance / 280);

  return (
    <div
      ref={toastRef}
      className={`toast toast--${type}`}
      style={{
        transform: `translate3d(calc(-50% + ${offsetX}px), ${offsetY}px, 0)`,
        transition: isDragging ? "none" : "transform 0.18s ease-out, opacity 0.18s ease-out",
        opacity: opacity,
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none"
      }}
      onMouseDown={handleMouseDown}
      onDragStart={(e) => e.preventDefault()}
      draggable={false}
    >
      <ToastIcon type={type} />
      <span className="toast-message">{message}</span>
    </div>
  );
}
