"use client";

import { useState } from "react";
import StyledSelect from "@/components/StyledSelect";
import { apiFetch } from "@/lib/apiFetch";
import { exportComedorEntregasExcel } from "@/lib/exportComedorEntregasExcel";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  refugioActual: string;
  refugiosList: Array<{ id: string; nombre: string }>;
  fechaActual: string;
  currentUser: any;
  showToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
}

export default function ComedorExportEntregasModal({
  isOpen,
  onClose,
  refugioActual,
  refugiosList,
  fechaActual,
  currentUser,
  showToast,
}: Props) {
  const [modo, setModo] = useState<"DIA" | "RANGO">("DIA");
  const [fecha, setFecha] = useState(fechaActual || new Date().toISOString().split("T")[0]);
  const [desde, setDesde] = useState(fechaActual || new Date().toISOString().split("T")[0]);
  const [hasta, setHasta] = useState(fechaActual || new Date().toISOString().split("T")[0]);
  const [servicio, setServicio] = useState<string>("TODOS");
  const [refugio, setRefugio] = useState<string>(refugioActual || "TODOS");
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const qRef = refugio && refugio !== "TODOS" ? `&refugio=${encodeURIComponent(refugio)}` : "";
      const qServ = servicio && servicio !== "TODOS" ? `&servicio=${encodeURIComponent(servicio)}` : "";
      
      let qFechas = "";
      if (modo === "DIA") {
        if (!fecha) {
          showToast("Seleccione una fecha válida.", "warning");
          setDownloading(false);
          return;
        }
        qFechas = `&fecha=${encodeURIComponent(fecha)}`;
      } else {
        if (!desde || !hasta) {
          showToast("Seleccione el rango de fechas completo.", "warning");
          setDownloading(false);
          return;
        }
        qFechas = `&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
      }

      const res = await apiFetch(`/api/comedor?type=entregas${qRef}${qFechas}${qServ}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo obtener el listado de entregas.");
      }

      const entregas = data.entregas || [];
      if (entregas.length === 0) {
        showToast(
          modo === "DIA"
            ? `No hay registros de retiros para la fecha ${fecha}.`
            : `No hay registros de retiros para el rango ${desde} al ${hasta}.`,
          "warning"
        );
        setDownloading(false);
        return;
      }

      await exportComedorEntregasExcel({
        entregas,
        fecha: modo === "DIA" ? fecha : undefined,
        desde: modo === "RANGO" ? desde : undefined,
        hasta: modo === "RANGO" ? hasta : undefined,
        refugio: refugio === "TODOS" ? "TODOS LOS CAMPAMENTOS" : refugio,
        servicioFiltro: servicio,
        generadoPor: (currentUser?.nombre || currentUser?.email || "Operador").trim(),
      });

      showToast(`Excel descargado con éxito: ${entregas.length} retiros procesados.`, "success");
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Error al generar el archivo Excel.", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "1rem",
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #ffffff)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.5rem",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "1px solid var(--border-color)",
            paddingBottom: "0.75rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.4rem" }}>📊</span>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Descargar Retiros de Comida en Excel
              </h3>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Reporte detallado de personas (jefes y personas solas) que retiraron Desayunos, Almuerzos y Cenas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "1.3rem",
              color: "var(--text-secondary)",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Selector de Modo: Día específico vs Rango de fechas */}
        <div>
          <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}>
            Modalidad de Descarga:
          </label>
          <div className="btn-seg-group" style={{ display: "flex", width: "100%" }}>
            <button
              type="button"
              className={`toolbar-btn ${modo === "DIA" ? "toolbar-btn--primary" : ""}`}
              onClick={() => setModo("DIA")}
              style={{ flex: 1, padding: "0.45rem", fontSize: "0.85rem", fontWeight: 700 }}
            >
              📅 Día Específico
            </button>
            <button
              type="button"
              className={`toolbar-btn ${modo === "RANGO" ? "toolbar-btn--primary" : ""}`}
              onClick={() => setModo("RANGO")}
              style={{ flex: 1, padding: "0.45rem", fontSize: "0.85rem", fontWeight: 700 }}
            >
              🗓️ Rango de Fechas
            </button>
          </div>
        </div>

        {/* Fechas según el modo */}
        {modo === "DIA" ? (
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
              Fecha a Descargar:
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                fontSize: "0.9rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--input-bg, var(--bg-secondary))",
                color: "var(--text-primary)",
              }}
            />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                Desde:
              </label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.88rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--input-bg, var(--bg-secondary))",
                  color: "var(--text-primary)",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                Hasta:
              </label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.88rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--input-bg, var(--bg-secondary))",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
        )}

        {/* Campamento / Refugio */}
        <div>
          <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
            Campamento / Refugio:
          </label>
          <StyledSelect
            value={refugio}
            onChange={setRefugio}
            ariaLabel="Seleccionar campamento para la descarga"
            options={[
              { value: "TODOS", label: "🏢 Todos los Campamentos" },
              ...(refugiosList || []).map((r) => ({ value: r.nombre, label: r.nombre })),
            ]}
          />
        </div>

        {/* Servicio */}
        <div>
          <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
            Servicio de Comida:
          </label>
          <StyledSelect
            value={servicio}
            onChange={setServicio}
            ariaLabel="Filtrar por servicio de comida"
            options={[
              { value: "TODOS", label: "☀️🍽️🌙 Todos (Desayuno, Almuerzo y Cena)" },
              { value: "DESAYUNO", label: "☀️ Solo Desayunos" },
              { value: "ALMUERZO", label: "🍽️ Solo Almuerzos" },
              { value: "CENA", label: "🌙 Solo Cenas" },
            ]}
          />
        </div>

        {/* Caja informativa de contenido del Excel */}
        <div
          style={{
            background: "rgba(37, 99, 235, 0.06)",
            border: "1px solid rgba(37, 99, 235, 0.2)",
            borderRadius: "10px",
            padding: "0.75rem 0.9rem",
            fontSize: "0.78rem",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: "#1d4ed8", marginBottom: "3px" }}>
            📋 Contenido del archivo Excel que se descargará:
          </div>
          <ul style={{ margin: "0 0 0 1rem", padding: 0 }}>
            <li><strong>Matriz por Jefe:</strong> Lista consolidada con cédula, nombre, teléfonos y columnas de Desayuno, Almuerzo y Cena en una sola fila.</li>
            <li><strong>Detalle Cronológico:</strong> Todos los retiros individuales con hora exacta y operador.</li>
            <li><strong>Hojas Independientes:</strong> Pestañas separadas para Desayunos, Almuerzos y Cenas con totales de raciones.</li>
          </ul>
        </div>

        {/* Botones de acción */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
          <button
            type="button"
            className="toolbar-btn"
            onClick={onClose}
            disabled={downloading}
            style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-submit"
            onClick={handleDownload}
            disabled={downloading}
            style={{
              padding: "0.55rem 1.25rem",
              fontSize: "0.88rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "#059669",
              borderColor: "#047857",
            }}
          >
            {downloading ? (
              <>
                <span className="spinner spinner-sm" />
                <span>Generando Excel...</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>Descargar Archivo Excel</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
