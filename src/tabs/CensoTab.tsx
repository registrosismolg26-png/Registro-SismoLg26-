"use client";

// ── Pestaña: Censo / Registro de Afectados (formulario wizard 4 pasos) ───────
// Todo el formulario de censo vive aquí: el asistente por pasos (grupo
// familiar, ubicación, identificación personal y salud), la validación por
// campo/paso, el lookup de cédula en el padrón local y el envío que guarda en
// IndexedDB y dispara la sincronización.
//
// Del context global consume: coords, registros (lookup del jefe de familia),
// showToast, triggerSync, refreshLocalRecords, currentUser. saveLocal y
// buscarCedulaEnCliente se importan directo de @/lib/db.

import { useState, useRef, useReducer } from "react";
import { saveLocal, buscarCedulaEnCliente } from "@/lib/db";
import type { Medicamento, FormData } from "@/types";
import { PARROQUIAS, INITIAL_FORM } from "@/lib/constants";
import { formReducer } from "@/lib/formReducer";
import { useAppContext } from "@/context/AppContext";
import { canRegister } from "@/lib/permissions";

export default function CensoTab() {
  const {
    coords,
    registros,
    showToast,
    triggerSync,
    refreshLocalRecords,
    currentUser,
  } = useAppContext();

  const [step, setStep] = useState<1|2|3|4>(1);

  // Form State — useReducer eliminates stale-closure bugs from useState in callbacks
  const [formData, dispatch] = useReducer(formReducer, INITIAL_FORM);

  // Medicamentos dinámicos (array independiente del reducer de strings)
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const addMedicamento    = () => setMedicamentos(p => [...p, { nombre: "", dosis: "", periodo: "" }]);
  const removeMedicamento = (i: number) => setMedicamentos(p => p.filter((_, idx) => idx !== i));
  const updateMedicamento = (i: number, field: keyof Medicamento, val: string) =>
    setMedicamentos(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  // Client Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Submission guard (distinct from background sync)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cédula local database lookup status
  const [lookupStatus, setLookupStatus] = useState<"idle" | "searching" | "found" | "not-found">("idle");

  // Resultado de buscar al Jefe de Familia por su cédula (solo informativo, NO bloquea el registro).
  const [jefeLookup, setJefeLookup] = useState<{ found: boolean; nombre?: string } | null>(null);
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleDateChange = (dateVal: string) => {
    if (!dateVal) return "";
    const birthDate = new Date(dateVal);
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculatedAge--;
    }
    
    return calculatedAge >= 0 ? calculatedAge.toString() : "0";
  };

  // Validation function for a single field
  const validateField = (name: string, value: string): string => {
    switch (name) {
      case "parroquia":
        return value ? "" : "Seleccione una parroquia";
      case "sector":
        return value.trim() ? "" : "El sector es obligatorio";
      case "comunidad":
        return value.trim() ? "" : "La comunidad es obligatoria";
      case "direccionExacta":
        return value.trim() ? "" : "La dirección exacta es obligatoria";
      case "cedula":
        if (!value) return "La cédula es obligatoria";
        if (value.length < 5) return "La cédula debe tener al menos 5 dígitos";
        return "";
      case "nombreApellido":
        if (!value.trim()) return "El nombre y apellido son obligatorios";
        if (value.trim().split(/\s+/).length < 2) return "Ingrese al menos un nombre y un apellido";
        return "";
      case "fechaNacimiento":
        if (!value) return "La fecha de nacimiento es obligatoria";
        if (value.length < 10) return "Complete el formato DD/MM/AAAA";
        const dateParts = value.split("/");
        if (dateParts.length === 3) {
          const d = parseInt(dateParts[0], 10);
          const m = parseInt(dateParts[1], 10);
          const y = parseInt(dateParts[2], 10);
          const currentYear = new Date().getFullYear();
          if (isNaN(d) || isNaN(m) || isNaN(y) || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > currentYear) {
            return "Fecha inválida (use días 01-31, meses 01-12)";
          }
        }
        return "";
      case "telefonoNum":
        if (!value) return "El número de teléfono es obligatorio";
        if (value.length < 7) return "Debe tener exactamente 7 dígitos";
        return "";
      case "cedulaJefeFamilia":
        if (formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO") {
          if (!value) return "La cédula del jefe de familia es obligatoria";
          if (value.length < 5) return "La cédula debe tener al menos 5 dígitos";
        }
        return "";
      case "patologiaDescripcion":
        if (formData.patologia === "SI" && !value.trim()) {
          return "Describa la patología crónica";
        }
        return "";
      case "motivoIntermitente":
        if (formData.intermitente === "SI" && !value.trim()) {
          return "El motivo es obligatorio para residentes intermitentes";
        }
        return "";
      default:
        return "";
    }
  };

  // Validate all fields
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const requiredKeys = [
      "parroquia",
      "sector",
      "comunidad",
      "direccionExacta",
      "nombreApellido",
      "cedula",
      "fechaNacimiento",
      "telefonoNum"
    ];

    requiredKeys.forEach(key => {
      const val = formData[key as keyof typeof formData] as string;
      const err = validateField(key, val);
      if (err) {
        newErrors[key] = err;
      }
    });

    // Conditional validations
    if (formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO") {
      const err = validateField("cedulaJefeFamilia", formData.cedulaJefeFamilia);
      if (err) newErrors.cedulaJefeFamilia = err;
    }

    if (formData.patologia === "SI") {
      const err = validateField("patologiaDescripcion", formData.patologiaDescripcion);
      if (err) newErrors.patologiaDescripcion = err;
    }

    if (formData.intermitente === "SI") {
      const err = validateField("motivoIntermitente", formData.motivoIntermitente);
      if (err) newErrors.motivoIntermitente = err;
    }

    // Required toggles
    if (!formData.genero) newErrors.genero = "Seleccione el género";
    if (!formData.jefeFamilia) newErrors.jefeFamilia = "Seleccione si es jefe de familia";
    if (!formData.perteneceNucleo) newErrors.perteneceNucleo = "Seleccione una opción";
    if (!formData.estadoFisico) newErrors.estadoFisico = "Seleccione el estado físico";
    if (!formData.patologia) newErrors.patologia = "Seleccione si posee patología";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === "cedula") {
      const cleanCedula = value.replace(/\D/g, "");
      dispatch({ type: "SET", field: "cedula", value: cleanCedula });
      setErrors(prev => ({ ...prev, cedula: validateField("cedula", cleanCedula) }));
      triggerLookup(cleanCedula);
      return;
    }

    if (name === "cedulaJefeFamilia") {
      const cleanVal = value.replace(/\D/g, "");
      dispatch({ type: "SET", field: "cedulaJefeFamilia", value: cleanVal });
      setErrors(prev => ({ ...prev, cedulaJefeFamilia: validateField("cedulaJefeFamilia", cleanVal) }));

      if (cleanVal.length >= 5) {
        // Look up Jefe in local registros cache (which contains all records)
        const jefe = registros.find(r => {
          const rClean = r.cedula.replace(/\D/g, "");
          return rClean === cleanVal;
        });

        if (jefe) {
          setJefeLookup({ found: true, nombre: jefe.nombreApellido });
          dispatch({
            type: "SET_MANY",
            patch: {
              parroquia: jefe.parroquia || "",
              sector: jefe.sector || "",
              comunidad: jefe.comunidad || "",
              direccionExacta: jefe.direccionExacta || ""
            }
          });
          showToast(`Residencia precargada desde el Jefe: ${jefe.nombreApellido}`, "success");
        } else {
          setJefeLookup({ found: false });
        }
      } else {
        setJefeLookup(null);
      }
      return;
    }

    // Formatted Date Input Mask (DD/MM/AAAA)
    if (name === "fechaNacimiento") {
      const rawVal = value.replace(/\D/g, "");
      let formatted = rawVal.slice(0, 2);
      if (rawVal.length > 2) formatted += "/" + rawVal.slice(2, 4);
      if (rawVal.length > 4) formatted += "/" + rawVal.slice(4, 8);

      const edad = rawVal.length === 8
        ? handleDateChange(`${rawVal.slice(4, 8)}-${rawVal.slice(2, 4)}-${rawVal.slice(0, 2)}`)
        : "";
      dispatch({ type: "SET_MANY", patch: { fechaNacimiento: formatted, edad } });
      setErrors(prev => ({ ...prev, fechaNacimiento: validateField("fechaNacimiento", formatted) }));
      return;
    }

    dispatch({ type: "SET", field: name as keyof FormData, value });
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  // Search voter locally in IndexedDB (100% offline)
  const triggerLookup = (cedulaVal: string) => {
    const cleanCedula = cedulaVal.replace(/\D/g, "");
    
    if (lookupTimeoutRef.current) {
      clearTimeout(lookupTimeoutRef.current);
    }

    if (cleanCedula.length < 7) {
      setLookupStatus("idle");
      return;
    }

    setLookupStatus("searching");

    // Debounce by 250ms for instant client-side responsiveness
    lookupTimeoutRef.current = setTimeout(async () => {
      try {
        const citizen = await buscarCedulaEnCliente(cleanCedula);
        
        if (citizen) {
          setLookupStatus("found");
          
          // Map gender from database format
          let mappedGenero = "";
          if (citizen.sexo === "F" || citizen.sexo === "FEMENINO") mappedGenero = "FEMENINO";
          else if (citizen.sexo === "M" || citizen.sexo === "MASCULINO") mappedGenero = "MASCULINO";

          let formattedDate = "";
          if (citizen.fechaNacimiento) {
            const parts = citizen.fechaNacimiento.split("-");
            if (parts.length === 3) {
              formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            } else {
              formattedDate = citizen.fechaNacimiento;
            }
          }

          dispatch({ type: "SET_MANY", patch: {
            nombreApellido: citizen.nombreCompleto,
            genero: mappedGenero,
            fechaNacimiento: formattedDate,
            edad: handleDateChange(citizen.fechaNacimiento),
          } });
          setErrors(prev => ({
            ...prev,
            nombreApellido: "",
            genero: "",
            fechaNacimiento: ""
          }));
          showToast("Identidad verificada en padrón local.", "info");
        } else {
          setLookupStatus("not-found");
        }
      } catch (err) {
        setLookupStatus("not-found");
      }
    }, 250);
  };

  // Per-step validation for the wizard (Swapped: Step 1 is Family Group, Step 2 is Geo, Step 3 is Personal ID, Step 4 is Health)
  const STEP_FIELDS: Record<number, string[]> = {
    1: ["perteneceNucleo", "jefeFamilia"],
    2: ["parroquia", "sector", "comunidad", "direccionExacta"],
    3: ["cedula", "nombreApellido", "genero", "fechaNacimiento", "telefonoNum"],
    4: ["estadoFisico", "patologia"],
  };

  const handleNextStep = () => {
    const fields = STEP_FIELDS[step];
    const newErrors: Record<string, string> = {};
    fields.forEach(field => {
      const err = validateField(field, (formData as any)[field] as string);
      if (err) newErrors[field] = err;
    });
    if (step === 1 && formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO") {
      const err = validateField("cedulaJefeFamilia", formData.cedulaJefeFamilia);
      if (err) newErrors.cedulaJefeFamilia = err;
    }
    if (step === 4 && formData.patologia === "SI") {
      const err = validateField("patologiaDescripcion", formData.patologiaDescripcion);
      if (err) newErrors.patologiaDescripcion = err;
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(prev => ({ ...prev, ...newErrors }));
      return;
    }
    setStep(s => (s + 1) as 1|2|3|4);
  };

  // Submit Handler: Saves to IndexedDB first, then triggers sync
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (!validateForm()) {
      showToast("Faltan campos obligatorios o poseen formato inválido.", "warning");
      setTimeout(() => {
        const firstErrorEl = document.querySelector(".has-error");
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
          if (firstErrorEl instanceof HTMLInputElement || firstErrorEl instanceof HTMLTextAreaElement) {
            firstErrorEl.focus({ preventScroll: true });
          }
        }
      }, 50);
      setIsSubmitting(false);
      return;
    }

    try {
      let rawCedula = formData.cedula.trim();
      if (formData.isChildDependent) {
        rawCedula = `${rawCedula}-${formData.dependentNumber}`;
      }
      const cleanCed = rawCedula.toUpperCase();
      const finalCedula = (cleanCed.startsWith("V-") || cleanCed.startsWith("E-"))
        ? cleanCed
        : `${formData.nacionalidad}-${cleanCed}`;

      const rawJefeCed = (formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO") 
        ? formData.cedulaJefeFamilia.trim().toUpperCase()
        : "";
      const finalJefeCedula = rawJefeCed
        ? ((rawJefeCed.startsWith("V-") || rawJefeCed.startsWith("E-")) ? rawJefeCed : `V-${rawJefeCed}`)
        : undefined;

      const finalTelefono = formData.telefonoNum ? `${formData.telefonoCod}-${formData.telefonoNum}` : null;
      
      let finalFechaNac = new Date();
      const dateParts = formData.fechaNacimiento.split("/");
      if (dateParts.length === 3) {
        const d = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10);
        const y = parseInt(dateParts[2], 10);
        finalFechaNac = new Date(y, m - 1, d);
      }

      const recordId = crypto.randomUUID();
      const registroData = {
        id: recordId,
        refugio: currentUser?.campamentoTransitorio,
        userId: currentUser?.id,
        data: {
          parroquia: formData.parroquia,
          sector: formData.sector,
          comunidad: formData.comunidad,
          direccionExacta: formData.direccionExacta,
          nombreApellido: formData.nombreApellido.toUpperCase().trim(),
          cedula: finalCedula,
          jefeFamilia: formData.jefeFamilia,
          genero: formData.genero,
          fechaNacimiento: finalFechaNac.toISOString(),
          edad: parseInt(formData.edad, 10),
          perteneceNucleo: formData.perteneceNucleo,
          cedulaJefeFamilia: finalJefeCedula,
          estadoFisico: formData.estadoFisico,
          patologia: formData.patologia,
          patologiaDescripcion: formData.patologia === "SI" ? formData.patologiaDescripcion.trim() : undefined,
          gpsLat: coords.lat !== null ? coords.lat : undefined,
          gpsLng: coords.lng !== null ? coords.lng : undefined,
          telefono: finalTelefono !== null ? finalTelefono : undefined,
          medicamentos: medicamentos.filter(m => m.nombre.trim()),
          intermitente: formData.intermitente || "NO",
          motivoIntermitente: formData.intermitente === "SI" ? formData.motivoIntermitente.trim() : undefined,
          refugio: currentUser?.campamentoTransitorio || "Complejo Educativo República de Panamá"
        }
      };

      await saveLocal(registroData);
      showToast("Registro guardado localmente.", "success");

      dispatch({ type: "RESET" });
      setMedicamentos([]);
      setErrors({});
      setLookupStatus("idle");
      setStep(1);

      await refreshLocalRecords();

      if (navigator.onLine) {
        triggerSync();
      }
    } catch (err) {
      showToast("Error al guardar en el dispositivo.", "warning");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guarda de tipos: este tab solo se monta autenticado (activeTab === "censo").
  if (!currentUser) return null;

  return (
    <>
        <div className="tab-enter">
          {canRegister(currentUser.role) ? (
            <form onSubmit={handleSubmit} className="form-card">
              {/* Wizard Progress Bar */}
              <div className="wizard-progress">
                {([1, 2, 3, 4] as const).map((s) => (
                  <div key={s} className="wizard-step-wrapper">
                    <div className={`wizard-step-dot ${step === s ? "active" : step > s ? "done" : ""}`}>
                      {step > s ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : s}
                    </div>
                    {s < 4 && <div className={`wizard-step-line ${step > s ? "done" : ""}`} />}
                  </div>
                ))}
              </div>
              <div className="wizard-step-label">
                {step === 1 && "Paso 1 — Grupo Familiar"}
                {step === 2 && "Paso 2 — Ubicación Geográfica"}
                {step === 3 && "Paso 3 — Identificación Personal"}
                {step === 4 && "Paso 4 — Estado de Salud"}
              </div>

              {/* PASO 1: Grupo Familiar */}
              {step === 1 && (
                <div className="form-section form-step-content">
                  <div className="form-group">
                    <label>¿Pertenece a un núcleo familiar?<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.perteneceNucleo === "SI" ? "selected" : ""} ${errors.perteneceNucleo ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="perteneceNucleo" value="SI" checked={formData.perteneceNucleo === "SI"} onChange={handleInputChange} />
                        SI
                      </label>
                      <label
                        className={`radio-card ${formData.perteneceNucleo === "NO" ? "selected" : ""} ${errors.perteneceNucleo ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="perteneceNucleo" value="NO" checked={formData.perteneceNucleo === "NO"} onChange={handleInputChange} />
                        NO
                      </label>
                    </div>
                    <div className="error-container">
                      {errors.perteneceNucleo && <span className="field-error-message">{errors.perteneceNucleo}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>¿Usted es el Jefe de Familia?<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.jefeFamilia === "SI" ? "selected" : ""} ${errors.jefeFamilia ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="jefeFamilia" value="SI" checked={formData.jefeFamilia === "SI"} onChange={handleInputChange} />
                        SI
                      </label>
                      <label
                        className={`radio-card ${formData.jefeFamilia === "NO" ? "selected" : ""} ${errors.jefeFamilia ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="jefeFamilia" value="NO" checked={formData.jefeFamilia === "NO"} onChange={handleInputChange} />
                        NO
                      </label>
                    </div>
                    <div className="error-container">
                      {errors.jefeFamilia && <span className="field-error-message">{errors.jefeFamilia}</span>}
                    </div>
                  </div>

                  <div className={`conditional-wrapper ${formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO" ? "open" : ""}`}>
                    <div className="conditional-inner">
                      <label htmlFor="cedulaJefeFamilia">Cédula del Jefe de Familia<span className="required-star">*</span></label>
                      <input
                        type="text"
                        name="cedulaJefeFamilia"
                        id="cedulaJefeFamilia"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Cédula del jefe (si ya está en sistema se precargará la residencia)"
                        value={formData.cedulaJefeFamilia}
                        onChange={handleInputChange}
                        className={errors.cedulaJefeFamilia ? "has-error" : ""}
                      />
                      <div className="error-container">
                        {errors.cedulaJefeFamilia && <span className="field-error-message">{errors.cedulaJefeFamilia}</span>}
                      </div>
                      {jefeLookup?.found && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--color-success)", fontSize: "0.75rem", fontWeight: 700, marginTop: "-0.15rem" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          {jefeLookup.nombre}
                        </span>
                      )}
                      {jefeLookup && !jefeLookup.found && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--color-warning)", fontSize: "0.75rem", fontWeight: 700, marginTop: "-0.15rem" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Jefe de Familia no registrado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 2: Ubicación */}
              {step === 2 && (
                <div className="form-section form-step-content">
                  <div className="form-group">
                    <label htmlFor="parroquia">Parroquia donde vive<span className="required-star">*</span></label>
                    <div className="native-select-wrapper">
                      <select
                        id="parroquia"
                        className={`native-select ${errors.parroquia ? "has-error" : ""}`}
                        value={formData.parroquia}
                        onChange={(e) => {
                          dispatch({ type: "SET", field: "parroquia", value: e.target.value });
                          setErrors(prev => ({ ...prev, parroquia: validateField("parroquia", e.target.value) }));
                        }}
                      >
                        <option value="">Seleccione una parroquia...</option>
                        {PARROQUIAS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <svg className="native-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                    <div className="error-container">
                      {errors.parroquia && <span className="field-error-message">{errors.parroquia}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="sector">Sector<span className="required-star">*</span></label>
                    <input
                      type="text"
                      name="sector"
                      id="sector"
                      placeholder="Ej: Barrio Aeropuerto"
                      value={formData.sector}
                      onChange={handleInputChange}
                      className={errors.sector ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {errors.sector && <span className="field-error-message">{errors.sector}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="comunidad">Comunidad<span className="required-star">*</span></label>
                    <input
                      type="text"
                      name="comunidad"
                      id="comunidad"
                      placeholder="Ej: Consejo Comunal Luchadores"
                      value={formData.comunidad}
                      onChange={handleInputChange}
                      className={errors.comunidad ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {errors.comunidad && <span className="field-error-message">{errors.comunidad}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="direccionExacta">Dirección Exacta<span className="required-star">*</span></label>
                    <textarea
                      name="direccionExacta"
                      id="direccionExacta"
                      placeholder="Ej: Calle principal, casa N° 12, frente al abasto..."
                      value={formData.direccionExacta}
                      onChange={handleInputChange}
                      className={errors.direccionExacta ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {errors.direccionExacta && <span className="field-error-message">{errors.direccionExacta}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 3: Identificación Personal */}
              {step === 3 && (
                <div className="form-section form-step-content">
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem", fontWeight: "normal" }}>
                      <input
                        type="checkbox"
                        checked={formData.isChildDependent}
                        onChange={(e) => {
                          dispatch({ type: "SET", field: "isChildDependent", value: e.target.checked });
                          if (e.target.checked && formData.cedulaJefeFamilia) {
                            const numOnly = formData.cedulaJefeFamilia.replace(/^[VE]-/, "");
                            dispatch({ type: "SET", field: "cedula", value: numOnly });
                          }
                        }}
                        style={{ width: "auto", height: "auto" }}
                      />
                      Menor de edad sin cédula (asociar a representante)
                    </label>
                  </div>

                  <div className="form-group">
                    <label htmlFor="cedula">{formData.isChildDependent ? "Cédula del Representante" : "Cédula de Identidad"}<span className="required-star">*</span></label>
                    <div className="field-row-cedula">
                      <div className="nat-toggle">
                        <button
                          type="button"
                          className={`nat-btn ${formData.nacionalidad === "V" ? "active" : ""}`}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => dispatch({ type: "SET", field: "nacionalidad", value: "V" })}
                        >V</button>
                        <button
                          type="button"
                          className={`nat-btn ${formData.nacionalidad === "E" ? "active" : ""}`}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => dispatch({ type: "SET", field: "nacionalidad", value: "E" })}
                        >E</button>
                      </div>
                      <input
                        type="text"
                        name="cedula"
                        id="cedula"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Solo números (ej: 12345678)"
                        value={formData.cedula}
                        onChange={handleInputChange}
                        className={errors.cedula ? "has-error" : ""}
                      />
                    </div>
                    {formData.isChildDependent && (
                      <div className="form-group" style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
                        <label htmlFor="dependentNumber" style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Número correlativo de hijo/dependiente</label>
                        <select
                          id="dependentNumber"
                          value={formData.dependentNumber}
                          onChange={(e) => dispatch({ type: "SET", field: "dependentNumber", value: e.target.value })}
                          style={{ width: "100%", height: "38px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                        >
                          <option value="1">1er Hijo/Representado (-1)</option>
                          <option value="2">2do Hijo/Representado (-2)</option>
                          <option value="3">3er Hijo/Representado (-3)</option>
                          <option value="4">4to Hijo/Representado (-4)</option>
                          <option value="5">5to Hijo/Representado (-5)</option>
                          <option value="6">6to Hijo/Representado (-6)</option>
                        </select>
                      </div>
                    )}
                    <div className="helper-box">
                      <span className={`helper-text ${lookupStatus !== "idle" ? "active" : ""} ${lookupStatus}`}>
                        {lookupStatus === "searching" && "Buscando cédula en padrón local..."}
                        {lookupStatus === "found" && "Ciudadano verificado. Datos autocompletados."}
                        {lookupStatus === "not-found" && "Cédula no registrada localmente. Ingrese manual."}
                      </span>
                    </div>
                    <div className="error-container">
                      {errors.cedula && <span className="field-error-message">{errors.cedula}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="nombreApellido">Nombre y Apellido<span className="required-star">*</span></label>
                    <input
                      type="text"
                      name="nombreApellido"
                      id="nombreApellido"
                      placeholder="Nombre completo"
                      value={formData.nombreApellido}
                      onChange={handleInputChange}
                      className={errors.nombreApellido ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {errors.nombreApellido && <span className="field-error-message">{errors.nombreApellido}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Género<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.genero === "MASCULINO" ? "selected" : ""} ${errors.genero ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input
                          type="radio"
                          name="genero"
                          value="MASCULINO"
                          checked={formData.genero === "MASCULINO"}
                          onChange={(e) => {
                            handleInputChange(e);
                            setTimeout(() => document.getElementById("fechaNacimiento")?.focus(), 50);
                          }}
                        />
                        MASCULINO
                      </label>
                      <label
                        className={`radio-card ${formData.genero === "FEMENINO" ? "selected" : ""} ${errors.genero ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input
                          type="radio"
                          name="genero"
                          value="FEMENINO"
                          checked={formData.genero === "FEMENINO"}
                          onChange={(e) => {
                            handleInputChange(e);
                            setTimeout(() => document.getElementById("fechaNacimiento")?.focus(), 50);
                          }}
                        />
                        FEMENINO
                      </label>
                    </div>
                    <div className="error-container">
                      {errors.genero && <span className="field-error-message">{errors.genero}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="fechaNacimiento">Fecha de Nacimiento (DD/MM/AAAA)<span className="required-star">*</span></label>
                    <input
                      type="text"
                      name="fechaNacimiento"
                      id="fechaNacimiento"
                      inputMode="numeric"
                      placeholder="DD/MM/AAAA (ej: 15/05/1990)"
                      value={formData.fechaNacimiento}
                      onChange={handleInputChange}
                      className={errors.fechaNacimiento ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {errors.fechaNacimiento && <span className="field-error-message">{errors.fechaNacimiento}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="edad">Edad (calculada automáticamente)</label>
                    <input
                      type="number"
                      name="edad"
                      id="edad"
                      placeholder="—"
                      value={formData.edad}
                      onChange={handleInputChange}
                      disabled
                      className="input-disabled"
                    />
                    <div className="error-container"></div>
                  </div>

                  <div className="form-group">
                    <label>Teléfono de Contacto<span className="required-star">*</span></label>
                    <div className="field-row-phone">
                      <div className="native-select-wrapper">
                        <select
                          className="native-select"
                          value={formData.telefonoCod}
                          onChange={(e) => dispatch({ type: "SET", field: "telefonoCod", value: e.target.value })}
                        >
                          {["0424", "0414", "0416", "0426", "0412", "0422", "0212"].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <svg className="native-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                      <input
                        type="text"
                        name="telefonoNum"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="7 dígitos"
                        value={formData.telefonoNum}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 7);
                          dispatch({ type: "SET", field: "telefonoNum", value: val });
                          setErrors(prev => ({ ...prev, telefonoNum: validateField("telefonoNum", val) }));
                        }}
                        className={errors.telefonoNum ? "has-error" : ""}
                      />
                    </div>
                    <div className="error-container">
                      {errors.telefonoNum && <span className="field-error-message">{errors.telefonoNum}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 4: Estado de Salud */}
              {step === 4 && (
                <div className="form-section form-step-content">
                  <div className="form-group">
                    <label>Estado Físico Actual<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.estadoFisico === "ILESO" ? "selected" : ""} ${errors.estadoFisico ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="estadoFisico" value="ILESO" checked={formData.estadoFisico === "ILESO"} onChange={handleInputChange} />
                        ILESO
                      </label>
                      <label
                        className={`radio-card ${formData.estadoFisico === "LESIONADO" ? "selected" : ""} ${errors.estadoFisico ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="estadoFisico" value="LESIONADO" checked={formData.estadoFisico === "LESIONADO"} onChange={handleInputChange} />
                        LESIONADO
                      </label>
                    </div>
                    <div className="error-container">
                      {errors.estadoFisico && <span className="field-error-message">{errors.estadoFisico}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>¿Posee alguna patología crónica?<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.patologia === "SI" ? "selected" : ""} ${errors.patologia ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="patologia" value="SI" checked={formData.patologia === "SI"} onChange={handleInputChange} />
                        SI
                      </label>
                      <label
                        className={`radio-card ${formData.patologia === "NO" ? "selected" : ""} ${errors.patologia ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="patologia" value="NO" checked={formData.patologia === "NO"} onChange={handleInputChange} />
                        NO
                      </label>
                    </div>
                    <div className="error-container">
                      {errors.patologia && <span className="field-error-message">{errors.patologia}</span>}
                    </div>
                  </div>

                  <div className={`conditional-wrapper ${formData.patologia === "SI" ? "open" : ""}`}>
                    <div className="conditional-inner">
                      <label htmlFor="patologiaDescripcion">Describa la patología crónica<span className="required-star">*</span></label>
                      <textarea
                        name="patologiaDescripcion"
                        id="patologiaDescripcion"
                        placeholder="Detalle de patologías (ej: Hipertensión, Diabetes, Asma...)"
                        value={formData.patologiaDescripcion}
                        onChange={handleInputChange}
                        className={errors.patologiaDescripcion ? "has-error" : ""}
                      />
                      <div className="error-container">
                        {errors.patologiaDescripcion && <span className="field-error-message">{errors.patologiaDescripcion}</span>}
                      </div>
                    </div>
                  </div>

                  <div className={`conditional-wrapper ${formData.patologia === "SI" || formData.estadoFisico === "LESIONADO" ? "open" : ""}`}>
                    <div className="conditional-inner">
                      <div className="med-section">
                        <div className="med-section-header">
                          <span className="med-section-title">Medicamentos</span>
                          <button type="button" className="btn-add-med" onClick={addMedicamento}>
                            + Agregar
                          </button>
                        </div>
                        {medicamentos.length === 0 ? (
                          <p className="med-empty">Sin medicamentos registrados. Usa "+ Agregar" para añadir uno.</p>
                        ) : (
                          <>
                            <div className="med-row med-row--header">
                              <span>Nombre</span>
                              <span>Dosis</span>
                              <span>Período</span>
                              <span />
                            </div>
                            {medicamentos.map((m, i) => (
                              <div key={i} className="med-row">
                                <input
                                  className="med-input"
                                  placeholder="ej: Metformina"
                                  value={m.nombre}
                                  onChange={e => updateMedicamento(i, "nombre", e.target.value)}
                                />
                                <input
                                  className="med-input"
                                  placeholder="ej: 500mg"
                                  value={m.dosis}
                                  onChange={e => updateMedicamento(i, "dosis", e.target.value)}
                                />
                                <input
                                  className="med-input"
                                  placeholder="ej: 2 veces/día"
                                  value={m.periodo}
                                  onChange={e => updateMedicamento(i, "periodo", e.target.value)}
                                />
                                <button type="button" className="btn-remove-med" onClick={() => removeMedicamento(i)}>
                                  ×
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Residente Intermitente */}
                  <div className="form-group">
                    <label>¿Es un residente intermitente?<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.intermitente === "NO" ? "selected" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="intermitente" value="NO"
                          checked={formData.intermitente === "NO"}
                          onChange={() => dispatch({ type: "SET_MANY", patch: { intermitente: "NO", motivoIntermitente: "" } })} />
                        NO
                      </label>
                      <label
                        className={`radio-card ${formData.intermitente === "SI" ? "selected" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="intermitente" value="SI"
                          checked={formData.intermitente === "SI"}
                          onChange={() => dispatch({ type: "SET", field: "intermitente", value: "SI" })} />
                        SI
                      </label>
                    </div>
                  </div>

                  <div className={`conditional-wrapper ${formData.intermitente === "SI" ? "open" : ""}`}>
                    <div className="conditional-inner">
                      <label htmlFor="motivoIntermitente">
                        Motivo del intermitente<span className="required-star">*</span>
                      </label>
                      <textarea
                        name="motivoIntermitente"
                        id="motivoIntermitente"
                        placeholder="Ej: Sale a trabajar de lunes a viernes, regresa los fines de semana."
                        value={formData.motivoIntermitente}
                        onChange={handleInputChange}
                        className={errors.motivoIntermitente ? "has-error" : ""}
                      />
                      <div className="error-container">
                        {errors.motivoIntermitente && <span className="field-error-message">{errors.motivoIntermitente}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navegación del asistente */}
              <div className="form-section-submit">
                {step === 2 && (
                  <div className={`gps-status ${coords.lat && coords.lng ? "gps-status--active" : "gps-status--inactive"}`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
                    {coords.lat && coords.lng
                      ? `GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                      : "Adquiriendo señal GPS..."}
                  </div>
                )}
                <div className="wizard-nav">
                  {step > 1 && (
                    <button
                      type="button"
                      className="btn-back"
                      onClick={() => setStep(s => (s - 1) as 1 | 2 | 3 | 4)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      Atrás
                    </button>
                  )}
                  {step < 4 ? (
                    <button
                      type="button"
                      className="btn-submit"
                      onClick={handleNextStep}
                    >
                      Continuar
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="btn-submit"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Guardando..." : "Registrar Familia Afectada"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          ) : (
            <div className="form-card form-card--centered">
              <p style={{ fontWeight: "bold" }}>Acceso no permitido.</p>
            </div>
          )}
        </div>
    </>
  );
}
