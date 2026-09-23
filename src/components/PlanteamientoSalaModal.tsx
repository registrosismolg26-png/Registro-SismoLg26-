"use client";

import { useState, useEffect, useMemo } from "react";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import StyledSelect from "@/components/StyledSelect";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { TITULO_CASA_OPTIONS, ESTATUS_SALA_OPTIONS } from "@/lib/constants";
import { apiFetch } from "@/lib/apiFetch";
import type { PlanteamientoSalaItem, TituloCasaTipo, PlanteamientoSalaEstatus } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  itemToEdit?: PlanteamientoSalaItem | null;
  defaultRefugio?: string;
  campamentosList: { id: string; nombre: string }[];
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function PlanteamientoSalaModal({
  isOpen,
  onClose,
  onSaved,
  itemToEdit,
  defaultRefugio,
  campamentosList,
  showToast,
}: Props) {
  const modal = useAnimatedModal(isOpen);

  const [refugio, setRefugio] = useState(defaultRefugio || campamentosList[0]?.nombre || "");
  const [cedula, setCedula] = useState("");
  const [nombreApellido, setNombreApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [registroId, setRegistroId] = useState<string | null>(null);

  // 9 Requisitos
  const [planillaCaracterizacion, setPlanillaCaracterizacion] = useState<"SI" | "NO">("NO");
  const [cedulaCatastral, setCedulaCatastral] = useState<"SI" | "NO">("NO");
  const [tituloCasa, setTituloCasa] = useState<TituloCasaTipo>("NINGUNO");
  const [referenciaBancariaVendedor, setReferenciaBancariaVendedor] = useState<"SI" | "NO">("NO");
  const [qrHabitatVivienda, setQrHabitatVivienda] = useState<"SI" | "NO">("NO");
  const [cedulaVendedor, setCedulaVendedor] = useState<"SI" | "NO">("NO");
  const [cedulaComprador, setCedulaComprador] = useState<"SI" | "NO">("NO");
  const [fotosVivienda, setFotosVivienda] = useState<"SI" | "NO">("NO");
  const [cantidadFotos, setCantidadFotos] = useState("0");
  const [vendedorPoseePatria, setVendedorPoseePatria] = useState<"SI" | "NO">("NO");

  // Estatus y Observación
  const [estatus, setEstatus] = useState<PlanteamientoSalaEstatus>("EN PROCESO");
  const [observacion, setObservacion] = useState("");

  const [searchingCedula, setSearchingCedula] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (itemToEdit) {
        setRefugio(itemToEdit.refugio || defaultRefugio || "");
        setCedula(itemToEdit.cedula || "");
        setNombreApellido(itemToEdit.nombreApellido || "");
        setTelefono(itemToEdit.telefono || "");
        setRegistroId(itemToEdit.registroId || null);
        setPlanillaCaracterizacion(itemToEdit.planillaCaracterizacion || "NO");
        setCedulaCatastral(itemToEdit.cedulaCatastral || "NO");
        setTituloCasa(itemToEdit.tituloCasa || "NINGUNO");
        setReferenciaBancariaVendedor(itemToEdit.referenciaBancariaVendedor || "NO");
        setQrHabitatVivienda(itemToEdit.qrHabitatVivienda || "NO");
        setCedulaVendedor(itemToEdit.cedulaVendedor || "NO");
        setCedulaComprador(itemToEdit.cedulaComprador || "NO");
        setFotosVivienda(itemToEdit.fotosVivienda || "NO");
        setCantidadFotos(String(itemToEdit.cantidadFotos || 0));
        setVendedorPoseePatria(itemToEdit.vendedorPoseePatria || "NO");
        setEstatus(itemToEdit.estatus || "EN PROCESO");
        setObservacion(itemToEdit.observacion || "");
      } else {
        setRefugio(defaultRefugio || (campamentosList[0]?.nombre || ""));
        setCedula("");
        setNombreApellido("");
        setTelefono("");
        setRegistroId(null);
        setPlanillaCaracterizacion("NO");
        setCedulaCatastral("NO");
        setTituloCasa("NINGUNO");
        setReferenciaBancariaVendedor("NO");
        setQrHabitatVivienda("NO");
        setCedulaVendedor("NO");
        setCedulaComprador("NO");
        setFotosVivienda("NO");
        setCantidadFotos("0");
        setVendedorPoseePatria("NO");
        setEstatus("EN PROCESO");
        setObservacion("");
      }
      setLookupMessage("");
    }
  }, [isOpen, itemToEdit, defaultRefugio, campamentosList]);

  // Cálculo dinámico de progreso
  const { cumplidos, porcentaje } = useMemo(() => {
    let c = 0;
    if (planillaCaracterizacion === "SI") c++;
    if (cedulaCatastral === "SI") c++;
    if (tituloCasa && tituloCasa !== "NINGUNO") c++;
    if (referenciaBancariaVendedor === "SI") c++;
    if (qrHabitatVivienda === "SI") c++;
    if (cedulaVendedor === "SI") c++;
    if (cedulaComprador === "SI") c++;
    if (fotosVivienda === "SI" || (parseInt(cantidadFotos, 10) > 0)) c++;
    if (vendedorPoseePatria === "SI") c++;
    return {
      cumplidos: c,
      porcentaje: Math.round((c / 9) * 100),
    };
  }, [
    planillaCaracterizacion,
    cedulaCatastral,
    tituloCasa,
    referenciaBancariaVendedor,
    qrHabitatVivienda,
    cedulaVendedor,
    cedulaComprador,
    fotosVivienda,
    cantidadFotos,
    vendedorPoseePatria,
  ]);

  const handleLookup = async (cedToLookup?: string) => {
    const val = (cedToLookup || cedula).replace(/\D/g, "");
    if (val.length < 4) {
      showToast("Ingresa una cédula válida de al menos 4 dígitos.", "warning");
      return;
    }

    setSearchingCedula(true);
    setLookupMessage("");
    try {
      const res = await apiFetch(`/api/planteamiento-sala/lookup?cedula=${encodeURIComponent(val)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.found && data?.persona) {
        setNombreApellido(data.persona.nombreApellido || "");
        if (data.persona.telefono) setTelefono(data.persona.telefono);
        if (data.persona.registroId) setRegistroId(data.persona.registroId);
        if (data.persona.refugio && (!refugio || refugio === "TODOS")) {
          setRefugio(data.persona.refugio);
        }
        setLookupMessage(
          data.source === "censo"
            ? "Persona localizada en el censo del sistema."
            : "Persona encontrada en el padrón electoral."
        );
        showToast("Datos autocompletados desde el sistema.", "success");
      } else {
        setLookupMessage("No se encontró registro automático. Puedes ingresar los datos manualmente.");
      }
    } catch (e) {
      console.error(e);
      setLookupMessage("No se pudo consultar el censo. Ingresa los datos manualmente.");
    } finally {
      setSearchingCedula(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCedula = cedula.replace(/\D/g, "");
    if (!cleanCedula) {
      showToast("La cédula es requerida.", "warning");
      return;
    }
    if (!nombreApellido.trim()) {
      showToast("El nombre y apellido es requerido.", "warning");
      return;
    }
    if (!refugio || refugio === "TODOS") {
      showToast("Selecciona un campamento específico.", "warning");
      return;
    }

    const campObj = campamentosList.find((c) => c.nombre === refugio);
    const refugioId = campObj?.id || null;

    setSaving(true);
    try {
      const res = await apiFetch("/api/planteamiento-sala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refugio,
          refugioId,
          cedula: cleanCedula,
          nombreApellido,
          telefono,
          registroId,
          planillaCaracterizacion,
          cedulaCatastral,
          tituloCasa,
          referenciaBancariaVendedor,
          qrHabitatVivienda,
          cedulaVendedor,
          cedulaComprador,
          fotosVivienda,
          cantidadFotos: parseInt(cantidadFotos || "0", 10) || 0,
          vendedorPoseePatria,
          estatus,
          observacion,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        showToast("Planteamiento guardado exitosamente.", "success");
        onSaved();
        onClose();
      } else {
        showToast(data?.error || "Error al guardar el planteamiento.", "error");
      }
    } catch (e: any) {
      console.error(e);
      showToast("Error de conexión al guardar.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!modal.mounted) return null;

  return (
    <div
      className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content pill-form sala-modal${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="modal-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
              {itemToEdit ? "Editar Planteamiento" : "Cargar Persona en Planteamiento Sala"}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Checklist de requisitos documentales y estatus del expediente por campamento.
            </p>
          </div>
          <button
            type="button"
            className="toolbar-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{ width: "32px", height: "32px", padding: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Tarjeta Visual de Progreso Dinámico */}
        <div
          className="sala-progress-card"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "0.9rem 1.1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              Progreso de Requisitos: <b>{cumplidos} de 9</b>
            </span>
            <span
              style={{
                fontSize: "0.95rem",
                fontWeight: 800,
                color: porcentaje === 100 ? "#059669" : porcentaje >= 50 ? "#2563eb" : "#d97706",
              }}
            >
              {porcentaje}%
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "10px",
              borderRadius: "999px",
              background: "var(--border-color)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${porcentaje}%`,
                height: "100%",
                background:
                  porcentaje === 100
                    ? "linear-gradient(90deg, #10b981, #059669)"
                    : "linear-gradient(90deg, #3b82f6, #2563eb)",
                borderRadius: "999px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* SECCIÓN 1: Identificación y Campamento */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div className="detail-section-title" style={{ marginBottom: "0.75rem" }}>
              Identificación y Campamento
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
              <div className="form-group">
                <label>Campamento</label>
                <StyledSelect
                  value={refugio}
                  onChange={setRefugio}
                  ariaLabel="Campamento"
                  options={campamentosList.map((c) => ({ value: c.nombre, label: c.nombre }))}
                />
              </div>

              <div className="form-group">
                <label>Cédula de la Persona</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    placeholder="Ej. 12345678"
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
                    onBlur={() => {
                      if (cedula.length >= 4 && !nombreApellido) handleLookup();
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => handleLookup()}
                    disabled={searchingCedula}
                    style={{ flexShrink: 0, padding: "0 1rem" }}
                  >
                    {searchingCedula ? "Buscando…" : "Buscar"}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Nombre y Apellido</label>
                <input
                  type="text"
                  placeholder="Nombre completo"
                  value={nombreApellido}
                  onChange={(e) => setNombreApellido(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="form-group">
                <label>Teléfono de Contacto (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej. 04121234567"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
            </div>

            {lookupMessage && (
              <p
                style={{
                  margin: "0.5rem 0 0",
                  fontSize: "0.78rem",
                  color: lookupMessage.includes("localizada") || lookupMessage.includes("encontrada")
                    ? "var(--color-success)"
                    : "var(--text-secondary)",
                }}
              >
                {lookupMessage}
              </p>
            )}
          </div>

          {/* SECCIÓN 2: 9 Requisitos Documentales */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div className="detail-section-title" style={{ marginBottom: "0.75rem" }}>
              Checklist de Requisitos Documentales (9)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {/* 1 */}
              <div className="form-group">
                <label>1. Planilla de caracterización</label>
                <StyledSelect
                  value={planillaCaracterizacion}
                  onChange={(v) => setPlanillaCaracterizacion(v as "SI" | "NO")}
                  ariaLabel="Planilla de caracterización"
                  options={[
                    { value: "SI", label: "Sí posee" },
                    { value: "NO", label: "No posee" },
                  ]}
                />
              </div>

              {/* 2 */}
              <div className="form-group">
                <label>2. Cédula catastral</label>
                <StyledSelect
                  value={cedulaCatastral}
                  onChange={(v) => setCedulaCatastral(v as "SI" | "NO")}
                  ariaLabel="Cédula catastral"
                  options={[
                    { value: "SI", label: "Sí posee" },
                    { value: "NO", label: "No posee" },
                  ]}
                />
              </div>

              {/* 3 */}
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>3. Título de Casa</label>
                <StyledSelect
                  value={tituloCasa}
                  onChange={(v) => setTituloCasa(v as TituloCasaTipo)}
                  ariaLabel="Título de Casa"
                  options={TITULO_CASA_OPTIONS}
                />
              </div>

              {/* 4 */}
              <div className="form-group">
                <label>4. Referencia Bancaria del vendedor</label>
                <StyledSelect
                  value={referenciaBancariaVendedor}
                  onChange={(v) => setReferenciaBancariaVendedor(v as "SI" | "NO")}
                  ariaLabel="Referencia Bancaria del vendedor"
                  options={[
                    { value: "SI", label: "Sí posee" },
                    { value: "NO", label: "No posee" },
                  ]}
                />
              </div>

              {/* 5 */}
              <div className="form-group">
                <label>5. QR de Hábitat y Vivienda</label>
                <StyledSelect
                  value={qrHabitatVivienda}
                  onChange={(v) => setQrHabitatVivienda(v as "SI" | "NO")}
                  ariaLabel="QR de Hábitat y Vivienda"
                  options={[
                    { value: "SI", label: "Sí posee" },
                    { value: "NO", label: "No posee" },
                  ]}
                />
              </div>

              {/* 6 */}
              <div className="form-group">
                <label>6. Cédula de Identidad del vendedor</label>
                <StyledSelect
                  value={cedulaVendedor}
                  onChange={(v) => setCedulaVendedor(v as "SI" | "NO")}
                  ariaLabel="Cédula del vendedor"
                  options={[
                    { value: "SI", label: "Sí posee" },
                    { value: "NO", label: "No posee" },
                  ]}
                />
              </div>

              {/* 7 */}
              <div className="form-group">
                <label>7. Cédula de Identidad del Comprador</label>
                <StyledSelect
                  value={cedulaComprador}
                  onChange={(v) => setCedulaComprador(v as "SI" | "NO")}
                  ariaLabel="Cédula del Comprador"
                  options={[
                    { value: "SI", label: "Sí posee" },
                    { value: "NO", label: "No posee" },
                  ]}
                />
              </div>

              {/* 8 */}
              <div className="form-group">
                <label>8. Fotos impresas de la vivienda</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <div style={{ flex: 1 }}>
                    <StyledSelect
                      value={fotosVivienda}
                      onChange={(v) => setFotosVivienda(v as "SI" | "NO")}
                      ariaLabel="Fotos impresas"
                      options={[
                        { value: "SI", label: "Sí posee" },
                        { value: "NO", label: "No posee" },
                      ]}
                    />
                  </div>
                  {fotosVivienda === "SI" && (
                    <input
                      type="number"
                      min="1"
                      max="99"
                      placeholder="Cant."
                      value={cantidadFotos}
                      onChange={(e) => setCantidadFotos(e.target.value.replace(/\D/g, ""))}
                      style={{ width: "80px", flexShrink: 0 }}
                      title="Cantidad de fotos impresas"
                    />
                  )}
                </div>
              </div>

              {/* 9 */}
              <div className="form-group">
                <label>9. El vendedor Posee Patria</label>
                <StyledSelect
                  value={vendedorPoseePatria}
                  onChange={(v) => setVendedorPoseePatria(v as "SI" | "NO")}
                  ariaLabel="Vendedor posee Patria"
                  options={[
                    { value: "SI", label: "Sí posee" },
                    { value: "NO", label: "No posee" },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Estatus y Observación */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div className="detail-section-title" style={{ marginBottom: "0.75rem" }}>
              Estatus y Observación del Expediente
            </div>

            <div className="form-group" style={{ marginBottom: "0.75rem" }}>
              <label>Estatus del Expediente</label>
              <StyledSelect
                value={estatus}
                onChange={(v) => setEstatus(v as PlanteamientoSalaEstatus)}
                ariaLabel="Estatus"
                options={ESTATUS_SALA_OPTIONS.map((e) => ({ value: e.value, label: e.label }))}
              />
            </div>

            <div className="form-group">
              <label>Observación (detalles, novedades o motivos)</label>
              <AutoGrowTextarea
                placeholder="Indica observaciones sobre los documentos o estatus de esta persona…"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                minRows={3}
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button type="button" className="toolbar-btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              className="toolbar-btn toolbar-btn--primary"
              disabled={saving}
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                fontWeight: 600,
                padding: "0 1.25rem",
              }}
            >
              {saving ? "Guardando…" : itemToEdit ? "Actualizar Planteamiento" : "Guardar Planteamiento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
