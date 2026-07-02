"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  getPending,
  getAllLocal,
  markSynced,
  incrementAttempt,
  clearLocalPadron,
  cargarPadronEnCliente,
  getLocalPadronCount,
  LocalRegistro
} from "@/lib/db";
import type { ToastType } from "@/types";
import { CUARTOS, ALLOWED_ADMINS, INACTIVITY_MS } from "@/lib/constants";
import { ToastIcon } from "@/components/ToastIcon";
import AppHeader from "@/components/AppHeader";
import LoginForm from "@/components/LoginForm";
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
  // Login (estado + handleLogin) → src/components/LoginForm.tsx (recibe props,
  // se renderiza fuera del Provider). Header/nav (estado + useLayoutEffect de la
  // píldora) → src/components/AppHeader.tsx.

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

  // El estado propio de cada pestaña vive en su componente:
  //  · tabla de asignaciones + filtros + detail modal → src/tabs/AsignacionesTab.tsx
  //  · formulario de censo (wizard, validación, lookup) → src/tabs/CensoTab.tsx

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

  // Logout Handler
  const handleLogout = () => {
    localStorage.removeItem("sismo_operator");
    sessionStorage.removeItem("sismo_operator");
    setCurrentUser(null);
    setActiveTab("censo");
    showToast("Sesión cerrada.", "info");
  };

  const pendingCount = localRecords.filter(r => r.status === "pending").length;

  // Si el usuario no está autenticado, mostrar la pantalla de login.
  // OJO: LoginForm se renderiza FUERA del <AppContext.Provider>, por eso
  // recibe props en lugar de consumir el context.
  if (!currentUser) {
    return (
      <LoginForm
        setCurrentUser={setCurrentUser}
        setActiveTab={setActiveTab}
        showToast={showToast}
        toast={toast}
      />
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
      {/* Cabecera institucional + navegación (dentro del Provider) */}
      <AppHeader />

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
