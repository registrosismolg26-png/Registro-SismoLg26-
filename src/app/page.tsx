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
  markPermanentError,
  LocalRegistro,
  LocalConsulta,
  getAllLocalConsultas,
  getPendingConsultas,
  markConsultaSynced,
  incrementConsultaAttempt,
  markConsultaPermanentError,
  getPendingCaracterizacion,
  markCaracterizacionSynced,
  incrementCaracterizacionAttempt,
  markCaracterizacionPermanentError,
} from "@/lib/db";
import { apiFetch } from "@/lib/apiFetch";
import { syncActivityLogs } from "@/lib/activityLog";
import { installErrorReporter } from "@/lib/clientErrors";
import { enablePush, pushSupported, pushPermission } from "@/lib/pushClient";
import {
  isMaster,
  canManageUsers,
  canRegister,
  canViewDashboard,
  canManageMorbilidad,
  isMedico,
} from "@/lib/permissions";
import type {
  ToastType,
  ActiveTab,
  Patologia,
  MedicamentoPredefinido,
  TipoLesion,
  CaracterizacionOpcion,
} from "@/types";
import { CUARTOS, INACTIVITY_MS } from "@/lib/constants";
import AppHeader from "@/components/AppHeader";
import AppSidebar from "@/components/AppSidebar";
import BottomDock from "@/components/BottomDock";
import LoginForm from "@/components/LoginForm";
import { NAV_ITEMS } from "@/components/navItems";
import NotificationCenter, {
  type AppNotif,
} from "@/components/NotificationCenter";
import { AppContext, type AppContextValue } from "@/context/AppContext";
import UsuariosTab from "@/tabs/UsuariosTab";
import DashboardTab from "@/tabs/DashboardTab";
import ConfigTab from "@/tabs/ConfigTab";
import AsignacionesTab from "@/tabs/AsignacionesTab";
import CaracterizacionTab from "@/tabs/CaracterizacionTab";
import MonitoreoTab from "@/tabs/MonitoreoTab";
import CensoTab from "@/tabs/CensoTab";
import MorbilidadTab from "@/tabs/MorbilidadTab";
import BalanceTab from "@/tabs/BalanceTab";
import HistorialClinicoTab from "@/tabs/HistorialClinicoTab";
import {
  useModalOverlayScrollLock,
  useModalOutsideClickGuard,
} from "@/components/useBodyScrollLock";
import dynamic from "next/dynamic";

// MapaTab carga Leaflet; se importa PEREZOSAMENTE (solo cuando Master abre la pestaña)
// y sin SSR (Leaflet usa window/document) → no engorda el bundle ni afecta a los demás.
const MapaTab = dynamic(() => import("@/tabs/MapaTab"), { ssr: false });

export default function Home() {
  // Regla GENERAL de modales: mientras haya cualquier `.modal-overlay` en el DOM,
  // el scroll del fondo queda bloqueado (con compensación de scrollbar).
  useModalOverlayScrollLock();
  // Regla GENERAL de modales: un click que EMPIEZA dentro del modal y TERMINA
  // sobre el overlay (p. ej. seleccionar texto y soltar afuera) NO lo cierra.
  useModalOutsideClickGuard();

  // Connection state
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Theme state
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Electoral Padron States
  const [votersCount, setVotersCount] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "downloading" | "saving" | "completed" | "error"
  >("idle");
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncTotal, setSyncTotal] = useState<number>(0);

  // Auth States
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    email: string;
    nombre: string;
    role: string;
    campamentoTransitorio: string;
  } | null>(null);
  // ¿Sesión ya restaurada desde storage? Hasta que el effect de arranque corre,
  // mostramos un splash (no el login) → sin el "flash" de login al recargar/actualizar.
  const [authReady, setAuthReady] = useState(false);
  // "Power admin" global (super-admin) = MASTER. El backend valida de verdad;
  // esto solo controla la UI de acciones globales.
  const isPowerAdmin = useMemo(() => {
    return !!currentUser && isMaster(currentUser.role);
  }, [currentUser]);
  // Login (estado + handleLogin) → src/components/LoginForm.tsx (recibe props,
  // se renderiza fuera del Provider). Header/nav (estado + useLayoutEffect de la
  // píldora) → src/components/AppHeader.tsx.

  // ── Refugio de vista (Master) ────────────────────────────────────────────
  // Master puede cambiar el refugio que ve en TODO el sistema (dashboard,
  // registrados, salones, censo). Estado local; inicia con su refugio asignado.
  // El resto de usuarios siempre ve su propio refugio (no puede cambiarlo).
  const [viewRefugio, setViewRefugio] = useState<string>("");
  const [refugiosList, setRefugiosList] = useState<
    { id: string; nombre: string; ubicacion?: string | null }[]
  >([]);
  const effectiveRefugio = currentUser
    ? isMaster(currentUser.role)
      ? viewRefugio || currentUser.campamentoTransitorio
      : currentUser.campamentoTransitorio
    : "";
  const effectiveRefugioRef = useRef(effectiveRefugio);
  useEffect(() => {
    effectiveRefugioRef.current = effectiveRefugio;
  }, [effectiveRefugio]);

  // Inicializa el refugio de vista con el del usuario al iniciar sesión.
  useEffect(() => {
    if (currentUser?.campamentoTransitorio && !viewRefugio) {
      setViewRefugio(currentUser.campamentoTransitorio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.campamentoTransitorio]);

  // Carga la lista de refugios (con ubicación): la usa el selector del header
  // (Master) y el reporte de WhatsApp (ubicación del refugio activo). El GET es
  // accesible a cualquier autenticado, así que se carga para todos.
  useEffect(() => {
    if (!currentUser) return;
    if (typeof window === "undefined" || !navigator.onLine) return;
    apiFetch("/api/refugios")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.refugios) setRefugiosList(data.refugios);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Cuartos dinámicos (personalizados por admin, cargados desde la BD por refugio)
  const [customCuartos, setCustomCuartos] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("customCuartos") || "[]");
    } catch {
      return [];
    }
  });

  // Capacidad de camas por salón (nombre → nº de camas). Mapa paralelo a
  // customCuartos para no romper allCuartos (string[]); default 18 si falta.
  const [roomCapacities, setRoomCapacities] = useState<Record<string, number>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        return JSON.parse(localStorage.getItem("roomCapacities") || "{}");
      } catch {
        return {};
      }
    },
  );

  useEffect(() => {
    localStorage.setItem("customCuartos", JSON.stringify(customCuartos));
  }, [customCuartos]);

  useEffect(() => {
    localStorage.setItem("roomCapacities", JSON.stringify(roomCapacities));
  }, [roomCapacities]);

  // Sellado por refugio: en un dispositivo compartido, si el cache de salones es
  // de otro refugio se limpia (el fetch traerá los del refugio actual). Evita
  // "ver los de todos los refugios" al reutilizar el equipo entre refugios.
  useEffect(() => {
    if (!currentUser) return;
    const owner = localStorage.getItem("cuartos_owner");
    if (owner && owner !== currentUser.campamentoTransitorio) {
      setCustomCuartos([]);
      setRoomCapacities({});
    }
    localStorage.setItem("cuartos_owner", currentUser.campamentoTransitorio);
  }, [currentUser?.campamentoTransitorio]);

  const refreshCustomRooms = async () => {
    if (typeof window === "undefined" || !navigator.onLine) return;
    try {
      // Se pide el refugio del usuario: Master obtiene SOLO el suyo (no todos);
      // el resto ya está limitado a su refugio por el backend.
      const q = effectiveRefugioRef.current
        ? `?refugio=${encodeURIComponent(effectiveRefugioRef.current)}`
        : "";
      const res = await apiFetch(`/api/cuartos${q}`);
      if (res.ok) {
        const data = await res.json();
        const roomNames = data.map((r: any) => r.name);
        const caps: Record<string, number> = {};
        data.forEach((r: any) => {
          caps[r.name] = typeof r.capacidad === "number" ? r.capacidad : 18;
        });
        setCustomCuartos(roomNames);
        setRoomCapacities(caps);
      }
    } catch (err) {
      console.error("Error refreshing custom rooms:", err);
    }
  };

  // Carga los salones del refugio activo al iniciar sesión (igual que registros
  // y stats). Depende de currentUser para que effectiveRefugio ya esté resuelto:
  // así Master ve SU refugio por defecto, no todos. Al cambiar el refugio de
  // vista, el effect de effectiveRefugio (más abajo) se encarga de recargar.
  useEffect(() => {
    if (currentUser) refreshCustomRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const allCuartos = useMemo(() => {
    return [...CUARTOS, ...customCuartos]; // Orden del DB: createdAt ASC (viejos→nuevos), estable
  }, [customCuartos]);

  const sortedCustomCuartos = useMemo(() => {
    return [...customCuartos]; // Mantiene el orden del DB (createdAt ASC, estable)
  }, [customCuartos]);

  // (Gestión de habitaciones/cuartos movida a src/tabs/ConfigTab.tsx.
  //  El estado compartido customCuartos/setCustomCuartos vive aquí y se expone
  //  por el context; refreshCustomRooms se usa desde triggerSync.)

  // Tab View Routing State
  const [activeTab, setActiveTab] = useState<ActiveTab>("censo");

  // Los roles médicos solo ven Morbilidad (AdminMedico además Usuarios). Si entran
  // en una pestaña que no les corresponde (p. ej. el default "censo"), se les lleva
  // a Morbilidad. Espeja el gating del AppHeader/render.
  useEffect(() => {
    if (!currentUser || !isMedico(currentUser.role)) return;
    const allowed =
      currentUser.role === "AdminMedico"
        ? ["morbilidad", "balance", "historial", "usuarios"]
        : ["morbilidad", "balance", "historial"];
    if (!allowed.includes(activeTab)) setActiveTab("morbilidad");
  }, [currentUser, activeTab]);

  // Persistir la pestaña activa para restaurarla al recargar (solo tras el arranque,
  // para no pisar la guardada con el default "censo" antes de leerla).
  useEffect(() => {
    if (!authReady) return;
    try { localStorage.setItem("sismo_active_tab", activeTab); } catch { /* noop */ }
  }, [activeTab, authReady]);

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
    registros.forEach((r) => {
      if (r.cuarto && r.cuarto.trim() && !activeSet.has(r.cuarto)) {
        missingRooms.push(r.cuarto);
      }
    });

    const uniqueMissing = Array.from(new Set(missingRooms)).sort((a, b) =>
      b.localeCompare(a),
    );
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
  const [coords, setCoords] = useState<{
    lat: number | null;
    lng: number | null;
  }>({ lat: null, lng: null });

  // Offline queue local records
  const [localRecords, setLocalRecords] = useState<LocalRegistro[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncQueueProgress, setSyncQueueProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // Patologias & Medical Consultations (Morbilidad)
  const [patologias, setPatologias] = useState<Patologia[]>([]);
  const [tiposLesion, setTiposLesion] = useState<TipoLesion[]>([]);
  const [consultas, setConsultas] = useState<any[]>([]);
  const [localConsultas, setLocalConsultas] = useState<LocalConsulta[]>([]);
  const [loadingConsultas, setLoadingConsultas] = useState(false);
  const [predefinedMedicamentos, setPredefinedMedicamentos] = useState<
    MedicamentoPredefinido[]
  >([]);
  // Caracterización: catálogo general de opciones cerradas (una sola tabla, por módulo/campo).
  const [caracterizacionOpciones, setCaracterizacionOpciones] = useState<
    CaracterizacionOpcion[]
  >([]);

  // (Corrección local de la cola, modal QR, diagnóstico de notificaciones y
  //  modales de gestión de habitaciones movidos a src/tabs/ConfigTab.tsx.)

  // Cold-start navigation / real-time PWA notification (globales, no del config)
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [pendingHistorialCedula, setPendingHistorialCedula] = useState<
    string | null
  >(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  // Centro de notificaciones internas (UNIFICADO): toasts, alertas y actualización.
  const [notifs, setNotifs] = useState<AppNotif[]>([]);
  const pushNotif = (n: AppNotif) =>
    setNotifs((prev) => [...prev.filter((x) => x.id !== n.id), n]);
  const dismissNotif = (id: string) =>
    setNotifs((prev) => prev.filter((n) => n.id !== id));

  // Service Worker Update States
  const [swRegistration, setSwRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState<boolean>(false);

  // Sync guard: useRef avoids stale-closure bug in setInterval (useState value is frozen in the closure)
  const isSyncingRef = useRef<boolean>(false);

  // Stats cache guard: avoid redundant fetches if last one was < 30s ago
  const lastStatsFetchRef = useRef<number>(0);

  // ETag por ámbito (refugio) para censo/consultas: al re-pedir la lista (p. ej. al
  // cambiar de pestaña) reenviamos el último ETag en If-None-Match; si nada cambió el
  // servidor responde 304 y NO re-descargamos toda la lista (ahorro de egress). En
  // memoria (no localStorage): el servidor recalcula el sello por ámbito, así que un
  // ETag ajeno nunca produce un 304 incorrecto. No afecta el offline (el cache local
  // sigue igual; el 304 simplemente conserva lo ya mostrado).
  const registrosEtagRef = useRef<Record<string, string>>({});
  const consultasEtagRef = useRef<Record<string, string>>({});

  // Online event debounce: wait 1s for stable connection before syncing (avoids 2G flicker double-sync)
  const onlineDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Inactivity session timeout — updated on every pointer/key event
  const lastActivityRef = useRef<number>(Date.now());

  // SW Update Remind Later timeout reference
  const remindLaterTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize online status, theme, user session, local padrón count, GPS and local queue on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);

      // Load user session
      const savedUser =
        localStorage.getItem("sismo_operator") ||
        sessionStorage.getItem("sismo_operator");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && typeof parsed === "object") {
            if (!parsed.campamentoTransitorio) {
              parsed.campamentoTransitorio = "";
            }
            setCurrentUser(parsed);
            // Restaurar la última pestaña si el rol la puede ver (NAV_ITEMS = fuente
            // de verdad del gating) → recargar/actualizar no te devuelve a "Registro".
            const savedTab = localStorage.getItem("sismo_active_tab");
            if (savedTab) {
              const item = NAV_ITEMS.find((n) => n.tab === savedTab);
              if (item?.show(parsed.role)) setActiveTab(savedTab as ActiveTab);
            }
          }
        } catch (e) {
          localStorage.removeItem("sismo_operator");
          sessionStorage.removeItem("sismo_operator");
        }
      }
      setAuthReady(true);

      // Load theme
      const savedTheme = localStorage.getItem("theme") as
        | "dark"
        | "light"
        | null;
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
          void syncActivityLogs(); // cola de logs (independiente)
          if (currentUser && canViewDashboard(currentUser.role)) {
            fetchStats();
          }
        }, 1000);
      };

      const handleOffline = () => {
        setIsOnline(false);
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      // Get current local voters count in IndexedDB
      refreshVotersCount();

      // Retrieve GPS coordinates immediately
      initGPS();

      refreshLocalRecords();
      refreshLocalConsultas();

      // Sync inicial al montar: SOLO envía lo genuinamente pendiente (getPending
      // filtra por status 'pending'). No se re-encola lo ya sincronizado — así no
      // se reenvía "todo una y otra vez", solo lo que falta. El re-envío de cambios
      // atascados queda como acción MANUAL en Config ("Reenviar cambios").
      triggerSync();
      void syncActivityLogs(); // procesa la cola de logs pendientes al montar
      installErrorReporter();  // captura errores JS no atrapados en campo → AuditLog

      const interval = setInterval(() => {
        if (navigator.onLine) {
          triggerSync();
          void syncActivityLogs();
        }
      }, 15000);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        clearInterval(interval);
      };
    }
  }, []);

  // Service Worker registration & automatic updates
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    // Solo registrar en producción
    if (process.env.NODE_ENV !== "production") return;

    let registration: ServiceWorkerRegistration | null = null;

    const handleUpdate = (reg: ServiceWorkerRegistration) => {
      setSwRegistration(reg);
      setShowUpdateBanner(true);
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;

        // Si ya hay un service worker esperando (por ejemplo, de una recarga previa)
        if (reg.waiting) {
          handleUpdate(reg);
        }

        // Escuchar si se encuentra un nuevo service worker instalando
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                handleUpdate(reg);
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn("SW registration failed:", err);
      });

    // Recargar la página cuando el nuevo Service Worker toma el control
    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    // Función para buscar actualizaciones proactivamente
    const checkForUpdates = () => {
      if (registration) {
        registration
          .update()
          .catch((err) => console.log("SW update check failed:", err));
      }
    };

    // Buscar actualizaciones periódicamente cada 5 minutos
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
    // Y cuando el usuario vuelva a enfocar la ventana/pestaña
    window.addEventListener("focus", checkForUpdates);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkForUpdates);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      if (remindLaterTimeoutRef.current)
        clearTimeout(remindLaterTimeoutRef.current);
    };
  }, []);

  const handleUpdateApp = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  };

  const handleRemindLater = () => {
    setShowUpdateBanner(false);
    if (remindLaterTimeoutRef.current)
      clearTimeout(remindLaterTimeoutRef.current);
    remindLaterTimeoutRef.current = setTimeout(
      () => {
        if (swRegistration && swRegistration.waiting) {
          setShowUpdateBanner(true);
        }
      },
      3 * 60 * 1000,
    ); // 3 minutos
  };

  // El banner de actualización se muestra por el centro UNIFICADO. Descartar por
  // swipe/X = ocultar; POSPONER es SOLO el botón "Más tarde" (reaparece a 3 min).
  useEffect(() => {
    if (showUpdateBanner) {
      pushNotif({
        id: "__update__",
        variant: "update",
        title: "Actualización disponible",
        message: "Hay una nueva versión lista. Actualiza cuando quieras.",
        onClose: () => setShowUpdateBanner(false),
        actions: [
          { label: "Más tarde", onClick: handleRemindLater },
          {
            label: "Actualizar ahora",
            primary: true,
            onClick: handleUpdateApp,
          },
        ],
      });
    } else {
      dismissNotif("__update__");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUpdateBanner]);

  // Load cached stats and registrations on mount — solo si el cache pertenece al
  // usuario de esta sesión (mejora H segura: en un dispositivo compartido no se
  // muestran datos del refugio de otro operador).
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUser =
        localStorage.getItem("sismo_operator") ||
        sessionStorage.getItem("sismo_operator");
      let ownerId = "";
      try {
        ownerId = savedUser ? JSON.parse(savedUser).id : "";
      } catch {}

      if (ownerId && localStorage.getItem("cached_owner") === ownerId) {
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
      } else {
        // Cache de otro usuario o sin dueño → descartar por seguridad.
        localStorage.removeItem("cached_registros");
        localStorage.removeItem("cached_stats");
        localStorage.removeItem("cached_owner");
      }
    }
  }, []);

  // Suscripción Web Push (automática para ADMIN al iniciar). El resto puede
  // activarla/renovarla a mano desde Configuración (ver enablePush).
  useEffect(() => {
    if (!currentUser || currentUser.role !== "ADMIN") return;
    if (!pushSupported()) return;
    // Solo si ya concedió o aún no decidió; si está bloqueado, no insistimos aquí.
    if (pushPermission() === "denied") return;
    const timeout = setTimeout(() => {
      void enablePush(currentUser.id);
    }, 1000);
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
        const newUrl =
          window.location.pathname +
          window.location.search.replace(/[\?&]registroId=[^&]+/, "");
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
          pushNotif({
            id: `reg-${registroId}`,
            variant: "alert",
            title: "Nuevo afectado",
            message: (
              <>
                <strong>{nombreApellido}</strong> ha sido registrado.
              </>
            ),
            duration: 8000,
            actions: [
              {
                label: "Asignar habitación",
                primary: true,
                onClick: () => {
                  setPendingSelectId(registroId);
                  fetchRegistros();
                },
              },
            ],
          });
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
    const match = registros.find((r) => r.id === pendingSelectId);
    if (match) {
      setActiveTab("asignaciones");
    }
  }, [registros, pendingSelectId]);

  // Fetch registrations from database on login/refresh to keep local cache up-to-date
  useEffect(() => {
    if (currentUser) {
      fetchRegistros();
      fetchPatologias();
      fetchTiposLesion();
      fetchPredefinedMedicamentos();
      fetchConsultas();
      refreshLocalConsultas();
      if (canViewDashboard(currentUser.role)) {
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
    if (
      activeTab === "morbilidad" ||
      activeTab === "balance" ||
      activeTab === "historial"
    ) {
      fetchConsultas();
      refreshLocalConsultas();
    }
    if (activeTab === "caracterizacion") {
      fetchRegistros(); // familias del censo (304 si no cambió)
      fetchCaracterizacionOpciones(); // catálogo general (cache 120s)
    }
    if (canViewDashboard(currentUser.role)) {
      if (activeTab === "dashboard") {
        fetchStats();
      }
    }
  }, [activeTab, currentUser]);

  // Auto-descarga/reanudación del padrón. En CADA arranque compara el conteo
  // local contra el total del servidor y reanuda en segundo plano si falta.
  // (Antes solo descargaba si el conteo local era 0, así que una descarga
  //  interrumpida a 100/200 se quedaba incompleta para siempre.)
  useEffect(() => {
    if (!currentUser || !isOnline) return;
    if (!canRegister(currentUser.role)) return; // solo quienes censan necesitan el padrón local
    (async () => {
      if (syncStatus !== "idle") return;
      const localCount = await getLocalPadronCount();

      // Total del servidor (ligero). Si no hay señal, usar el último total conocido.
      let serverTotal = 0;
      try {
        const res = await apiFetch("/api/padron/count");
        if (res.ok) {
          const d = await res.json();
          serverTotal = d.total || 0;
          if (serverTotal > 0)
            localStorage.setItem("padron_total", String(serverTotal));
        }
      } catch {
        /* sin señal: se usa el total guardado */
      }

      const knownTotal =
        serverTotal ||
        parseInt(localStorage.getItem("padron_total") || "0", 10);

      // Reanudar si la copia local está incompleta; o primera descarga si aún no
      // hay nada y no se pudo consultar el total.
      if (
        (knownTotal > 0 && localCount < knownTotal) ||
        (localCount === 0 && knownTotal === 0)
      ) {
        downloadFullPadron();
      }
    })();
  }, [currentUser]);

  // Inactivity session expiry: logout after INACTIVITY_MS of no pointer/key events
  useEffect(() => {
    if (!currentUser) return;
    const touch = () => {
      lastActivityRef.current = Date.now();
    };
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
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.warn("Error al obtener coordenadas GPS:", error.message);
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    }
  };

  // Helper to show temporary toasts
  const showToast = (message: string, type: ToastType) => {
    pushNotif({
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      variant: type,
      message,
      duration: 4000,
    });
  };

  // Get records list from IndexedDB to show history and sync progress
  const refreshLocalRecords = async () => {
    const records = await getAllLocal();
    records.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    setLocalRecords(records);
  };

  const refreshLocalConsultas = async () => {
    const list = await getAllLocalConsultas();
    list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    setLocalConsultas(list);
  };

  // force=true → salta el cache HTTP (cache:"reload"): se usa tras crear/editar/borrar
  // un ítem del catálogo, para no leer la versión vieja del navegador (max-age=120).
  const fetchPatologias = async (force = false) => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("sismo_cached_patologias_v2");
      if (cached) {
        try {
          setPatologias(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
    }
    if (!navigator.onLine) return;
    try {
      const res = await apiFetch(
        "/api/patologias",
        force ? { cache: "reload" } : {},
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.patologias) {
          setPatologias(data.patologias);
          localStorage.setItem(
            "sismo_cached_patologias_v2",
            JSON.stringify(data.patologias),
          );
        }
      }
    } catch (err) {
      console.error("Error al obtener patologías:", err);
    }
  };

  const fetchTiposLesion = async (force = false) => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("sismo_cached_tipos_lesion_v1");
      if (cached) {
        try {
          setTiposLesion(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
    }
    if (!navigator.onLine) return;
    try {
      const res = await apiFetch(
        "/api/tipos-lesion",
        force ? { cache: "reload" } : {},
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.tiposLesion) {
          setTiposLesion(data.tiposLesion);
          localStorage.setItem(
            "sismo_cached_tipos_lesion_v1",
            JSON.stringify(data.tiposLesion),
          );
        }
      }
    } catch (err) {
      console.error("Error al obtener tipos de lesión:", err);
    }
  };

  const fetchPredefinedMedicamentos = async (force = false) => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(
        "sismo_cached_predefined_medicamentos",
      );
      if (cached) {
        try {
          setPredefinedMedicamentos(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
    }
    if (!navigator.onLine) return;
    try {
      const res = await apiFetch(
        "/api/medicamentos",
        force ? { cache: "reload" } : {},
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.medicamentos) {
          setPredefinedMedicamentos(data.medicamentos);
          localStorage.setItem(
            "sismo_cached_predefined_medicamentos",
            JSON.stringify(data.medicamentos),
          );
        }
      }
    } catch (err) {
      console.error("Error al obtener medicamentos predefinidos:", err);
    }
  };

  // Catálogo general de caracterización. force=true → salta cache HTTP (tras editar opciones).
  const fetchCaracterizacionOpciones = async (force = false) => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(
        "sismo_cached_caracterizacion_opciones_v1",
      );
      if (cached) {
        try {
          setCaracterizacionOpciones(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
    }
    if (!navigator.onLine) return;
    try {
      const res = await apiFetch(
        "/api/caracterizacion/opciones",
        force ? { cache: "reload" } : {},
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.opciones) {
          setCaracterizacionOpciones(data.opciones);
          localStorage.setItem(
            "sismo_cached_caracterizacion_opciones_v1",
            JSON.stringify(data.opciones),
          );
        }
      }
    } catch (err) {
      console.error("Error al obtener opciones de caracterización:", err);
    }
  };

  const fetchConsultas = async () => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("cached_consultas_v2");
      if (cached) {
        try {
          setConsultas(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
    }
    if (!navigator.onLine) return;
    setLoadingConsultas(true);
    try {
      const scopeKey = effectiveRefugioRef.current || "__all__";
      const q = effectiveRefugioRef.current
        ? `?refugio=${encodeURIComponent(effectiveRefugioRef.current)}`
        : "";
      const prevEtag = consultasEtagRef.current[scopeKey];
      const res = await apiFetch(
        `/api/consultas${q}`,
        prevEtag ? { headers: { "If-None-Match": prevEtag } } : {},
      );
      // 304 = nada cambió en el servidor → conservamos lo ya cargado (cache/estado actual).
      if (res.status === 304) return;
      if (res.ok) {
        const etag = res.headers.get("ETag");
        if (etag) consultasEtagRef.current[scopeKey] = etag;
        const data = await res.json();
        if (data.success && data.consultas) {
          setConsultas(data.consultas);
          localStorage.setItem(
            "cached_consultas_v2",
            JSON.stringify(data.consultas),
          );
        }
      }
    } catch (err) {
      console.error("Error al obtener consultas:", err);
    } finally {
      setLoadingConsultas(false);
    }
  };

  // Sync execution engine — controlled concurrency (batch of 2) for resilience on weak networks.
  // Fully parallel risks saturating a 2G/3G link and failing all records at once;
  // batch-of-2 keeps bandwidth manageable while still being faster than purely sequential.
  const triggerSync = async () => {
    if (isSyncingRef.current) return;

    // Check if there are actual pending items to sync before altering state
    const pending = await getPending();
    const pendingConsultasInit = await getPendingConsultas();
    const pendingCaracterizacionInit = await getPendingCaracterizacion();
    if (
      pending.length === 0 &&
      pendingConsultasInit.length === 0 &&
      pendingCaracterizacionInit.length === 0
    ) {
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    let serverError: string | null = null; // detalle del primer 5xx (para no fallar en silencio)
    try {
      // Orden: primero las CREACIONES (censos nuevos), luego las ediciones; y dentro
      // de cada grupo, en orden CRONOLÓGICO (createdAt asc) para no montarlos
      // desordenados. Así una creación siempre llega antes que su edición.
      pending.sort((a, b) => {
        const au = a.type === "update" ? 1 : 0;
        const bu = b.type === "update" ? 1 : 0;
        if (au !== bu) return au - bu;
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });

      const BATCH = 2;
      setSyncQueueProgress({ done: 0, total: pending.length });

      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);

        const results = await Promise.allSettled(
          batch.map((record) =>
            apiFetch("/api/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // Manda el TIPO REAL: los registros viejos sin type (p. ej. "asignar cuarto"
              // guardados antes del fix) llegan como undefined → NO se saltan → se aplican
              // como edición. Solo las creaciones marcadas 'new' se saltan si ya existen.
              body: JSON.stringify({
                ...record.data,
                id: record.id,
                refugio: record.refugio,
                _localType: record.type,
              }),
              timeoutMs: 15000,
            }),
          ),
        );

        await Promise.allSettled(
          results.map(async (result, j) => {
            const record = batch[j];
            if (result.status === "rejected") {
              // Red / timeout / abort → temporal: reintentar con backoff.
              await incrementAttempt(record.id);
              return;
            }
            const res = result.value;
            if (res.status === 201 || res.status === 200) {
              await markSynced(record.id, "registrado");
            } else if (res.status === 409) {
              await markSynced(record.id, "duplicado");
              showToast(
                `La cédula de ${record.data.nombreApellido} ya está registrada en el servidor.`,
                "warning",
              );
            } else if (
              res.status === 400 ||
              res.status === 401 ||
              res.status === 403
            ) {
              // Rechazo definitivo: reintentar no ayuda. Sale de la cola y se avisa.
              let reason =
                res.status === 401
                  ? "Sesión no válida para sincronizar. Vuelva a iniciar sesión."
                  : res.status === 403
                    ? "Sin permiso para sincronizar este registro (refugio o rol)."
                    : "Datos inválidos en el registro.";
              if (res.status === 400) {
                const d = await res.json().catch(() => ({}) as any);
                if (d?.error || d?.details)
                  reason = [d.error, d.details].filter(Boolean).join(" — ");
              }
              if (!serverError)
                serverError = `${record.data.nombreApellido}: ${reason}`;
              await markPermanentError(record.id, reason);
            } else {
              // 5xx u otros → temporal: backoff. Captura el detalle del servidor UNA vez
              // (el offline enmascaraba estos 500 → nada llegaba a la BD sin aviso).
              if (res.status >= 500 && !serverError) {
                serverError = await res
                  .json()
                  .then(
                    (d: any) => d?.details || d?.error || `HTTP ${res.status}`,
                  )
                  .catch(() => `HTTP ${res.status}`);
              }
              await incrementAttempt(record.id);
            }
          }),
        );

        setSyncQueueProgress({
          done: Math.min(i + BATCH, pending.length),
          total: pending.length,
        });
      }

      await refreshLocalRecords();
      await refreshCustomRooms();

      // --- Sincronizar Consultas Médicas (en orden cronológico) ---
      const pendingConsultas = await getPendingConsultas();
      pendingConsultas.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      if (pendingConsultas.length > 0) {
        for (let i = 0; i < pendingConsultas.length; i += BATCH) {
          const batch = pendingConsultas.slice(i, i + BATCH);

          const results = await Promise.allSettled(
            batch.map((c) =>
              apiFetch("/api/consultas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: c.id,
                  cedula: c.data.cedula,
                  nombreApellido: c.data.nombreApellido,
                  genero: c.data.genero,
                  edad: c.data.edad,
                  fechaNacimiento: c.data.fechaNacimiento,
                  tipoPaciente: c.data.tipoPaciente,
                  tipoNota: c.data.tipoNota,
                  fechaConsulta: c.data.fechaConsulta,
                  lesiones: c.data.lesiones,
                  estadoFisico: c.data.estadoFisico,
                  embarazo: c.data.embarazo,
                  refugio: c.data.refugio,
                  registroId: c.data.registroId,
                  antecedentesPatologiaIds: c.data.antecedentesPatologiaIds,
                  antecedentesMedicamentoIds: c.data.antecedentesMedicamentoIds,
                  diagnosticoPatologiaIds: c.data.diagnosticoPatologiaIds,
                  diagnosticoMedicamentoIds: c.data.diagnosticoMedicamentoIds,
                  notasDoctor: c.data.notasDoctor,
                }),
                timeoutMs: 15000,
              }),
            ),
          );

          await Promise.allSettled(
            results.map(async (result, j) => {
              const c = batch[j];
              if (result.status === "rejected") {
                await incrementConsultaAttempt(c.id);
                return;
              }
              const res = result.value;
              if (res.status === 201 || res.status === 200) {
                await markConsultaSynced(c.id);
              } else if (
                res.status === 400 ||
                res.status === 401 ||
                res.status === 403
              ) {
                const reason =
                  res.status === 401
                    ? "Sesión no válida para sincronizar consulta. Vuelva a iniciar sesión."
                    : res.status === 403
                      ? "Sin permiso para registrar esta consulta médica."
                      : "Datos inválidos en la consulta.";
                await markConsultaPermanentError(c.id, reason);
              } else {
                if (res.status >= 500 && !serverError) {
                  serverError = await res
                    .json()
                    .then(
                      (d: any) =>
                        d?.details || d?.error || `HTTP ${res.status}`,
                    )
                    .catch(() => `HTTP ${res.status}`);
                }
                await incrementConsultaAttempt(c.id);
              }
            }),
          );
        }
        await refreshLocalConsultas();
        await fetchConsultas();
      }

      // --- Sincronizar Caracterización (fichas por familia; 1 registro = 1 familia) ---
      const pendingCaracterizacion = await getPendingCaracterizacion();
      pendingCaracterizacion.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      if (pendingCaracterizacion.length > 0) {
        for (let i = 0; i < pendingCaracterizacion.length; i += BATCH) {
          const batch = pendingCaracterizacion.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map((f) =>
              apiFetch("/api/caracterizacion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: f.id,
                  refugio: f.refugio,
                  hogar: f.data.hogar,
                  personas: f.data.personas,
                }),
                timeoutMs: 15000,
              }),
            ),
          );
          await Promise.allSettled(
            results.map(async (result, j) => {
              const f = batch[j];
              if (result.status === "rejected") {
                await incrementCaracterizacionAttempt(f.id);
                return;
              }
              const res = result.value;
              if (res.status === 201 || res.status === 200) {
                await markCaracterizacionSynced(f.id);
              } else if (
                res.status === 400 ||
                res.status === 401 ||
                res.status === 403
              ) {
                const reason =
                  res.status === 401
                    ? "Sesión no válida para sincronizar la ficha. Vuelva a iniciar sesión."
                    : res.status === 403
                      ? "Sin permiso para guardar caracterización."
                      : "Datos inválidos en la ficha.";
                await markCaracterizacionPermanentError(f.id, reason);
              } else {
                if (res.status >= 500 && !serverError) {
                  serverError = await res
                    .json()
                    .then(
                      (d: any) =>
                        d?.details || d?.error || `HTTP ${res.status}`,
                    )
                    .catch(() => `HTTP ${res.status}`);
                }
                await incrementCaracterizacionAttempt(f.id);
              }
            }),
          );
        }
      }

      // Si hubo un 500 del servidor, avisar (una vez) en vez de reintentar en silencio.
      if (serverError) {
        showToast(`No se pudo guardar en el servidor: ${serverError}`, "error");
      }
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
      showToast(
        "Se requiere conexión a internet para descargar el padrón.",
        "warning",
      );
      return;
    }

    setSyncStatus("downloading");
    // Reanudar desde lo que ya haya en IndexedDB (una descarga previa pudo quedar
    // interrumpida por recarga/cambio de sección). No se reinicia desde 0.
    const alreadyLocal = await getLocalPadronCount();
    setSyncProgress(alreadyLocal);
    setSyncTotal(0);
    showToast(
      alreadyLocal > 0
        ? "Reanudando descarga del padrón..."
        : "Descargando padrón electoral...",
      "info",
    );

    const MAX_RETRIES = 3;
    let totalInserted = alreadyLocal;
    let serverTotal = 0;

    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // Saltar en el stream los registros ya presentes en IndexedDB (tanto los
        // de una descarga previa reanudada como los insertados en reintentos).
        const skipAlreadyInserted = totalInserted;

        if (attempt > 0) {
          showToast(
            `Padrón incompleto. Reintentando (${attempt}/${MAX_RETRIES})...`,
            "warning",
          );
        }

        // Descarga por streaming (NDJSON, potencialmente grande y lenta en 2G):
        // timeout amplio para no abortar el stream a mitad de descarga.
        const res = await apiFetch("/api/padron/download", {
          method: "POST",
          timeoutMs: 600000,
        });
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
            try {
              pending.push(JSON.parse(line));
            } catch {}
          }
          if (pending.length >= WRITE_EVERY) await flushPending();
        }

        // Flush línea residual
        if (buffer.trim()) {
          try {
            pending.push(JSON.parse(buffer));
          } catch {}
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
          "warning",
        );
      } else {
        showToast(
          `Padrón descargado: ${finalCount.toLocaleString()} registros.`,
          "success",
        );
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
    if (
      confirm(
        "¿Estás seguro de borrar el padrón electoral local de este dispositivo?",
      )
    ) {
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
      const q = effectiveRefugioRef.current
        ? `?refugio=${encodeURIComponent(effectiveRefugioRef.current)}`
        : "";
      const res = await apiFetch(`/api/stats${q}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        if (typeof window !== "undefined") {
          localStorage.setItem("cached_stats", JSON.stringify(data.stats));
          if (currentUser) localStorage.setItem("cached_owner", currentUser.id);
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
      const scopeKey = effectiveRefugioRef.current || "__all__";
      const q = effectiveRefugioRef.current
        ? `?refugio=${encodeURIComponent(effectiveRefugioRef.current)}`
        : "";
      const prevEtag = registrosEtagRef.current[scopeKey];
      const res = await apiFetch(
        `/api/registros${q}`,
        prevEtag ? { headers: { "If-None-Match": prevEtag } } : {},
      );
      // 304 = sin cambios en el servidor → conservamos el cache/estado ya cargado.
      if (res.status === 304) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as any);
        throw new Error(
          `HTTP ${res.status} — ${body?.details || body?.error || "sin detalle"}`,
        );
      }
      const etag = res.headers.get("ETag");
      if (etag) registrosEtagRef.current[scopeKey] = etag;
      const data = await res.json();
      const newRegs = data.registros ?? [];
      setRegistros(newRegs);
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(newRegs));
        if (currentUser) localStorage.setItem("cached_owner", currentUser.id);
      }
    } catch (err: any) {
      showToast(
        "Error al cargar los registros: " + (err?.message ?? ""),
        "error",
      );
    } finally {
      setLoadingRegistros(false);
    }
  };

  // Master cambió el refugio de vista → recargar registros, stats y salones del
  // nuevo refugio. Ignora la inicialización (el mount ya carga todo).
  const prevEffRefugioRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser || !effectiveRefugio) return;
    if (prevEffRefugioRef.current === null) {
      prevEffRefugioRef.current = effectiveRefugio; // primer valor: sin refetch
      return;
    }
    if (prevEffRefugioRef.current === effectiveRefugio) return;
    prevEffRefugioRef.current = effectiveRefugio;
    fetchRegistros();
    if (canViewDashboard(currentUser.role)) fetchStats(true);
    refreshCustomRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRefugio]);

  // Logout Handler
  const handleLogout = () => {
    localStorage.removeItem("sismo_operator");
    sessionStorage.removeItem("sismo_operator");
    // Descartar el cache local del operador saliente (no filtrar entre sesiones).
    localStorage.removeItem("sismo_active_tab");
    localStorage.removeItem("cached_registros");
    localStorage.removeItem("cached_stats");
    localStorage.removeItem("cached_owner");
    localStorage.removeItem("cached_consultas_v2");
    localStorage.removeItem("sismo_cached_predefined_medicamentos");
    localStorage.removeItem("sismo_cached_tipos_lesion_v1");
    setViewRefugio("");
    setRefugiosList([]);
    prevEffRefugioRef.current = null;
    setCurrentUser(null);
    setActiveTab("censo");
    showToast("Sesión cerrada.", "info");
  };

  const pendingCount =
    localRecords.filter((r) => r.status === "pending").length +
    localConsultas.filter((c) => c.status === "pending").length;

  // Splash mientras se restaura la sesión desde storage (evita el flash de login al
  // recargar/actualizar). En SSR y el primer render cliente authReady=false → splash,
  // sin desajuste de hidratación.
  if (!authReady) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
        <span className="spinner" aria-label="Cargando" />
      </div>
    );
  }

  // Si el usuario no está autenticado, mostrar la pantalla de login.
  // OJO: LoginForm se renderiza FUERA del <AppContext.Provider>, por eso
  // recibe props en lugar de consumir el context.
  if (!currentUser) {
    return (
      <>
        <LoginForm
          setCurrentUser={setCurrentUser}
          setActiveTab={setActiveTab}
          showToast={showToast}
        />
        <NotificationCenter items={notifs} onDismiss={dismissNotif} />
      </>
    );
  }

  // Authenticated Dashboard Layout
  const appCtx: AppContextValue = {
    isOnline,
    theme,
    toggleTheme,
    currentUser,
    setCurrentUser,
    isPowerAdmin: !!isPowerAdmin,
    handleLogout,
    activeTab,
    setActiveTab,
    showToast,
    triggerSync,
    isSyncing,
    syncQueueProgress,
    pendingCount,
    registros,
    setRegistros,
    fetchRegistros,
    loadingRegistros,
    localRecords,
    refreshLocalRecords,
    patologias,
    fetchPatologias,
    tiposLesion,
    fetchTiposLesion,
    predefinedMedicamentos,
    fetchPredefinedMedicamentos,
    caracterizacionOpciones,
    fetchCaracterizacionOpciones,
    consultas,
    localConsultas,
    loadingConsultas,
    refreshLocalConsultas,
    fetchConsultas,
    pendingSelectId,
    setPendingSelectId,
    pendingHistorialCedula,
    setPendingHistorialCedula,
    pendingUserId,
    setPendingUserId,
    customCuartos,
    setCustomCuartos,
    allCuartos,
    sortedCustomCuartos,
    dashboardRooms,
    roomCapacities,
    setRoomCapacities,
    viewRefugio,
    setViewRefugio,
    refugiosList,
    effectiveRefugio,
    stats,
    loadingStats,
    fetchStats,
    votersCount,
    coords,
    syncStatus,
    syncProgress,
    syncTotal,
    downloadFullPadron,
    deletePadronLocal,
    refreshVotersCount,
  };

  const showBanner = !isOnline || pendingCount > 0 || isSyncing;
  let bannerText = "";
  let bannerClass = "offline-top-banner";

  if (!isOnline) {
    bannerClass += " offline-top-banner--danger";
    bannerText = `Sin conexión: Trabajando en modo local · ${pendingCount} registro${pendingCount !== 1 ? "s" : ""} pendiente${pendingCount !== 1 ? "s" : ""}`;
  } else if (isSyncing && syncQueueProgress) {
    bannerClass += " offline-top-banner--syncing";
    bannerText = `Sincronizando datos... ${syncQueueProgress.done} de ${syncQueueProgress.total} completados`;
  } else if (pendingCount > 0) {
    bannerClass += " offline-top-banner--pending";
    bannerText = `${pendingCount} registro${pendingCount !== 1 ? "s" : ""} pendiente${pendingCount !== 1 ? "s" : ""} por sincronizar`;
  }

  return (
    <AppContext.Provider value={appCtx}>
      <div className="app-layout-wrapper">
        <div
          className={`${bannerClass}${showBanner ? " is-visible" : ""}`}
          role="status"
        >
          <div className="offline-banner-content">
            {!isOnline && (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 20h.01" />
                  <path d="M8.5 16.429a5 5 0 0 1 7 0" />
                  <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
                  <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
                  <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
                  <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
                  <path d="m2 2 20 20" />
                </svg>
                <span>{bannerText}</span>
              </>
            )}
            {isOnline && isSyncing && (
              <>
                <span className="spinner spinner-sm spinner-white" />
                <span>{bannerText}</span>
              </>
            )}
            {isOnline && !isSyncing && pendingCount > 0 && (
              <>
                <svg
                  className="offline-banner-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>{bannerText}</span>
              </>
            )}
          </div>
        </div>

        <div className="container">
          {/* Cabecera institucional + navegación (dentro del Provider).
              En escritorio (≥1024px) el CSS oculta AppHeader y muestra el sidebar flotante. */}
          <AppHeader />
          <AppSidebar />
          {/* Dock de navegación inferior flotante (solo móvil ≤768px) */}
          <BottomDock />

          {/* TAB 1: FORM VIEW (CENSO) — no visible para médicos ni Visualizador */}
          {activeTab === "censo" && canRegister(currentUser.role) && (
            <CensoTab />
          )}

          {/* TAB 2: DASHBOARD VIEW (ADMIN ONLY) */}
          {activeTab === "dashboard" && canViewDashboard(currentUser.role) && (
            <DashboardTab />
          )}

          {/* TAB 3: USER ADMINISTRATION (MASTER, ADMIN o AdminMedico —filtrado) */}
          {activeTab === "usuarios" && canManageUsers(currentUser.role) && (
            <UsuariosTab />
          )}

          {/* TAB 4: CONFIGURATION — no visible para médicos ni Visualizador */}
          {activeTab === "config" &&
            !isMedico(currentUser.role) &&
            currentUser.role !== "VISUALIZADOR" && <ConfigTab />}

          {/* TAB 5: ASIGNACIONES / REGISTRO DE AFECTADOS — no visible para médicos */}
          {activeTab === "asignaciones" && !isMedico(currentUser.role) && (
            <AsignacionesTab />
          )}
          {activeTab === "caracterizacion" && isMaster(currentUser.role) && (
            <CaracterizacionTab />
          )}
          {activeTab === "monitoreo" && isMaster(currentUser.role) && (
            <MonitoreoTab />
          )}
          {activeTab === "mapa" && isMaster(currentUser.role) && <MapaTab />}

          {/* TAB 6: MORBILIDAD / CONSULTAS MÉDICAS */}
          {activeTab === "morbilidad" &&
            canManageMorbilidad(currentUser.role) && <MorbilidadTab />}

          {/* TAB 7: BALANCE DE SALUD (médicos + Master) */}
          {activeTab === "balance" && canManageMorbilidad(currentUser.role) && (
            <BalanceTab />
          )}

          {/* TAB 8: HISTORIAL CLÍNICO (médicos + Master) */}
          {activeTab === "historial" &&
            canManageMorbilidad(currentUser.role) && <HistorialClinicoTab />}

          {/* Centro de notificaciones internas (UNIFICADO): toasts + alertas + actualización */}
          <NotificationCenter items={notifs} onDismiss={dismissNotif} />
        </div>
      </div>
    </AppContext.Provider>
  );
}
