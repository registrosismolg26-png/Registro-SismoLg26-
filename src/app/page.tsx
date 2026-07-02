"use client";

import { useState, useEffect, useLayoutEffect, useRef, useReducer, useMemo } from "react";
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
import type { Medicamento, ToastType, FormData } from "@/types";
import { PARROQUIAS, CUARTOS, INITIAL_FORM, ALLOWED_ADMINS, INACTIVITY_MS } from "@/lib/constants";
import { formReducer } from "@/lib/formReducer";
import { sha256, formatRoomLabel } from "@/lib/helpers";
import { ToastIcon } from "@/components/ToastIcon";
import { AppContext, type AppContextValue } from "@/context/AppContext";
import UsuariosTab from "@/tabs/UsuariosTab";
import DashboardTab from "@/tabs/DashboardTab";
import ConfigTab from "@/tabs/ConfigTab";
import AsignacionesTab from "@/tabs/AsignacionesTab";

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
  const isPowerAdmin = useMemo(() => {
    return currentUser && currentUser.role === "ADMIN" && ALLOWED_ADMINS.includes(currentUser.email.toLowerCase());
  }, [currentUser]);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const navDesktopRef = useRef<HTMLDivElement>(null);
  const [pillReady, setPillReady] = useState(false);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

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

  const allCuartos = useMemo(() => {
    return [...CUARTOS, ...customCuartos]; // Already sorted by DB (createdAt desc)
  }, [customCuartos]);

  const sortedCustomCuartos = useMemo(() => {
    return [...customCuartos]; // Keep DB order (createdAt desc)
  }, [customCuartos]);

  // (Gestión de habitaciones/cuartos movida a src/tabs/ConfigTab.tsx.
  //  El estado compartido customCuartos/setCustomCuartos vive aquí y se expone
  //  por el context; refreshCustomRooms se usa desde triggerSync.)

  // Tab View Routing State
  const [activeTab, setActiveTab] = useState<"censo" | "dashboard" | "usuarios" | "config" | "asignaciones">("censo");
  const [menuOpen, setMenuOpen] = useState(false);

  const [step, setStep] = useState<1|2|3|4>(1);

  // Dashboard Stats States
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // (Gestión de usuarios movida a src/tabs/UsuariosTab.tsx)

  // Asignaciones Module State (Admin only)
  const [registros, setRegistros] = useState<any[]>([]);

  // All rooms including deleted-but-still-assigned ones for graphic stats display
  const dashboardRooms = useMemo(() => {
    const activeRooms = [...CUARTOS, ...customCuartos];
    const activeSet = new Set(activeRooms);
    
    // Find unique assigned rooms that are not currently in the DB
    const missingRooms: string[] = [];
    registros.forEach(r => {
      if (r.cuarto && r.cuarto.trim() && !activeSet.has(r.cuarto)) {
        missingRooms.push(r.cuarto);
      }
    });

    const uniqueMissing = Array.from(new Set(missingRooms)).sort((a, b) => b.localeCompare(a));
    return [...activeRooms, ...uniqueMissing];
  }, [customCuartos, registros]);

  // loadingRegistros vive en Home (lo setea fetchRegistros) y se expone por el
  // context; AsignacionesTab lo consume para el skeleton de carga.
  const [loadingRegistros, setLoadingRegistros] = useState(false);

  // (Estado de la tabla de asignaciones, filtros y el detail modal —
  //  registroSearch/selectedRegistro/editData/filtros/etc.— movidos a
  //  src/tabs/AsignacionesTab.tsx.)

  // Form State — useReducer eliminates stale-closure bugs from useState in callbacks
  const [formData, dispatch] = useReducer(formReducer, INITIAL_FORM);

  // Medicamentos dinámicos (array independiente del reducer de strings)
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const addMedicamento    = () => setMedicamentos(p => [...p, { nombre: "", dosis: "", periodo: "" }]);
  const removeMedicamento = (i: number) => setMedicamentos(p => p.filter((_, idx) => idx !== i));
  const updateMedicamento = (i: number, field: keyof Medicamento, val: string) =>
    setMedicamentos(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  // (editMedicamentos + addEditMed/removeEditMed/updateEditMed movidos a
  //  src/tabs/AsignacionesTab.tsx.)

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

  // (Corrección local de la cola, modal QR, diagnóstico de notificaciones y
  //  modales de gestión de habitaciones movidos a src/tabs/ConfigTab.tsx.)

  // Cold-start navigation / real-time PWA notification (globales, no del config)
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [internalNotification, setInternalNotification] = useState<{ registroId: string; nombreApellido: string } | null>(null);

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

  // Navegación por notificación PWA: cuando llega pendingSelectId con match en
  // registros, cambiamos a la pestaña asignaciones. La selección del registro
  // (setSelectedRegistro) + limpieza de pendingSelectId la hace AsignacionesTab,
  // porque selectedRegistro es estado local de ese tab. No limpiamos aquí el
  // pendingSelectId para no ganarle la carrera al tab (que aún puede no estar
  // montado en el primer render).
  useEffect(() => {
    if (!pendingSelectId || !registros.length) return;
    const match = registros.find(r => r.id === pendingSelectId);
    if (match) {
      setActiveTab("asignaciones");
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
      }
    }
  }, [activeTab, currentUser]);

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

  useLayoutEffect(() => {
    const nav = navDesktopRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!active) return;
    setPillStyle({ left: active.offsetLeft, width: active.offsetWidth });
    setPillReady(true);
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
  // batches as data arrives. Verifica el total contra X-Padron-Total y
  // reintenta automáticamente si faltan registros (hasta 3 veces).
  const downloadFullPadron = async () => {
    if (!isOnline) {
      showToast("Se requiere conexión a internet para descargar el padrón.", "warning");
      return;
    }

    setSyncStatus("downloading");
    setSyncProgress(0);
    setSyncTotal(0);
    showToast("Descargando padrón electoral...", "info");

    const MAX_RETRIES = 3;
    let totalInserted = 0;
    let serverTotal = 0;

    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // En el primer intento limpiamos e iniciamos desde 0
        // En reintentos, saltamos lo que ya tenemos
        const skipAlreadyInserted = attempt > 0 ? totalInserted : 0;

        if (attempt > 0) {
          showToast(`Padrón incompleto. Reintentando (${attempt}/${MAX_RETRIES})...`, "warning");
        }

        const res = await fetch("/api/padron/download", { method: "POST" });
        if (!res.ok || !res.body) throw new Error("Fallo al descargar padrón");

        // Leer el total del servidor desde el header
        const headerTotal = res.headers.get("X-Padron-Total");
        if (headerTotal) {
          serverTotal = parseInt(headerTotal, 10);
          setSyncTotal(serverTotal);
        }

        setSyncStatus("saving");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let pending: any[][] = [];
        const WRITE_EVERY = 500;
        let linesSkipped = 0;

        const flushPending = async () => {
          if (pending.length === 0) return;
          const chunk = pending.splice(0);
          await cargarPadronEnCliente(chunk, () => {});
          totalInserted += chunk.length;
          setSyncProgress(totalInserted);
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;
          for (const line of lines) {
            if (!line.trim()) continue;
            // En reintentos, saltar los registros ya guardados en IndexedDB
            if (linesSkipped < skipAlreadyInserted) {
              linesSkipped++;
              continue;
            }
            try { pending.push(JSON.parse(line)); } catch {}
          }
          if (pending.length >= WRITE_EVERY) await flushPending();
        }

        // Flush línea residual
        if (buffer.trim()) {
          try { pending.push(JSON.parse(buffer)); } catch {}
        }
        await flushPending();

        // Si el servidor no envió el header total, asumir completado
        if (!serverTotal || totalInserted >= serverTotal) break;
      }

      // Verificar conteo final en IndexedDB para máxima precisión
      const finalCount = await getLocalPadronCount();

      setSyncTotal(serverTotal || finalCount);
      setSyncStatus("completed");

      if (serverTotal && finalCount < serverTotal) {
        showToast(
          `Padrón descargado parcialmente: ${finalCount.toLocaleString()} de ${serverTotal.toLocaleString()} registros. Intenta de nuevo.`,
          "warning"
        );
      } else {
        showToast(`Padrón descargado: ${finalCount.toLocaleString()} registros.`, "success");
      }

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
    if (!silent) {
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
      if (!silent) {
        setLoadingStats(false);
      }
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

  // (handleAsignarCuarto, handleSaveEdit, closeModal y handleDeleteRegistro
  //  movidos a src/tabs/AsignacionesTab.tsx. setRegistros se expone por el
  //  context para que el tab haga la actualización optimista.)

  // (handleExportExcel y handlePrintPDFList movidos a src/tabs/AsignacionesTab.tsx.)

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

  // (Exportar JSON y generar códigos QR de la cola movidos a src/tabs/ConfigTab.tsx.)

  const pendingCount = localRecords.filter(r => r.status === "pending").length;

  // (filteredRegistros y roomCounts movidos a src/tabs/AsignacionesTab.tsx.)

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

            <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
                ¿Busca a un familiar afectado?
              </p>
              <a
                href="/buscar"
                className="btn-secondary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", textDecoration: "none" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Buscar Familiar Afectado
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
  const appCtx: AppContextValue = {
    isOnline, theme, toggleTheme,
    currentUser, isPowerAdmin: !!isPowerAdmin, handleLogout,
    activeTab, setActiveTab, showToast,
    triggerSync, isSyncing, syncQueueProgress, pendingCount,
    registros, setRegistros, fetchRegistros, loadingRegistros,
    localRecords, refreshLocalRecords,
    pendingSelectId, setPendingSelectId,
    customCuartos, setCustomCuartos, allCuartos, sortedCustomCuartos, dashboardRooms,
    stats, loadingStats, fetchStats,
    votersCount, coords,
    syncStatus, syncProgress, syncTotal,
    downloadFullPadron, deletePadronLocal, refreshVotersCount,
  };

  return (
    <AppContext.Provider value={appCtx}>
    <div className="container">
      {/* Unified App Header */}
      <header className="app-header">

        {/* ── Franja institucional ── */}
        <div className="header-main">
          <div className="header-identity">
            <div className="header-seal" aria-hidden="true">
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
        <div className="nav-desktop-menu" ref={navDesktopRef}>
          {/* Píldora deslizante */}
          <div
            className="nav-pill"
            style={{
              left: pillStyle.left,
              width: pillStyle.width,
              transition: pillReady
                ? "left 0.32s cubic-bezier(0.4,0,0.2,1), width 0.32s cubic-bezier(0.4,0,0.2,1)"
                : "none",
            }}
          />
          {currentUser.role !== "VISUALIZADOR" && (
            <button
              type="button"
              data-tab="censo"
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
              data-tab="dashboard"
              className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span>Estadísticas</span>
            </button>
          )}
          <button
            type="button"
            data-tab="asignaciones"
            className={`nav-btn ${activeTab === "asignaciones" ? "active" : ""}`}
            onClick={() => setActiveTab("asignaciones")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Registrados</span>
          </button>
          {isPowerAdmin && (
            <button
              type="button"
              data-tab="usuarios"
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
              data-tab="config"
              className={`nav-btn ${activeTab === "config" ? "active" : ""}`}
              onClick={() => setActiveTab("config")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41"/></svg>
              <span>Configuración</span>
            </button>
          )}
          <a href="/buscar" className="nav-btn nav-btn--buscar" style={{ textDecoration: "none" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Buscar</span>
          </a>
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
              <a href="/buscar" className="nav-dropdown-item" style={{ textDecoration: "none" }} onClick={() => setMenuOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Buscar Familiar
              </a>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: FORM VIEW (CENSO) */}
      {activeTab === "censo" && (
        <div className="tab-enter">
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
      )}

      {/* TAB 2: DASHBOARD VIEW (ADMIN ONLY) */}
      {activeTab === "dashboard" && currentUser.role === "ADMIN" && <DashboardTab />}

      {/* TAB 3: USER ADMINISTRATION (ADMIN ONLY) */}
      {activeTab === "usuarios" && isPowerAdmin && <UsuariosTab />}

      {/* TAB 4: CONFIGURATION & DATABASE STATS VIEW */}
      {activeTab === "config" && <ConfigTab />}

      {/* TAB 5: ASIGNACIONES / REGISTRO DE AFECTADOS */}
      {activeTab === "asignaciones" && <AsignacionesTab />}

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
    </AppContext.Provider>
  );
}
