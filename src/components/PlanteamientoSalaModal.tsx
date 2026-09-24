"use client";

import { useState, useEffect, useMemo } from "react";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import StyledSelect from "@/components/StyledSelect";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import {
  TITULO_CASA_OPTIONS,
  ESTATUS_SALA_OPTIONS,
  TIPO_OPCION_PLANTEAMIENTO_OPTIONS,
} from "@/lib/constants";
import { apiFetch } from "@/lib/apiFetch";
import { fetchCedulaExterna } from "@/lib/cedulaApi";
import type {
  PlanteamientoSalaItem,
  TituloCasaTipo,
  PlanteamientoSalaEstatus,
  TipoOpcionPlanteamiento,
  PlanteamientoCargaFamiliarItem,
} from "@/types";

const TIPO_FAMILIAR_OPTIONS = [
  "Esposa",
  "Esposo",
  "Hermano",
  "Hermana",
  "Hijo",
  "Hija",
  "Nieto",
  "Nieta",
  "Otro",
] as const;

// Edad (a hoy) a partir de una fecha yyyy-mm-dd
const computeEdad = (ymd: string): string => {
  if (!ymd) return "";
  const d = new Date(ymd + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? String(age) : "";
};

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

  // Datos básicos de la persona
  const [refugio, setRefugio] = useState(defaultRefugio || campamentosList[0]?.nombre || "");
  const [cedula, setCedula] = useState("");
  const [nombreApellido, setNombreApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [genero, setGenero] = useState<"MASCULINO" | "FEMENINO" | "">("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [edad, setEdad] = useState("");
  const [registroId, setRegistroId] = useState<string | null>(null);

  // Tipo de Opción / Modalidad
  const [tipoOpcion, setTipoOpcion] = useState<TipoOpcionPlanteamiento>("MERCADO_SECUNDARIO");

  // 1. Mercado Secundario (10 Requisitos)
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
  const [qrColapsoVivienda, setQrColapsoVivienda] = useState<"SI" | "NO">("NO");

  // 2. Alquiler (7 Requisitos)
  const [cartaCompromiso, setCartaCompromiso] = useState<"SI" | "NO">("NO");
  const [fotosAlquiler, setFotosAlquiler] = useState<"SI" | "NO">("NO");
  const [cantidadFotosAlquiler, setCantidadFotosAlquiler] = useState("0");
  const [referenciaBancariaAlquiler, setReferenciaBancariaAlquiler] = useState<"SI" | "NO">("NO");
  const [cedulaArrendador, setCedulaArrendador] = useState<"SI" | "NO">("NO");
  const [cedulaArrendatario, setCedulaArrendatario] = useState<"SI" | "NO">("NO");
  const [rifArrendador, setRifArrendador] = useState<"SI" | "NO">("NO");
  const [rifArrendatario, setRifArrendatario] = useState<"SI" | "NO">("NO");

  // 3. Plan Venezuela Renace (Requisitos y Materiales)
  const [rifViviendaDanos, setRifViviendaDanos] = useState<"SI" | "NO">("NO");
  const [fotosViviendaRenace, setFotosViviendaRenace] = useState<"SI" | "NO">("NO");
  const [cantidadFotosRenace, setCantidadFotosRenace] = useState("0");
  const [sacosCemento, setSacosCemento] = useState("0");
  const [metrosArena, setMetrosArena] = useState("0");
  const [bloques, setBloques] = useState("0");
  const [cabillas, setCabillas] = useState("0");
  const [pego, setPego] = useState("0");

  // Estatus, Fechas de Avance y Observación
  const [estatus, setEstatus] = useState<PlanteamientoSalaEstatus>("EN PROCESO");
  const [observacion, setObservacion] = useState("");
  const [fechaEntregaCarpeta, setFechaEntregaCarpeta] = useState("");
  const [fechaEntregaSubsidio, setFechaEntregaSubsidio] = useState("");

  // Carga Familiar (renglones dinámicos por ítem)
  const [cargaFamiliar, setCargaFamiliar] = useState<PlanteamientoCargaFamiliarItem[]>([]);
  const [searchingRows, setSearchingRows] = useState<Record<string, boolean>>({});
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});

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
        setGenero(
          itemToEdit.genero === "FEMENINO" || itemToEdit.genero === "MASCULINO"
            ? itemToEdit.genero
            : ""
        );
        const fn = itemToEdit.fechaNacimiento ? itemToEdit.fechaNacimiento.slice(0, 10) : "";
        setFechaNacimiento(fn);
        setEdad(
          itemToEdit.edad !== null && itemToEdit.edad !== undefined
            ? String(itemToEdit.edad)
            : fn
            ? computeEdad(fn)
            : ""
        );
        setRegistroId(itemToEdit.registroId || null);
        setTipoOpcion(itemToEdit.tipoOpcion || "MERCADO_SECUNDARIO");

        // Mercado Secundario
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
        setQrColapsoVivienda(itemToEdit.qrColapsoVivienda || "NO");

        // Alquiler
        setCartaCompromiso(itemToEdit.cartaCompromiso || "NO");
        setFotosAlquiler(itemToEdit.fotosAlquiler || "NO");
        setCantidadFotosAlquiler(String(itemToEdit.cantidadFotosAlquiler || 0));
        setReferenciaBancariaAlquiler(itemToEdit.referenciaBancariaAlquiler || "NO");
        setCedulaArrendador(itemToEdit.cedulaArrendador || "NO");
        setCedulaArrendatario(itemToEdit.cedulaArrendatario || "NO");
        setRifArrendador(itemToEdit.rifArrendador || "NO");
        setRifArrendatario(itemToEdit.rifArrendatario || "NO");

        // Plan Venezuela Renace
        setRifViviendaDanos(itemToEdit.rifViviendaDanos || "NO");
        setFotosViviendaRenace(itemToEdit.fotosViviendaRenace || "NO");
        setCantidadFotosRenace(String(itemToEdit.cantidadFotosRenace || 0));
        setSacosCemento(String(itemToEdit.sacosCemento || 0));
        setMetrosArena(String(itemToEdit.metrosArena || 0));
        setBloques(String(itemToEdit.bloques || 0));
        setCabillas(String(itemToEdit.cabillas || 0));
        setPego(String(itemToEdit.pego || 0));

        setEstatus(itemToEdit.estatus || "EN PROCESO");
        setObservacion(itemToEdit.observacion || "");
        setFechaEntregaCarpeta(
          itemToEdit.fechaEntregaCarpeta ||
          (itemToEdit.createdAt ? itemToEdit.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10))
        );
        setFechaEntregaSubsidio(itemToEdit.fechaEntregaSubsidio || "");

        const famList: PlanteamientoCargaFamiliarItem[] = Array.isArray(itemToEdit.cargaFamiliar)
          ? (itemToEdit.cargaFamiliar as PlanteamientoCargaFamiliarItem[])
          : [];
        setCargaFamiliar(famList);
        setSearchingRows({});
        setRowMessages({});
      } else {
        setRefugio(defaultRefugio || (campamentosList[0]?.nombre || ""));
        setCedula("");
        setNombreApellido("");
        setTelefono("");
        setGenero("");
        setFechaNacimiento("");
        setEdad("");
        setFechaEntregaCarpeta(new Date().toISOString().slice(0, 10));
        setFechaEntregaSubsidio("");
        setRegistroId(null);
        setTipoOpcion("MERCADO_SECUNDARIO");

        setCargaFamiliar([]);
        setSearchingRows({});
        setRowMessages({});

        // Reset Mercado Secundario
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
        setQrColapsoVivienda("NO");

        // Reset Alquiler
        setCartaCompromiso("NO");
        setFotosAlquiler("NO");
        setCantidadFotosAlquiler("0");
        setReferenciaBancariaAlquiler("NO");
        setCedulaArrendador("NO");
        setCedulaArrendatario("NO");
        setRifArrendador("NO");
        setRifArrendatario("NO");

        // Reset Plan Venezuela Renace
        setRifViviendaDanos("NO");
        setFotosViviendaRenace("NO");
        setCantidadFotosRenace("0");
        setSacosCemento("0");
        setMetrosArena("0");
        setBloques("0");
        setCabillas("0");
        setPego("0");

        setEstatus("EN PROCESO");
        setObservacion("");
      }
      setLookupMessage("");
    }
  }, [isOpen, itemToEdit, defaultRefugio, campamentosList]);

  // Cálculo dinámico de progreso según la modalidad seleccionada
  const { cumplidos, total, porcentaje } = useMemo(() => {
    if (tipoOpcion === "ALQUILER") {
      let c = 0;
      if (cartaCompromiso === "SI") c++;
      if (fotosAlquiler === "SI" || parseInt(cantidadFotosAlquiler, 10) > 0) c++;
      if (referenciaBancariaAlquiler === "SI") c++;
      if (cedulaArrendador === "SI") c++;
      if (cedulaArrendatario === "SI") c++;
      if (rifArrendador === "SI") c++;
      if (rifArrendatario === "SI") c++;
      return {
        cumplidos: c,
        total: 7,
        porcentaje: Math.round((c / 7) * 100),
      };
    }

    if (tipoOpcion === "PLAN_VENEZUELA_RENACE") {
      let c = 0;
      if (rifViviendaDanos === "SI") c++;
      if (fotosViviendaRenace === "SI" || parseInt(cantidadFotosRenace, 10) > 0) c++;
      const hasMaterials =
        parseInt(sacosCemento, 10) > 0 ||
        parseFloat(metrosArena) > 0 ||
        parseInt(bloques, 10) > 0 ||
        parseInt(cabillas, 10) > 0 ||
        parseInt(pego, 10) > 0;
      if (hasMaterials) c++;
      return {
        cumplidos: c,
        total: 3,
        porcentaje: Math.round((c / 3) * 100),
      };
    }

    // MERCADO_SECUNDARIO por defecto
    let c = 0;
    if (planillaCaracterizacion === "SI") c++;
    if (cedulaCatastral === "SI") c++;
    if (tituloCasa && tituloCasa !== "NINGUNO") c++;
    if (referenciaBancariaVendedor === "SI") c++;
    if (qrHabitatVivienda === "SI") c++;
    if (cedulaVendedor === "SI") c++;
    if (cedulaComprador === "SI") c++;
    if (fotosVivienda === "SI" || parseInt(cantidadFotos, 10) > 0) c++;
    if (vendedorPoseePatria === "SI") c++;
    if (qrColapsoVivienda === "SI") c++;
    return {
      cumplidos: c,
      total: 10,
      porcentaje: Math.round((c / 10) * 100),
    };
  }, [
    tipoOpcion,
    // Mercado Secundario
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
    qrColapsoVivienda,
    // Alquiler
    cartaCompromiso,
    fotosAlquiler,
    cantidadFotosAlquiler,
    referenciaBancariaAlquiler,
    cedulaArrendador,
    cedulaArrendatario,
    rifArrendador,
    rifArrendatario,
    // Plan Venezuela Renace
    rifViviendaDanos,
    fotosViviendaRenace,
    cantidadFotosRenace,
    sacosCemento,
    metrosArena,
    bloques,
    cabillas,
    pego,
  ]);

  const handleFechaNacimientoChange = (val: string) => {
    setFechaNacimiento(val);
    setEdad(computeEdad(val));
  };

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
        const p = data.persona;
        if (p.nombreApellido) setNombreApellido(p.nombreApellido);
        if (p.telefono) setTelefono(p.telefono);
        if (p.registroId) setRegistroId(p.registroId);
        if (p.refugio && (!refugio || refugio === "TODOS")) {
          setRefugio(p.refugio);
        }
        if (p.genero) {
          const g = String(p.genero).toUpperCase();
          if (g.startsWith("F")) setGenero("FEMENINO");
          else if (g.startsWith("M")) setGenero("MASCULINO");
        }
        if (p.fechaNacimiento) {
          const fn = String(p.fechaNacimiento).slice(0, 10);
          setFechaNacimiento(fn);
          setEdad(p.edad !== null && p.edad !== undefined ? String(p.edad) : computeEdad(fn));
        }

        const srcLabel =
          data.source === "censo"
            ? "censo del sistema"
            : data.source === "padron"
            ? "padrón electoral"
            : "data del REP / CNE";
        setLookupMessage(`Persona localizada en ${srcLabel}.`);
        showToast(`Datos autocompletados desde ${srcLabel}.`, "success");
      } else {
        // Fallback en cliente con api.cedula.com.ve / REP
        const ext = await fetchCedulaExterna("V", val);
        if (ext && ext.nombreApellido) {
          setNombreApellido(ext.nombreApellido);
          if (ext.genero) {
            const g = ext.genero.toUpperCase();
            if (g.startsWith("F")) setGenero("FEMENINO");
            else if (g.startsWith("M")) setGenero("MASCULINO");
          }
          if (ext.fechaNacimiento) {
            const fn = ext.fechaNacimiento.slice(0, 10);
            setFechaNacimiento(fn);
            setEdad(computeEdad(fn));
          }
          setLookupMessage("Persona localizada en la data del REP.");
          showToast("Datos autocompletados desde el REP.", "success");
        } else {
          setLookupMessage("No se encontró en el REP ni en el censo. Puedes ingresar los datos manualmente.");
          showToast("No encontrado en el REP. Completa los datos manualmente.", "info");
        }
      }
    } catch (e) {
      console.error(e);
      setLookupMessage("No se pudo consultar el censo. Ingresa los datos manualmente.");
    } finally {
      setSearchingCedula(false);
    }
  };

  const handleAddFamiliarRow = () => {
    const newId = crypto.randomUUID();
    const newRow: PlanteamientoCargaFamiliarItem = {
      id: newId,
      cedula: "",
      nombreApellido: "",
      parentesco: "Hijo",
      genero: "MASCULINO",
      fechaNacimiento: "",
      edad: null,
      telefono: "",
    };
    setCargaFamiliar((prev) => [...prev, newRow]);
    showToast("Nuevo renglón de familiar añadido.", "info");
  };

  const updateFamiliarRow = (id: string, updates: Partial<PlanteamientoCargaFamiliarItem>) => {
    setCargaFamiliar((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };

  const handleRowFechaNacimientoChange = (id: string, val: string) => {
    const calcAgeStr = computeEdad(val);
    const parsedAge = calcAgeStr ? parseInt(calcAgeStr, 10) : null;
    updateFamiliarRow(id, {
      fechaNacimiento: val,
      edad: parsedAge,
    });
  };

  const handleRemoveFamiliarRow = (id: string) => {
    setCargaFamiliar((prev) => prev.filter((row) => row.id !== id));
    setSearchingRows((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setRowMessages((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    showToast("Renglón de familiar eliminado.", "info");
  };

  const handleRowLookup = async (id: string, cedToLookup?: string) => {
    const row = cargaFamiliar.find((r) => r.id === id);
    if (!row) return;
    const val = (cedToLookup || row.cedula || "").replace(/\D/g, "");
    if (val.length < 4) {
      showToast("Ingresa una cédula válida de al menos 4 dígitos.", "warning");
      return;
    }

    setSearchingRows((prev) => ({ ...prev, [id]: true }));
    setRowMessages((prev) => ({ ...prev, [id]: "" }));

    try {
      const res = await apiFetch(`/api/planteamiento-sala/lookup?cedula=${encodeURIComponent(val)}`);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.found && data?.persona) {
        const p = data.persona;
        const updates: Partial<PlanteamientoCargaFamiliarItem> = {};
        if (p.nombreApellido) updates.nombreApellido = p.nombreApellido;
        if (p.telefono && !row.telefono) updates.telefono = p.telefono;
        if (p.genero) {
          const g = String(p.genero).toUpperCase();
          if (g.startsWith("F")) updates.genero = "FEMENINO";
          else if (g.startsWith("M")) updates.genero = "MASCULINO";
        }
        if (p.fechaNacimiento) {
          const fn = String(p.fechaNacimiento).slice(0, 10);
          updates.fechaNacimiento = fn;
          const computed = computeEdad(fn);
          updates.edad = p.edad !== null && p.edad !== undefined ? p.edad : computed ? parseInt(computed, 10) : null;
        }

        updateFamiliarRow(id, updates);

        const srcLabel =
          data.source === "censo"
            ? "censo del sistema"
            : data.source === "padron"
            ? "padrón electoral"
            : "data del REP / CNE";
        setRowMessages((prev) => ({ ...prev, [id]: `Familiar localizado en ${srcLabel}.` }));
        showToast(`Familiar autocompletado desde ${srcLabel}.`, "success");
      } else {
        // Fallback en cliente con api.cedula.com.ve / REP
        const ext = await fetchCedulaExterna("V", val);
        if (ext && ext.nombreApellido) {
          const updates: Partial<PlanteamientoCargaFamiliarItem> = {
            nombreApellido: ext.nombreApellido,
          };
          if (ext.genero) {
            const g = ext.genero.toUpperCase();
            if (g.startsWith("F")) updates.genero = "FEMENINO";
            else if (g.startsWith("M")) updates.genero = "MASCULINO";
          }
          if (ext.fechaNacimiento) {
            const fn = ext.fechaNacimiento.slice(0, 10);
            updates.fechaNacimiento = fn;
            const computed = computeEdad(fn);
            updates.edad = computed ? parseInt(computed, 10) : null;
          }
          updateFamiliarRow(id, updates);
          setRowMessages((prev) => ({ ...prev, [id]: "Familiar localizado en data del REP." }));
          showToast("Familiar autocompletado desde el REP.", "success");
        } else {
          setRowMessages((prev) => ({ ...prev, [id]: "No se encontró en el REP. Completa los datos manualmente." }));
          showToast("Familiar no encontrado en REP. Completa los datos manualmente.", "info");
        }
      }
    } catch (e) {
      console.error(e);
      setRowMessages((prev) => ({ ...prev, [id]: "No se pudo consultar el REP." }));
    } finally {
      setSearchingRows((prev) => ({ ...prev, [id]: false }));
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

    // Filtrar renglones que tengan al menos cédula o nombre
    const validCargaFamiliar = cargaFamiliar
      .map((fam) => ({
        id: fam.id || crypto.randomUUID(),
        cedula: (fam.cedula || "").replace(/\D/g, ""),
        nombreApellido: (fam.nombreApellido || "").trim().toUpperCase(),
        parentesco: (fam.parentesco || "Otro").trim(),
        genero: fam.genero || null,
        fechaNacimiento: fam.fechaNacimiento ? fam.fechaNacimiento.slice(0, 10) : null,
        edad: fam.edad != null && !isNaN(Number(fam.edad)) ? Number(fam.edad) : null,
        telefono: fam.telefono ? fam.telefono.trim() : null,
      }))
      .filter((fam) => fam.cedula || fam.nombreApellido);

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        refugio,
        refugioId,
        cedula: cleanCedula,
        nombreApellido,
        telefono,
        genero: genero || null,
        fechaNacimiento: fechaNacimiento || null,
        edad: edad ? parseInt(edad, 10) : null,
        cargaFamiliar: validCargaFamiliar,
        fechaEntregaCarpeta: fechaEntregaCarpeta || new Date().toISOString().slice(0, 10),
        fechaEntregaSubsidio: estatus === "CREDITO ENTREGADO" ? (fechaEntregaSubsidio || new Date().toISOString().slice(0, 10)) : null,
        registroId,
        tipoOpcion,
        estatus,
        observacion,
      };

      if (itemToEdit?.id) {
        payload.id = itemToEdit.id;
      }

      if (tipoOpcion === "MERCADO_SECUNDARIO") {
        payload.planillaCaracterizacion = planillaCaracterizacion;
        payload.cedulaCatastral = cedulaCatastral;
        payload.tituloCasa = tituloCasa;
        payload.referenciaBancariaVendedor = referenciaBancariaVendedor;
        payload.qrHabitatVivienda = qrHabitatVivienda;
        payload.cedulaVendedor = cedulaVendedor;
        payload.cedulaComprador = cedulaComprador;
        payload.fotosVivienda = fotosVivienda;
        payload.cantidadFotos = parseInt(cantidadFotos || "0", 10) || 0;
        payload.vendedorPoseePatria = vendedorPoseePatria;
        payload.qrColapsoVivienda = qrColapsoVivienda;
      } else if (tipoOpcion === "ALQUILER") {
        payload.cartaCompromiso = cartaCompromiso;
        payload.fotosAlquiler = fotosAlquiler;
        payload.cantidadFotosAlquiler = parseInt(cantidadFotosAlquiler || "0", 10) || 0;
        payload.referenciaBancariaAlquiler = referenciaBancariaAlquiler;
        payload.cedulaArrendador = cedulaArrendador;
        payload.cedulaArrendatario = cedulaArrendatario;
        payload.rifArrendador = rifArrendador;
        payload.rifArrendatario = rifArrendatario;
      } else if (tipoOpcion === "PLAN_VENEZUELA_RENACE") {
        payload.rifViviendaDanos = rifViviendaDanos;
        payload.fotosViviendaRenace = fotosViviendaRenace;
        payload.cantidadFotosRenace = parseInt(cantidadFotosRenace || "0", 10) || 0;
        payload.sacosCemento = parseInt(sacosCemento || "0", 10) || 0;
        payload.metrosArena = parseFloat(metrosArena || "0") || 0;
        payload.bloques = parseInt(bloques || "0", 10) || 0;
        payload.cabillas = parseInt(cabillas || "0", 10) || 0;
        payload.pego = parseInt(pego || "0", 10) || 0;
      }

      const res = await apiFetch("/api/planteamiento-sala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const currentOpcionMeta =
    TIPO_OPCION_PLANTEAMIENTO_OPTIONS.find((o) => o.value === tipoOpcion) ||
    TIPO_OPCION_PLANTEAMIENTO_OPTIONS[0];

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
        style={{ maxWidth: "700px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="modal-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
              {itemToEdit ? "Editar Planteamiento" : "Cargar Persona en Planteamiento Sala"}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Gestión de expedientes con checklist dinámico según la modalidad habitacional seleccionada.
            </p>
          </div>
          <button
            type="button"
            className="toolbar-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{ width: "32px", height: "32px", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Progreso de Requisitos: <b>{cumplidos} de {total}</b>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: currentOpcionMeta.bg,
                  color: currentOpcionMeta.color,
                  border: `1px solid ${currentOpcionMeta.border}`,
                }}
              >
                {currentOpcionMeta.shortLabel}
              </span>
            </div>
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
          {/* SECCIÓN 1: Información de la Persona y Modalidad */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div className="detail-section-title" style={{ marginBottom: "0.75rem" }}>
              Información de la Persona y Modalidad
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

              {/* Selector de Tipo de Opción */}
              <div className="form-group">
                <label>Tipo de Opción (Modalidad)</label>
                <StyledSelect
                  value={tipoOpcion}
                  onChange={(v) => setTipoOpcion(v as TipoOpcionPlanteamiento)}
                  ariaLabel="Tipo de Opción"
                  options={TIPO_OPCION_PLANTEAMIENTO_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
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

              <div className="form-group">
                <label>Género</label>
                <StyledSelect
                  value={genero}
                  onChange={(v) => setGenero(v as "MASCULINO" | "FEMENINO" | "")}
                  ariaLabel="Género"
                  placeholder="Seleccionar…"
                  options={[
                    { value: "MASCULINO", label: "MASCULINO" },
                    { value: "FEMENINO", label: "FEMENINO" },
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Fecha de Nacimiento</label>
                <input
                  type="date"
                  value={fechaNacimiento}
                  onChange={(e) => handleFechaNacimientoChange(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>

              <div className="form-group">
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Edad</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                    (Auto-calculada)
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="130"
                  placeholder="Ej. 35"
                  value={edad}
                  onChange={(e) => setEdad(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              <div className="form-group">
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Fecha de Entrega de Carpeta</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                    (Fecha de Carga)
                  </span>
                </label>
                <input
                  type="date"
                  value={fechaEntregaCarpeta}
                  onChange={(e) => setFechaEntregaCarpeta(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  required
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

            {/* SECCIÓN CARGA FAMILIAR POR ÍTEM / RENGLÓN */}
            <div
              style={{
                marginTop: "1.25rem",
                background: "var(--bg-secondary)",
                border: cargaFamiliar.length > 0 ? "1.5px solid #2563eb" : "1px solid var(--border-color)",
                borderRadius: "14px",
                padding: "1rem 1.15rem",
                transition: "all 0.2s ease",
              }}
            >
              {/* Barra / Cabecera con botón de acción item */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: cargaFamiliar.length > 0 ? "rgba(37,99,235,0.12)" : "rgba(0,0,0,0.05)",
                      color: cargaFamiliar.length > 0 ? "#2563eb" : "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: "0.98rem", color: "var(--text-primary)" }}>
                        Carga Familiar
                      </span>
                      {cargaFamiliar.length > 0 ? (
                        <span
                          style={{
                            background: "#2563eb",
                            color: "#fff",
                            fontSize: "0.72rem",
                            padding: "2px 9px",
                            borderRadius: "999px",
                            fontWeight: 700,
                          }}
                        >
                          {cargaFamiliar.length} {cargaFamiliar.length === 1 ? "familiar cargado" : "familiares cargados"}
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "rgba(0,0,0,0.06)",
                            color: "var(--text-secondary)",
                            fontSize: "0.72rem",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            fontWeight: 600,
                          }}
                        >
                          Opcional
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Haga clic en el botón para agregar un renglón por cada familiar y vincularlo con la data del CNE.
                    </p>
                  </div>
                </div>

                {/* Botón ítem para agregar renglón */}
                <button
                  type="button"
                  className="toolbar-btn"
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "0.84rem",
                    padding: "0.45rem 1.1rem",
                    borderRadius: "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 2px 5px rgba(37,99,235,0.25)",
                    cursor: "pointer",
                  }}
                  onClick={handleAddFamiliarRow}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Agregar Familiar</span>
                </button>
              </div>

              {/* Renglones de familiares agregados */}
              {cargaFamiliar.length === 0 ? (
                <div
                  style={{
                    marginTop: "0.9rem",
                    padding: "1rem",
                    textAlign: "center",
                    background: "var(--bg-primary)",
                    borderRadius: "10px",
                    border: "1px dashed var(--border-color)",
                    color: "var(--text-secondary)",
                    fontSize: "0.82rem",
                  }}
                >
                  No posee carga familiar agregada en este momento. Si la persona tiene carga familiar, presione <b>Agregar Familiar</b> para desplegar los renglones correspondientes.
                </div>
              ) : (
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {cargaFamiliar.map((fam, idx) => {
                    const isSearching = Boolean(searchingRows[fam.id]);
                    const msg = rowMessages[fam.id];

                    return (
                      <div
                        key={fam.id}
                        style={{
                          background: "var(--bg-primary)",
                          border: "1.5px solid var(--border-color)",
                          borderRadius: "12px",
                          padding: "1rem 1.15rem",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                        }}
                      >
                        {/* Cabecera del Renglón */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "0.85rem",
                            paddingBottom: "0.6rem",
                            borderBottom: "1px solid var(--border-color)",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span
                              style={{
                                background: "#eff6ff",
                                color: "#2563eb",
                                fontWeight: 800,
                                fontSize: "0.76rem",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                border: "1px solid rgba(37,99,235,0.2)",
                              }}
                            >
                              Familiar #{idx + 1}
                            </span>
                            <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                              {fam.nombreApellido ? fam.nombreApellido : "Nuevo Renglón de Familiar"}
                            </span>
                            {fam.parentesco && (
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  padding: "1px 8px",
                                  borderRadius: "999px",
                                  background: "rgba(37,99,235,0.1)",
                                  color: "#2563eb",
                                }}
                              >
                                {fam.parentesco}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            className="toolbar-btn"
                            style={{
                              color: "#dc2626",
                              padding: "4px 10px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              borderRadius: "6px",
                              border: "1px solid rgba(220,38,38,0.25)",
                              background: "rgba(220,38,38,0.06)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            onClick={() => handleRemoveFamiliarRow(fam.id)}
                            title="Eliminar este renglón de familiar"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            <span>Quitar Familiar</span>
                          </button>
                        </div>

                        {/* BARRA PARA ESPECIFICAR QUÉ TIPO DE FAMILIAR ES */}
                        <div style={{ marginBottom: "0.85rem" }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              marginBottom: "6px",
                              color: "var(--text-secondary)",
                              textTransform: "uppercase",
                              letterSpacing: "0.3px",
                            }}
                          >
                            Especificar Tipo de Familiar:
                          </label>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "5px",
                              background: "var(--bg-secondary)",
                              padding: "6px",
                              borderRadius: "10px",
                              border: "1px solid var(--border-color)",
                            }}
                          >
                            {TIPO_FAMILIAR_OPTIONS.map((tipo) => {
                              const isSelected = (fam.parentesco || "").toUpperCase() === tipo.toUpperCase();
                              return (
                                <button
                                  key={tipo}
                                  type="button"
                                  onClick={() => {
                                    let newGen = fam.genero;
                                    if (["Esposa", "Hermana", "Hija", "Nieta"].includes(tipo)) {
                                      newGen = "FEMENINO";
                                    } else if (["Esposo", "Hermano", "Hijo", "Nieto"].includes(tipo)) {
                                      newGen = "MASCULINO";
                                    }
                                    updateFamiliarRow(fam.id, { parentesco: tipo, genero: newGen });
                                  }}
                                  style={{
                                    border: isSelected ? "1px solid #2563eb" : "1px solid transparent",
                                    background: isSelected ? "#2563eb" : "var(--bg-primary)",
                                    color: isSelected ? "#ffffff" : "var(--text-primary)",
                                    fontWeight: isSelected ? 700 : 500,
                                    fontSize: "0.78rem",
                                    padding: "5px 12px",
                                    borderRadius: "7px",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    boxShadow: isSelected ? "0 1px 3px rgba(37,99,235,0.3)" : "none",
                                  }}
                                >
                                  {tipo}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* CAMPOS DE DATOS PERSONALES DEL FAMILIAR */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.75rem" }}>
                          {/* Cédula */}
                          <div className="form-group">
                            <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Cédula de Identidad</label>
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              <input
                                type="text"
                                placeholder="Ej. 25123456"
                                value={fam.cedula || ""}
                                onChange={(e) => updateFamiliarRow(fam.id, { cedula: e.target.value.replace(/\D/g, "") })}
                                onBlur={() => {
                                  if ((fam.cedula || "").length >= 4 && !fam.nombreApellido) {
                                    handleRowLookup(fam.id);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="toolbar-btn"
                                onClick={() => handleRowLookup(fam.id)}
                                disabled={isSearching}
                                style={{ flexShrink: 0, padding: "0 0.75rem", fontSize: "0.76rem" }}
                                title="Buscar en CNE / REP"
                              >
                                {isSearching ? "…" : "Buscar CNE"}
                              </button>
                            </div>
                          </div>

                          {/* Nombre y Apellido */}
                          <div className="form-group">
                            <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nombre y Apellido</label>
                            <input
                              type="text"
                              placeholder="Nombre completo"
                              value={fam.nombreApellido || ""}
                              onChange={(e) => updateFamiliarRow(fam.id, { nombreApellido: e.target.value.toUpperCase() })}
                            />
                          </div>

                          {/* Género */}
                          <div className="form-group">
                            <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Género</label>
                            <StyledSelect
                              value={fam.genero || ""}
                              onChange={(v) => updateFamiliarRow(fam.id, { genero: v as "MASCULINO" | "FEMENINO" | "" })}
                              ariaLabel="Género del familiar"
                              placeholder="Seleccionar…"
                              options={[
                                { value: "MASCULINO", label: "MASCULINO" },
                                { value: "FEMENINO", label: "FEMENINO" },
                              ]}
                            />
                          </div>

                          {/* Fecha de Nacimiento */}
                          <div className="form-group">
                            <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Fecha de Nacimiento</label>
                            <input
                              type="date"
                              value={fam.fechaNacimiento || ""}
                              onChange={(e) => handleRowFechaNacimientoChange(fam.id, e.target.value)}
                              max={new Date().toISOString().slice(0, 10)}
                            />
                          </div>

                          {/* Edad */}
                          <div className="form-group">
                            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", fontWeight: 600 }}>
                              <span>Edad</span>
                              <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                                (Auto-calculada)
                              </span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="130"
                              placeholder="Ej. 24"
                              value={fam.edad != null ? String(fam.edad) : ""}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "");
                                updateFamiliarRow(fam.id, { edad: v ? parseInt(v, 10) : null });
                              }}
                            />
                          </div>

                          {/* Teléfono */}
                          <div className="form-group">
                            <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Teléfono (opcional)</label>
                            <input
                              type="text"
                              placeholder="Ej. 04121234567"
                              value={fam.telefono || ""}
                              onChange={(e) => updateFamiliarRow(fam.id, { telefono: e.target.value })}
                            />
                          </div>
                        </div>

                        {msg && (
                          <p
                            style={{
                              margin: "0.6rem 0 0",
                              fontSize: "0.76rem",
                              color: msg.includes("localizado") || msg.includes("Localizado")
                                ? "var(--color-success)"
                                : "var(--text-secondary)",
                            }}
                          >
                            {msg}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Botón inferior para agregar otro familiar */}
                  <div style={{ display: "flex", justifyContent: "center", marginTop: "0.3rem" }}>
                    <button
                      type="button"
                      className="toolbar-btn"
                      style={{
                        background: "var(--bg-secondary)",
                        border: "1.5px dashed #2563eb",
                        color: "#2563eb",
                        fontWeight: 700,
                        fontSize: "0.84rem",
                        padding: "0.6rem 1.4rem",
                        borderRadius: "10px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                      }}
                      onClick={handleAddFamiliarRow}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>Agregar Otro Familiar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN 2: Requisitos según Modalidad */}

          {/* CASO A: MERCADO SECUNDARIO (9 REQUISITOS) */}
          {tipoOpcion === "MERCADO_SECUNDARIO" && (
            <div style={{ marginBottom: "1.25rem" }}>
              <div
                className="detail-section-title"
                style={{
                  marginBottom: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Requisitos: Mercado Secundario (10)</span>
                <span style={{ fontSize: "0.75rem", color: "#2563eb", fontWeight: 700 }}>
                  Expediente de Compra / Venta
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
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

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>3. Título de Casa</label>
                  <StyledSelect
                    value={tituloCasa}
                    onChange={(v) => setTituloCasa(v as TituloCasaTipo)}
                    ariaLabel="Título de Casa"
                    options={TITULO_CASA_OPTIONS}
                  />
                </div>

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

                <div className="form-group">
                  <label>10. QR de Colapso de vivienda</label>
                  <StyledSelect
                    value={qrColapsoVivienda}
                    onChange={(v) => setQrColapsoVivienda(v as "SI" | "NO")}
                    ariaLabel="QR de Colapso de vivienda"
                    options={[
                      { value: "SI", label: "Sí posee" },
                      { value: "NO", label: "No posee" },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}

          {/* CASO B: ALQUILER (7 REQUISITOS) */}
          {tipoOpcion === "ALQUILER" && (
            <div style={{ marginBottom: "1.25rem" }}>
              <div
                className="detail-section-title"
                style={{
                  marginBottom: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Requisitos: Alquiler (7)</span>
                <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 700 }}>
                  Expediente de Arrendamiento
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
                <div className="form-group">
                  <label>1. Carta de compromiso</label>
                  <StyledSelect
                    value={cartaCompromiso}
                    onChange={(v) => setCartaCompromiso(v as "SI" | "NO")}
                    ariaLabel="Carta de compromiso"
                    options={[
                      { value: "SI", label: "Sí posee" },
                      { value: "NO", label: "No posee" },
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label>2. Fotos del alquiler</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <div style={{ flex: 1 }}>
                      <StyledSelect
                        value={fotosAlquiler}
                        onChange={(v) => setFotosAlquiler(v as "SI" | "NO")}
                        ariaLabel="Fotos del alquiler"
                        options={[
                          { value: "SI", label: "Sí posee" },
                          { value: "NO", label: "No posee" },
                        ]}
                      />
                    </div>
                    {fotosAlquiler === "SI" && (
                      <input
                        type="number"
                        min="1"
                        max="99"
                        placeholder="Cant."
                        value={cantidadFotosAlquiler}
                        onChange={(e) => setCantidadFotosAlquiler(e.target.value.replace(/\D/g, ""))}
                        style={{ width: "80px", flexShrink: 0 }}
                        title="Cantidad de fotos de alquiler"
                      />
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>3. Referencia bancaria del que alquila</label>
                  <StyledSelect
                    value={referenciaBancariaAlquiler}
                    onChange={(v) => setReferenciaBancariaAlquiler(v as "SI" | "NO")}
                    ariaLabel="Referencia bancaria del que alquila"
                    options={[
                      { value: "SI", label: "Sí posee" },
                      { value: "NO", label: "No posee" },
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label>4. Cédula de identidad del arrendador</label>
                  <StyledSelect
                    value={cedulaArrendador}
                    onChange={(v) => setCedulaArrendador(v as "SI" | "NO")}
                    ariaLabel="Cédula de identidad del arrendador"
                    options={[
                      { value: "SI", label: "Sí posee" },
                      { value: "NO", label: "No posee" },
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label>5. Cédula de identidad del arrendatario</label>
                  <StyledSelect
                    value={cedulaArrendatario}
                    onChange={(v) => setCedulaArrendatario(v as "SI" | "NO")}
                    ariaLabel="Cédula de identidad del arrendatario"
                    options={[
                      { value: "SI", label: "Sí posee" },
                      { value: "NO", label: "No posee" },
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label>6. RIF del arrendador</label>
                  <StyledSelect
                    value={rifArrendador}
                    onChange={(v) => setRifArrendador(v as "SI" | "NO")}
                    ariaLabel="RIF del arrendador"
                    options={[
                      { value: "SI", label: "Sí posee" },
                      { value: "NO", label: "No posee" },
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label>7. RIF del arrendatario</label>
                  <StyledSelect
                    value={rifArrendatario}
                    onChange={(v) => setRifArrendatario(v as "SI" | "NO")}
                    ariaLabel="RIF del arrendatario"
                    options={[
                      { value: "SI", label: "Sí posee" },
                      { value: "NO", label: "No posee" },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}

          {/* CASO C: PLAN VENEZUELA RENACE */}
          {tipoOpcion === "PLAN_VENEZUELA_RENACE" && (
            <div style={{ marginBottom: "1.25rem" }}>
              <div
                className="detail-section-title"
                style={{
                  marginBottom: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Requisitos: Plan Venezuela Renace</span>
                <span style={{ fontSize: "0.75rem", color: "#7c3aed", fontWeight: 700 }}>
                  Rehabilitación y Materiales
                </span>
              </div>

              {/* Documentos básicos */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div className="form-group">
                  <label>1. RIF de la Vivienda con daños</label>
                  <StyledSelect
                    value={rifViviendaDanos}
                    onChange={(v) => setRifViviendaDanos(v as "SI" | "NO")}
                    ariaLabel="RIF de la vivienda con daños"
                    options={[
                      { value: "SI", label: "Sí posee" },
                      { value: "NO", label: "No posee" },
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label>2. Fotos de la vivienda</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <div style={{ flex: 1 }}>
                      <StyledSelect
                        value={fotosViviendaRenace}
                        onChange={(v) => setFotosViviendaRenace(v as "SI" | "NO")}
                        ariaLabel="Fotos de la vivienda renace"
                        options={[
                          { value: "SI", label: "Sí posee" },
                          { value: "NO", label: "No posee" },
                        ]}
                      />
                    </div>
                    {fotosViviendaRenace === "SI" && (
                      <input
                        type="number"
                        min="1"
                        max="99"
                        placeholder="Cant."
                        value={cantidadFotosRenace}
                        onChange={(e) => setCantidadFotosRenace(e.target.value.replace(/\D/g, ""))}
                        style={{ width: "80px", flexShrink: 0 }}
                        title="Cantidad de fotos de la vivienda"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Sub-tarjeta de Insumos y Materiales */}
              <div
                style={{
                  background: "rgba(124, 58, 237, 0.04)",
                  border: "1px dashed rgba(124, 58, 237, 0.3)",
                  borderRadius: "14px",
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.75rem" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b21a8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#6b21a8" }}>
                    Materiales e Insumos Solicitados
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "0.75rem",
                  }}
                >
                  <div className="form-group">
                    <label style={{ fontSize: "0.78rem" }}>Sacos de cemento</label>
                    <input
                      type="number"
                      min="0"
                      value={sacosCemento}
                      onChange={(e) => setSacosCemento(e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: "0.78rem" }}>Metros de arena</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={metrosArena}
                      onChange={(e) => setMetrosArena(e.target.value)}
                      placeholder="0.0"
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: "0.78rem" }}>Bloques</label>
                    <input
                      type="number"
                      min="0"
                      value={bloques}
                      onChange={(e) => setBloques(e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: "0.78rem" }}>Cabillas</label>
                    <input
                      type="number"
                      min="0"
                      value={cabillas}
                      onChange={(e) => setCabillas(e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: "0.78rem" }}>Pego</label>
                    <input
                      type="number"
                      min="0"
                      value={pego}
                      onChange={(e) => setPego(e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECCIÓN 3: Estatus y Observación */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div className="detail-section-title" style={{ marginBottom: "0.75rem" }}>
              Estatus y Observación del Expediente
            </div>

            <div className="form-group" style={{ marginBottom: "0.75rem" }}>
              <label>Estatus del Expediente</label>
              <StyledSelect
                value={estatus}
                onChange={(v) => {
                  const newStat = v as PlanteamientoSalaEstatus;
                  setEstatus(newStat);
                  if (newStat === "CREDITO ENTREGADO" && !fechaEntregaSubsidio) {
                    setFechaEntregaSubsidio(new Date().toISOString().slice(0, 10));
                  }
                }}
                ariaLabel="Estatus"
                options={ESTATUS_SALA_OPTIONS.map((e) => ({ value: e.value, label: e.label }))}
              />
            </div>

            {estatus === "CREDITO ENTREGADO" && (
              <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Fecha de Entrega de Subsidio</span>
                  <span style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 700 }}>
                    (Crédito Entregado)
                  </span>
                </label>
                <input
                  type="date"
                  value={fechaEntregaSubsidio || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setFechaEntregaSubsidio(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
            )}

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
