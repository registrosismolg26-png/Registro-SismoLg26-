"use client";

import { useState, useEffect, useRef, useReducer, useMemo } from "react";
import QRCode from "qrcode";
import {
  saveLocal,
  getPending,
  getAllLocal,
  markSynced,
  incrementAttempt,
  clearLocalPadron,
  cargarPadronEnCliente,
  buscarCedulaEnCliente,
  getLocalPadronCount,
  LocalRegistro
} from "@/lib/db";

// ── Form state ──────────────────────────────────────────────────────────────

type Medicamento = { nombre: string; dosis: string; periodo: string };

type FormData = {
  parroquia: string; sector: string; comunidad: string; direccionExacta: string;
  nacionalidad: string; cedula: string; nombreApellido: string; genero: string;
  fechaNacimiento: string; edad: string; perteneceNucleo: string; jefeFamilia: string;
  cedulaJefeFamilia: string; estadoFisico: string; patologia: string;
  patologiaDescripcion: string; telefonoCod: string; telefonoNum: string;
  isChildDependent: boolean; dependentNumber: string;
};

type FormAction =
  | { type: "SET"; field: keyof FormData; value: any }
  | { type: "SET_MANY"; patch: Partial<FormData> }
  | { type: "RESET" };

const INITIAL_FORM: FormData = {
  parroquia: "", sector: "", comunidad: "", direccionExacta: "",
  nacionalidad: "V", cedula: "", nombreApellido: "", genero: "",
  fechaNacimiento: "", edad: "", perteneceNucleo: "", jefeFamilia: "",
  cedulaJefeFamilia: "", estadoFisico: "", patologia: "", patologiaDescripcion: "",
  telefonoCod: "0412", telefonoNum: "",
  isChildDependent: false, dependentNumber: "1",
};

function formReducer(state: FormData, action: FormAction): FormData {
  switch (action.type) {
    case "SET":      return { ...state, [action.field]: action.value };
    case "SET_MANY": return { ...state, ...action.patch };
    case "RESET":    return { ...INITIAL_FORM };
    default:         return state;
  }
}

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

type ToastType = "success" | "error" | "info" | "warning";

function ToastIcon({ type }: { type: ToastType }) {
  const p = {
    width: 18, height: 18, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "toast-icon",
  };
  switch (type) {
    case "success":
      return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
    case "error":
      return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
    case "warning":
      return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  }
}

const CUARTOS: string[] = [];

const formatRoomLabel = (room: string) => {
  return room
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace("Edificio", "Edif.")
    .replace("Salon", "Salón");
};

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
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; nombre: string; role: string; campamentoTransitorio: string } | null>(null);
  const ALLOWED_ADMINS = useMemo(() => ["yender.umc@gmail.com", "juventudlgelectoral@gmail.com", "abelenviso@gmail.com"], []);
  const isPowerAdmin = useMemo(() => {
    return currentUser && currentUser.role === "ADMIN" && ALLOWED_ADMINS.includes(currentUser.email.toLowerCase());
  }, [currentUser, ALLOWED_ADMINS]);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [personalTrabajo, setPersonalTrabajo] = useState(84);
  const [entes, setEntes] = useState<string[]>([
    "Ministerio de Alimentación y sus entes",
    "Gobernación",
    "MPP Educación",
    "MPP Indistria y Comercio",
    "MPP Proceso Social del Trabajo",
    "MPP Juventud",
    "MPP para la Defensa",
    "Alcaldía",
    "Vicepresidencia de Obras Publicad y Servicios",
    "Juventud Socialista (brigadas de solidaridad)"
  ]);
  const [newEnte, setNewEnte] = useState("");

  // Cuartos dinámicos (base + personalizados por admin)
  const [customCuartos, setCustomCuartos] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("customCuartos") || "[]"); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("customCuartos", JSON.stringify(customCuartos));
  }, [customCuartos]);

  const refreshCustomRooms = async () => {
    if (typeof window === "undefined" || !navigator.onLine) return;
    try {
      const res = await fetch("/api/cuartos");
      if (res.ok) {
        const data = await res.json();
        const roomNames = data.map((r: any) => r.name);
        setCustomCuartos(roomNames);
      }
    } catch (err) {
      console.error("Error refreshing custom rooms:", err);
    }
  };

  useEffect(() => {
    refreshCustomRooms();
  }, []);

  const allCuartos = useMemo(() => [...CUARTOS, ...customCuartos], [customCuartos]);
  const [newBuilding, setNewBuilding] = useState("");
  const [newSalon, setNewSalon] = useState("");

  const addCustomCuarto = async () => {
    const b = newBuilding.trim().toUpperCase();
    const s = newSalon.trim().toUpperCase();
    if (!b || !s) return;
    const key = `EDIFICIO ${b} SALON ${s}`;
    if (allCuartos.includes(key)) return;

    // Optimistic UI update
    setCustomCuartos(prev => [...prev, key]);
    setNewBuilding("");
    setNewSalon("");

    if (navigator.onLine) {
      try {
        await fetch("/api/cuartos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: key })
        });
      } catch (err) {
        console.error("Error creating custom room in DB:", err);
      }
    }
  };

  const removeCustomCuarto = async (key: string) => {
    setCustomCuartos(prev => prev.filter(c => c !== key));
    if (navigator.onLine) {
      try {
        await fetch(`/api/cuartos?name=${encodeURIComponent(key)}`, {
          method: "DELETE"
        });
      } catch (err) {
        console.error("Error deleting custom room in DB:", err);
      }
    }
  };

  // Tab View Routing State
  const [activeTab, setActiveTab] = useState<"censo" | "dashboard" | "usuarios" | "config" | "asignaciones">("censo");
  const [menuOpen, setMenuOpen] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUpdatingPresentation, setIsUpdatingPresentation] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1|2|3|4>(1);

  // Dashboard Stats States
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // User Management State (Admin only)
  const [userForm, setUserForm] = useState({
    nombre: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "REGISTRADOR",
    campamentoTransitorio: "Complejo Educativo República de Panamá"
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [userShowPassword, setUserShowPassword] = useState(false);
  const [userShowConfirmPassword, setUserShowConfirmPassword] = useState(false);

  // Asignaciones Module State (Admin only)
  const [registros, setRegistros] = useState<any[]>([]);
  const [loadingRegistros, setLoadingRegistros] = useState(false);
  const [registroSearch, setRegistroSearch] = useState("");
  const [selectedRegistro, setSelectedRegistro] = useState<any | null>(null);
  const [asignCuarto, setAsignCuarto] = useState("");
  const [savingCuarto, setSavingCuarto] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  // Filters State for search table
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterGenero, setFilterGenero] = useState("");
  const [filterEdad, setFilterEdad] = useState("");
  const [filterParroquia, setFilterParroquia] = useState("");
  const [filterEstadoFisico, setFilterEstadoFisico] = useState("");
  const [filterCuarto, setFilterCuarto] = useState("");
  const [filterRetirado, setFilterRetirado] = useState("NO");

  // Form State — useReducer eliminates stale-closure bugs from useState in callbacks
  const [formData, dispatch] = useReducer(formReducer, INITIAL_FORM);

  // Medicamentos dinámicos (array independiente del reducer de strings)
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const addMedicamento    = () => setMedicamentos(p => [...p, { nombre: "", dosis: "", periodo: "" }]);
  const removeMedicamento = (i: number) => setMedicamentos(p => p.filter((_, idx) => idx !== i));
  const updateMedicamento = (i: number, field: keyof Medicamento, val: string) =>
    setMedicamentos(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  const [editMedicamentos, setEditMedicamentos] = useState<Medicamento[]>([]);
  const addEditMed    = () => setEditMedicamentos(p => [...p, { nombre: "", dosis: "", periodo: "" }]);
  const removeEditMed = (i: number) => setEditMedicamentos(p => p.filter((_, idx) => idx !== i));
  const updateEditMed = (i: number, field: keyof Medicamento, val: string) =>
    setEditMedicamentos(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  // Client Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Submission guard (distinct from background sync)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // GPS state
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  // Offline queue local records
  const [localRecords, setLocalRecords] = useState<LocalRegistro[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncQueueProgress, setSyncQueueProgress] = useState<{ done: number; total: number } | null>(null);

  // Local edit states for offline correction
  const [selectedLocalRecord, setSelectedLocalRecord] = useState<LocalRegistro | null>(null);
  const [showLocalEditModal, setShowLocalEditModal] = useState(false);
  const [localEditCedula, setLocalEditCedula] = useState("");
  const [localEditNombre, setLocalEditNombre] = useState("");
  const [localEditNacionalidad, setLocalEditNacionalidad] = useState("V");

  // QR Transfer Modal States
  const [qrCodes, setQrCodes] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [internalNotification, setInternalNotification] = useState<{ registroId: string; nombreApellido: string } | null>(null);

  // Notification Diagnostics (helper state)
  const [permissionState, setPermissionState] = useState<string>("default");
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissionState(Notification.permission);
      const interval = setInterval(() => {
        setPermissionState(Notification.permission);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, []);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Cédula local database lookup status
  const [lookupStatus, setLookupStatus] = useState<"idle" | "searching" | "found" | "not-found">("idle");
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync guard: useRef avoids stale-closure bug in setInterval (useState value is frozen in the closure)
  const isSyncingRef = useRef<boolean>(false);

  // Stats cache guard: avoid redundant fetches if last one was < 30s ago
  const lastStatsFetchRef = useRef<number>(0);

  // Online event debounce: wait 1s for stable connection before syncing (avoids 2G flicker double-sync)
  const onlineDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Inactivity session timeout — updated on every pointer/key event
  const lastActivityRef = useRef<number>(Date.now());
  const INACTIVITY_MS = 60 * 60 * 1000; // 1 hour

  // Initialize online status, theme, user session, local padrón count, GPS and local queue on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      
      // Load user session
      const savedUser = localStorage.getItem("sismo_operator") || sessionStorage.getItem("sismo_operator");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && typeof parsed === "object") {
            if (!parsed.campamentoTransitorio) {
              parsed.campamentoTransitorio = "Complejo Educativo República de Panamá";
            }
            setCurrentUser(parsed);
          }
        } catch (e) {
          localStorage.removeItem("sismo_operator");
          sessionStorage.removeItem("sismo_operator");
        }
      }

      // Load theme
      const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
      const initialTheme = savedTheme || "dark";
      setTheme(initialTheme);
      document.documentElement.setAttribute("data-theme", initialTheme);

      const handleOnline = () => {
        setIsOnline(true);
        // Debounce 1s: on 2G the online event can fire multiple times during reconnection
        if (onlineDebounceRef.current) clearTimeout(onlineDebounceRef.current);
        onlineDebounceRef.current = setTimeout(() => {
          showToast("Conexión restablecida. Sincronizando...", "success");
          triggerSync();
          if (currentUser && currentUser.role === "ADMIN") {
            fetchStats();
            fetchUsers();
          }
        }, 1000);
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

  // Load cached stats and registrations on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const cachedRegs = localStorage.getItem("cached_registros");
      if (cachedRegs) {
        try {
          setRegistros(JSON.parse(cachedRegs));
        } catch (e) {
          console.error(e);
        }
      }
      const cachedStats = localStorage.getItem("cached_stats");
      if (cachedStats) {
        try {
          setStats(JSON.parse(cachedStats));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Web Push Subscription for Admins
  useEffect(() => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BBklTIPZhS7ziGhVXKTdMFyXPrAE5qmdh12TbUtPxczuVm_al9Qq0ua8EFCCow7xrJI3p6lhaEQI-4OS1v2qTNI";
    if (!VAPID_PUBLIC_KEY) {
      console.warn("VAPID public key not found in env.");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("Push notifications not supported in this browser.");
      return;
    }

    const initSubscription = async () => {
      try {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }

        if (Notification.permission !== "granted") {
          console.warn("Notification permission denied.");
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        
        try {
          const existingSub = await reg.pushManager.getSubscription();
          if (existingSub) {
            await existingSub.unsubscribe();
            console.log("Unsubscribed from existing push subscription to ensure fresh VAPID register.");
          }
        } catch (e) {
          console.warn("Error clearing old subscription:", e);
        }
        
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            subscription: sub,
            userId: currentUser.id
          })
        });

        console.log("Push subscription registered successfully.");
      } catch (err) {
        console.error("Failed to register push subscription:", err);
      }
    };

    function urlBase64ToUint8Array(base64String: string) {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    const timeout = setTimeout(initSubscription, 1000);
    return () => clearTimeout(timeout);
  }, [currentUser]);

  // Check query parameters for cold start navigation from notifications
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const registroId = urlParams.get("registroId");
      if (registroId) {
        setPendingSelectId(registroId);
        // Clean URL query parameters
        const newUrl = window.location.pathname + window.location.search.replace(/[\?&]registroId=[^&]+/, "");
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, []);

  // Listen for real-time navigation messages from service worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NAVIGATE_TO_REGISTRO") {
        const url = new URL(event.data.url, window.location.href);
        const registroId = url.searchParams.get("registroId");
        if (registroId) {
          setPendingSelectId(registroId);
          fetchRegistros(); // Refetch to make sure registration exists
        }
      } else if (event.data?.type === "NEW_REGISTRO_NOTIFICATION") {
        const { registroId, nombreApellido } = event.data;
        if (registroId && nombreApellido) {
          setInternalNotification({ registroId, nombreApellido });
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  // Auto-select registration when pendingSelectId is found in loaded registros
  useEffect(() => {
    if (!pendingSelectId || !registros.length) return;
    const match = registros.find(r => r.id === pendingSelectId);
    if (match) {
      setActiveTab("asignaciones");
      setSelectedRegistro(match);
      setPendingSelectId(null);
    }
  }, [registros, pendingSelectId]);

  // Fetch registrations from database on login/refresh to keep local cache up-to-date
  useEffect(() => {
    if (currentUser) {
      fetchRegistros();
      if (currentUser.role === "ADMIN") {
        fetchStats(true);
      }
    }
  }, [currentUser]);

  // Intercept browser back button when logged in to prevent returning to login page
  useEffect(() => {
    if (currentUser) {
      window.history.pushState(null, "", window.location.href);
      const handlePopState = () => {
        window.history.pushState(null, "", window.location.href);
      };
      window.addEventListener("popstate", handlePopState);
      return () => {
        window.removeEventListener("popstate", handlePopState);
      };
    }
  }, [currentUser]);

  // Fetch Dashboard Stats and Users when active tab changes
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === "asignaciones") {
      fetchRegistros();
    }
    if (currentUser.role === "ADMIN") {
      if (activeTab === "dashboard") {
        fetchStats();
      } else if (activeTab === "usuarios") {
        fetchUsers();
      }
    }
  }, [activeTab, currentUser]);

  // Listen to fullscreen changes to sync React state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    document.addEventListener("mozfullscreenchange", handleFsChange);
    document.addEventListener("MSFullscreenChange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.removeEventListener("mozfullscreenchange", handleFsChange);
      document.removeEventListener("MSFullscreenChange", handleFsChange);
    };
  }, []);

  // Automatically refresh stats every 5 seconds when in fullscreen presentation mode
  useEffect(() => {
    if (isFullscreen && isOnline) {
      const interval = setInterval(() => {
        fetchStats(true, true);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isFullscreen, isOnline]);

  // Auto-download padrón if not loaded when user logs in
  useEffect(() => {
    if (!currentUser || !isOnline) return;
    getLocalPadronCount().then(count => {
      if (count === 0 && syncStatus === "idle") {
        downloadFullPadron();
      }
    });
  }, [currentUser]);

  // Inactivity session expiry: logout after INACTIVITY_MS of no pointer/key events
  useEffect(() => {
    if (!currentUser) return;
    const touch = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch, { passive: true });
    const guard = setInterval(() => {
      if (Date.now() - lastActivityRef.current > INACTIVITY_MS) {
        handleLogout();
        showToast("Sesión cerrada por inactividad.", "info");
      }
    }, 60_000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      clearInterval(guard);
    };
  }, [currentUser]);

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
  const showToast = (message: string, type: ToastType) => {
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
              body: JSON.stringify({ ...record.data, id: record.id })
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
            if (res.status === 201 || res.status === 200) {
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
      await refreshCustomRooms();
    } catch (e) {
      console.error("Error en el ciclo de sincronización:", e);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      setSyncQueueProgress(null);
    }
  };

  // Download padron via NDJSON stream — writes to IndexedDB in 500-record
  // batches as data arrives, so progress is visible immediately even on 2G.
  const downloadFullPadron = async () => {
    if (!isOnline) {
      showToast("Se requiere conexión a internet para descargar el padrón.", "warning");
      return;
    }

    setSyncStatus("downloading");
    setSyncProgress(0);
    setSyncTotal(0);
    showToast("Descargando padrón electoral...", "info");

    try {
      const res = await fetch("/api/padron/download", { method: "POST" });
      if (!res.ok || !res.body) throw new Error("Fallo al descargar padrón");

      setSyncStatus("saving");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let pending: any[][] = [];
      let total = 0;
      const WRITE_EVERY = 500;

      const flushPending = async () => {
        if (pending.length === 0) return;
        const chunk = pending.splice(0);
        await cargarPadronEnCliente(chunk, () => {});
        total += chunk.length;
        setSyncProgress(total);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.trim()) pending.push(JSON.parse(line));
        }
        if (pending.length >= WRITE_EVERY) await flushPending();
      }

      // flush any leftover line
      if (buffer.trim()) {
        try { pending.push(JSON.parse(buffer)); } catch {}
      }
      await flushPending();

      setSyncTotal(total);
      setSyncStatus("completed");
      showToast(`Padrón descargado: ${total.toLocaleString()} registros.`, "success");
      await refreshVotersCount();

      setTimeout(() => {
        setSyncStatus("idle");
        setSyncProgress(0);
        setSyncTotal(0);
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setSyncStatus("error");
      showToast("Error al descargar el padrón.", "error");
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
        showToast("Error al borrar el padrón.", "error");
      }
    }
  };

  // Fetch consolidated dashboard stats from Supabase
  const fetchStats = async (force = false, silent = false) => {
    // Load from cache first for instant display
    if (typeof window !== "undefined" && !silent) {
      const cached = localStorage.getItem("cached_stats");
      if (cached) {
        try {
          setStats(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (!navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastStatsFetchRef.current < 30_000) return;
    lastStatsFetchRef.current = now;
    if (silent) {
      setIsUpdatingPresentation(true);
    } else {
      setLoadingStats(true);
    }
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        if (typeof window !== "undefined") {
          localStorage.setItem("cached_stats", JSON.stringify(data.stats));
        }
      }
    } catch (err) {
      console.error("Error al obtener estadísticas:", err);
    } finally {
      if (silent) {
        setIsUpdatingPresentation(false);
      } else {
        setLoadingStats(false);
      }
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

  // Fetch all registros from DB for admin asignaciones module
  const fetchRegistros = async () => {
    // Load from cache first for instant display
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("cached_registros");
      if (cached) {
        try {
          setRegistros(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (!navigator.onLine) return;

    setLoadingRegistros(true);
    try {
      const res = await fetch("/api/registros");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newRegs = data.registros ?? [];
      setRegistros(newRegs);
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(newRegs));
      }
    } catch (err: any) {
      showToast("Error al cargar los registros: " + (err?.message ?? ""), "error");
    } finally {
      setLoadingRegistros(false);
    }
  };

  const handleAsignarCuarto = async () => {
    if (!selectedRegistro || !asignCuarto) return;
    setSavingCuarto(true);

    const updated = { ...selectedRegistro, cuarto: asignCuarto };
    
    // 1. Optimistic UI update
    setRegistros(prev => {
      const next = prev.map(r => r.id === updated.id ? updated : r);
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(next));
      }
      return next;
    });
    setSelectedRegistro(updated);

    // 2. Queue in IndexedDB in the background
    try {
      const localRec = {
        id: updated.id,
        data: {
          parroquia: updated.parroquia,
          sector: updated.sector,
          comunidad: updated.comunidad,
          direccionExacta: updated.direccionExacta,
          nombreApellido: updated.nombreApellido,
          cedula: updated.cedula,
          jefeFamilia: updated.jefeFamilia,
          genero: updated.genero,
          fechaNacimiento: updated.fechaNacimiento,
          edad: updated.edad,
          perteneceNucleo: updated.perteneceNucleo,
          cedulaJefeFamilia: updated.cedulaJefeFamilia,
          estadoFisico: updated.estadoFisico,
          patologia: updated.patologia,
          patologiaDescripcion: updated.patologiaDescripcion || undefined,
          telefono: updated.telefono || undefined,
          medicamentos: updated.medicamentos || [],
          cuarto: updated.cuarto,
          retirado: updated.retirado || "NO",
          retiradoRazon: updated.retiradoRazon || undefined,
          refugio: updated.refugio || "Complejo Educativo República de Panamá"
        }
      };
      await saveLocal(localRec);
      await refreshLocalRecords();
      showToast("Habitación asignada correctamente (sincronizando en segundo plano)", "success");
      if (navigator.onLine) {
        triggerSync();
      }
    } catch (e) {
      console.error(e);
      showToast("Error al procesar en segundo plano", "error");
    } finally {
      setSavingCuarto(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedRegistro) return;
    setSavingEdit(true);

    const nac = editData.nacionalidad || (selectedRegistro.cedula.startsWith("E-") ? "E" : "V");
    const cleanCedNum = editData.cedula ? String(editData.cedula).trim().replace(/\D/g, "") : selectedRegistro.cedula.replace(/\D/g, "");
    const finalCedula = `${nac}-${cleanCedNum}`;

    const rawJefeCed = editData.cedulaJefeFamilia ? String(editData.cedulaJefeFamilia).trim().toUpperCase() : (selectedRegistro.cedulaJefeFamilia || "");
    const finalJefeCedula = rawJefeCed
      ? ((rawJefeCed.startsWith("V-") || rawJefeCed.startsWith("E-")) ? rawJefeCed : `V-${rawJefeCed}`)
      : null;

    let finalFechaNac = selectedRegistro.fechaNacimiento;
    let finalEdad = selectedRegistro.edad;

    if (editData.fechaNacimiento) {
      const dateParts = editData.fechaNacimiento.split("/");
      if (dateParts.length === 3) {
        const d = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10);
        const y = parseInt(dateParts[2], 10);
        const tempDate = new Date(y, m - 1, d);
        if (!isNaN(tempDate.getTime())) {
          finalFechaNac = tempDate.toISOString();
          
          // Calculate age
          const today = new Date();
          let calculatedAge = today.getFullYear() - tempDate.getFullYear();
          const monthDiff = today.getMonth() - tempDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < tempDate.getDate())) {
            calculatedAge--;
          }
          finalEdad = calculatedAge >= 0 ? calculatedAge : 0;
        }
      }
    }

    const updated = {
      ...selectedRegistro,
      ...editData,
      fechaNacimiento: finalFechaNac,
      edad: finalEdad,
      cedula: finalCedula,
      cedulaJefeFamilia: finalJefeCedula,
      medicamentos: editMedicamentos
    };

    // 1. Optimistic UI update
    setRegistros(prev => {
      const next = prev.map(r => r.id === updated.id ? updated : r);
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(next));
      }
      return next;
    });
    setSelectedRegistro(updated);
    setEditMode(false);

    // 2. Queue in IndexedDB in the background
    try {
      const localRec = {
        id: updated.id,
        data: {
          parroquia: updated.parroquia,
          sector: updated.sector,
          comunidad: updated.comunidad,
          direccionExacta: updated.direccionExacta,
          nombreApellido: updated.nombreApellido.toUpperCase().trim(),
          cedula: updated.cedula,
          jefeFamilia: updated.jefeFamilia,
          genero: updated.genero,
          fechaNacimiento: updated.fechaNacimiento,
          edad: parseInt(String(updated.edad), 10),
          perteneceNucleo: updated.perteneceNucleo,
          cedulaJefeFamilia: updated.cedulaJefeFamilia || undefined,
          estadoFisico: updated.estadoFisico,
          patologia: updated.patologia,
          patologiaDescripcion: updated.patologia === "SI" ? updated.patologiaDescripcion : undefined,
          telefono: updated.telefono || undefined,
          medicamentos: updated.medicamentos || [],
          cuarto: updated.cuarto || undefined,
          retirado: updated.retirado || "NO",
          retiradoRazon: updated.retirado === "SI" ? updated.retiradoRazon : undefined,
          refugio: updated.refugio || "Complejo Educativo República de Panamá"
        }
      };
      await saveLocal(localRec);
      await refreshLocalRecords();
      showToast("Registro guardado (sincronizando en segundo plano)", "success");
      if (navigator.onLine) {
        triggerSync();
      }
    } catch (e) {
      console.error(e);
      showToast("Error al guardar cambios locales", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteRegistro = async (id: string) => {
    try {
      const res = await fetch(`/api/registros/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRegistros(prev => {
          const next = prev.filter(r => r.id !== id);
          if (typeof window !== "undefined") {
            localStorage.setItem("cached_registros", JSON.stringify(next));
          }
          return next;
        });
        setSelectedRegistro(null);
        showToast("Registro eliminado correctamente", "success");
      } else {
        const errData = await res.json();
        showToast("Error al eliminar: " + (errData.error || ""), "error");
      }
    } catch {
      showToast("Error de conexión", "error");
    }
  };

  const handleSaveLocalEdit = async () => {
    if (!selectedLocalRecord) return;
    const cleanCed = localEditCedula.trim().toUpperCase();
    const finalCedula = (cleanCed.startsWith("V-") || cleanCed.startsWith("E-")) ? cleanCed : `${localEditNacionalidad}-${cleanCed}`;
    const updatedRecord = {
      ...selectedLocalRecord,
      data: {
        ...selectedLocalRecord.data,
        cedula: finalCedula,
        nombreApellido: localEditNombre.trim().toUpperCase()
      },
      status: "pending" as const,
      attempts: 0,
      syncResult: undefined
    };
    await saveLocal(updatedRecord);
    setShowLocalEditModal(false);
    setSelectedLocalRecord(null);
    showToast("Registro local corregido y en cola", "success");
    await refreshLocalRecords();
    if (navigator.onLine) {
      triggerSync();
    }
  };

  const handleExportExcel = () => {
    const present = registros.filter(r => r.retirado !== "SI");
    if (present.length === 0) {
      showToast("No hay registros de personas presentes para exportar", "warning");
      return;
    }

    const headers = [
      "Cédula", "Nombre y Apellido", "Género", "Fecha de Nacimiento", "Edad",
      "Parroquia", "Sector", "Comunidad", "Dirección Exacta", "Teléfono",
      "Cuarto/Habitación", "Estado Físico", "Jefe de Familia", "Cédula Jefe",
      "Patología", "Descripción Patología", "Medicamentos", "Fecha de Registro"
    ];

    const rows = present.map(r => {
      const meds = Array.isArray(r.medicamentos) 
        ? r.medicamentos.map((m: any) => `${m.nombre || ""}:${m.dosis || ""}:${m.periodo || ""}`).join(" | ")
        : "";
      return [
        r.cedula,
        r.nombreApellido,
        r.genero,
        r.fechaNacimiento,
        r.edad,
        r.parroquia,
        r.sector,
        r.comunidad,
        r.direccionExacta,
        r.telefono || "",
        r.cuarto || "Sin asignar",
        r.estadoFisico,
        r.jefeFamilia,
        r.cedulaJefeFamilia || "",
        r.patologia,
        r.patologiaDescripcion || "",
        meds,
        r.createdAt ? new Date(r.createdAt).toLocaleString("es-VE") : ""
      ];
    });

    const csvContent = [headers.join(";"), ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `registro_censo_presentes_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV para Excel descargado correctamente", "success");
  };

  const handlePrintPDFList = () => {
    const present = registros.filter(r => r.retirado !== "SI");
    if (present.length === 0) {
      showToast("No hay registros de personas presentes para imprimir", "warning");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("Por favor permita las ventanas emergentes para imprimir", "error");
      return;
    }

    const sorted = [...present].sort((a, b) => {
      const roomA = a.cuarto || "ZZZ";
      const roomB = b.cuarto || "ZZZ";
      return roomA.localeCompare(roomB) || a.nombreApellido.localeCompare(b.nombreApellido);
    });

    const rowsHtml = sorted.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.nombreApellido}</td>
        <td>${r.cedula}</td>
        <td>${r.edad}</td>
        <td>${r.cuarto || '<span style="color: #999;">Sin asignar</span>'}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Listado de Personas Presentes - Censo Sismológico 2026</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #1e3a8a;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .logo {
            height: 60px;
            object-fit: contain;
          }
          .title-container {
            text-align: right;
          }
          h1 {
            font-size: 1.4rem;
            margin: 0;
            color: #1e3a8a;
          }
          h2 {
            font-size: 1rem;
            margin: 5px 0 0 0;
            color: #666;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px 10px;
            text-align: left;
            font-size: 0.9rem;
          }
          th {
            background-color: #f3f4f6;
            color: #1e3a8a;
            font-weight: bold;
          }
          tr:nth-child(even) {
            background-color: #f9fafb;
          }
          .footer {
            margin-top: 30px;
            font-size: 0.75rem;
            text-align: center;
            color: #777;
            border-top: 1px solid #ddd;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img class="logo" src="/logo_gob.webp" alt="Gobernación La Guaira">
          <div class="title-container">
            <h1>LISTADO DE PERSONAS PRESENTES</h1>
            <h2>Censo de Campamento Transitorio - Sismo La Guaira 2026</h2>
          </div>
        </div>
        <p style="font-size: 0.85rem; color: #555;">
          <strong>Total Presentes:</strong> ${present.length} personas. 
          <strong>Fecha de Generación:</strong> ${new Date().toLocaleString("es-VE")}
        </p>
        <table>
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Nombre y Apellido</th>
              <th style="width: 120px;">Cédula</th>
              <th style="width: 80px;">Edad</th>
              <th style="width: 180px;">Habitación / Salón</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          Gobernación del Estado La Guaira &middot; Sistema de Censo Sismológico 2026 &middot; Impresión Oficial
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
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
          const userSession = {
            id: match.id,
            email: match.email,
            nombre: match.nombre,
            role: match.role,
            campamentoTransitorio: match.campamentoTransitorio || "Complejo Educativo República de Panamá"
          };
          setCurrentUser(userSession);
          if (userSession.role === "VISUALIZADOR") {
            setActiveTab("dashboard");
          } else {
            setActiveTab("censo");
          }
          if (rememberMe) {
            localStorage.setItem("sismo_operator", JSON.stringify(userSession));
            sessionStorage.removeItem("sismo_operator");
          } else {
            sessionStorage.setItem("sismo_operator", JSON.stringify(userSession));
            localStorage.removeItem("sismo_operator");
          }
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
        if (data.user.role === "VISUALIZADOR") {
          setActiveTab("dashboard");
        } else {
          setActiveTab("censo");
        }
        if (rememberMe) {
          localStorage.setItem("sismo_operator", JSON.stringify(data.user));
          sessionStorage.removeItem("sismo_operator");
        } else {
          sessionStorage.setItem("sismo_operator", JSON.stringify(data.user));
          localStorage.removeItem("sismo_operator");
        }

        // Save credential hash locally for offline fallback authentication
        const cachedStr = localStorage.getItem("sismo_cached_operators") || "[]";
        const cachedList = JSON.parse(cachedStr);
        const filtered = cachedList.filter((u: any) => u.email !== data.user.email);
        filtered.push({
          id: data.user.id,
          email: data.user.email,
          nombre: data.user.nombre,
          role: data.user.role,
          campamentoTransitorio: data.user.campamentoTransitorio || "Complejo Educativo República de Panamá",
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
    sessionStorage.removeItem("sismo_operator");
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
    if (userForm.password !== userForm.confirmPassword) {
      errs.confirmPassword = "Las contraseñas no coinciden.";
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
      setCreateUserModalOpen(false);
      setUserForm({
        nombre: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "REGISTRADOR",
        campamentoTransitorio: "Complejo Educativo República de Panamá"
      });
      setUserShowPassword(false);
      setUserShowConfirmPassword(false);
      fetchUsers();
    } catch (err) {
      console.error(err);
      showToast("Error de conexión al guardar el usuario.", "warning");
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserErrors({});

    if (!currentUser || !isPowerAdmin) return;

    // Validation
    const errs: Record<string, string> = {};
    if (!userForm.nombre.trim()) errs.nombre = "El nombre es obligatorio.";
    if (!userForm.email.trim()) {
      errs.email = "El correo es obligatorio.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email)) {
      errs.email = "El correo no es válido.";
    }
    if (userForm.password) {
      if (userForm.password.length < 6) {
        errs.password = "La contraseña debe tener al menos 6 caracteres.";
      }
      if (userForm.password !== userForm.confirmPassword) {
        errs.confirmPassword = "Las contraseñas no coinciden.";
      }
    }

    if (Object.keys(errs).length > 0) {
      setUserErrors(errs);
      return;
    }

    if (!isOnline) {
      showToast("Se requiere conexión a internet para actualizar usuarios.", "warning");
      return;
    }

    try {
      const res = await fetch("/api/auth/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUserId,
          ...userForm,
          adminId: currentUser.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Error al actualizar usuario.", "warning");
        return;
      }

      showToast("Usuario actualizado con éxito.", "success");
      setEditingUserId(null);
      setEditUserModalOpen(false);
      setUserForm({
        nombre: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "REGISTRADOR",
        campamentoTransitorio: "Complejo Educativo República de Panamá"
      });
      setUserShowPassword(false);
      setUserShowConfirmPassword(false);
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
        }
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
      showToast("Error al exportar archivo JSON.", "error");
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
      showToast("Error al generar códigos QR.", "error");
    }
  };

  const pendingCount = localRecords.filter(r => r.status === "pending").length;

  // Local Offline statistics calculation helper
  const getLocalStats = () => {
    const activeRecords = localRecords.filter(r => (r.data as any).retirado !== "SI");
    const retiredRecords = localRecords.filter(r => (r.data as any).retirado === "SI");

    const total = activeRecords.length;
    const totalRetirados = retiredRecords.length;
    const totalRegistrados = total + totalRetirados;

    // Calculate families
    const familyGroups: Record<string, number> = {};
    activeRecords.forEach(r => {
      let familyId = "";
      if (r.data.jefeFamilia === "SI") {
        familyId = r.data.cedula;
      } else if (r.data.cedulaJefeFamilia) {
        familyId = r.data.cedulaJefeFamilia;
      } else {
        familyId = r.data.cedula;
      }
      familyGroups[familyId] = (familyGroups[familyId] || 0) + 1;
    });

    let nucleosFamiliares = 0;
    let individuosSolos = 0;
    Object.values(familyGroups).forEach(size => {
      if (size >= 2) {
        nucleosFamiliares++;
      } else {
        individuosSolos++;
      }
    });

    if (total === 0) {
      return {
        total: 0,
        totalRegistrados,
        totalRetirados,
        nucleosFamiliares: 0,
        individuosSolos: 0,
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

    activeRecords.forEach(r => {
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
      totalRegistrados,
      totalRetirados,
      nucleosFamiliares,
      individuosSolos,
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

  // Helper to generate the WhatsApp report text
  const generateReportText = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const dateTimeStr = `${day}/${month} || Hora: ${hours}:${minutes}hrs`;

    const t = currentStats.total || 0;
    const may = currentStats.mayores || 0;
    const mayM = currentStats.matrix?.mayores?.masculino || 0;
    const mayF = currentStats.matrix?.mayores?.femenino || 0;

    const ad = currentStats.adultos || 0;
    const adM = currentStats.matrix?.adultos?.masculino || 0;
    const adF = currentStats.matrix?.adultos?.femenino || 0;

    const men = currentStats.menores || 0;
    const menF = currentStats.matrix?.menores?.femenino || 0;
    const menM = currentStats.matrix?.menores?.masculino || 0;

    const entesList = entes.map(e => `- ${e}`).join("\n");

    return `*Campamento de Transición Complejo Educativo República de Panamá.*

Fecha y Hora: ${dateTimeStr}
Ubicación: https://maps.app.goo.gl/aNtWU1M5Di3u9NAV7?g_st=ic

Total general: ${t} personas
Adultos Mayores: ${may}
${String(mayM).padStart(2, '0')} masculinos
${String(mayF).padStart(2, '0')} femeninos 

Adultos: ${ad}
${String(adM).padStart(2, '0')} masculino
${String(adF).padStart(2, '0')} femenino

Niños: ${men}
${String(menF).padStart(2, '0')} niñas
${String(menM).padStart(2, '0')} niños

Personal de trabajo: ${personalTrabajo} personas.  
Entes Presentes: 
${entesList}`;
  };

  const handleShareReport = () => {
    const text = generateReportText();
    navigator.clipboard.writeText(text).then(() => {
      showToast("Reporte copiado al portapapeles.", "success");
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    }).catch(() => {
      showToast("No se pudo copiar el texto automáticamente. Cópielo manualmente.", "error");
    });
  };

  const handleAddEnte = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEnte.trim()) {
      setEntes(prev => [...prev, newEnte.trim()]);
      setNewEnte("");
    }
  };

  const handleRemoveEnte = (index: number) => {
    setEntes(prev => prev.filter((_, i) => i !== index));
  };

  const filteredRegistros = useMemo(() => {
    let result = registros;

    // Apply text search
    if (registroSearch.trim()) {
      const q = registroSearch.toLowerCase();
      result = result.filter(r =>
        r.nombreApellido?.toLowerCase().includes(q) ||
        r.cedula?.toLowerCase().includes(q) ||
        r.parroquia?.toLowerCase().includes(q)
      );
    }

    // Apply filters
    if (filterGenero) {
      result = result.filter(r => r.genero === filterGenero);
    }
    if (filterEdad) {
      result = result.filter(r => {
        const edad = r.edad || 0;
        if (filterEdad === "menores") return edad < 18;
        if (filterEdad === "adultos") return edad >= 18 && edad < 60;
        if (filterEdad === "mayores") return edad >= 60;
        return true;
      });
    }
    if (filterParroquia) {
      result = result.filter(r => r.parroquia === filterParroquia);
    }
    if (filterEstadoFisico) {
      result = result.filter(r => r.estadoFisico === filterEstadoFisico);
    }
    if (filterCuarto) {
      result = result.filter(r => {
        if (filterCuarto === "sin_asignar") return !r.cuarto;
        return r.cuarto === filterCuarto;
      });
    }
    if (filterRetirado) {
      result = result.filter(r => (r.retirado || "NO") === filterRetirado);
    }

    return result;
  }, [registros, registroSearch, filterGenero, filterEdad, filterParroquia, filterEstadoFisico, filterCuarto, filterRetirado]);

  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCuartos.forEach(room => {
      counts[room] = 0;
    });
    registros.filter(r => r.retirado !== "SI" && r.cuarto).forEach(r => {
      if (r.cuarto && counts[r.cuarto] !== undefined) {
        counts[r.cuarto]++;
      }
    });
    return counts;
  }, [registros, allCuartos]);

  const currentStats = useMemo(
    () => (isOnline && stats) ? stats : getLocalStats(),
    [isOnline, stats, localRecords]
  );

  // If user is not authenticated, show Login Screen
  if (!currentUser) {
    return (
      <div className="container">
        <div className="app-header app-header--centered" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <img src="/logo_gob.webp" alt="Logo Gobernación La Guaira" style={{ width: "90px", height: "90px", objectFit: "contain" }} />
          <div className="title-area title-area--centered">
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
              <div className="password-input-container" style={{ position: "relative", width: "100%" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  id="login-password"
                  placeholder="Contraseña"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  style={{ paddingRight: "2.5rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted, #888)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0"
                  }}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group remember-me-container" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem", marginBottom: "1rem" }}>
              <input
                type="checkbox"
                id="remember-me"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: "auto", height: "auto", cursor: "pointer" }}
              />
              <label htmlFor="remember-me" style={{ margin: 0, cursor: "pointer", fontSize: "0.875rem", userSelect: "none" }}>
                Recordarme en este dispositivo
              </label>
            </div>

            <button type="submit" className="btn-submit" disabled={loadingAuth}>
              {loadingAuth ? "Verificando..." : "Entrar al Sistema"}
            </button>

            <div style={{ marginTop: "1.5rem", textAlign: "center", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
                ¿Busca a un familiar afectado?
              </p>
              <a
                href="/buscar"
                style={{
                  display: "inline-block",
                  marginTop: "0.5rem",
                  fontSize: "0.875rem",
                  color: "var(--color-primary-hover, #2563eb)",
                  fontWeight: "600",
                  textDecoration: "underline",
                }}
              >
                Consultar Buscador Público de Familiares
              </a>
            </div>
          </form>
        </div>

        {toast && (
          <div className={`toast toast--${toast.type}`}>
            <ToastIcon type={toast.type} />
            <span className="toast-message">{toast.message}</span>
          </div>
        )}
      </div>
    );
  }

  // Authenticated Dashboard Layout
  return (
    <div className="container">
      {/* Unified App Header */}
      <header className="app-header">

        {/* ── Franja institucional ── */}
        <div className="header-main">
          <div className="header-identity">
            <div className="header-seal" aria-hidden="true" style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/logo_gob.webp" alt="Escudo Gobernación La Guaira" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div className="header-title-group">
              <span className="header-org-name">GOBERNACIÓN DEL ESTADO LA GUAIRA</span>
              <h1>REGISTRO DE AFECTADOS</h1>
              <p className="header-tagline">Sistema de Censo Sismológico · Venezuela 2026</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle-btn"
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {theme === "dark" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>

        {/* ── Franja de operación ── */}
        <div className="header-ops">
          <div className="header-ops-status">
            <span className={`status-dot ${isOnline ? "online" : "offline"}`}></span>
            <span className="header-conn">{isOnline ? "En línea" : "Sin señal"}</span>
            {(pendingCount > 0 || isSyncing) && (
              <span className="queue-badge">
                {isSyncing && syncQueueProgress
                  ? <><span className="spinner spinner-sm"></span> {syncQueueProgress.done}/{syncQueueProgress.total}</>
                  : `${pendingCount} pend.`
                }
              </span>
            )}
          </div>
          <div className="header-ops-user">
            <span className="header-operator">{currentUser.nombre}</span>
            <span className={`role-badge ${currentUser.role === "ADMIN" ? "admin" : ""}`}>{currentUser.role}</span>
            <button type="button" onClick={handleLogout} className="logout-btn" title="Cerrar sesión">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Salir
            </button>
          </div>
        </div>

      </header>

      {/* Navigation — Floating Sticky Bubble */}
      <div className="app-nav">
        <div className="nav-desktop-menu">
          {currentUser.role !== "VISUALIZADOR" && (
            <button
              type="button"
              className={`nav-btn ${activeTab === "censo" ? "active" : ""}`}
              onClick={() => setActiveTab("censo")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span>Registrar</span>
            </button>
          )}
          {(currentUser.role === "ADMIN" || currentUser.role === "VISUALIZADOR") && (
            <button
              type="button"
              className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span>Estadísticas</span>
            </button>
          )}
          <button
            type="button"
            className={`nav-btn ${activeTab === "asignaciones" ? "active" : ""}`}
            onClick={() => setActiveTab("asignaciones")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Registrados</span>
          </button>
          {isPowerAdmin && (
            <button
              type="button"
              className={`nav-btn ${activeTab === "usuarios" ? "active" : ""}`}
              onClick={() => setActiveTab("usuarios")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>Usuarios</span>
            </button>
          )}
          {currentUser.role !== "VISUALIZADOR" && (
            <button
              type="button"
              className={`nav-btn ${activeTab === "config" ? "active" : ""}`}
              onClick={() => setActiveTab("config")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41"/></svg>
              <span>Configuración</span>
            </button>
          )}
        </div>

        <div className="nav-mobile-menu">
          <div className="nav-mobile-primary">
            <span className="nav-mobile-active-tab">
              {activeTab === "censo" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Registrar</>}
              {activeTab === "dashboard" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Estadísticas</>}
              {activeTab === "asignaciones" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Registrados</>}
              {activeTab === "usuarios" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Usuarios</>}
              {activeTab === "config" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41"/></svg> Configuración</>}
            </span>
            <button
              type="button"
              className={`nav-hamburger ${menuOpen ? "open" : ""}`}
              onClick={() => setMenuOpen(m => !m)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              <span className="nav-hamburger-line" />
              <span className="nav-hamburger-line" />
              <span className="nav-hamburger-line" />
            </button>
          </div>
          {menuOpen && (
            <div className="nav-mobile-dropdown">
              {currentUser.role !== "VISUALIZADOR" && activeTab !== "censo" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("censo"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  Registrar
                </button>
              )}
              {(currentUser.role === "ADMIN" || currentUser.role === "VISUALIZADOR") && activeTab !== "dashboard" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("dashboard"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  Estadísticas
                </button>
              )}
              {activeTab !== "asignaciones" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("asignaciones"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Registrados
                </button>
              )}
              {isPowerAdmin && activeTab !== "usuarios" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("usuarios"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Usuarios
                </button>
              )}
              {currentUser.role !== "VISUALIZADOR" && activeTab !== "config" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("config"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41"/></svg>
                  Configuración
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: FORM VIEW (CENSO) */}
      {activeTab === "censo" && (
        <>
          {currentUser.role === "REGISTRADOR" || currentUser.role === "ADMIN" ? (
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
        </>
      )}

      {/* TAB 2: DASHBOARD VIEW (ADMIN ONLY) */}
      {activeTab === "dashboard" && currentUser.role === "ADMIN" && (
        <div ref={dashboardRef} className={`tab-view tab-view--dashboard ${isFullscreen ? "presentation-mode" : ""}`}>

          <div className="dashboard-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h2 className="dashboard-section-title" style={{ margin: 0 }}>Panel de Estadísticas</h2>
              {isUpdatingPresentation && (
                <span className="updating-pulse-indicator" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.7rem", color: "var(--color-success)", fontWeight: "600" }}>
                  <span className="pulse-dot" style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-success)" }}></span>
                  Actualizando...
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "auto", margin: 0, padding: "0 1rem", height: "var(--element-height, 42px)", display: "flex", alignItems: "center", gap: "0.5rem" }}
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                  } else {
                    dashboardRef.current?.requestFullscreen();
                  }
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                {isFullscreen ? "Salir Presentación" : "Modo Presentación"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "auto", margin: 0, padding: "0 1rem", height: "var(--element-height, 42px)", display: "flex", alignItems: "center", gap: "0.5rem" }}
                onClick={() => window.print()}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Imprimir / PDF
              </button>
              <button
                type="button"
                className="btn-submit"
                style={{ width: "auto", margin: 0, padding: "0 1.25rem", height: "var(--element-height, 42px)", display: "flex", alignItems: "center", gap: "0.5rem" }}
                onClick={() => setShowReportModal(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                Generar Reporte WhatsApp
              </button>
            </div>
          </div>

          {/* Connection status notification for stats */}
          {!isOnline && (
            <div className="status-bar status-bar--warning">
              <div className="status-indicator">
                <span className="status-dot offline"></span>
                <span className="text-warning">Modo Offline: Estadísticas de registros locales</span>
              </div>
            </div>
          )}

          {loadingStats ? (
            <div className="form-card loading-center">
              <span className="spinner spinner-lg"></span>
              <span>Cargando métricas consolidadas...</span>
            </div>
          ) : (
            <>
              {/* Stat Cards Grid */}
              <div className="stats-grid">
                <div className="stat-card stat-card--primary">
                  <div className="stat-card-header">
                    <span className="stat-label">Total Registrados</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stat-icon stat-icon-primary"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  </div>
                  <span key={currentStats.totalRegistrados} className="stat-value stat-card-value-animate">{currentStats.totalRegistrados || 0}</span>
                </div>
                <div className="stat-card stat-card--success">
                  <div className="stat-card-header">
                    <span className="stat-label">Presentes en Campamento</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stat-icon stat-icon-success"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  </div>
                  <span key={currentStats.total} className="stat-value stat-card-value-animate">{currentStats.total || 0}</span>
                </div>
                <div className="stat-card stat-card--violet">
                  <div className="stat-card-header">
                    <span className="stat-label">Núcleos Familiares</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stat-icon stat-icon-violet"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>
                  </div>
                  <span key={currentStats.nucleosFamiliares} className="stat-value stat-card-value-animate">{currentStats.nucleosFamiliares || 0}</span>
                </div>
                <div className="stat-card stat-card--muted">
                  <div className="stat-card-header">
                    <span className="stat-label">Individuos Solos</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stat-icon stat-icon-muted"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8"/></svg>
                  </div>
                  <span key={currentStats.individuosSolos} className="stat-value stat-card-value-animate">{currentStats.individuosSolos || 0}</span>
                </div>
                <div className="stat-card stat-card--warning">
                  <div className="stat-card-header">
                    <span className="stat-label">Menores (&lt;18)</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stat-icon stat-icon-warning"><path d="M14 18a6 6 0 0 0-12 0" /><circle cx="8" cy="8" r="4" /><path d="M12 11h8" /><path d="M12 15h6" /></svg>
                  </div>
                  <span key={currentStats.menores} className="stat-value stat-card-value-animate">
                    {currentStats.menores || 0}
                    <span className="stat-pct">
                      ({currentStats.total > 0 ? ((currentStats.menores / currentStats.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="stat-card stat-card--success">
                  <div className="stat-card-header">
                    <span className="stat-label">Adultos (18-59)</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stat-icon stat-icon-success"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                  </div>
                  <span key={currentStats.adultos} className="stat-value stat-card-value-animate">
                    {currentStats.adultos || 0}
                    <span className="stat-pct">
                      ({currentStats.total > 0 ? ((currentStats.adultos / currentStats.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="stat-card stat-card--violet">
                  <div className="stat-card-header">
                    <span className="stat-label">Mayores (60+)</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stat-icon stat-icon-violet"><path d="M20 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M2 21h12" /><circle cx="8" cy="7" r="4" /></svg>
                  </div>
                  <span key={currentStats.mayores} className="stat-value stat-card-value-animate">
                    {currentStats.mayores || 0}
                    <span className="stat-pct">
                      ({currentStats.total > 0 ? ((currentStats.mayores / currentStats.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="stat-card stat-card--danger">
                  <div className="stat-card-header">
                    <span className="stat-label">Personas Retiradas</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stat-icon stat-icon-danger" style={{ color: "var(--color-danger)" }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="8" x2="22" y2="13" /><line x1="22" y1="8" x2="17" y2="13" /></svg>
                  </div>
                  <span key={currentStats.totalRetirados} className="stat-value stat-card-value-animate">{currentStats.totalRetirados || 0}</span>
                </div>
              </div>

              <div className="stats-charts-grid">
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
                        { pct: pMen, count: currentStats.menores || 0, color: "var(--chart-menores)" },
                        { pct: pAd,  count: currentStats.adultos  || 0, color: "var(--chart-adultos)" },
                        { pct: pMay, count: currentStats.mayores  || 0, color: "var(--chart-mayores)" }
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
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "var(--chart-menores)" }}></span> Menores ({pMen.toFixed(1)}%)</span>
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "var(--chart-adultos)" }}></span> Adultos ({pAd.toFixed(1)}%)</span>
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "var(--chart-mayores)" }}></span> Mayores ({pMay.toFixed(1)}%)</span>
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
                      { count: f, pct: pFem,  color: "var(--chart-femenino)",  label: "Femenino"  },
                      { count: m, pct: pMasc, color: "var(--chart-masculino)", label: "Masculino" },
                      { count: o, pct: pOtro, color: "var(--chart-otro)",      label: "No especif." }
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
                  <p className="data-empty">
                    No hay datos registrados aún.
                  </p>
                ) : (
                  <div className="bar-list">
                    {[...currentStats.byParroquia]
                      .sort((a: any, b: any) => b.count - a.count)
                      .map((p: any, i: number) => {
                        const pct = currentStats.total > 0 ? Math.round((p.count / currentStats.total) * 100) : 0;
                        return (
                          <div key={p.name} className="bar-item">
                            <div className="bar-item-header">
                              <span>{p.name}</span>
                              <span className="bar-item-meta">{p.count} <span className="bar-item-pct">({pct}%)</span></span>
                            </div>
                            <div className="bar-track">
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
                <div className="tab-view" style={{ gap: "1rem" }}>
                  {/* Estado Físico - Gauges semicirculares SVG */}
                  <div>
                    <h4 className="subsection-title">Estado Físico</h4>
                    {currentStats.byEstadoFisico.length === 0 ? (
                      <p className="data-empty-sm">Sin datos</p>
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
                          { label: "Ilesos",     count: ileso,    pct: (ileso    / t * 100), color: "var(--chart-ileso)",    track: "var(--chart-ileso-track)" },
                          { label: "Lesionados", count: lesionado, pct: (lesionado / t * 100), color: "var(--chart-lesionado)", track: "var(--chart-lesionado-track)" }
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
                    <h4 className="subsection-title subsection-title--compact">Patologías Crónicas</h4>
                    {currentStats.byPatologia.length === 0 ? (
                      <p className="data-empty-sm">Sin datos</p>
                    ) : (
                      <div className="bar-list bar-list--sm">
                        {currentStats.byPatologia.map((pat: any) => {
                          const percentage = currentStats.total > 0 ? Math.round((pat.count / currentStats.total) * 100) : 0;
                          const barColor = pat.name === "SI" ? "var(--color-warning)" : "#94a3b8";
                          return (
                            <div key={pat.name} className="bar-item">
                              <div className="bar-item-header bar-item-header--sm">
                                <span>{pat.name === "SI" ? "SÍ POSEE PATOLOGÍA" : "NO POSEE PATOLOGÍA"}</span>
                                <span>{pat.count} ({percentage}%)</span>
                              </div>
                              <div className="bar-track-sm">
                                <div className="bar-fill" style={{ width: `${percentage}%`, background: barColor }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Distribución por Habitación / Salón */}
              <div className="dashboard-section" style={{ gridColumn: "span 3", marginTop: "1rem" }}>
                <h3 className="dashboard-section-title">Distribución por Habitación / Salón</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem" }}>
                  {allCuartos.map(room => {
                    const count = roomCounts[room] || 0;
                    
                    let colorClass = "salon-green";
                    if (count >= 17) {
                      colorClass = "salon-red";
                    } else if (count >= 11) {
                      colorClass = "salon-yellow";
                    }

                    return (
                      <div
                        key={room}
                        className={`stat-card ${colorClass}`}
                        style={{ padding: "0.75rem", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span style={{ fontSize: "0.85rem", fontWeight: "700" }}>{formatRoomLabel(room)}</span>
                        <span style={{
                          fontWeight: "800",
                          fontSize: "0.95rem"
                        }}>
                          {count} {count === 1 ? 'ocupante' : 'ocupantes'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
        </div>
      )}

      {/* TAB 3: USER ADMINISTRATION (ADMIN ONLY) */}
      {activeTab === "usuarios" && isPowerAdmin && (
        <div className="tab-view" style={{ display: "flex", flexDirection: "column" }}>
          
          {/* Registered Users Table Card (Spacious Layout) */}
          <div className="history-card" style={{ width: "100%", maxWidth: "100%", margin: 0, padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <span className="history-title" style={{ display: "block", marginBottom: "0.25rem" }}>OPERADORES DEL SISTEMA</span>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
                  Gestione las cuentas de operadores, asignación de campamentos y niveles de acceso administrativo y consulta.
                </p>
              </div>
              {isOnline && (
                <button
                  type="button"
                  className="btn-submit"
                  style={{ width: "auto", margin: 0, padding: "0 1.25rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
                  onClick={() => {
                    setCreateUserModalOpen(true);
                    setUserForm({
                      nombre: "",
                      email: "",
                      password: "",
                      confirmPassword: "",
                      role: "REGISTRADOR",
                      campamentoTransitorio: "Complejo Educativo República de Panamá"
                    });
                    setUserErrors({});
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Registrar Nuevo Operador
                </button>
              )}
            </div>

            {!isOnline && (
              <p className="status-msg status-msg--warning" style={{ margin: "0.5rem 0" }}>
                Sin conexión. No es posible listar o registrar operadores.
              </p>
            )}
            
            {loadingUsers ? (
              <div className="loading-center" style={{ minHeight: "200px" }}>
                <span className="spinner"></span>
              </div>
            ) : systemUsers.length === 0 ? (
              <p className="data-empty" style={{ padding: "3rem 1rem" }}>
                No hay operadores cargados o se requiere conexión para consultar.
              </p>
            ) : (
              <div className="registro-table-wrapper">
                <table className="registro-table">
                  <thead>
                    <tr>
                      <th>Nombre y Apellido</th>
                      <th>Correo de Acceso</th>
                      <th>Rol</th>
                      <th>Campamento Asignado</th>
                      <th style={{ textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemUsers.map((usr) => (
                      <tr key={usr.id}>
                        <td><strong>{usr.nombre}</strong></td>
                        <td>{usr.email}</td>
                        <td>
                          <span className={`queue-badge ${
                            usr.role === "ADMIN" 
                              ? "queue-badge--role-admin" 
                              : usr.role === "VISUALIZADOR"
                              ? "queue-badge--role-visualizador"
                              : "queue-badge--role-registrador"
                          }`} style={usr.role === "VISUALIZADOR" ? {
                            backgroundColor: "rgba(99, 102, 241, 0.1)",
                            color: "#818cf8",
                            border: "1px solid rgba(99, 102, 241, 0.2)"
                          } : undefined}>
                            {usr.role === "ADMIN" ? "ADMINISTRADOR" : usr.role === "VISUALIZADOR" ? "VISUALIZADOR" : "REGISTRADOR"}
                          </span>
                        </td>
                        <td>{usr.campamentoTransitorio || "Sin campamento"}</td>
                        <td style={{ textAlign: "right" }}>
                          {isOnline && (
                            <button
                              type="button"
                              className="btn-ver"
                              style={{ padding: "0.35rem 0.75rem", fontSize: "0.775rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", height: "auto" }}
                              onClick={() => {
                                setEditingUserId(usr.id);
                                setUserForm({
                                  nombre: usr.nombre,
                                  email: usr.email,
                                  password: "",
                                  confirmPassword: "",
                                  role: usr.role,
                                  campamentoTransitorio: usr.campamentoTransitorio || "Complejo Educativo República de Panamá"
                                });
                                setUserErrors({});
                                setEditUserModalOpen(true);
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CONFIGURATION & DATABASE STATS VIEW */}
      {activeTab === "config" && (
        <div className="tab-view">
          
          {/* Operator Profile Details */}
          <div className="history-card history-card--gap-sm">
            <span className="history-title">PERFIL DE OPERADOR</span>
            <div className="profile-grid">
              <span className="profile-grid-label">Nombre:</span>
              <strong>{currentUser.nombre}</strong>
              <span className="profile-grid-label">Usuario:</span>
              <strong>{currentUser.email}</strong>
              <span className="profile-grid-label">Rol:</span>
              <strong className="profile-grid-value-accent">{currentUser.role}</strong>
              <span className="profile-grid-label">Notificaciones PWA:</span>
              <span>
                {typeof window !== "undefined" && (!("serviceWorker" in navigator) || !("PushManager" in window)) ? (
                  <span style={{ color: "#ef4444", fontWeight: "700" }}>⚠️ No soportado (Requiere HTTPS)</span>
                ) : permissionState === "granted" ? (
                  <span style={{ color: "#10b981", fontWeight: "700" }}>🟢 Activo (Suscrito)</span>
                ) : permissionState === "denied" ? (
                  <span style={{ color: "#ef4444", fontWeight: "700" }}>🔴 Bloqueado (Restablecer permisos en navegador)</span>
                ) : (
                  <span style={{ color: "#f59e0b", fontWeight: "700" }}>🟡 Pendiente (Inicia sesión como ADMIN para habilitar)</span>
                )}
              </span>
            </div>
          </div>

          {/* Voter Database Management */}
          <div className="history-card">
            <div className="card-header-row">
              <span className="history-title" style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                Padrón Electoral Local
              </span>
              {votersCount > 0 && syncStatus === "idle" && (
                <button 
                  type="button" 
                  onClick={deletePadronLocal}
                  className="btn-link-danger"
                >
                  Borrar local
                </button>
              )}
            </div>

            {votersCount > 0 ? (
              <div className="padron-installed">
                Padrón electoral instalado ({votersCount.toLocaleString()} ciudadanos)
              </div>
            ) : (
              <div className="padron-missing">
                Padrón offline no instalado. El censo no autocompletará datos.
              </div>
            )}

            {syncStatus === "idle" && votersCount === 0 && (
              <button 
                type="button" 
                onClick={downloadFullPadron} 
                disabled={!isOnline}
                className="btn-submit btn-submit--sm"
              >
                Descargar Padrón Completo
              </button>
            )}

            {syncStatus === "downloading" && (
              <div className="status-msg status-msg--warning">
                <span className="spinner"></span> Descargando datos del padrón...
              </div>
            )}

            {syncStatus === "saving" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <div className="padron-status-count-row status-msg--warning">
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span className="spinner spinner-sm"></span>
                    Guardando en dispositivo...
                  </span>
                  <span className="tabular-num">
                    {syncProgress.toLocaleString()} reg.
                  </span>
                </div>
                <div className="padron-progress-track">
                  <div
                    className="padron-indeterminate-bar"
                    style={{ height: "100%", background: "var(--color-warning)" }}
                  />
                </div>
              </div>
            )}

            {syncStatus === "completed" && (
              <div className="status-msg status-msg--success">
                Instalación completa. Ciudadanos listos para lookup local.
              </div>
            )}

            {syncStatus === "error" && (
              <div className="status-msg status-msg--danger">
                Error al descargar el padrón. Verifique conexión de internet.
              </div>
            )}
          </div>

          {/* Backup warning panels */}
          {pendingCount > 0 && (
            <div className="history-card history-card--alert history-card--gap-sm">
              <span className="history-title text-warning" style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                Respaldo y Transferencia de Emergencia
              </span>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.3" }}>
                Posee {pendingCount} registros locales en cola. Si necesita transferirlos a otro dispositivo offline por contingencia de red, use las siguientes opciones:
              </p>
              <div className="transfer-grid">
                <button 
                  type="button" 
                  onClick={handleExportJSON}
                  className="radio-card transfer-btn"
                >
                  Exportar Respaldo (JSON)
                </button>
                <button 
                  type="button" 
                  onClick={handleGenerateQRs}
                  className="radio-card transfer-btn transfer-btn--primary"
                >
                  Generar Lotes (QR)
                </button>
              </div>
            </div>
          )}

          {/* Sync Detailed Audit Queue List */}
          <div className="history-card history-card--gap-sm">
            <div className="card-header-row">
              <span className="history-title">Auditoría y Registros Locales</span>
              <button 
                type="button" 
                onClick={triggerSync} 
                disabled={isSyncing || !isOnline}
                className="btn-link"
              >
                Sincronizar cola
              </button>
            </div>

            {localRecords.length === 0 ? (
              <p className="data-empty">
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
                    <div
                      className="sync-log-item"
                      key={r.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setSelectedLocalRecord(r);
                        const cleanCed = r.data.cedula.replace(/^[VE]-/, "");
                        const nac = r.data.cedula.startsWith("E") ? "E" : "V";
                        setLocalEditCedula(cleanCed);
                        setLocalEditNombre(r.data.nombreApellido);
                        setLocalEditNacionalidad(nac);
                        setShowLocalEditModal(true);
                      }}
                    >
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

          {/* Gestión de Habitaciones — solo ADMIN */}
          {currentUser.role === "ADMIN" && (
            <div className="history-card history-card--gap-sm">
              <span className="history-title">GESTIÓN DE EDIFICIOS Y SALONES</span>

              {/* Formulario para agregar */}
              <div className="room-add-form">
                <div className="room-add-inputs">
                  <div className="room-add-field">
                    <label className="room-add-label">Edificio</label>
                    <input
                      className="room-add-input"
                      placeholder="ej: 3"
                      value={newBuilding}
                      onChange={e => setNewBuilding(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addCustomCuarto()}
                    />
                  </div>
                  <div className="room-add-field">
                    <label className="room-add-label">Salón</label>
                    <input
                      className="room-add-input"
                      placeholder="ej: 33"
                      value={newSalon}
                      onChange={e => setNewSalon(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addCustomCuarto()}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-submit btn-submit--sm"
                    onClick={addCustomCuarto}
                    disabled={!newBuilding.trim() || !newSalon.trim()}
                  >
                    Agregar
                  </button>
                </div>
                {newBuilding.trim() && newSalon.trim() && (
                  <p className="room-add-preview">
                    Se agregará: <strong>Edif. {newBuilding.trim()} &mdash; Salón {newSalon.trim()}</strong>
                  </p>
                )}
              </div>

              {/* Listado de todas las habitaciones */}
              <div className="room-list-section">
                <span className="room-list-label">Habitaciones Registradas en el Sistema ({customCuartos.length})</span>
                {customCuartos.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.5rem 0 0 0" }}>
                    No hay habitaciones registradas en la base de datos.
                  </p>
                ) : (
                  <div className="room-chip-list" style={{ marginTop: "0.5rem" }}>
                    {customCuartos.map(c => (
                      <span key={c} className="room-chip room-chip--custom">
                        {formatRoomLabel(c)}
                        <button
                          type="button"
                          className="room-chip-remove"
                          onClick={() => removeCustomCuarto(c)}
                          title="Eliminar Habitación"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ASIGNACIONES */}
      {activeTab === "asignaciones" && (
        <div className="tab-view">
          <div className="dashboard-section">
            <div className="asign-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <div className="dashboard-section-title">Registro de Afectados</div>
                {!loadingRegistros && (
                  <span className="asign-count" style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {filteredRegistros.length} de {registros.length}
                  </span>
                )}
              </div>
              {currentUser.role === "ADMIN" && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: "auto", margin: 0, padding: "0 0.75rem", fontSize: "0.75rem", height: "32px", display: "flex", alignItems: "center", gap: "0.25rem" }}
                    onClick={handleExportExcel}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    Exportar Excel
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: "auto", margin: 0, padding: "0 0.75rem", fontSize: "0.75rem", height: "32px", display: "flex", alignItems: "center", gap: "0.25rem" }}
                    onClick={handlePrintPDFList}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Imprimir PDF Presentes
                  </button>
                </div>
              )}
            </div>

            <div className="asign-search-wrap" style={{ marginBottom: "0.5rem" }}>
              <input
                type="text"
                placeholder="Buscar por nombre, cédula o parroquia..."
                value={registroSearch}
                onChange={e => setRegistroSearch(e.target.value)}
              />
              {registroSearch && (
                <button
                  className="asign-search-clear"
                  onClick={() => setRegistroSearch("")}
                  aria-label="Limpiar búsqueda"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-secondary"
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "0 0.75rem",
                  fontSize: "0.75rem",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  backgroundColor: filtersOpen ? "var(--color-primary-light)" : undefined,
                  color: filtersOpen ? "var(--color-primary)" : undefined
                }}
                onClick={() => setFiltersOpen(o => !o)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                {filtersOpen ? "Ocultar Filtros" : "Filtros Avanzados"}
              </button>

              {(filterGenero || filterEdad || filterParroquia || filterEstadoFisico || filterCuarto || filterRetirado !== "NO") && (
                <button
                  type="button"
                  className="btn-ver"
                  style={{
                    width: "auto",
                    margin: 0,
                    padding: "0 0.75rem",
                    fontSize: "0.75rem",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    backgroundColor: "rgba(220, 38, 38, 0.08)",
                    color: "var(--color-danger)",
                    border: "1px solid rgba(220, 38, 38, 0.25)"
                  }}
                  onClick={() => {
                    setFilterGenero("");
                    setFilterEdad("");
                    setFilterParroquia("");
                    setFilterEstadoFisico("");
                    setFilterCuarto("");
                    setFilterRetirado("NO");
                  }}
                >
                  Limpiar Filtros
                </button>
              )}
            </div>

            {filtersOpen && (
              <div style={{
                marginBottom: "1rem",
                padding: "1rem",
                backgroundColor: "var(--input-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "1rem"
              }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: "700", marginBottom: "0.25rem" }}>Género</label>
                  <select
                    value={filterGenero}
                    onChange={e => setFilterGenero(e.target.value)}
                    style={{ width: "100%", height: "36px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", fontSize: "0.8rem", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">Todos</option>
                    <option value="MASCULINO">Masculino</option>
                    <option value="FEMENINO">Femenino</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: "700", marginBottom: "0.25rem" }}>Grupo de Edad</label>
                  <select
                    value={filterEdad}
                    onChange={e => setFilterEdad(e.target.value)}
                    style={{ width: "100%", height: "36px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", fontSize: "0.8rem", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">Todos</option>
                    <option value="menores">Menores de edad (&lt;18)</option>
                    <option value="adultos">Adultos (18-59)</option>
                    <option value="mayores">Adultos mayores (60+)</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: "700", marginBottom: "0.25rem" }}>Parroquia</label>
                  <select
                    value={filterParroquia}
                    onChange={e => setFilterParroquia(e.target.value)}
                    style={{ width: "100%", height: "36px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", fontSize: "0.8rem", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">Todas</option>
                    {PARROQUIAS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: "700", marginBottom: "0.25rem" }}>Estado Físico</label>
                  <select
                    value={filterEstadoFisico}
                    onChange={e => setFilterEstadoFisico(e.target.value)}
                    style={{ width: "100%", height: "36px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", fontSize: "0.8rem", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">Todos</option>
                    <option value="ILESO">Ileso</option>
                    <option value="LESIONADO">Lesionado</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: "700", marginBottom: "0.25rem" }}>Habitación / Salón</label>
                  <select
                    value={filterCuarto}
                    onChange={e => setFilterCuarto(e.target.value)}
                    style={{ width: "100%", height: "36px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", fontSize: "0.8rem", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">Todos</option>
                    <option value="sin_asignar">Sin asignar</option>
                    {allCuartos.map(c => (
                      <option key={c} value={c}>{formatRoomLabel(c)}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: "700", marginBottom: "0.25rem" }}>Estatus de Permanencia</label>
                  <select
                    value={filterRetirado}
                    onChange={e => setFilterRetirado(e.target.value)}
                    style={{ width: "100%", height: "36px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", fontSize: "0.8rem", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">Todos (Presentes y Egresados)</option>
                    <option value="NO">Presentes actualmente</option>
                    <option value="SI">Egresados / Retirados</option>
                  </select>
                </div>
              </div>
            )}

            {loadingRegistros ? (
              <div className="text-muted" style={{ textAlign: "center", padding: "2rem" }}>
                Cargando registros...
              </div>
            ) : registros.length === 0 ? (
              <div className="text-muted" style={{ textAlign: "center", padding: "2rem" }}>
                No hay afectados registrados o no se pudo conectar a la base de datos.
              </div>
            ) : filteredRegistros.length === 0 ? (
              <div className="text-muted" style={{ textAlign: "center", padding: "2rem" }}>
                Sin resultados para &ldquo;{registroSearch}&rdquo;
              </div>
            ) : (
              <div className="registro-table-wrapper">
                <table className="registro-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre y Apellido</th>
                      <th className="col-cedula">Cédula</th>
                      <th className="col-parroquia">Parroquia</th>
                      <th>Estado</th>
                      <th>Cuarto</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRegistros.map((reg, i) => (
                      <tr key={reg.id}>
                        <td className="col-num">{i + 1}</td>
                        <td className="col-nombre">{reg.nombreApellido}</td>
                        <td className="col-cedula">{reg.cedula}</td>
                        <td className="col-parroquia">{reg.parroquia}</td>
                        <td className="col-estado">
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span className={`estado-pill ${reg.estadoFisico === "LESIONADO" ? "estado-pill--danger" : "estado-pill--ok"}`}>
                              {reg.estadoFisico}
                            </span>
                            {reg.retirado === "SI" && (
                              <span className="estado-pill" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.4)" }}>
                                RETIRADO
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="col-cuarto">
                          {reg.cuarto
                            ? <span className="cuarto-badge cuarto-badge--assigned">{reg.cuarto}</span>
                            : <span className="cuarto-badge cuarto-badge--none">Sin asignar</span>
                          }
                        </td>
                        <td className="col-action">
                          <button
                            className="btn-ver"
                            onClick={() => {
                              setSelectedRegistro(reg);
                              setAsignCuarto(reg.cuarto || "");
                              setEditMode(false);
                              setEditData({});
                            }}
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Registro Detail & Edit & Asignación Modal */}
      {selectedRegistro && (
        <div className="modal-overlay" onClick={() => { setSelectedRegistro(null); setEditMode(false); }}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()}>

            {/* ── Header ── */}
            <div className="modal-header">
              <div>
                <span className="modal-title">
                  {editMode ? "Editar Registro" : selectedRegistro.nombreApellido}
                </span>
                <div className="modal-subtitle" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span>C.I. {selectedRegistro.cedula}</span>
                  {!editMode && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", fontWeight: "700", color: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)" }}>
                      <span style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        backgroundColor: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)",
                        display: "inline-block"
                      }}></span>
                      {selectedRegistro.estadoFisico}
                    </span>
                  )}
                </div>
              </div>
              <button className="modal-close" onClick={() => { setSelectedRegistro(null); setEditMode(false); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* ── VISTA DETALLE ── */}
            {!editMode && (
              <>
                <div className="detail-grid">
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Nombre y Apellido</span>
                    <span className="detail-value">{selectedRegistro.nombreApellido}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Edad</span>
                    <span className="detail-value">{selectedRegistro.edad} años</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Género</span>
                    <span className="detail-value">{selectedRegistro.genero}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Estado Físico</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: "700", color: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)" }}>
                      <span style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        backgroundColor: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)",
                        display: "inline-block"
                      }}></span>
                      {selectedRegistro.estadoFisico}
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Jefe de Familia</span>
                    <span className="detail-value">{selectedRegistro.jefeFamilia}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Pertenece a Núcleo</span>
                    <span className="detail-value">{selectedRegistro.perteneceNucleo || "NO"}</span>
                  </div>
                  {selectedRegistro.perteneceNucleo === "SI" && selectedRegistro.jefeFamilia === "NO" && selectedRegistro.cedulaJefeFamilia && (
                    <div className="detail-field">
                      <span className="detail-label">Cédula Jefe de Familia</span>
                      <span className="detail-value">{selectedRegistro.cedulaJefeFamilia}</span>
                    </div>
                  )}
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Parroquia</span>
                    <span className="detail-value">{selectedRegistro.parroquia}</span>
                  </div>
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Sector / Comunidad</span>
                    <span className="detail-value">{selectedRegistro.sector} — {selectedRegistro.comunidad}</span>
                  </div>
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Dirección Exacta</span>
                    <span className="detail-value">{selectedRegistro.direccionExacta}</span>
                  </div>
                  {selectedRegistro.telefono && (
                    <div className="detail-field">
                      <span className="detail-label">Teléfono</span>
                      <span className="detail-value">{selectedRegistro.telefono}</span>
                    </div>
                  )}
                  {selectedRegistro.patologia === "SI" && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Patología</span>
                      <span className="detail-value">{selectedRegistro.patologiaDescripcion || "Sí"}</span>
                    </div>
                  )}
                  {(selectedRegistro.patologia === "SI" || selectedRegistro.estadoFisico === "LESIONADO") && Array.isArray(selectedRegistro.medicamentos) && selectedRegistro.medicamentos.length > 0 && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Medicamentos</span>
                      <div className="med-table-view">
                        <div className="med-row med-row--header">
                          <span>Nombre</span>
                          <span>Dosis</span>
                          <span>Período</span>
                        </div>
                        {(selectedRegistro.medicamentos as Medicamento[]).map((m, i) => (
                          <div key={i} className="med-row med-row--readonly">
                            <span>{m.nombre}</span>
                            <span>{m.dosis}</span>
                            <span>{m.periodo}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedRegistro.cuarto && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Cuarto Asignado</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: "700", color: "var(--color-success)" }}>
                        <span style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          backgroundColor: "var(--color-success)",
                          display: "inline-block"
                        }}></span>
                        {selectedRegistro.cuarto}
                      </span>
                    </div>
                  )}
                  {selectedRegistro.retirado === "SI" && (
                    <div className="detail-field detail-field--full" style={{ borderLeft: "3px solid var(--color-danger, #e53e3e)", paddingLeft: "8px" }}>
                      <span className="detail-label" style={{ color: "var(--color-danger, #e53e3e)" }}>Estado: RETIRADO / EGRESADO</span>
                      <span className="detail-value">
                        {selectedRegistro.retiradoRazon && <div><strong>Razón:</strong> {selectedRegistro.retiradoRazon}</div>}
                        {selectedRegistro.retiradoFecha && (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            <strong>Fecha/Hora:</strong> {new Date(selectedRegistro.retiradoFecha).toLocaleString("es-VE")}
                          </div>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                 {currentUser.role === "ADMIN" && (
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", width: "100%" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{
                          flex: 1,
                          margin: 0,
                          backgroundColor: "var(--color-danger-light)",
                          color: "var(--color-danger)",
                          borderColor: "rgba(220, 38, 38, 0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          height: "var(--element-height, 42px)"
                        }}
                        onClick={() => {
                          const confirmDel = window.confirm(`¿Está seguro de que desea eliminar permanentemente a ${selectedRegistro.nombreApellido} de los registros? Esta acción no se puede deshacer.`);
                          if (confirmDel) {
                            handleDeleteRegistro(selectedRegistro.id);
                          }
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        Eliminar
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", height: "var(--element-height, 42px)" }}
                        onClick={() => {
                          setEditMode(true);
                          const isoDateStr = selectedRegistro.fechaNacimiento;
                          let formattedBirthDate = "";
                          if (isoDateStr) {
                            const dObj = new Date(isoDateStr);
                            if (!isNaN(dObj.getTime())) {
                              const day = String(dObj.getDate()).padStart(2, "0");
                              const month = String(dObj.getMonth() + 1).padStart(2, "0");
                              const year = dObj.getFullYear();
                              formattedBirthDate = `${day}/${month}/${year}`;
                            }
                          }
                          let nac = "V";
                          let num = selectedRegistro.cedula;
                          if (selectedRegistro.cedula.startsWith("V-")) {
                            nac = "V";
                            num = selectedRegistro.cedula.slice(2);
                          } else if (selectedRegistro.cedula.startsWith("E-")) {
                            nac = "E";
                            num = selectedRegistro.cedula.slice(2);
                          } else if (selectedRegistro.cedula.startsWith("V")) {
                            nac = "V";
                            num = selectedRegistro.cedula.slice(1);
                          } else if (selectedRegistro.cedula.startsWith("E")) {
                            nac = "E";
                            num = selectedRegistro.cedula.slice(1);
                          }

                          let jefeNum = selectedRegistro.cedulaJefeFamilia || "";
                          if (jefeNum.startsWith("V-") || jefeNum.startsWith("E-")) {
                            jefeNum = jefeNum.slice(2);
                          } else if (jefeNum.startsWith("V") || jefeNum.startsWith("E")) {
                            jefeNum = jefeNum.slice(1);
                          }

                          setEditData({
                            nacionalidad: nac,
                            cedula: num,
                            nombreApellido: selectedRegistro.nombreApellido,
                            parroquia: selectedRegistro.parroquia,
                            sector: selectedRegistro.sector,
                            comunidad: selectedRegistro.comunidad,
                            direccionExacta: selectedRegistro.direccionExacta,
                            genero: selectedRegistro.genero,
                            estadoFisico: selectedRegistro.estadoFisico,
                            patologia: selectedRegistro.patologia,
                            patologiaDescripcion: selectedRegistro.patologiaDescripcion || "",
                            telefono: selectedRegistro.telefono || "",
                            retirado: selectedRegistro.retirado || "NO",
                            retiradoRazon: selectedRegistro.retiradoRazon || "",
                            fechaNacimiento: formattedBirthDate,
                            jefeFamilia: selectedRegistro.jefeFamilia || "NO",
                            perteneceNucleo: selectedRegistro.perteneceNucleo || "NO",
                            cedulaJefeFamilia: jefeNum,
                          });
                          setEditMedicamentos(Array.isArray(selectedRegistro.medicamentos) ? selectedRegistro.medicamentos : []);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Editar Datos
                      </button>
                    </div>
                 )}
              </>
            )}

            {/* ── MODO EDICIÓN ── */}
            {editMode && (
              <>
                <div className="detail-edit-grid">
                  {currentUser.role === "ADMIN" && (
                    <>
                      <div className="form-group detail-field--full" style={{ marginBottom: "0.25rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "700", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={editData.isChildDependent || false}
                            onChange={(e) => {
                              setEditData(prev => ({ ...prev, isChildDependent: e.target.checked }));
                            }}
                          />
                          Menor de edad sin cédula (hijo/dependiente)
                        </label>
                      </div>

                      <div className="form-group detail-field--full">
                        <label>{editData.isChildDependent ? "Cédula del Representante" : "Cédula de Identidad"}</label>
                        <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                          <select
                            value={editData.nacionalidad || "V"}
                            onChange={e => setEditData(prev => ({ ...prev, nacionalidad: e.target.value }))}
                            style={{ width: "80px", height: "42px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem" }}
                          >
                            <option value="V">V</option>
                            <option value="E">E</option>
                          </select>
                          <input
                            type="text"
                            value={editData.cedula || ""}
                            onChange={e => setEditData(prev => ({ ...prev, cedula: e.target.value.replace(/\D/g, "") }))}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn-submit"
                            style={{ width: "auto", margin: 0, padding: "0 1rem", fontSize: "0.8rem", height: "auto" }}
                            onClick={async () => {
                              if (!editData.cedula) return;
                              const citizen = await buscarCedulaEnCliente(String(editData.cedula));
                              if (citizen) {
                                setEditData(prev => ({
                                  ...prev,
                                  nombreApellido: citizen.nombreCompleto || prev.nombreApellido,
                                  genero: citizen.sexo === "F" || citizen.sexo === "FEMENINO" ? "FEMENINO" : "MASCULINO"
                                }));
                                showToast("Datos cargados del padrón local", "success");
                              } else {
                                showToast("Cédula no encontrada en el padrón local", "warning");
                              }
                            }}
                          >
                            Consultar Padrón
                          </button>
                        </div>
                      </div>

                      {editData.isChildDependent && (
                        <div className="form-group detail-field--full">
                          <label>Número correlativo de hijo/dependiente</label>
                          <select
                            value={editData.dependentNumber || "1"}
                            onChange={(e) => setEditData(prev => ({ ...prev, dependentNumber: e.target.value }))}
                            style={{ width: "100%", height: "42px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
                          >
                            <option value="1">1er Hijo/Representado (-1)</option>
                            <option value="2">2do Hijo/Representado (-2)</option>
                            <option value="3">3er Hijo/Representado (-3)</option>
                            <option value="4">4to Hijo/Representado (-4)</option>
                            <option value="5">5to Hijo/Representado (-5)</option>
                          </select>
                        </div>
                      )}
                    </>
                  )}
                  <div className="form-group detail-field--full">
                    <label>Nombre y Apellido</label>
                    <input type="text" value={editData.nombreApellido || ""}
                      onChange={e => setEditData(prev => ({ ...prev, nombreApellido: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Fecha de Nacimiento (DD/MM/AAAA)</label>
                    <input 
                      type="text" 
                      value={editData.fechaNacimiento || ""}
                      onChange={e => {
                        const rawVal = e.target.value.replace(/\D/g, "");
                        let formatted = rawVal.slice(0, 2);
                        if (rawVal.length > 2) formatted += "/" + rawVal.slice(2, 4);
                        if (rawVal.length > 4) formatted += "/" + rawVal.slice(4, 8);
                        setEditData(prev => ({ ...prev, fechaNacimiento: formatted }));
                      }}
                      placeholder="DD/MM/AAAA"
                    />
                  </div>
                  <div className="form-group">
                    <label>Edad Calculada</label>
                    <input 
                      type="text" 
                      value={(() => {
                        if (!editData.fechaNacimiento) return selectedRegistro.edad;
                        const dateParts = editData.fechaNacimiento.split("/");
                        if (dateParts.length === 3) {
                          const d = parseInt(dateParts[0], 10);
                          const m = parseInt(dateParts[1], 10);
                          const y = parseInt(dateParts[2], 10);
                          const tempDate = new Date(y, m - 1, d);
                          if (!isNaN(tempDate.getTime())) {
                            const today = new Date();
                            let calculatedAge = today.getFullYear() - tempDate.getFullYear();
                            const monthDiff = today.getMonth() - tempDate.getMonth();
                            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < tempDate.getDate())) {
                              calculatedAge--;
                            }
                            return calculatedAge >= 0 ? calculatedAge : 0;
                          }
                        }
                        return selectedRegistro.edad;
                      })() + " años"}
                      disabled
                      style={{ backgroundColor: "var(--bg-primary)", cursor: "not-allowed" }}
                    />
                  </div>
                  <div className="form-group">
                    <label>¿Es Jefe de Familia?</label>
                    <select value={editData.jefeFamilia || "NO"}
                      onChange={e => setEditData(prev => ({ ...prev, jefeFamilia: e.target.value }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>¿Pertenece a un Núcleo Familiar?</label>
                    <select value={editData.perteneceNucleo || "NO"}
                      onChange={e => setEditData(prev => ({ ...prev, perteneceNucleo: e.target.value }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
                  </div>
                  {editData.perteneceNucleo === "SI" && editData.jefeFamilia === "NO" && (
                    <div className="form-group detail-field--full">
                      <label>Cédula del Jefe de Familia</label>
                      <input 
                        type="text" 
                        value={editData.cedulaJefeFamilia || ""}
                        onChange={e => setEditData(prev => ({ ...prev, cedulaJefeFamilia: e.target.value.replace(/\D/g, "") }))}
                        placeholder="Ingrese la cédula del jefe de familia"
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Parroquia</label>
                    <input type="text" value={editData.parroquia || ""}
                      onChange={e => setEditData(prev => ({ ...prev, parroquia: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Sector</label>
                    <input type="text" value={editData.sector || ""}
                      onChange={e => setEditData(prev => ({ ...prev, sector: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Comunidad</label>
                    <input type="text" value={editData.comunidad || ""}
                      onChange={e => setEditData(prev => ({ ...prev, comunidad: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Género</label>
                    <select value={editData.genero || ""}
                      onChange={e => setEditData(prev => ({ ...prev, genero: e.target.value }))}>
                      <option value="MASCULINO">Masculino</option>
                      <option value="FEMENINO">Femenino</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Estado Físico</label>
                    <select value={editData.estadoFisico || ""}
                      onChange={e => setEditData(prev => ({ ...prev, estadoFisico: e.target.value }))}>
                      <option value="ILESO">Ileso</option>
                      <option value="LESIONADO">Lesionado</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Patología</label>
                    <select value={editData.patologia || ""}
                      onChange={e => setEditData(prev => ({ ...prev, patologia: e.target.value }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
                  </div>
                  {editData.patologia === "SI" && (
                    <div className="form-group detail-field--full">
                      <label>Descripción de Patología</label>
                      <input type="text" value={editData.patologiaDescripcion || ""}
                        onChange={e => setEditData(prev => ({ ...prev, patologiaDescripcion: e.target.value }))} />
                    </div>
                  )}
                  {(editData.patologia === "SI" || editData.estadoFisico === "LESIONADO") && (
                    <div className="form-group detail-field--full">
                      <div className="med-section">
                        <div className="med-section-header">
                          <span className="med-section-title">Medicamentos</span>
                          <button type="button" className="btn-add-med" onClick={addEditMed}>
                            + Agregar
                          </button>
                        </div>
                        {editMedicamentos.length === 0 ? (
                          <p className="med-empty">Sin medicamentos. Usa "+ Agregar" para añadir.</p>
                        ) : (
                          <>
                            <div className="med-row med-row--header">
                              <span>Nombre</span>
                              <span>Dosis</span>
                              <span>Período</span>
                              <span />
                            </div>
                            {editMedicamentos.map((m, i) => (
                              <div key={i} className="med-row">
                                <input className="med-input" placeholder="ej: Metformina" value={m.nombre}
                                  onChange={e => updateEditMed(i, "nombre", e.target.value)} />
                                <input className="med-input" placeholder="ej: 500mg" value={m.dosis}
                                  onChange={e => updateEditMed(i, "dosis", e.target.value)} />
                                <input className="med-input" placeholder="ej: 2 veces/día" value={m.periodo}
                                  onChange={e => updateEditMed(i, "periodo", e.target.value)} />
                                <button type="button" className="btn-remove-med" onClick={() => removeEditMed(i)}>×</button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input type="text" value={editData.telefono || ""}
                      onChange={e => setEditData(prev => ({ ...prev, telefono: e.target.value }))} />
                  </div>
                  <div className="form-group detail-field--full">
                    <label>Dirección Exacta</label>
                    <input type="text" value={editData.direccionExacta || ""}
                      onChange={e => setEditData(prev => ({ ...prev, direccionExacta: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Retirado / Egresado</label>
                    <select value={editData.retirado || "NO"}
                      onChange={e => setEditData(prev => ({ ...prev, retirado: e.target.value }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
                  </div>
                  {editData.retirado === "SI" && (
                    <div className="form-group detail-field--full">
                      <label>Razón de Retiro</label>
                      <input type="text" placeholder="ej: Retornado a vivienda, alta médica, etc." value={editData.retiradoRazon || ""}
                        onChange={e => setEditData(prev => ({ ...prev, retiradoRazon: e.target.value }))} />
                    </div>
                  )}
                </div>
                <div className="modal-edit-actions">
                  <button type="button" className="btn-secondary"
                    onClick={() => setEditMode(false)} disabled={savingEdit}>
                    Cancelar
                  </button>
                  <button type="button" className="btn-submit" style={{ flex: 1 }}
                    onClick={handleSaveEdit} disabled={savingEdit}>
                    {savingEdit ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </>
            )}

            {/* ── ASIGNAR CUARTO (solo visible para ADMIN) ── */}
            {currentUser.role === "ADMIN" && (
              <div className="modal-cuarto-section">
                <div className="section-title" style={{ margin: "0 0 0.625rem" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Asignación de Alojamiento
                </div>
                <div className="form-group">
                  <label htmlFor="cuarto-select">Cuarto / Salón</label>
                  <select id="cuarto-select" value={asignCuarto}
                    onChange={e => setAsignCuarto(e.target.value)}>
                    <option value="">— Seleccionar cuarto —</option>
                    {allCuartos.map(c => {
                      const count = roomCounts[c] || 0;
                      let emoji = "🟢";
                      if (count >= 17) {
                        emoji = "🔴";
                      } else if (count >= 11) {
                        emoji = "🟡";
                      }
                      return <option key={c} value={c}>{emoji} {c} ({count} {count === 1 ? 'ocupante' : 'ocupantes'})</option>;
                    })}
                  </select>
                  {asignCuarto && (() => {
                    const count = roomCounts[asignCuarto] || 0;
                    let color = "#10b981"; // Green
                    if (count >= 17) {
                      color = "#ef4444"; // Red
                    } else if (count >= 11) {
                      color = "#f59e0b"; // Yellow/Amber
                    }
                    return (
                      <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", fontWeight: "800", color: color }}>
                        Ocupantes: {count}/18
                      </div>
                    );
                  })()}
                </div>
                <button type="button" className="btn-submit" style={{ marginTop: "0.625rem" }}
                  onClick={handleAsignarCuarto}
                  disabled={savingCuarto || !asignCuarto || asignCuarto === selectedRegistro.cuarto}>
                  {savingCuarto ? "Guardando..." : selectedRegistro.cuarto ? "Reasignar Cuarto" : "Confirmar Asignación"}
                </button>
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

      {/* Local Queue Edit Modal for corrections (duplicate Cédula errors) */}
      {showLocalEditModal && selectedLocalRecord && (
        <div className="modal-overlay" onClick={() => { setShowLocalEditModal(false); setSelectedLocalRecord(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "450px", width: "90%" }}>
            <div className="modal-header">
              <span className="modal-title">CORREGIR CÉDULA / NOMBRE</span>
              <button className="modal-close" onClick={() => { setShowLocalEditModal(false); setSelectedLocalRecord(null); }}>✕</button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Modifique los datos principales del registro local para intentar la sincronización nuevamente.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label>Nombre y Apellido</label>
                <input
                  type="text"
                  value={localEditNombre}
                  onChange={(e) => setLocalEditNombre(e.target.value)}
                  style={{ width: "100%", height: "38px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem" }}
                />
              </div>

              <div className="form-group">
                <label>Cédula de Identidad</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <select
                    value={localEditNacionalidad}
                    onChange={(e) => setLocalEditNacionalidad(e.target.value)}
                    style={{ width: "80px", height: "38px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem" }}
                  >
                    <option value="V">V</option>
                    <option value="E">E</option>
                  </select>
                  <input
                    type="text"
                    value={localEditCedula}
                    onChange={(e) => setLocalEditCedula(e.target.value)}
                    style={{ flex: 1, height: "38px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem" }}
                  />
                </div>
              </div>

              <button
                type="button"
                className="btn-submit"
                onClick={handleSaveLocalEdit}
                style={{ marginTop: "0.5rem" }}
              >
                Guardar y Sincronizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Report Generator Modal */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "600px", width: "95%" }}>
            <div className="modal-header">
              <span className="modal-title" style={{ fontSize: "0.95rem", lineHeight: "1.2" }}>Generador de Reporte para WhatsApp</span>
              <button className="modal-close" onClick={() => setShowReportModal(false)}>✕</button>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem", maxHeight: "65vh", overflowY: "auto", paddingRight: "5px" }}>
              <div className="form-group">
                <label htmlFor="rep-personal">Personal de Trabajo</label>
                <input
                  type="number"
                  id="rep-personal"
                  value={personalTrabajo}
                  onChange={e => setPersonalTrabajo(parseInt(e.target.value, 10) || 0)}
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Entes Presentes</label>
                <form onSubmit={handleAddEnte} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", width: "100%" }}>
                  <input
                    type="text"
                    placeholder="Agregar nuevo ente..."
                    value={newEnte}
                    onChange={e => setNewEnte(e.target.value)}
                    style={{ flex: 1, minWidth: "120px" }}
                  />
                  <button type="submit" className="btn-submit" style={{ width: "auto", margin: 0, padding: "0 1rem" }}>Agregar</button>
                </form>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "150px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.5rem" }}>
                  {entes.map((ente, index) => (
                    <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", padding: "2px 0" }}>
                      <span style={{ wordBreak: "break-all", paddingRight: "5px" }}>• {ente}</span>
                      <button type="button" onClick={() => handleRemoveEnte(index)} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontWeight: "bold", padding: "0 5px" }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Vista Previa del Mensaje</label>
                <pre style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "var(--font-system)",
                  fontSize: "0.8rem",
                  backgroundColor: "var(--input-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  padding: "0.75rem",
                  color: "var(--text-primary)",
                  maxHeight: "180px",
                  overflowY: "auto",
                  overflowX: "hidden"
                }}>
                  {generateReportText()}
                </pre>
              </div>
            </div>

            <div className="modal-actions" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" style={{ flex: "1 1 100px", margin: 0 }} onClick={() => setShowReportModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn-submit" style={{ flex: "2 1 180px", margin: 0, whiteSpace: "normal", height: "auto", minHeight: "var(--element-height)", padding: "6px 12px", lineHeight: "1.2" }} onClick={handleShareReport}>
                Copiar y Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear Nuevo Usuario */}
      {createUserModalOpen && (
        <div className="modal-overlay" onClick={() => setCreateUserModalOpen(false)}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <span className="modal-title">Crear Nuevo Usuario / Operador</span>
              <button className="modal-close" onClick={() => setCreateUserModalOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="detail-edit-grid" style={{ gridTemplateColumns: "1fr", gap: "0.75rem", padding: "0.5rem 0" }}>
              <div className="form-group">
                <label htmlFor="user-create-nombre">Nombre y Apellido del Operador</label>
                <input
                  type="text"
                  id="user-create-nombre"
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
                <label htmlFor="user-create-email">Correo Electrónico</label>
                <input
                  type="email"
                  id="user-create-email"
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
                <label htmlFor="user-create-password">Contraseña (Mínimo 6 caracteres)</label>
                <div style={{ display: "flex", gap: "0.25rem", width: "100%", position: "relative" }}>
                  <input
                    type={userShowPassword ? "text" : "password"}
                    id="user-create-password"
                    placeholder="Contraseña del operador"
                    value={userForm.password}
                    onChange={(e) => {
                      setUserForm(prev => ({ ...prev, password: e.target.value }));
                      setUserErrors(prev => ({ ...prev, password: "" }));
                    }}
                    className={userErrors.password ? "has-error" : ""}
                    style={{ paddingRight: "40px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setUserShowPassword(p => !p)}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
                  >
                    {userShowPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                <div className="error-container">
                  {userErrors.password && <span className="field-error-message">{userErrors.password}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="user-create-confirm">Confirmar Contraseña</label>
                <div style={{ display: "flex", gap: "0.25rem", width: "100%", position: "relative" }}>
                  <input
                    type={userShowConfirmPassword ? "text" : "password"}
                    id="user-create-confirm"
                    placeholder="Repita la contraseña"
                    value={userForm.confirmPassword}
                    onChange={(e) => {
                      setUserForm(prev => ({ ...prev, confirmPassword: e.target.value }));
                      setUserErrors(prev => ({ ...prev, confirmPassword: "" }));
                    }}
                    className={userErrors.confirmPassword ? "has-error" : ""}
                    style={{ paddingRight: "40px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setUserShowConfirmPassword(p => !p)}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
                  >
                    {userShowConfirmPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                <div className="error-container">
                  {userErrors.confirmPassword && <span className="field-error-message">{userErrors.confirmPassword}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="user-create-campamento">Campamento Transitorio</label>
                <input
                  type="text"
                  id="user-create-campamento"
                  placeholder="ej: Complejo Educativo República de Panamá"
                  value={userForm.campamentoTransitorio}
                  onChange={(e) => setUserForm(prev => ({ ...prev, campamentoTransitorio: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Rol asignado</label>
                <div className="radio-group" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                  <label className={`radio-card ${userForm.role === "REGISTRADOR" ? "selected" : ""}`} style={{ fontSize: "0.75rem", padding: "0.5rem" }}>
                    <input 
                      type="radio" 
                      name="role-create" 
                      value="REGISTRADOR" 
                      checked={userForm.role === "REGISTRADOR"}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} 
                    />
                    REGISTRADOR
                  </label>
                  <label className={`radio-card ${userForm.role === "VISUALIZADOR" ? "selected" : ""}`} style={{ fontSize: "0.75rem", padding: "0.5rem" }}>
                    <input 
                      type="radio" 
                      name="role-create" 
                      value="VISUALIZADOR" 
                      checked={userForm.role === "VISUALIZADOR"}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} 
                    />
                    VISUALIZADOR
                  </label>
                  <label className={`radio-card ${userForm.role === "ADMIN" ? "selected" : ""}`} style={{ fontSize: "0.75rem", padding: "0.5rem" }}>
                    <input 
                      type="radio" 
                      name="role-create" 
                      value="ADMIN" 
                      checked={userForm.role === "ADMIN"}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} 
                    />
                    ADMIN
                  </label>
                </div>
              </div>

              <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setCreateUserModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-submit" style={{ flex: 1 }}>
                  Registrar Operador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Usuario */}
      {editUserModalOpen && (
        <div className="modal-overlay" onClick={() => setEditUserModalOpen(false)}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <span className="modal-title">Editar Usuario / Operador</span>
              <button className="modal-close" onClick={() => setEditUserModalOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleUpdateUser} className="detail-edit-grid" style={{ gridTemplateColumns: "1fr", gap: "0.75rem", padding: "0.5rem 0" }}>
              <div className="form-group">
                <label htmlFor="user-edit-nombre">Nombre y Apellido del Operador</label>
                <input
                  type="text"
                  id="user-edit-nombre"
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
                <label htmlFor="user-edit-email">Correo Electrónico</label>
                <input
                  type="email"
                  id="user-edit-email"
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

              <div className="form-group" style={{ position: "relative" }}>
                <label htmlFor="user-edit-password">Nueva Contraseña (dejar en blanco para no cambiar)</label>
                <div style={{ display: "flex", gap: "0.25rem", width: "100%", position: "relative" }}>
                  <input
                    type={userShowPassword ? "text" : "password"}
                    id="user-edit-password"
                    placeholder="Nueva contraseña"
                    value={userForm.password}
                    onChange={(e) => {
                      setUserForm(prev => ({ ...prev, password: e.target.value }));
                      setUserErrors(prev => ({ ...prev, password: "" }));
                    }}
                    className={userErrors.password ? "has-error" : ""}
                    style={{ paddingRight: "40px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setUserShowPassword(p => !p)}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
                  >
                    {userShowPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                <div className="error-container">
                  {userErrors.password && <span className="field-error-message">{userErrors.password}</span>}
                </div>
              </div>

              <div className="form-group" style={{ position: "relative" }}>
                <label htmlFor="user-edit-confirm">Confirmar Nueva Contraseña</label>
                <div style={{ display: "flex", gap: "0.25rem", width: "100%", position: "relative" }}>
                  <input
                    type={userShowConfirmPassword ? "text" : "password"}
                    id="user-edit-confirm"
                    placeholder="Repita la nueva contraseña"
                    value={userForm.confirmPassword}
                    onChange={(e) => {
                      setUserForm(prev => ({ ...prev, confirmPassword: e.target.value }));
                      setUserErrors(prev => ({ ...prev, confirmPassword: "" }));
                    }}
                    className={userErrors.confirmPassword ? "has-error" : ""}
                    style={{ paddingRight: "40px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setUserShowConfirmPassword(p => !p)}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
                  >
                    {userShowConfirmPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                <div className="error-container">
                  {userErrors.confirmPassword && <span className="field-error-message">{userErrors.confirmPassword}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="user-edit-campamento">Campamento Transitorio</label>
                <input
                  type="text"
                  id="user-edit-campamento"
                  placeholder="ej: Complejo Educativo República de Panamá"
                  value={userForm.campamentoTransitorio}
                  onChange={(e) => setUserForm(prev => ({ ...prev, campamentoTransitorio: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Rol asignado</label>
                <div className="radio-group" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                  <label className={`radio-card ${userForm.role === "REGISTRADOR" ? "selected" : ""}`} style={{ fontSize: "0.75rem", padding: "0.5rem" }}>
                    <input 
                      type="radio" 
                      name="role-edit" 
                      value="REGISTRADOR" 
                      checked={userForm.role === "REGISTRADOR"}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} 
                    />
                    REGISTRADOR
                  </label>
                  <label className={`radio-card ${userForm.role === "VISUALIZADOR" ? "selected" : ""}`} style={{ fontSize: "0.75rem", padding: "0.5rem" }}>
                    <input 
                      type="radio" 
                      name="role-edit" 
                      value="VISUALIZADOR" 
                      checked={userForm.role === "VISUALIZADOR"}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} 
                    />
                    VISUALIZADOR
                  </label>
                  <label className={`radio-card ${userForm.role === "ADMIN" ? "selected" : ""}`} style={{ fontSize: "0.75rem", padding: "0.5rem" }}>
                    <input 
                      type="radio" 
                      name="role-edit" 
                      value="ADMIN" 
                      checked={userForm.role === "ADMIN"}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} 
                    />
                    ADMIN
                  </label>
                </div>
              </div>

              <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setEditUserModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-submit" style={{ flex: 1 }}>
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real-time internal PWA notification banner */}
      {internalNotification && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          backgroundColor: "var(--bg-secondary, #1a202c)",
          borderLeft: "4px solid var(--color-primary, #6366f1)",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
          borderRadius: "8px",
          padding: "1rem",
          zIndex: 99999,
          maxWidth: "350px",
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)"
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.25rem" }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "700", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-primary)" }}>
                Nuevo Afectado
              </div>
              <p style={{ fontSize: "0.85rem", margin: "4px 0 0 0", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                <strong>{internalNotification.nombreApellido}</strong> ha sido registrado en el censo.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem" }}>
            <button
              type="button"
              className="btn-secondary"
              style={{
                width: "auto",
                margin: 0,
                padding: "0 0.75rem",
                fontSize: "0.75rem",
                height: "28px",
                backgroundColor: "transparent",
                border: "none",
                color: "var(--text-secondary)"
              }}
              onClick={() => setInternalNotification(null)}
            >
              Ignorar
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{
                width: "auto",
                margin: 0,
                padding: "0 0.75rem",
                fontSize: "0.75rem",
                height: "28px",
                backgroundColor: "var(--color-primary)",
                color: "#ffffff",
                borderColor: "var(--color-primary)",
                fontWeight: "600"
              }}
              onClick={() => {
                setPendingSelectId(internalNotification.registroId);
                fetchRegistros();
                setInternalNotification(null);
              }}
            >
              Asignar Habitación
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          <ToastIcon type={toast.type} />
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
