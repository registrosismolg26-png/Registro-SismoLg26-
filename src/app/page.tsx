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
import CensoTab from "@/tabs/CensoTab";

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

  // (Estado del formulario de censo —step, formData/dispatch, medicamentos,
  //  errors, isSubmitting, lookupStatus/lookupTimeoutRef y sus handlers—
  //  movidos a src/tabs/CensoTab.tsx.)

  // GPS state (global: se captura al montar y se expone por el context; CensoTab
  //  lo consume para adjuntar las coordenadas al registro)
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

  // (Handlers del censo —handleDateChange, validateField, validateForm,
  //  handleInputChange, triggerLookup, STEP_FIELDS, handleNextStep y
  //  handleSubmit— movidos a src/tabs/CensoTab.tsx.)

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
      {activeTab === "censo" && <CensoTab />}

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
