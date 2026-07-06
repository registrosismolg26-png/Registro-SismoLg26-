"use client";

// ── Pestaña: Censo / Registro de Afectados (formulario wizard 4 pasos) ───────
// Todo el formulario de censo vive aquí: el asistente por pasos (grupo
// familiar, ubicación, identificación personal y salud), la validación por
// campo/paso, el lookup de cédula en el padrón local y el envío que guarda en
// IndexedDB y dispara la sincronización.
//
// Controles: todos los selects/fechas usan los componentes con reformat
// (StyledSelect, SearchableSelect, DatePicker) — ya no hay <select>/inputs de
// fecha nativos. La validación se muestra por campo SOLO cuando el campo fue
// tocado o se intentó avanzar/enviar (gating por `touched`) para no marcar
// errores en secciones a las que apenas se llega. El duplicado de cédula se
// evalúa EN VIVO al escribir (encadenado con el padrón y la precarga del jefe).
//
// Del context global consume: coords, registros (lookup del jefe de familia),
// showToast, triggerSync, refreshLocalRecords, currentUser. saveLocal y
// buscarCedulaEnCliente se importan directo de @/lib/db.

import { useState, useRef, useReducer, useMemo, useEffect } from "react";
import { saveLocal, buscarCedulaEnCliente } from "@/lib/db";
import { fetchCedulaExterna } from "@/lib/cedulaApi";
import type { Medicamento, FormData } from "@/types";
import { PARROQUIAS, INITIAL_FORM, PERIODO_OPTIONS } from "@/lib/constants";
import { formReducer } from "@/lib/formReducer";
import { useAppContext } from "@/context/AppContext";
import { canRegister, hasRefugio } from "@/lib/permissions";
import { roomFillLevel, patologiaNombre, medLabel } from "@/lib/helpers";
import SearchableSelect from "@/components/SearchableSelect";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import StyledSelect from "@/components/StyledSelect";
import DatePicker from "@/components/DatePicker";

const TELEFONO_CODIGOS = ["0424", "0414", "0416", "0426", "0412", "0422", "0212"];

export default function CensoTab() {
  const {
    coords,
    registros,
    showToast,
    triggerSync,
    refreshLocalRecords,
    currentUser,
    allCuartos,
    roomCapacities,
    fetchRegistros,
    effectiveRefugio,
    localRecords,
    patologias,
    predefinedMedicamentos
  } = useAppContext();

  const [step, setStep] = useState<1|2|3|4>(1);

  // Patologías por-ID: se guarda un array de ids del catálogo.
  const addPatologia = (id: string) => {
    if (!id) return;
    const current = Array.isArray(formData.patologiaIds) ? formData.patologiaIds : [];
    if (current.includes(id)) return;
    dispatch({ type: "SET", field: "patologiaIds", value: [...current, id] });
    setErrors(prev => ({ ...prev, patologiaIds: "" }));
  };
  const removePatologia = (id: string) => {
    const current = Array.isArray(formData.patologiaIds) ? formData.patologiaIds : [];
    dispatch({ type: "SET", field: "patologiaIds", value: current.filter((x: string) => x !== id) });
  };

  // Medicamentos por-ID: solo desde el catálogo (id + posología editable).
  const handleSelectPredefinedMed = (medId: string) => {
    if (!medId) return;
    const match = predefinedMedicamentos.find(m => m.id === medId);
    if (match && !medicamentos.some(x => x.id === medId)) {
      // Nombre y dosis salen del catálogo por ID (solo lectura); dosis = concentración.
      setMedicamentos(prev => [...prev, { id: match.id, dosis: match.concentracion || "", periodo: "" }]);
    }
  };

  // Asignación de habitación en el censo (OPCIONAL). Reusa la ocupación por
  // cuarto (como en Asignaciones) para el semáforo del select.
  const [asignCuartoCenso, setAsignCuartoCenso] = useState("");
  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    registros.filter((r: any) => r.retirado !== "SI" && r.cuarto).forEach((r: any) => {
      counts[r.cuarto] = (counts[r.cuarto] || 0) + 1;
    });
    return counts;
  }, [registros]);
  // Etiqueta de un cuarto con su semáforo de ocupación (para el searchable).
  const roomLabel = (c: string) => {
    const count = roomCounts[c] || 0;
    const cap = roomCapacities[c] ?? 18;
    const level = roomFillLevel(count, cap);
    const emoji = level === "red" ? "🔴" : level === "yellow" ? "🟡" : "🟢";
    return `${emoji} ${c} (${count}/${cap})`;
  };
  // Carga la ocupación una vez si aún no está (para el semáforo del select).
  useEffect(() => {
    if (registros.length === 0) fetchRegistros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Form State — useReducer eliminates stale-closure bugs from useState in callbacks
  const [formData, dispatch] = useReducer(formReducer, INITIAL_FORM);

  // Medicamentos dinámicos (array independiente del reducer de strings)
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const removeMedicamento = (i: number) => setMedicamentos(p => p.filter((_, idx) => idx !== i));
  const updateMedicamento = (i: number, field: "dosis" | "periodo", val: string) =>
    setMedicamentos(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  // Client Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Campos "tocados": un error solo se muestra si el campo fue tocado o si se
  // intentó avanzar/enviar (evita marcar en rojo secciones recién abiertas).
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (...fields: string[]) => setTouched(prev => {
    let changed = false;
    const next = { ...prev };
    fields.forEach(f => { if (!next[f]) { next[f] = true; changed = true; } });
    return changed ? next : prev;
  });

  // ¿Se intentó registrar? Los campos del ÚLTIMO paso (Estado de Salud) NO se
  // validan por navegación ni por el precargado de cédula: SOLO se revelan al
  // pulsar "Registrar". Así llegar al paso 4 nunca lo pinta en rojo.
  const [triedSubmit, setTriedSubmit] = useState(false);
  const SUBMIT_ONLY_FIELDS = new Set(["estadoFisico", "patologia"]);

  // Mensaje de error a mostrar para un campo (respeta el gating):
  //  - campos del paso 4 (SUBMIT_ONLY): solo tras intentar registrar.
  //  - resto: al tocar el campo o tras intentar avanzar/registrar.
  const err = (field: string): string => {
    const reveal = SUBMIT_ONLY_FIELDS.has(field) ? triedSubmit : (touched[field] || triedSubmit);
    return reveal ? (errors[field] || "") : "";
  };

  // Submission guard (distinct from background sync)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cédula local database lookup status
  const [lookupStatus, setLookupStatus] = useState<"idle" | "searching" | "found" | "not-found">("idle");

  // Resultado de buscar al Jefe de Familia por su cédula (solo informativo, NO bloquea el registro).
  const [jefeLookup, setJefeLookup] = useState<{ found: boolean; nombre?: string } | null>(null);
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Conversión de fecha (DatePicker usa yyyy-mm-dd; el form guarda dd/mm/aaaa) ─
  const dmyToYmd = (dmy: string): string => {
    const p = (dmy || "").split("/");
    if (p.length !== 3 || p[2].length !== 4) return "";
    return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
  };
  const ymdToDmy = (ymd: string): string => {
    if (!ymd) return "";
    const p = ymd.split("-");
    if (p.length !== 3) return "";
    return `${p[2]}/${p[1]}/${p[0]}`;
  };

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

  // ── Duplicado de cédula (adulto activo), en vivo ────────────────────────────
  // Construye la cédula final (respeta nacionalidad y menor-sin-cédula) y la
  // busca entre registros sincronizados y locales pendientes (ignora retirados).
  const cedulaDupInfo = useMemo<{ dup: boolean; nombre?: string; finalCedula: string }>(() => {
    let raw = (formData.cedula || "").trim();
    if (!raw) return { dup: false, finalCedula: "" };
    if (formData.isChildDependent) raw = `${raw}-${formData.dependentNumber}`;
    const clean = raw.toUpperCase();
    const finalCedula = (clean.startsWith("V-") || clean.startsWith("E-"))
      ? clean
      : `${formData.nacionalidad}-${clean}`;

    const inSynced = registros.find((r: any) =>
      r.retirado !== "SI" && r.cedula && r.cedula.toUpperCase().trim() === finalCedula);
    if (inSynced) return { dup: true, nombre: inSynced.nombreApellido, finalCedula };

    const inLocal = localRecords.find((r: any) =>
      r.status !== "synced" && r.data?.retirado !== "SI" &&
      r.data?.cedula && r.data.cedula.toUpperCase().trim() === finalCedula);
    if (inLocal) return { dup: true, nombre: inLocal.data?.nombreApellido, finalCedula };

    return { dup: false, finalCedula };
  }, [formData.cedula, formData.nacionalidad, formData.isChildDependent, formData.dependentNumber, registros, localRecords]);

  const cedulaDupMsg = cedulaDupInfo.nombre
    ? `Esta cédula ya está registrada: ${cedulaDupInfo.nombre}`
    : "Esta cédula ya se encuentra registrada en el sistema local.";

  // Sincroniza el error de cédula EN VIVO (formato → duplicado). Solo si el
  // campo ya fue tocado, para no marcarlo al llegar al paso 3 sin escribir nada.
  useEffect(() => {
    if (!touched.cedula) return;
    const fmt = validateField("cedula", formData.cedula);
    const msg = fmt || (cedulaDupInfo.dup ? cedulaDupMsg : "");
    setErrors(prev => (prev.cedula === msg ? prev : { ...prev, cedula: msg }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.cedula, cedulaDupInfo, touched.cedula]);

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
      case "genero":
        return value ? "" : "Seleccione el género";
      case "perteneceNucleo":
        return value ? "" : "Seleccione una opción";
      case "jefeFamilia":
        return value ? "" : "Seleccione si es jefe de familia";
      case "estadoFisico":
        return value ? "" : "Seleccione el estado físico";
      case "patologia":
        return value ? "" : "Seleccione si posee patología";
      case "cedulaJefeFamilia":
        if (formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO") {
          if (!value) return "La cédula del jefe de familia es obligatoria";
          if (value.length < 5) return "La cédula debe tener al menos 5 dígitos";
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
      const errMsg = validateField(key, val);
      if (errMsg) {
        newErrors[key] = errMsg;
      }
    });

    // Conditional validations
    if (formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO") {
      const e = validateField("cedulaJefeFamilia", formData.cedulaJefeFamilia);
      if (e) newErrors.cedulaJefeFamilia = e;
    }

    if (formData.patologia === "SI" && (!formData.patologiaIds || formData.patologiaIds.length === 0)) {
      newErrors.patologiaIds = "Seleccione al menos una patología";
    }

    if (formData.intermitente === "SI") {
      const e = validateField("motivoIntermitente", formData.motivoIntermitente);
      if (e) newErrors.motivoIntermitente = e;
    }

    // Required toggles
    if (!formData.genero) newErrors.genero = "Seleccione el género";
    if (!formData.jefeFamilia) newErrors.jefeFamilia = "Seleccione si es jefe de familia";
    if (!formData.perteneceNucleo) newErrors.perteneceNucleo = "Seleccione una opción";
    if (!formData.estadoFisico) newErrors.estadoFisico = "Seleccione el estado físico";
    if (!formData.patologia) newErrors.patologia = "Seleccione si posee patología";

    // Duplicado (mismo cálculo que el chequeo en vivo)
    if (!newErrors.cedula && cedulaDupInfo.dup) {
      newErrors.cedula = cedulaDupMsg;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === "cedula") {
      const cleanCedula = value.replace(/\D/g, "");
      dispatch({ type: "SET", field: "cedula", value: cleanCedula });
      markTouched("cedula");
      // El error (formato + duplicado) lo sincroniza el useEffect en vivo.
      // Si es hijo/dependiente, la cédula es la del REPRESENTANTE → NO se consulta el
      // padrón (devolvería los datos del padre). El chequeo de duplicado local ya usa
      // la cédula completa con el sufijo.
      if (formData.isChildDependent) setLookupStatus("idle");
      else triggerLookup(cleanCedula);
      return;
    }

    if (name === "cedulaJefeFamilia") {
      const cleanVal = value.replace(/\D/g, "");
      dispatch({ type: "SET", field: "cedulaJefeFamilia", value: cleanVal });
      markTouched("cedulaJefeFamilia");
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

    dispatch({ type: "SET", field: name as keyof FormData, value });
    markTouched(name);
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
          // Los datos autocompletados son válidos: limpia sus errores (NO toca la cédula).
          setErrors(prev => ({
            ...prev,
            nombreApellido: "",
            genero: "",
            fechaNacimiento: ""
          }));
          showToast("Identidad verificada en padrón local.", "info");
        } else {
          // 3) API externa en línea (api.cedula.com.ve), como tercera fuente.
          const ext = await fetchCedulaExterna(formData.nacionalidad, cleanCedula);
          if (ext) {
            setLookupStatus("found");
            const parts = (ext.fechaNacimiento || "").split("-"); // yyyy-mm-dd
            const extFecha = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : "";
            dispatch({ type: "SET_MANY", patch: {
              ...(ext.nombreApellido ? { nombreApellido: ext.nombreApellido } : {}),
              ...(ext.genero ? { genero: ext.genero } : {}),
              ...(extFecha ? { fechaNacimiento: extFecha, edad: handleDateChange(ext.fechaNacimiento) } : {}),
            } });
            setErrors(prev => ({ ...prev, nombreApellido: "", genero: "", fechaNacimiento: "" }));
            showToast("Identidad verificada en línea (api.cedula.com.ve).", "info");
          } else {
            setLookupStatus("not-found");
          }
        }
      } catch (err) {
        setLookupStatus("not-found");
      }
    }, 250);
  };

  // Per-step validation for the wizard (Step 1 Family Group, 2 Geo, 3 Personal ID, 4 Health)
  const STEP_FIELDS: Record<number, string[]> = {
    1: ["perteneceNucleo", "jefeFamilia"],
    2: ["parroquia", "sector", "comunidad", "direccionExacta"],
    3: ["cedula", "nombreApellido", "genero", "fechaNacimiento", "telefonoNum"],
    4: ["estadoFisico", "patologia"],
  };

  // Campos condicionales por paso (además de STEP_FIELDS) que también se limpian
  // al llegar a ese paso.
  const STEP_EXTRA: Record<number, string[]> = {
    1: ["cedulaJefeFamilia"],
    4: ["patologiaIds", "motivoIntermitente"],
  };

  // Navega a un paso dejando SIN touched / SIN error los campos del paso DESTINO,
  // para que al llegar NUNCA aparezcan en rojo antes de tocar nada (bulletproof:
  // no importa cómo se hubieran marcado antes).
  const goToStep = (next: 1 | 2 | 3 | 4) => {
    const clearFields = [...(STEP_FIELDS[next] || []), ...(STEP_EXTRA[next] || [])];
    setTouched(prev => {
      const n = { ...prev };
      clearFields.forEach(f => { delete n[f]; });
      return n;
    });
    setErrors(prev => {
      const n = { ...prev };
      clearFields.forEach(f => { delete n[f]; });
      return n;
    });
    // Navegar limpia la revelación de "intento de registro": el paso destino
    // arranca limpio (los campos SUBMIT_ONLY vuelven a ocultarse).
    setTriedSubmit(false);
    setStep(next);
  };

  const handleNextStep = () => {
    const fields = STEP_FIELDS[step];
    // Revela los errores del paso actual (marca sus campos como tocados).
    markTouched(...fields);
    const newErrors: Record<string, string> = {};
    fields.forEach(field => {
      const e = validateField(field, (formData as any)[field] as string);
      if (e) newErrors[field] = e;
    });
    if (step === 1 && formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO") {
      markTouched("cedulaJefeFamilia");
      const e = validateField("cedulaJefeFamilia", formData.cedulaJefeFamilia);
      if (e) newErrors.cedulaJefeFamilia = e;
    }
    if (step === 3 && !newErrors.cedula && cedulaDupInfo.dup) {
      newErrors.cedula = cedulaDupMsg;
    }
    if (step === 4 && formData.patologia === "SI" && (!formData.patologiaIds || formData.patologiaIds.length === 0)) {
      newErrors.patologiaIds = "Seleccione al menos una patología";
    }
    setErrors(prev => ({ ...prev, ...newErrors }));
    if (Object.keys(newErrors).length > 0) return;
    goToStep((step + 1) as 1|2|3|4);
  };

  // Submit Handler: Saves to IndexedDB first, then triggers sync
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Enter en un input de un paso previo dispara submit: NO debe enviar ni marcar
    // todo el form como tocado (eso pintaba en rojo los radios del paso 4 al llegar).
    // El envío real solo procede desde el último paso.
    if (step !== 4) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    // Guarda: sin refugio activo no se puede registrar (ni online ni offline).
    if (!hasRefugio(effectiveRefugio)) {
      showToast("No hay un campamento asignado para registrar. Un administrador debe asociarte a un campamento.", "error");
      setIsSubmitting(false);
      return;
    }

    // Intento de registro: valida TODO el form y revela cualquier error pendiente
    // (incluidos los campos SUBMIT_ONLY del paso 4).
    setTriedSubmit(true);
    markTouched(
      "parroquia", "sector", "comunidad", "direccionExacta", "nombreApellido",
      "cedula", "fechaNacimiento", "telefonoNum", "genero", "jefeFamilia",
      "perteneceNucleo", "estadoFisico", "patologia", "cedulaJefeFamilia",
      "patologiaIds", "motivoIntermitente"
    );

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
        type: 'new' as const,   // creación → re-enviarla no debe tocar un registro ya creado
        refugio: effectiveRefugio,
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
          embarazo: formData.genero === "FEMENINO" ? (formData.embarazo === "SI" ? "SI" : "NO") : "NO",
          patologia: formData.patologia,
          patologiaIds: formData.patologia === "SI" ? (formData.patologiaIds || []) : [],
          gpsLat: coords.lat !== null ? coords.lat : undefined,
          gpsLng: coords.lng !== null ? coords.lng : undefined,
          telefono: finalTelefono !== null ? finalTelefono : undefined,
          medicamentoIds: medicamentos.filter(m => m.id),
          cuarto: asignCuartoCenso || undefined,
          intermitente: formData.intermitente || "NO",
          motivoIntermitente: formData.intermitente === "SI" ? formData.motivoIntermitente.trim() : undefined,
          refugio: effectiveRefugio
        }
      };

      await saveLocal(registroData);
      showToast("Registro guardado localmente.", "success");

      dispatch({ type: "RESET" });
      setMedicamentos([]);
      setErrors({});
      setTouched({});
      setTriedSubmit(false);
      setLookupStatus("idle");
      setJefeLookup(null);
      setAsignCuartoCenso("");
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
          {!hasRefugio(effectiveRefugio) ? (
            <div className="form-card" style={{ textAlign: "center", padding: "2rem 1.5rem" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 1rem", display: "block" }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <h3 style={{ margin: "0 0 0.5rem", color: "var(--text-primary)", fontSize: "1.1rem" }}>Sin campamento asignado</h3>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                Tu usuario no está asociado a ningún campamento, por lo que no puedes registrar personas. Pídele a un administrador que te asigne un campamento.
              </p>
            </div>
          ) : canRegister(currentUser.role) ? (
            <form onSubmit={handleSubmit} className="form-card censo-form">
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
                <div className="form-section form-step-content" key="step-1">
                  <div className="form-group">
                    <label>¿Pertenece a un núcleo familiar?<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.perteneceNucleo === "SI" ? "selected" : ""} ${err("perteneceNucleo") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="perteneceNucleo" value="SI" checked={formData.perteneceNucleo === "SI"} onChange={handleInputChange} />
                        SI
                      </label>
                      <label
                        className={`radio-card ${formData.perteneceNucleo === "NO" ? "selected" : ""} ${err("perteneceNucleo") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="perteneceNucleo" value="NO" checked={formData.perteneceNucleo === "NO"} onChange={handleInputChange} />
                        NO
                      </label>
                    </div>
                    <div className="error-container">
                      {err("perteneceNucleo") && <span className="field-error-message">{err("perteneceNucleo")}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>¿Usted es el Jefe de Familia?<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.jefeFamilia === "SI" ? "selected" : ""} ${err("jefeFamilia") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="jefeFamilia" value="SI" checked={formData.jefeFamilia === "SI"} onChange={handleInputChange} />
                        SI
                      </label>
                      <label
                        className={`radio-card ${formData.jefeFamilia === "NO" ? "selected" : ""} ${err("jefeFamilia") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="jefeFamilia" value="NO" checked={formData.jefeFamilia === "NO"} onChange={handleInputChange} />
                        NO
                      </label>
                    </div>
                    <div className="error-container">
                      {err("jefeFamilia") && <span className="field-error-message">{err("jefeFamilia")}</span>}
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
                        className={err("cedulaJefeFamilia") ? "has-error" : ""}
                      />
                      <div className="error-container">
                        {err("cedulaJefeFamilia") && <span className="field-error-message">{err("cedulaJefeFamilia")}</span>}
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
                <div className="form-section form-step-content" key="step-2">
                  <div className="form-group">
                    <label htmlFor="parroquia">Parroquia donde vive<span className="required-star">*</span></label>
                    <StyledSelect
                      value={formData.parroquia}
                      onChange={(v) => {
                        dispatch({ type: "SET", field: "parroquia", value: v });
                        markTouched("parroquia");
                        setErrors(prev => ({ ...prev, parroquia: validateField("parroquia", v) }));
                      }}
                      options={PARROQUIAS.map(p => ({ value: p, label: p }))}
                      placeholder="Seleccione una parroquia..."
                      ariaLabel="Parroquia donde vive"
                      error={!!err("parroquia")}
                    />
                    <div className="error-container">
                      {err("parroquia") && <span className="field-error-message">{err("parroquia")}</span>}
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
                      className={err("sector") ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {err("sector") && <span className="field-error-message">{err("sector")}</span>}
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
                      className={err("comunidad") ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {err("comunidad") && <span className="field-error-message">{err("comunidad")}</span>}
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
                      className={err("direccionExacta") ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {err("direccionExacta") && <span className="field-error-message">{err("direccionExacta")}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 3: Identificación Personal */}
              {step === 3 && (
                <div className="form-section form-step-content" key="step-3">
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <button
                      type="button"
                      className={`pill-check pill-check--wrap${formData.isChildDependent ? " is-on" : ""}`}
                      aria-pressed={formData.isChildDependent}
                      onClick={() => {
                        const checked = !formData.isChildDependent;
                        dispatch({ type: "SET", field: "isChildDependent", value: checked });
                        // Al marcarlo hijo la cédula es la del representante → limpia el
                        // estado del padrón (no se verifica ahí).
                        if (checked) setLookupStatus("idle");
                        if (checked && formData.cedulaJefeFamilia) {
                          const numOnly = formData.cedulaJefeFamilia.replace(/^[VE]-/, "");
                          dispatch({ type: "SET", field: "cedula", value: numOnly });
                          markTouched("cedula");
                        }
                      }}
                    >
                      <span className="pill-check__box" aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                      <span className="pill-check__label">Menor de edad sin cédula (asociar a representante)</span>
                    </button>
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
                        className={err("cedula") ? "has-error" : ""}
                      />
                    </div>
                    {formData.isChildDependent && (
                      <div className="form-group" style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
                        <label htmlFor="dependentNumber" style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Número correlativo de hijo/dependiente</label>
                        <StyledSelect
                          value={formData.dependentNumber}
                          onChange={(v) => dispatch({ type: "SET", field: "dependentNumber", value: v })}
                          options={[
                            { value: "1", label: "1er Hijo/Representado (-1)" },
                            { value: "2", label: "2do Hijo/Representado (-2)" },
                            { value: "3", label: "3er Hijo/Representado (-3)" },
                            { value: "4", label: "4to Hijo/Representado (-4)" },
                            { value: "5", label: "5to Hijo/Representado (-5)" },
                            { value: "6", label: "6to Hijo/Representado (-6)" },
                          ]}
                          ariaLabel="Número correlativo de hijo/dependiente"
                        />
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
                      {err("cedula") && <span className="field-error-message">{err("cedula")}</span>}
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
                      className={err("nombreApellido") ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {err("nombreApellido") && <span className="field-error-message">{err("nombreApellido")}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Género<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.genero === "MASCULINO" ? "selected" : ""} ${err("genero") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input
                          type="radio"
                          name="genero"
                          value="MASCULINO"
                          checked={formData.genero === "MASCULINO"}
                          onChange={handleInputChange}
                        />
                        MASCULINO
                      </label>
                      <label
                        className={`radio-card ${formData.genero === "FEMENINO" ? "selected" : ""} ${err("genero") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input
                          type="radio"
                          name="genero"
                          value="FEMENINO"
                          checked={formData.genero === "FEMENINO"}
                          onChange={handleInputChange}
                        />
                        FEMENINO
                      </label>
                    </div>
                    <div className="error-container">
                      {err("genero") && <span className="field-error-message">{err("genero")}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="fechaNacimiento">Fecha de Nacimiento<span className="required-star">*</span></label>
                    <DatePicker
                      value={dmyToYmd(formData.fechaNacimiento)}
                      onChange={(ymd) => {
                        dispatch({ type: "SET_MANY", patch: { fechaNacimiento: ymdToDmy(ymd), edad: ymd ? handleDateChange(ymd) : "" } });
                        markTouched("fechaNacimiento");
                        setErrors(prev => ({ ...prev, fechaNacimiento: validateField("fechaNacimiento", ymdToDmy(ymd)) }));
                      }}
                      placeholder="Seleccione la fecha de nacimiento…"
                      error={!!err("fechaNacimiento")}
                    />
                    <div className="error-container">
                      {err("fechaNacimiento") && <span className="field-error-message">{err("fechaNacimiento")}</span>}
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
                      readOnly
                      disabled
                      className="input-disabled"
                    />
                    <div className="error-container"></div>
                  </div>

                  <div className="form-group">
                    <label>Teléfono de Contacto<span className="required-star">*</span></label>
                    <div className="field-row-phone">
                      <StyledSelect
                        value={formData.telefonoCod}
                        onChange={(v) => dispatch({ type: "SET", field: "telefonoCod", value: v })}
                        options={TELEFONO_CODIGOS.map(c => ({ value: c, label: c }))}
                        ariaLabel="Código de área"
                      />
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
                          markTouched("telefonoNum");
                          setErrors(prev => ({ ...prev, telefonoNum: validateField("telefonoNum", val) }));
                        }}
                        className={err("telefonoNum") ? "has-error" : ""}
                      />
                    </div>
                    <div className="error-container">
                      {err("telefonoNum") && <span className="field-error-message">{err("telefonoNum")}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 4: Estado de Salud */}
              {step === 4 && (
                <div className="form-section form-step-content" key="step-4">
                  <div className="form-group">
                    <label>Estado Físico Actual<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.estadoFisico === "ILESO" ? "selected" : ""} ${err("estadoFisico") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="estadoFisico" value="ILESO" checked={formData.estadoFisico === "ILESO"} onChange={handleInputChange} />
                        ILESO
                      </label>
                      <label
                        className={`radio-card ${formData.estadoFisico === "LESIONADO" ? "selected" : ""} ${err("estadoFisico") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="estadoFisico" value="LESIONADO" checked={formData.estadoFisico === "LESIONADO"} onChange={handleInputChange} />
                        LESIONADO
                      </label>
                    </div>
                    <div className="error-container">
                      {err("estadoFisico") && <span className="field-error-message">{err("estadoFisico")}</span>}
                    </div>
                  </div>

                  {formData.genero === "FEMENINO" && (
                    <div className="form-group">
                      <label>¿Está embarazada?</label>
                      <div className="radio-group">
                        <label
                          className={`radio-card ${formData.embarazo === "NO" ? "selected" : ""}`}
                          onPointerDown={(e) => e.preventDefault()}
                        >
                          <input type="radio" name="embarazo" value="NO" checked={formData.embarazo === "NO"} onChange={handleInputChange} />
                          NO
                        </label>
                        <label
                          className={`radio-card ${formData.embarazo === "SI" ? "selected" : ""}`}
                          onPointerDown={(e) => e.preventDefault()}
                        >
                          <input type="radio" name="embarazo" value="SI" checked={formData.embarazo === "SI"} onChange={handleInputChange} />
                          SI
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label>¿Posee alguna patología crónica?<span className="required-star">*</span></label>
                    <div className="radio-group">
                      <label
                        className={`radio-card ${formData.patologia === "SI" ? "selected" : ""} ${err("patologia") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="patologia" value="SI" checked={formData.patologia === "SI"} onChange={handleInputChange} />
                        SI
                      </label>
                      <label
                        className={`radio-card ${formData.patologia === "NO" ? "selected" : ""} ${err("patologia") ? "has-error" : ""}`}
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <input type="radio" name="patologia" value="NO" checked={formData.patologia === "NO"} onChange={handleInputChange} />
                        NO
                      </label>
                    </div>
                    <div className="error-container">
                      {err("patologia") && <span className="field-error-message">{err("patologia")}</span>}
                    </div>
                  </div>

                  <div className={`conditional-wrapper ${formData.patologia === "SI" ? "open" : ""}`}>
                    <div className="conditional-inner">
                      <label style={{ marginBottom: "0.5rem", display: "block" }}>Seleccione patologías<span className="required-star">*</span></label>
                      <div style={{ marginTop: "0.5rem" }}>
                        <SearchableSelect
                          placeholder="Buscar y agregar patología…"
                          inputClassName="morb-control"
                          options={patologias
                            .filter(p => !(formData.patologiaIds || []).includes(p.id))
                            .map(p => ({ value: p.id, label: p.nombre }))}
                          onSelect={addPatologia}
                          error={!!errors.patologiaIds}
                        />
                      </div>
                      <div className="pathology-pills-grid">
                        {(formData.patologiaIds || []).length === 0 ? (
                          <span className="pills-empty">(Ninguna seleccionada)</span>
                        ) : (formData.patologiaIds || []).map((id: string) => (
                          <span key={id} className="chip-pill">
                            {patologiaNombre(id, patologias)}
                            <button
                              type="button"
                              onClick={() => removePatologia(id)}
                              aria-label="Quitar"
                              className="chip-pill__x"
                            >×</button>
                          </span>
                        ))}
                      </div>
                      <div className="error-container">
                        {errors.patologiaIds && <span className="field-error-message">{errors.patologiaIds}</span>}
                      </div>
                    </div>
                  </div>

                  <div className={`conditional-wrapper ${formData.patologia === "SI" || formData.estadoFisico === "LESIONADO" ? "open" : ""}`}>
                    <div className="conditional-inner">
                      <div className="med-section">
                        <div className="med-section-header" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <span className="med-section-title">Medicamentos</span>
                          <SearchableSelect
                            placeholder="Buscar y agregar medicamento…"
                            inputClassName="morb-control"
                            options={predefinedMedicamentos
                              .filter(m => !medicamentos.some(x => x.id === m.id))
                              .map(m => ({ value: m.id, label: [m.nombre, m.concentracion, m.presentacion].filter(Boolean).join(" · ") }))}
                            onSelect={handleSelectPredefinedMed}
                          />
                        </div>
                        {medicamentos.length === 0 ? (
                          <p className="med-empty">Sin medicamentos. Elige uno del catálogo arriba.</p>
                        ) : (
                          <div className="med-items">
                            {medicamentos.map((m, i) => (
                              <div key={i} className="med-item">
                                <div className="med-item__head">
                                  <span className="med-item__name">{medLabel(m.id, predefinedMedicamentos)}</span>
                                  <button type="button" className="btn-remove-med" onClick={() => removeMedicamento(i)} aria-label="Quitar medicamento">×</button>
                                </div>
                                <div className="med-item__fields">
                                  <div className="med-item__field med-item__field--dose">
                                    <span className="med-item__label">Dosis</span>
                                    <span className="med-item__dose">{m.dosis || "—"}</span>
                                  </div>
                                  <div className="med-item__field med-item__field--periodo">
                                    <span className="med-item__label">Período</span>
                                    <StyledSelect
                                      dense
                                      value={m.periodo}
                                      onChange={(v) => updateMedicamento(i, "periodo", v)}
                                      options={PERIODO_OPTIONS.map(op => ({ value: op, label: op }))}
                                      placeholder="Elegir período…"
                                      ariaLabel="Período"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
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
                        className={err("motivoIntermitente") ? "has-error" : ""}
                      />
                      <div className="error-container">
                        {err("motivoIntermitente") && <span className="field-error-message">{err("motivoIntermitente")}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 4 (cont.): Asignación de habitación — OPCIONAL */}
              {step === 4 && (
                <div className="form-section form-step-content">
                  <div className="form-group">
                    <label>
                      Habitación / Salón <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                    </label>
                    <SearchableSingleSelect
                      value={asignCuartoCenso}
                      onChange={setAsignCuartoCenso}
                      options={allCuartos.map(c => ({ value: c, label: roomLabel(c) }))}
                      placeholder="Sin habitación asignada"
                      searchPlaceholder="Buscar habitación…"
                      clearLabel="— Sin habitación asignada —"
                      emptyText="Sin habitaciones configuradas"
                      ariaLabel="Habitación / Salón"
                    />
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Si lo dejas vacío, la persona queda registrada sin habitación asignada.
                    </p>
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
                      onClick={() => goToStep((step - 1) as 1 | 2 | 3 | 4)}
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
                      {isSubmitting ? "Guardando..." : "Registrar Afectado"}
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
