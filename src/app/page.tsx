"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import CustomSelect from "@/components/CustomSelect";
import { 
  saveLocal, 
  getPending, 
  getAllLocal, 
  markSynced, 
  incrementAttempt, 
  isPadronCargado,
  clearLocalPadron,
  cargarPadronEnCliente,
  buscarCedulaEnCliente,
  getLocalPadronCount,
  LocalRegistro 
} from "@/lib/db";

// Parroquias de La Guaira y Caracas
const PARROQUIAS = [
  "EL JUNKO",
  "CARAYACA",
  "CATIA LA MAR",
  "URIMARE",
  "CARLOS SOUBLETTE",
  "MAIQUETIA",
  "LA GUAIRA",
  "MACUTO",
  "CARABALLEDA",
  "NAIGUATA",
  "CARUAO",
  "CARACAS"
];

// Helper to hash password on client side (SHA-256) for offline fallback authentication
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function Home() {
  // Connection state
  const [isOnline, setIsOnline] = useState<boolean>(true);
  
  // Theme state
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Electoral Padron States
  const [votersCount, setVotersCount] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "downloading" | "saving" | "completed" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncTotal, setSyncTotal] = useState<number>(0);

  // Auth States
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; nombre: string; role: string } | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);

  // Tab View Routing State
  const [activeTab, setActiveTab] = useState<"censo" | "dashboard" | "usuarios" | "config">("censo");

  // Dashboard Stats States
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // User Management State (Admin only)
  const [userForm, setUserForm] = useState({
    nombre: "",
    email: "",
    password: "",
    role: "REGISTRADOR"
  });
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    parroquia: "",
    sector: "",
    comunidad: "",
    direccionExacta: "",
    nacionalidad: "V",
    cedula: "",
    nombreApellido: "",
    genero: "",
    fechaNacimiento: "",
    edad: "",
    perteneceNucleo: "",
    jefeFamilia: "",
    cedulaJefeFamilia: "",
    estadoFisico: "",
    patologia: "",
    patologiaDescripcion: "",
    telefonoCod: "0412",
    telefonoNum: ""
  });

  // Client Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});

  // GPS state
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  // Offline queue local records
  const [localRecords, setLocalRecords] = useState<LocalRegistro[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncQueueProgress, setSyncQueueProgress] = useState<{ done: number; total: number } | null>(null);

  // QR Transfer Modal States
  const [qrCodes, setQrCodes] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "warning" } | null>(null);

  // Cédula local database lookup status
  const [lookupStatus, setLookupStatus] = useState<"idle" | "searching" | "found" | "not-found">("idle");
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync guard: useRef avoids stale-closure bug in setInterval (useState value is frozen in the closure)
  const isSyncingRef = useRef<boolean>(false);

  // Stats cache guard: avoid redundant fetches if last one was < 30s ago
  const lastStatsFetchRef = useRef<number>(0);

  // Initialize online status, theme, user session, local padrón count, GPS and local queue on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      
      // Load user session
      const savedUser = localStorage.getItem("sismo_operator");
      if (savedUser) {
        try {
          setCurrentUser(JSON.parse(savedUser));
        } catch (e) {
          localStorage.removeItem("sismo_operator");
        }
      }

      // Load theme
      const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
      const initialTheme = savedTheme || "dark";
      setTheme(initialTheme);
      document.documentElement.setAttribute("data-theme", initialTheme);

      const handleOnline = () => {
        setIsOnline(true);
        showToast("Conexión restablecida. Sincronizando...", "success");
        triggerSync();
        if (currentUser) {
          fetchStats();
          if (currentUser.role === "ADMIN") fetchUsers();
        }
      };
      
      const handleOffline = () => {
        setIsOnline(false);
        showToast("Sin conexión. Trabajando en modo local offline.", "warning");
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      
      // Get current local voters count in IndexedDB
      refreshVotersCount();

      // Retrieve GPS coordinates immediately
      initGPS();

      refreshLocalRecords();

      // Trigger automatic sync on mount
      triggerSync();

      const interval = setInterval(() => {
        if (navigator.onLine) {
          triggerSync();
        }
      }, 15000);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        clearInterval(interval);
      };
    }
  }, []);

  // Fetch Dashboard Stats and Users when active tab changes
  useEffect(() => {
    if (currentUser) {
      if (activeTab === "dashboard") {
        fetchStats();
      } else if (activeTab === "usuarios" && currentUser.role === "ADMIN") {
        fetchUsers();
      }
    }
  }, [activeTab, currentUser]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
  };

  const refreshVotersCount = async () => {
    const count = await getLocalPadronCount();
    setVotersCount(count);
  };

  // Initialize GPS coords capture
  const initGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn("Error al obtener coordenadas GPS:", error.message);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  // Helper to show temporary toasts
  const showToast = (message: string, type: "success" | "info" | "warning") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Get records list from IndexedDB to show history and sync progress
  const refreshLocalRecords = async () => {
    const records = await getAllLocal();
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setLocalRecords(records);
  };

  // Sync execution engine — controlled concurrency (batch of 2) for resilience on weak networks.
  // Fully parallel risks saturating a 2G/3G link and failing all records at once;
  // batch-of-2 keeps bandwidth manageable while still being faster than purely sequential.
  const triggerSync = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const pending = await getPending();
      if (pending.length === 0) return;

      const BATCH = 2;
      setSyncQueueProgress({ done: 0, total: pending.length });

      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);

        const results = await Promise.allSettled(
          batch.map(record =>
            fetch("/api/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(record.data)
            })
          )
        );

        await Promise.allSettled(
          results.map(async (result, j) => {
            const record = batch[j];
            if (result.status === "rejected") {
              await incrementAttempt(record.id);
              return;
            }
            const res = result.value;
            if (res.status === 201) {
              await markSynced(record.id, "registrado");
            } else if (res.status === 409) {
              await markSynced(record.id, "duplicado");
            } else {
              await incrementAttempt(record.id);
            }
          })
        );

        setSyncQueueProgress({ done: Math.min(i + BATCH, pending.length), total: pending.length });
      }

      await refreshLocalRecords();
    } catch (e) {
      console.error("Error en el ciclo de sincronización:", e);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      setSyncQueueProgress(null);
    }
  };

  // Download entire padron in compressed format and write in batches
  const downloadFullPadron = async () => {
    if (!isOnline) {
      showToast("Se requiere conexión a internet para descargar el padrón.", "warning");
      return;
    }

    setSyncStatus("downloading");
    showToast("Descargando padrón electoral...", "info");

    try {
      const res = await fetch("/api/padron/download", { method: "POST" });
      if (!res.ok) throw new Error("Fallo al descargar padrón");

      const data = await res.json();
      setSyncTotal(data.length);
      setSyncStatus("saving");

      // Write in background batches to prevent browser lock
      await cargarPadronEnCliente(data, (insertedCount) => {
        setSyncProgress(insertedCount);
      });

      setSyncStatus("completed");
      showToast("Padrón electoral guardado exitosamente offline.", "success");
      await refreshVotersCount();

      // Reset progress after a short delay
      setTimeout(() => {
        setSyncStatus("idle");
        setSyncProgress(0);
        setSyncTotal(0);
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setSyncStatus("error");
      showToast("Error al descargar el padrón.", "warning");
      setTimeout(() => setSyncStatus("idle"), 5000);
    }
  };

  const deletePadronLocal = async () => {
    if (confirm("¿Estás seguro de borrar el padrón electoral local de este dispositivo?")) {
      try {
        await clearLocalPadron();
        await refreshVotersCount();
        showToast("Padrón local eliminado.", "info");
      } catch (err) {
        showToast("Error al borrar el padrón.", "warning");
      }
    }
  };

  // Fetch consolidated dashboard stats from Supabase
  const fetchStats = async (force = false) => {
    if (!navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastStatsFetchRef.current < 30_000) return;
    lastStatsFetchRef.current = now;
    setLoadingStats(true);
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Error al obtener estadísticas:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Fetch system users (Admin only)
  const fetchUsers = async () => {
    if (!currentUser || currentUser.role !== "ADMIN" || !navigator.onLine) return;
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/auth/users?adminId=${currentUser.id}`);
      const data = await res.json();
      if (data.success) {
        setSystemUsers(data.users);
      }
    } catch (err) {
      console.error("Error al listar usuarios:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // User Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError("Por favor ingrese correo y contraseña.");
      return;
    }

    setLoadingAuth(true);

    try {
      const pHash = await sha256(loginPassword);

      if (!navigator.onLine) {
        // Offline Auth Fallback: Check local credentials cached in localStorage
        const cachedStr = localStorage.getItem("sismo_cached_operators") || "[]";
        const cachedList = JSON.parse(cachedStr);
        const match = cachedList.find(
          (u: any) => u.email === loginEmail.trim().toLowerCase() && u.passwordHash === pHash
        );

        if (match) {
          const userSession = { id: match.id, email: match.email, nombre: match.nombre, role: match.role };
          setCurrentUser(userSession);
          localStorage.setItem("sismo_operator", JSON.stringify(userSession));
          showToast(`Sesión local iniciada: ${match.nombre}`, "success");
        } else {
          setLoginError("Credenciales inválidas sin conexión. Inicie sesión online primero.");
        }
        setLoadingAuth(false);
        return;
      }

      // Online Auth: API Call
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Fallo en la autenticación.");
        setLoadingAuth(false);
        return;
      }

      if (data.success && data.user) {
        setCurrentUser(data.user);
        localStorage.setItem("sismo_operator", JSON.stringify(data.user));

        // Save credential hash locally for offline fallback authentication
        const cachedStr = localStorage.getItem("sismo_cached_operators") || "[]";
        const cachedList = JSON.parse(cachedStr);
        const filtered = cachedList.filter((u: any) => u.email !== data.user.email);
        filtered.push({
          id: data.user.id,
          email: data.user.email,
          nombre: data.user.nombre,
          role: data.user.role,
          passwordHash: pHash
        });
        localStorage.setItem("sismo_cached_operators", JSON.stringify(filtered));

        showToast(`Sesión iniciada: ${data.user.nombre}.`, "success");
        setLoginEmail("");
        setLoginPassword("");
      }
    } catch (err) {
      console.error(err);
      setLoginError("Error de red al intentar iniciar sesión.");
    } finally {
      setLoadingAuth(false);
    }
  };

  // Logout Handler
  const handleLogout = () => {
    localStorage.removeItem("sismo_operator");
    setCurrentUser(null);
    setActiveTab("censo");
    showToast("Sesión cerrada.", "info");
  };

  // Admin Create User Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserErrors({});

    if (!currentUser || currentUser.role !== "ADMIN") return;

    // Validation
    const errs: Record<string, string> = {};
    if (!userForm.nombre.trim()) errs.nombre = "El nombre es obligatorio.";
    if (!userForm.email.trim()) {
      errs.email = "El correo es obligatorio.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email)) {
      errs.email = "El correo no es válido.";
    }
    if (!userForm.password) {
      errs.password = "La contraseña es obligatoria.";
    } else if (userForm.password.length < 6) {
      errs.password = "La contraseña debe tener al menos 6 caracteres.";
    }

    if (Object.keys(errs).length > 0) {
      setUserErrors(errs);
      return;
    }

    if (!isOnline) {
      showToast("Se requiere conexión a internet para registrar nuevos usuarios.", "warning");
      return;
    }

    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...userForm, adminId: currentUser.id })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Error al crear usuario.", "warning");
        return;
      }

      showToast("Usuario creado con éxito.", "success");
      setUserForm({
        nombre: "",
        email: "",
        password: "",
        role: "REGISTRADOR"
      });
      fetchUsers();
    } catch (err) {
      console.error(err);
      showToast("Error de conexión al guardar el usuario.", "warning");
    }
  };

  // Auto-calculate age from date of birth
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
      const val = formData[key as keyof typeof formData];
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
      setFormData(prev => ({ ...prev, [name]: cleanCedula }));
      
      const error = validateField("cedula", cleanCedula);
      setErrors(prev => ({ ...prev, cedula: error }));
      
      triggerLookup(cleanCedula);
      return;
    }

    if (name === "cedulaJefeFamilia") {
      const cleanVal = value.replace(/\D/g, "");
      setFormData(prev => ({ ...prev, [name]: cleanVal }));
      
      const error = validateField("cedulaJefeFamilia", cleanVal);
      setErrors(prev => ({ ...prev, cedulaJefeFamilia: error }));
      return;
    }

    // Formatted Date Input Mask (DD/MM/AAAA)
    if (name === "fechaNacimiento") {
      let rawVal = value.replace(/\D/g, "");
      let formatted = "";
      
      if (rawVal.length > 0) {
        formatted += rawVal.slice(0, 2);
      }
      if (rawVal.length > 2) {
        formatted += "/" + rawVal.slice(2, 4);
      }
      if (rawVal.length > 4) {
        formatted += "/" + rawVal.slice(4, 8);
      }
      
      setFormData(prev => {
        const updated = { ...prev, fechaNacimiento: formatted };
        
        // Calculate age on-the-fly once date is complete
        if (rawVal.length === 8) {
          const d = rawVal.slice(0, 2);
          const m = rawVal.slice(2, 4);
          const y = rawVal.slice(4, 8);
          updated.edad = handleDateChange(`${y}-${m}-${d}`);
        } else {
          updated.edad = "";
        }
        return updated;
      });

      const error = validateField("fechaNacimiento", formatted);
      setErrors(prev => ({ ...prev, fechaNacimiento: error }));
      return;
    }

    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      return updated;
    });

    const error = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: error }));
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

          setFormData(prev => ({
            ...prev,
            nombreApellido: citizen.nombreCompleto,
            genero: mappedGenero,
            fechaNacimiento: formattedDate,
            edad: handleDateChange(citizen.fechaNacimiento)
          }));
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

  // Submit Handler: Saves to IndexedDB first, then triggers sync
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast("Faltan campos obligatorios o poseen formato inválido.", "warning");
      
      // Auto-scroll smooth to first error field
      setTimeout(() => {
        const firstErrorEl = document.querySelector(".has-error");
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
          if (firstErrorEl instanceof HTMLInputElement || firstErrorEl instanceof HTMLTextAreaElement) {
            firstErrorEl.focus({ preventScroll: true });
          }
        }
      }, 50);
      return;
    }

    try {
      const finalCedula = `${formData.nacionalidad}-${formData.cedula}`;
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
          cedulaJefeFamilia: (formData.perteneceNucleo === "SI" && formData.jefeFamilia === "NO") 
            ? formData.cedulaJefeFamilia 
            : undefined,
          estadoFisico: formData.estadoFisico,
          patologia: formData.patologia,
          patologiaDescripcion: formData.patologia === "SI" ? formData.patologiaDescripcion.trim() : undefined,
          gpsLat: coords.lat !== null ? coords.lat : undefined,
          gpsLng: coords.lng !== null ? coords.lng : undefined,
          telefono: finalTelefono !== null ? finalTelefono : undefined
        }
      };

      await saveLocal(registroData);
      showToast("Registro guardado localmente.", "success");

      // Reset form fields
      setFormData(prev => ({
        ...prev,
        cedula: "",
        nombreApellido: "",
        genero: "",
        fechaNacimiento: "",
        edad: "",
        perteneceNucleo: "",
        jefeFamilia: "",
        cedulaJefeFamilia: "",
        estadoFisico: "",
        patologia: "",
        patologiaDescripcion: "",
        telefonoCod: "0412",
        telefonoNum: ""
      }));
      setLookupStatus("idle");
      
      await refreshLocalRecords();

      if (navigator.onLine) {
        triggerSync();
      }
    } catch (err) {
      showToast("Error al guardar en el dispositivo.", "warning");
      console.error(err);
    }
  };

  // EXPORT 1: JSON File Backup Download
  const handleExportJSON = async () => {
    const pending = await getPending();
    if (pending.length === 0) {
      showToast("No hay registros pendientes para respaldar.", "info");
      return;
    }

    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pending, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `respaldo-censo-pendientes-${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Copia de seguridad JSON descargada.", "success");
    } catch (err) {
      showToast("Error al exportar archivo JSON.", "warning");
    }
  };

  // EXPORT 2: Generate Offline QR Codes for pending records
  const handleGenerateQRs = async () => {
    const pending = await getPending();
    if (pending.length === 0) {
      showToast("No hay registros pendientes para generar QR.", "info");
      return;
    }

    try {
      const codes = await Promise.all(
        pending.map(async (record) => {
          const compressed = {
            id: record.id,
            p: record.data.parroquia,
            s: record.data.sector,
            c: record.data.comunidad,
            d: record.data.direccionExacta,
            n: record.data.nombreApellido,
            ci: record.data.cedula,
            jf: record.data.jefeFamilia,
            g: record.data.genero,
            fn: record.data.fechaNacimiento,
            e: record.data.edad,
            pn: record.data.perteneceNucleo,
            cj: record.data.cedulaJefeFamilia || null,
            ef: record.data.estadoFisico,
            pat: record.data.patologia,
            pd: record.data.patologiaDescripcion || null,
            lat: record.data.gpsLat || null,
            lng: record.data.gpsLng || null
          };

          const jsonStr = JSON.stringify(compressed);
          const qrUrl = await QRCode.toDataURL(jsonStr, { errorCorrectionLevel: "L", margin: 2 });
          
          return {
            id: record.id,
            name: record.data.nombreApellido,
            url: qrUrl
          };
        })
      );

      setQrCodes(codes);
      setShowQrModal(true);
    } catch (err) {
      console.error("Error al generar QR:", err);
      showToast("Error al generar códigos QR.", "warning");
    }
  };

  const pendingCount = localRecords.filter(r => r.status === "pending").length;

  // Local Offline statistics calculation helper
  const getLocalStats = () => {
    const total = localRecords.length;
    if (total === 0) {
      return {
        total: 0,
        menores: 0,
        adultos: 0,
        mayores: 0,
        matrix: {
          menores: { femenino: 0, masculino: 0, otro: 0 },
          adultos: { femenino: 0, masculino: 0, otro: 0 },
          mayores: { femenino: 0, masculino: 0, otro: 0 }
        },
        byParroquia: [],
        byGenero: [],
        byEstadoFisico: [],
        byPatologia: [],
        promedioEdad: 0
      };
    }

    const byParroquiaMap: Record<string, number> = {};
    const byGeneroMap: Record<string, number> = {};
    const byEstadoFisicoMap: Record<string, number> = {};
    const byPatologiaMap: Record<string, number> = {};
    let sumAge = 0;
    let menores = 0;
    let adultos = 0;
    let mayores = 0;

    const matrix = {
      menores: { femenino: 0, masculino: 0, otro: 0 },
      adultos: { femenino: 0, masculino: 0, otro: 0 },
      mayores: { femenino: 0, masculino: 0, otro: 0 }
    };

    localRecords.forEach(r => {
      const p = r.data.parroquia || "DESCONOCIDO";
      byParroquiaMap[p] = (byParroquiaMap[p] || 0) + 1;

      const g = r.data.genero || "DESCONOCIDO";
      byGeneroMap[g] = (byGeneroMap[g] || 0) + 1;

      const ef = r.data.estadoFisico || "DESCONOCIDO";
      byEstadoFisicoMap[ef] = (byEstadoFisicoMap[ef] || 0) + 1;

      const pat = r.data.patologia || "NO";
      byPatologiaMap[pat] = (byPatologiaMap[pat] || 0) + 1;

      const edadVal = parseInt(String(r.data.edad), 10);
      const gVal = String(r.data.genero || "").toUpperCase();
      const isFem = gVal === "FEMENINO";
      const isMasc = gVal === "MASCULINO";

      if (!isNaN(edadVal)) {
        sumAge += edadVal;
        if (edadVal < 18) {
          menores++;
          if (isFem) matrix.menores.femenino++;
          else if (isMasc) matrix.menores.masculino++;
          else matrix.menores.otro++;
        } else if (edadVal < 60) {
          adultos++;
          if (isFem) matrix.adultos.femenino++;
          else if (isMasc) matrix.adultos.masculino++;
          else matrix.adultos.otro++;
        } else {
          mayores++;
          if (isFem) matrix.mayores.femenino++;
          else if (isMasc) matrix.mayores.masculino++;
          else matrix.mayores.otro++;
        }
      }
    });

    const byParroquia = Object.keys(byParroquiaMap).map(name => ({ name, count: byParroquiaMap[name] }));
    const byGenero = Object.keys(byGeneroMap).map(name => ({ name, count: byGeneroMap[name] }));
    const byEstadoFisico = Object.keys(byEstadoFisicoMap).map(name => ({ name, count: byEstadoFisicoMap[name] }));
    const byPatologia = Object.keys(byPatologiaMap).map(name => ({ name, count: byPatologiaMap[name] }));
    const promedioEdad = Math.round(sumAge / total);

    return {
      total,
      menores,
      adultos,
      mayores,
      matrix,
      byParroquia,
      byGenero,
      byEstadoFisico,
      byPatologia,
      promedioEdad
    };
  };

  const currentStats = (isOnline && stats) ? stats : getLocalStats();

  // If user is not authenticated, show Login Screen
  if (!currentUser) {
    return (
      <div className="container">
        <div className="app-header" style={{ justifyContent: "center" }}>
          <div className="title-area" style={{ alignItems: "center" }}>
            <h1>REGISTRO DE AFECTADOS</h1>
            <p className="subtitle">Censo Sismológico PWA 100% Offline</p>
          </div>
        </div>

        <div className="login-container">
          <form onSubmit={handleLogin} className="login-card">
            <div className="login-header">
              <h2 className="login-title">Iniciar Sesión</h2>
              <p className="login-subtitle">Ingrese sus credenciales de operador para continuar.</p>
            </div>

            {loginError && <div className="login-error">{loginError}</div>}

            <div className="form-group">
              <label htmlFor="login-email">Correo Electrónico</label>
              <input
                type="email"
                id="login-email"
                placeholder="ej: operador@sismo.gob.ve"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Contraseña</label>
              <input
                type="password"
                id="login-password"
                placeholder="Contraseña"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-submit" disabled={loadingAuth}>
              {loadingAuth ? "Verificando..." : "Entrar al Sistema"}
            </button>

            <div className="login-info-box">
              <strong>Nota:</strong> Para el primer inicio de sesión se creará la cuenta administradora por defecto (<strong>admin@sismo.gob.ve</strong> / <strong>admin123456</strong>) si la base de datos se encuentra vacía. Requiere conexión.
            </div>
          </form>
        </div>

        {toast && (
          <div className="toast">
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    );
  }

  // Authenticated Dashboard Layout
  return (
    <div className="container">
      {/* App Header */}
      <div className="app-header">
        <div className="title-area">
          <h1>REGISTRO DE AFECTADOS</h1>
          <p className="subtitle">Censo Sismológico PWA - Venezuela 2026</p>
        </div>
        <button 
          type="button"
          onClick={toggleTheme} 
          className="theme-toggle-btn"
          title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
        >
          {theme === "dark" ? "Claro" : "Oscuro"}
        </button>
      </div>

      {/* Operator Session Bar */}
      <div className="operator-bar">
        <div className="operator-info">
          <span>{currentUser.nombre} ({currentUser.role})</span>
        </div>
        <button type="button" onClick={handleLogout} className="logout-btn">
          Cerrar Sesión
        </button>
      </div>

      {/* Connection status bar */}
      <div className="status-bar">
        <div className="status-indicator">
          <span className={`status-dot ${isOnline ? "online" : "offline"}`}></span>
          <span>{isOnline ? "CONEXIÓN ESTABLE (ONLINE)" : "TRABAJANDO SIN CONEXIÓN (OFFLINE)"}</span>
        </div>
        {(pendingCount > 0 || isSyncing) && (
          <span className="queue-badge">
            {isSyncing && syncQueueProgress
              ? <><span className="spinner"></span> {syncQueueProgress.done}/{syncQueueProgress.total}</>
              : <>{pendingCount} pendientes {isSyncing && <span className="spinner"></span>}</>
            }
          </span>
        )}
      </div>

      {/* Tab Navigation Menu */}
      <div className="nav-tabs">
        <button 
          type="button" 
          onClick={() => setActiveTab("censo")} 
          className={`nav-tab-btn ${activeTab === "censo" ? "active" : ""}`}
        >
          Registrar
        </button>
        <button 
          type="button" 
          onClick={() => setActiveTab("dashboard")} 
          className={`nav-tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
        >
          Estadísticas
        </button>
        {currentUser.role === "ADMIN" && (
          <button 
            type="button" 
            onClick={() => setActiveTab("usuarios")} 
            className={`nav-tab-btn ${activeTab === "usuarios" ? "active" : ""}`}
          >
            Usuarios
          </button>
        )}
        <button 
          type="button" 
          onClick={() => setActiveTab("config")} 
          className={`nav-tab-btn ${activeTab === "config" ? "active" : ""}`}
        >
          Configuración
        </button>
      </div>

      {/* TAB 1: FORM VIEW (CENSO) */}
      {activeTab === "censo" && (
        <>
          {currentUser.role === "REGISTRADOR" || currentUser.role === "ADMIN" ? (
            <form onSubmit={handleSubmit} className="form-card">
              {/* Section 1: Ubicación */}
              <div className="form-section">
                <div className="section-title">
                  Ubicación Geográfica
                </div>
                
                <CustomSelect
                  label="Parroquia donde vive"
                  value={formData.parroquia}
                  onChange={(val) => {
                    setFormData(prev => ({ ...prev, parroquia: val }));
                    setErrors(prev => ({ ...prev, parroquia: validateField("parroquia", val) }));
                  }}
                  options={PARROQUIAS}
                  placeholder="Seleccione una parroquia..."
                  required
                  hasError={!!errors.parroquia}
                />
                <div className="error-container">
                  {errors.parroquia && <span className="field-error-message">{errors.parroquia}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="sector">Sector donde vive<span className="required-star">*</span></label>
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
                  <label htmlFor="comunidad">Comunidad donde vive<span className="required-star">*</span></label>
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

              <hr className="section-divider" />

              {/* Section 2: Datos Personales */}
              <div className="form-section">
                <div className="section-title">
                  Datos Personales
                </div>

                <div className="form-group">
                  <label htmlFor="cedula">Cédula de Identidad<span className="required-star">*</span></label>
                  <div style={{ display: "grid", gridTemplateColumns: "75px 1fr", gap: "0.75rem", alignItems: "center" }}>
                    <CustomSelect
                      label=""
                      value={formData.nacionalidad}
                      onChange={(val) => setFormData(prev => ({ ...prev, nacionalidad: val }))}
                      options={["V", "E"]}
                    />
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
                    <label className={`radio-card ${formData.genero === "MASCULINO" ? "selected" : ""} ${errors.genero ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="genero" 
                        value="MASCULINO" 
                        checked={formData.genero === "MASCULINO"}
                        onChange={handleInputChange} 
                      />
                      MASCULINO
                    </label>
                    <label className={`radio-card ${formData.genero === "FEMENINO" ? "selected" : ""} ${errors.genero ? "has-error" : ""}`}>
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
                  <label htmlFor="edad">Edad<span className="required-star">*</span></label>
                  <input 
                    type="number" 
                    name="edad" 
                    id="edad" 
                    placeholder="Edad calculada" 
                    value={formData.edad} 
                    onChange={handleInputChange} 
                    disabled
                    style={{ backgroundColor: "var(--bg-primary)", cursor: "not-allowed" }}
                  />
                  <div className="error-container"></div>
                </div>

                <div className="form-group">
                  <label>Teléfono de Contacto<span className="required-star">*</span></label>
                  <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "0.75rem", alignItems: "start" }}>
                    <CustomSelect
                      label=""
                      value={formData.telefonoCod}
                      onChange={(val) => setFormData(prev => ({ ...prev, telefonoCod: val }))}
                      options={["0424", "0414", "0416", "0426", "0412", "0422", "0212"]}
                      placeholder="Código"
                    />
                    <input 
                      type="text" 
                      name="telefonoNum" 
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Número (7 dígitos)" 
                      value={formData.telefonoNum} 
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 7);
                        setFormData(prev => ({ ...prev, telefonoNum: val }));
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

              <hr className="section-divider" />

              {/* Section 3: Núcleo Familiar */}
              <div className="form-section">
                <div className="section-title">
                  Grupo Familiar
                </div>

                <div className="form-group">
                  <label>¿Pertenece a un núcleo familiar?<span className="required-star">*</span></label>
                  <div className="radio-group">
                    <label className={`radio-card ${formData.perteneceNucleo === "SI" ? "selected" : ""} ${errors.perteneceNucleo ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="perteneceNucleo" 
                        value="SI" 
                        checked={formData.perteneceNucleo === "SI"}
                        onChange={handleInputChange} 
                      />
                      SI
                    </label>
                    <label className={`radio-card ${formData.perteneceNucleo === "NO" ? "selected" : ""} ${errors.perteneceNucleo ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="perteneceNucleo" 
                        value="NO" 
                        checked={formData.perteneceNucleo === "NO"}
                        onChange={handleInputChange} 
                      />
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
                    <label className={`radio-card ${formData.jefeFamilia === "SI" ? "selected" : ""} ${errors.jefeFamilia ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="jefeFamilia" 
                        value="SI" 
                        checked={formData.jefeFamilia === "SI"}
                        onChange={handleInputChange} 
                      />
                      SI
                    </label>
                    <label className={`radio-card ${formData.jefeFamilia === "NO" ? "selected" : ""} ${errors.jefeFamilia ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="jefeFamilia" 
                        value="NO" 
                        checked={formData.jefeFamilia === "NO"}
                        onChange={handleInputChange} 
                      />
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
                      placeholder="Cédula del jefe del núcleo" 
                      value={formData.cedulaJefeFamilia} 
                      onChange={handleInputChange} 
                      className={errors.cedulaJefeFamilia ? "has-error" : ""}
                    />
                    <div className="error-container">
                      {errors.cedulaJefeFamilia && <span className="field-error-message">{errors.cedulaJefeFamilia}</span>}
                    </div>
                  </div>
                </div>
              </div>

              <hr className="section-divider" />

              {/* Section 4: Estado Físico y Salud */}
              <div className="form-section">
                <div className="section-title">
                  Estado de Salud
                </div>

                <div className="form-group">
                  <label>Estado Físico Actual<span className="required-star">*</span></label>
                  <div className="radio-group">
                    <label className={`radio-card ${formData.estadoFisico === "ILESO" ? "selected" : ""} ${errors.estadoFisico ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="estadoFisico" 
                        value="ILESO" 
                        checked={formData.estadoFisico === "ILESO"}
                        onChange={handleInputChange} 
                      />
                      ILESO
                    </label>
                    <label className={`radio-card ${formData.estadoFisico === "LECIONADO" ? "selected" : ""} ${errors.estadoFisico ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="estadoFisico" 
                        value="LECIONADO" 
                        checked={formData.estadoFisico === "LECIONADO"}
                        onChange={handleInputChange} 
                      />
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
                    <label className={`radio-card ${formData.patologia === "SI" ? "selected" : ""} ${errors.patologia ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="patologia" 
                        value="SI" 
                        checked={formData.patologia === "SI"}
                        onChange={handleInputChange} 
                      />
                      SI
                    </label>
                    <label className={`radio-card ${formData.patologia === "NO" ? "selected" : ""} ${errors.patologia ? "has-error" : ""}`}>
                      <input 
                        type="radio" 
                        name="patologia" 
                        value="NO" 
                        checked={formData.patologia === "NO"}
                        onChange={handleInputChange} 
                      />
                      NO
                    </label>
                  </div>
                  <div className="error-container">
                    {errors.patologia && <span className="field-error-message">{errors.patologia}</span>}
                  </div>
                </div>

                <div className={`conditional-wrapper ${formData.patologia === "SI" ? "open" : ""}`}>
                  <div className="conditional-inner">
                    <label htmlFor="patologiaDescripcion">Describa la patología y medicamentos requeridos<span className="required-star">*</span></label>
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
              </div>

              {/* GPS indicator */}
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", gap: "0.25rem", alignItems: "center" }}>
                {coords.lat && coords.lng ? (
                  <span style={{ color: "var(--color-success)" }}>
                    Coordenadas satelitales GPS fijadas: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </span>
                ) : (
                  <span>Capturando coordenadas satelitales GPS...</span>
                )}
              </div>

              {/* Submit Button */}
              <button type="submit" className="btn-submit">
                Registrar Familia Afectada
              </button>
            </form>
          ) : (
            <div className="form-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <p style={{ fontWeight: "bold" }}>Acceso no permitido.</p>
            </div>
          )}
        </>
      )}

      {/* TAB 2: DASHBOARD VIEW */}
      {activeTab === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* Connection status notification for stats */}
          {!isOnline && (
            <div className="status-bar" style={{ borderLeftColor: "var(--color-warning)", background: "rgba(245, 158, 11, 0.05)" }}>
              <div className="status-indicator">
                <span className="status-dot offline"></span>
                <span style={{ color: "var(--color-warning)" }}>Modo Offline: Estadísticas de registros locales</span>
              </div>
            </div>
          )}

          {loadingStats ? (
            <div className="form-card" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px" }}>
              <span className="spinner" style={{ width: "30px", height: "30px" }}></span>
              <span style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>Cargando métricas consolidadas...</span>
            </div>
          ) : (
            <>
              {/* Stat Cards Grid */}
              <div className="stats-grid">
                <div className="stat-card stat-card--primary">
                  <div className="stat-card-header">
                    <span className="stat-label">Total Registrados</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "16px", height: "16px" }} className="stat-icon stat-icon-primary"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  </div>
                  <span className="stat-value">{currentStats.total}</span>
                </div>
                <div className="stat-card stat-card--warning">
                  <div className="stat-card-header">
                    <span className="stat-label">Menores (&lt;18)</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "16px", height: "16px" }} className="stat-icon stat-icon-warning"><path d="M14 18a6 6 0 0 0-12 0" /><circle cx="8" cy="8" r="4" /><path d="M12 11h8" /><path d="M12 15h6" /></svg>
                  </div>
                  <span className="stat-value">
                    {currentStats.menores || 0}
                    <span style={{ fontSize: "0.75rem", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "0.25rem" }}>
                      ({currentStats.total > 0 ? ((currentStats.menores / currentStats.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="stat-card stat-card--success">
                  <div className="stat-card-header">
                    <span className="stat-label">Adultos (18-59)</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "16px", height: "16px" }} className="stat-icon stat-icon-success"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                  </div>
                  <span className="stat-value">
                    {currentStats.adultos || 0}
                    <span style={{ fontSize: "0.75rem", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "0.25rem" }}>
                      ({currentStats.total > 0 ? ((currentStats.adultos / currentStats.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="stat-card stat-card--violet">
                  <div className="stat-card-header">
                    <span className="stat-label">Mayores (60+)</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "16px", height: "16px" }} className="stat-icon stat-icon-violet"><path d="M20 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M2 21h12" /><circle cx="8" cy="7" r="4" /></svg>
                  </div>
                  <span className="stat-value">
                    {currentStats.mayores || 0}
                    <span style={{ fontSize: "0.75rem", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "0.25rem" }}>
                      ({currentStats.total > 0 ? ((currentStats.mayores / currentStats.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="stat-card stat-card--muted">
                  <div className="stat-card-header">
                    <span className="stat-label">Edad Promedio</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "16px", height: "16px" }} className="stat-icon stat-icon-muted"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  </div>
                  <span className="stat-value">{currentStats.promedioEdad || 0} años</span>
                </div>
              </div>

              {/* Distribución por Grupos de Edad - Segmentado */}
              <div className="dashboard-section">
                <h3 className="dashboard-section-title">Distribución de Población por Edad</h3>
                {currentStats.total === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem 0" }}>Sin datos</p>
                ) : (
                  <div className="segmented-bar-container">
                    {(() => {
                      const t = currentStats.total || 1;
                      const pMen = (currentStats.menores || 0) / t * 100;
                      const pAd  = (currentStats.adultos  || 0) / t * 100;
                      const pMay = (currentStats.mayores  || 0) / t * 100;
                      const segs = [
                        { pct: pMen, count: currentStats.menores || 0, color: "#d97706" },
                        { pct: pAd,  count: currentStats.adultos  || 0, color: "#059669" },
                        { pct: pMay, count: currentStats.mayores  || 0, color: "#7c3aed" }
                      ];
                      return (
                        <>
                          <div className="segmented-bar-track" style={{ position: "relative", height: "28px", borderRadius: "6px", overflow: "hidden", display: "flex" }}>
                            {segs.map((s, i) => (
                              <div key={i} style={{ width: `${s.pct}%`, backgroundColor: s.color, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", transition: "width 0.4s ease" }}>
                                {s.pct >= 15 && (
                                  <span style={{ fontSize: "0.625rem", fontWeight: "700", color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap" }}>
                                    {s.count} · {s.pct.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="segmented-bar-legend">
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "#d97706" }}></span> Menores ({pMen.toFixed(1)}%)</span>
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "#059669" }}></span> Adultos ({pAd.toFixed(1)}%)</span>
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "#7c3aed" }}></span> Mayores ({pMay.toFixed(1)}%)</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Distribución por Género - Dona SVG pura */}
              <div className="dashboard-section">
                <h3 className="dashboard-section-title">Distribución de Población por Género</h3>
                {currentStats.total === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem 0" }}>Sin datos</p>
                ) : (
                  (() => {
                    const t = currentStats.total || 1;
                    const f = currentStats.byGenero.find((g: any) => g.name === "FEMENINO")?.count || 0;
                    const m = currentStats.byGenero.find((g: any) => g.name === "MASCULINO")?.count || 0;
                    const o = Math.max(0, currentStats.total - f - m);
                    const pFem  = f / t * 100;
                    const pMasc = m / t * 100;
                    const pOtro = o / t * 100;

                    // SVG donut: r=38, circumference ≈ 238.76
                    const r = 38;
                    const cx = 50;
                    const cy = 50;
                    const circ = 2 * Math.PI * r;
                    const segments = [
                      { count: f, pct: pFem,  color: "#db2777", label: "Femenino"  },
                      { count: m, pct: pMasc, color: "#2563eb", label: "Masculino" },
                      { count: o, pct: pOtro, color: "#64748b", label: "No especif." }
                    ];
                    let offset = 0;
                    const arcs = segments.map(seg => {
                      const dash  = (seg.pct / 100) * circ;
                      const gap   = circ - dash;
                      const rotate = (offset / 100) * 360 - 90;
                      offset += seg.pct;
                      return { ...seg, dash, gap, rotate };
                    });

                    return (
                      <div className="donut-chart-wrapper">
                        <svg viewBox="0 0 100 100" width="110" height="110" style={{ flexShrink: 0 }}>
                          {arcs.map((arc, i) => (
                            <circle
                              key={i}
                              cx={cx} cy={cy} r={r}
                              fill="none"
                              stroke={arc.color}
                              strokeWidth="14"
                              strokeDasharray={`${arc.dash} ${arc.gap}`}
                              strokeDashoffset={0}
                              transform={`rotate(${arc.rotate} ${cx} ${cy})`}
                              style={{ transition: "stroke-dasharray 0.4s ease" }}
                            />
                          ))}
                          <text x="50" y="46" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" style={{ fill: "var(--text-primary)" }}>{currentStats.total}</text>
                          <text x="50" y="57" textAnchor="middle" fontSize="6.5" fill="currentColor" style={{ fill: "var(--text-muted)" }}>Total</text>
                        </svg>
                        <div className="donut-legend">
                          {arcs.map((arc, i) => (
                            <div key={i} className="donut-legend-item">
                              <span className="donut-legend-dot" style={{ backgroundColor: arc.color }}></span>
                              <span>{arc.label}</span>
                              <span className="donut-legend-pct">{arc.count} <span style={{ fontWeight: "normal", color: "var(--text-muted)" }}>({arc.pct.toFixed(1)}%)</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Matriz de Frecuencias Demográficas (Cruce de variables) */}
              <div className="dashboard-section">
                <h3 className="dashboard-section-title">Matriz de Frecuencias Demográficas</h3>
                {(() => {
                  const mx = currentStats.matrix || {
                    menores: { femenino: 0, masculino: 0, otro: 0 },
                    adultos: { femenino: 0, masculino: 0, otro: 0 },
                    mayores: { femenino: 0, masculino: 0, otro: 0 }
                  };
                  const tMen = mx.menores.femenino + mx.menores.masculino + mx.menores.otro;
                  const tAd  = mx.adultos.femenino  + mx.adultos.masculino  + mx.adultos.otro;
                  const tMay = mx.mayores.femenino  + mx.mayores.masculino  + mx.mayores.otro;
                  const tFem  = mx.menores.femenino  + mx.adultos.femenino  + mx.mayores.femenino;
                  const tMasc = mx.menores.masculino + mx.adultos.masculino + mx.mayores.masculino;
                  const tOtr  = mx.menores.otro      + mx.adultos.otro      + mx.mayores.otro;

                  // heatmap intensity per column (relative to column max)
                  const maxFem  = Math.max(mx.menores.femenino,  mx.adultos.femenino,  mx.mayores.femenino)  || 1;
                  const maxMasc = Math.max(mx.menores.masculino, mx.adultos.masculino, mx.mayores.masculino) || 1;
                  const maxOtr  = Math.max(mx.menores.otro,      mx.adultos.otro,      mx.mayores.otro)      || 1;
                  const hFem  = (v: number) => ({ background: `rgba(219, 39, 119, ${(v / maxFem)  * 0.18})` });
                  const hMasc = (v: number) => ({ background: `rgba(37, 99, 235,   ${(v / maxMasc) * 0.18})` });
                  const hOtr  = (v: number) => ({ background: `rgba(100, 116, 139, ${(v / maxOtr)  * 0.18})` });

                  return (
                    <div className="matrix-table-wrapper">
                      <table className="matrix-table">
                        <thead>
                          <tr>
                            <th>Grupo de Edad</th>
                            <th>Femenino</th>
                            <th>Masculino</th>
                            <th>No Espec.</th>
                            <th style={{ textAlign: "right" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td><strong>Menores (&lt;18)</strong></td>
                            <td className="cell-fem"  style={hFem(mx.menores.femenino)}>{mx.menores.femenino}</td>
                            <td className="cell-masc" style={hMasc(mx.menores.masculino)}>{mx.menores.masculino}</td>
                            <td className="cell-otro" style={hOtr(mx.menores.otro)}>{mx.menores.otro}</td>
                            <td style={{ textAlign: "right" }}><strong>{tMen}</strong></td>
                          </tr>
                          <tr>
                            <td><strong>Adultos (18-59)</strong></td>
                            <td className="cell-fem"  style={hFem(mx.adultos.femenino)}>{mx.adultos.femenino}</td>
                            <td className="cell-masc" style={hMasc(mx.adultos.masculino)}>{mx.adultos.masculino}</td>
                            <td className="cell-otro" style={hOtr(mx.adultos.otro)}>{mx.adultos.otro}</td>
                            <td style={{ textAlign: "right" }}><strong>{tAd}</strong></td>
                          </tr>
                          <tr>
                            <td><strong>Mayores (60+)</strong></td>
                            <td className="cell-fem"  style={hFem(mx.mayores.femenino)}>{mx.mayores.femenino}</td>
                            <td className="cell-masc" style={hMasc(mx.mayores.masculino)}>{mx.mayores.masculino}</td>
                            <td className="cell-otro" style={hOtr(mx.mayores.otro)}>{mx.mayores.otro}</td>
                            <td style={{ textAlign: "right" }}><strong>{tMay}</strong></td>
                          </tr>
                          <tr style={{ borderTop: "2px solid var(--border-color)" }}>
                            <td><strong>Total General</strong></td>
                            <td><strong>{tFem}</strong></td>
                            <td><strong>{tMasc}</strong></td>
                            <td><strong>{tOtr}</strong></td>
                            <td style={{ textAlign: "right" }}><strong>{currentStats.total}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* Afectados por Parroquia */}
              <div className="dashboard-section">
                <h3 className="dashboard-section-title">Afectados por Parroquia</h3>
                {currentStats.byParroquia.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1rem 0" }}>
                    No hay datos registrados aún.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {[...currentStats.byParroquia]
                      .sort((a: any, b: any) => b.count - a.count)
                      .map((p: any, i: number) => {
                        const pct = currentStats.total > 0 ? Math.round((p.count / currentStats.total) * 100) : 0;
                        return (
                          <div key={p.name} style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.775rem", fontWeight: "700" }}>
                              <span>{p.name}</span>
                              <span style={{ color: "var(--text-secondary)" }}>{p.count} <span style={{ fontWeight: "normal", color: "var(--text-muted)" }}>({pct}%)</span></span>
                            </div>
                            <div style={{ width: "100%", height: "8px", background: "var(--border-color)", borderRadius: "4px", overflow: "hidden" }}>
                              <div
                                className="parroquia-bar"
                                style={{
                                  "--bar-width": `${pct}%`,
                                  animationDelay: `${i * 60}ms`
                                } as React.CSSProperties}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Salud y Condición Física */}
              <div className="dashboard-section">
                <h3 className="dashboard-section-title">Salud y Condición Física</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* Estado Físico - Gauges semicirculares SVG */}
                  <div>
                    <h4 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.75rem", fontWeight: "700" }}>Estado Físico</h4>
                    {currentStats.byEstadoFisico.length === 0 ? (
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Sin datos</p>
                    ) : (
                      (() => {
                        const ileso    = currentStats.byEstadoFisico.find((e: any) => e.name === "ILESO")?.count || 0;
                        const lesionado = currentStats.byEstadoFisico.find((e: any) => e.name === "LESIONADO" || e.name === "LECIONADO")?.count || 0;
                        const t = currentStats.total || 1;
                        // Semicircle gauge: arc on a 100×60 viewBox, r=40, half-circumference=125.66
                        const halfCirc = Math.PI * 40;
                        const gaugeArc = (pct: number) => {
                          const filled = (pct / 100) * halfCirc;
                          return `${filled} ${halfCirc - filled}`;
                        };
                        const gauges = [
                          { label: "Ilesos",    count: ileso,    pct: (ileso / t * 100),    color: "#059669", track: "rgba(5,150,105,0.12)" },
                          { label: "Lesionados", count: lesionado, pct: (lesionado / t * 100), color: "#ef4444", track: "rgba(239,68,68,0.12)" }
                        ];
                        return (
                          <div className="gauge-wrapper">
                            {gauges.map(g => (
                              <div key={g.label} className="gauge-item">
                                <svg viewBox="0 0 100 56" width="110" height="62">
                                  {/* track */}
                                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={g.track} strokeWidth="12" strokeLinecap="round" />
                                  {/* filled arc */}
                                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={g.color} strokeWidth="12" strokeLinecap="round"
                                    strokeDasharray={gaugeArc(g.pct)}
                                    style={{ transition: "stroke-dasharray 0.5s ease" }} />
                                  <text x="50" y="44" textAnchor="middle" fontSize="14" fontWeight="800" style={{ fill: "var(--text-primary)" }}>{g.count}</text>
                                </svg>
                                <span className="gauge-label">{g.label}</span>
                                <span className="gauge-pct">{g.pct.toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </div>

                  {/* Patologías Crónicas */}
                  <div>
                    <h4 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.4rem", fontWeight: "700" }}>Patologías Crónicas</h4>
                    {currentStats.byPatologia.length === 0 ? (
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Sin datos</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {currentStats.byPatologia.map((pat: any) => {
                          const percentage = currentStats.total > 0 ? Math.round((pat.count / currentStats.total) * 100) : 0;
                          const barColor = pat.name === "SI" ? "var(--color-warning)" : "#94a3b8";
                          return (
                            <div key={pat.name} style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.725rem", fontWeight: "700" }}>
                                <span>{pat.name === "SI" ? "SÍ POSEE PATOLOGÍA" : "NO POSEE PATOLOGÍA"}</span>
                                <span>{pat.count} ({percentage}%)</span>
                              </div>
                              <div style={{ width: "100%", height: "6px", background: "var(--border-color)", borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: `${percentage}%`, height: "100%", background: barColor, borderRadius: "3px" }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: USER ADMINISTRATION (ADMIN ONLY) */}
      {activeTab === "usuarios" && currentUser.role === "ADMIN" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* User Registration Form Card */}
          <form onSubmit={handleCreateUser} className="form-card">
            <div className="form-section" style={{ gap: "1rem" }}>
              <div className="section-title">
                Crear Nuevo Usuario
              </div>

              <div className="form-group">
                <label htmlFor="user-nombre">Nombre y Apellido del Operador</label>
                <input
                  type="text"
                  id="user-nombre"
                  placeholder="ej: Juan Pérez"
                  value={userForm.nombre}
                  onChange={(e) => {
                    setUserForm(prev => ({ ...prev, nombre: e.target.value }));
                    setUserErrors(prev => ({ ...prev, nombre: "" }));
                  }}
                  className={userErrors.nombre ? "has-error" : ""}
                />
                <div className="error-container">
                  {userErrors.nombre && <span className="field-error-message">{userErrors.nombre}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="user-email">Correo Electrónico</label>
                <input
                  type="email"
                  id="user-email"
                  placeholder="ej: juan.perez@sismo.gob.ve"
                  value={userForm.email}
                  onChange={(e) => {
                    setUserForm(prev => ({ ...prev, email: e.target.value }));
                    setUserErrors(prev => ({ ...prev, email: "" }));
                  }}
                  className={userErrors.email ? "has-error" : ""}
                />
                <div className="error-container">
                  {userErrors.email && <span className="field-error-message">{userErrors.email}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="user-password">Contraseña (Mínimo 6 caracteres)</label>
                <input
                  type="password"
                  id="user-password"
                  placeholder="Nueva contraseña"
                  value={userForm.password}
                  onChange={(e) => {
                    setUserForm(prev => ({ ...prev, password: e.target.value }));
                    setUserErrors(prev => ({ ...prev, password: "" }));
                  }}
                  className={userErrors.password ? "has-error" : ""}
                />
                <div className="error-container">
                  {userErrors.password && <span className="field-error-message">{userErrors.password}</span>}
                </div>
              </div>

              <div className="form-group">
                <label>Rol asignado</label>
                <div className="radio-group">
                  <label className={`radio-card ${userForm.role === "REGISTRADOR" ? "selected" : ""}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="REGISTRADOR" 
                      checked={userForm.role === "REGISTRADOR"}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} 
                    />
                    REGISTRADOR
                  </label>
                  <label className={`radio-card ${userForm.role === "ADMIN" ? "selected" : ""}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="ADMIN" 
                      checked={userForm.role === "ADMIN"}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} 
                    />
                    ADMINISTRADOR
                  </label>
                </div>
              </div>

              <button type="submit" className="btn-submit">
                Registrar Operador
              </button>
            </div>
          </form>

          {/* Registered Users List Card */}
          <div className="history-card">
            <span className="history-title">OPERADORES DEL SISTEMA</span>
            {!isOnline && (
              <p style={{ fontSize: "0.75rem", color: "var(--color-warning)", margin: "0.5rem 0", fontWeight: "700" }}>
                Sin conexión. No es posible listar o actualizar operadores.
              </p>
            )}
            
            {loadingUsers ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "1rem 0" }}>
                <span className="spinner"></span>
              </div>
            ) : systemUsers.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1rem 0" }}>
                No hay operadores cargados o se requiere conexión para consultar.
              </p>
            ) : (
              <div className="history-list" style={{ marginTop: "0.5rem" }}>
                {systemUsers.map((usr) => (
                  <div className="history-item" key={usr.id} style={{ padding: "0.6rem 0.8rem" }}>
                    <div className="history-item-info">
                      <span className="history-item-name">{usr.nombre}</span>
                      <span className="history-item-meta">{usr.email}</span>
                    </div>
                    <span className="queue-badge" style={{ background: usr.role === "ADMIN" ? "var(--color-primary-light)" : "var(--bg-primary)" }}>
                      {usr.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CONFIGURATION & DATABASE STATS VIEW */}
      {activeTab === "config" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* Operator Profile Details */}
          <div className="history-card" style={{ gap: "0.5rem" }}>
            <span className="history-title">PERFIL DE OPERADOR</span>
            <div style={{ fontSize: "0.8rem", display: "grid", gridTemplateColumns: "100px 1fr", gap: "0.5rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Nombre:</span>
              <strong>{currentUser.nombre}</strong>
              <span style={{ color: "var(--text-secondary)" }}>Usuario:</span>
              <strong>{currentUser.email}</strong>
              <span style={{ color: "var(--text-secondary)" }}>Rol:</span>
              <strong style={{ color: "var(--color-primary)" }}>{currentUser.role}</strong>
            </div>
          </div>

          {/* Voter Database Management */}
          <div className="history-card" style={{ gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="history-title" style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                Padrón Electoral Local
              </span>
              {votersCount > 0 && syncStatus === "idle" && (
                <button 
                  type="button" 
                  onClick={deletePadronLocal}
                  style={{ background: "none", border: "none", color: "var(--color-danger)", fontSize: "0.75rem", fontWeight: "700", cursor: "pointer" }}
                >
                  Borrar local
                </button>
              )}
            </div>

            {votersCount > 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--color-success)", fontWeight: "700", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                Padrón electoral instalado ({votersCount.toLocaleString()} ciudadanos)
              </div>
            ) : (
              <div style={{ fontSize: "0.8rem", color: "var(--color-danger)", fontWeight: "700" }}>
                Padrón offline no instalado. El censo no autocompletará datos.
              </div>
            )}

            {syncStatus === "idle" && votersCount === 0 && (
              <button 
                type="button" 
                onClick={downloadFullPadron} 
                disabled={!isOnline}
                className="btn-submit"
                style={{ padding: "0.6rem 1rem", fontSize: "0.85rem", borderRadius: "10px" }}
              >
                Descargar Padrón Completo
              </button>
            )}

            {syncStatus === "downloading" && (
              <div style={{ fontSize: "0.8rem", color: "var(--color-warning)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="spinner"></span> Descargando datos del padrón...
              </div>
            )}

            {syncStatus === "saving" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-warning)", display: "flex", justifyContent: "space-between" }}>
                  <span>Guardando en base IndexedDB local...</span>
                  <span>{syncProgress.toLocaleString()} / {syncTotal.toLocaleString()}</span>
                </div>
                <div style={{ width: "100%", height: "6px", background: "var(--glass-border)", borderRadius: "3px", overflow: "hidden" }}>
                  <div 
                    style={{ 
                      width: `${(syncProgress / syncTotal) * 100}%`, 
                      height: "100%", 
                      background: "var(--color-warning)", 
                      transition: "width 0.1s ease" 
                    }}
                  ></div>
                </div>
              </div>
            )}

            {syncStatus === "completed" && (
              <div style={{ fontSize: "0.8rem", color: "var(--color-success)", fontWeight: "700" }}>
                Instalación completa. Ciudadanos listos para lookup local.
              </div>
            )}

            {syncStatus === "error" && (
              <div style={{ fontSize: "0.8rem", color: "var(--color-danger)", fontWeight: "700" }}>
                Error al descargar el padrón. Verifique conexión de internet.
              </div>
            )}
          </div>

          {/* Backup warning panels */}
          {pendingCount > 0 && (
            <div className="history-card" style={{ border: "1px dashed var(--color-warning)", background: "rgba(245, 158, 11, 0.02)", gap: "0.5rem" }}>
              <span className="history-title" style={{ color: "var(--color-warning)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                Respaldo y Transferencia de Emergencia
              </span>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.3" }}>
                Posee {pendingCount} registros locales en cola. Si necesita transferirlos a otro dispositivo offline por contingencia de red, use las siguientes opciones:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.25rem" }}>
                <button 
                  type="button" 
                  onClick={handleExportJSON}
                  className="radio-card"
                  style={{ borderColor: "rgba(255, 255, 255, 0.1)", background: "rgba(255, 255, 255, 0.02)", cursor: "pointer", fontSize: "0.8rem" }}
                >
                  Exportar Respaldo (JSON)
                </button>
                <button 
                  type="button" 
                  onClick={handleGenerateQRs}
                  className="radio-card"
                  style={{ borderColor: "rgba(99, 102, 241, 0.3)", background: "rgba(99, 102, 241, 0.05)", color: "var(--color-primary)", cursor: "pointer", fontSize: "0.8rem" }}
                >
                  Generar Lotes (QR)
                </button>
              </div>
            </div>
          )}

          {/* Sync Detailed Audit Queue List */}
          <div className="history-card" style={{ gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="history-title">Auditoría y Registros Locales</span>
              <button 
                type="button" 
                onClick={triggerSync} 
                disabled={isSyncing || !isOnline}
                style={{ background: "none", border: "none", color: "var(--color-primary)", fontWeight: "bold", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.2rem" }}
              >
                Sincronizar cola
              </button>
            </div>

            {localRecords.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0" }}>
                No hay registros cargados en este dispositivo.
              </p>
            ) : (
              <div className="sync-log-list">
                {localRecords.map((r) => {
                  let badgeClass = "pending";
                  let badgeText = "En cola";
                  
                  if (r.status === "synced") {
                    if (r.syncResult === "duplicado") {
                      badgeClass = "duplicado";
                      badgeText = "Duplicado";
                    } else {
                      badgeClass = "registrado";
                      badgeText = "Registrado";
                    }
                  } else if (r.attempts > 3) {
                    badgeClass = "error";
                    badgeText = "Fallo";
                  }

                  return (
                    <div className="sync-log-item" key={r.id}>
                      <div>
                        <div className="sync-log-name">{r.data.nombreApellido}</div>
                        <div className="sync-log-meta">
                          C.I. {r.data.cedula} • {r.data.parroquia} • Tel: {r.data.telefono || "N/A"}
                        </div>
                      </div>
                      <span className={`sync-badge ${badgeClass}`}>{badgeText}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Codes Modal */}
      {showQrModal && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">CÓDIGOS QR DE EMERGENCIA</span>
              <button className="modal-close" onClick={() => setShowQrModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Escanee estos códigos QR desde otro dispositivo con conexión a internet para cargar los censos del operador a la base central.
            </p>
            <div className="qr-carousel">
              {qrCodes.map((code, index) => (
                <div key={code.id} className="qr-card">
                  <div className="qr-badge">Registro {index + 1} de {qrCodes.length}</div>
                  <img src={code.url} alt={`QR de ${code.name}`} className="qr-image" />
                  <div className="qr-name">{code.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
