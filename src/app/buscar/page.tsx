"use client";

import { useState, useEffect } from "react";

type PublicRegistro = {
  id: string;
  nombreApellido: string;
  cedula: string;
  parroquia: string;
  sector: string;
  comunidad: string;
  direccionExacta: string;
  genero: string;
  fechaNacimiento: string;
  edad: number;
  estadoFisico: string;
  cuarto: string | null;
  retirado: string;
  retiradoRazon: string | null;
  telefono: string | null;
  refugio: string;
};

export default function PublicSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isOperator, setIsOperator] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" | "warning" } | null>(null);

  // Load theme and operator session on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
      const initialTheme = savedTheme || "dark";
      setTheme(initialTheme);
      document.documentElement.setAttribute("data-theme", initialTheme);

      const savedUser = localStorage.getItem("sismo_operator") || sessionStorage.getItem("sismo_operator");
      if (savedUser) {
        setIsOperator(true);
      }
    }
  }, []);

  // Debounced search trigger as user types
  useEffect(() => {
    const cleanQ = query.trim();
    if (cleanQ.length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/public-search?q=${encodeURIComponent(cleanQ)}`);
        const data = await res.json();
        if (data.success) {
          setResults(data.registros || []);
          setSearched(true);
        } else {
          showToast("Error al realizar la búsqueda", "error");
        }
      } catch {
        showToast("Error de conexión", "error");
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  const showToast = (message: string, type: "success" | "error" | "info" | "warning") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Mask Cédula slightly for basic privacy (e.g. V-26597356 -> V-26***356)
  const maskCedula = (ced: string) => {
    const prefix = ced.slice(0, 2); // E.g. "V-" or "E-"
    const numberPart = ced.replace(/^[VE]-/, "");
    if (numberPart.length <= 4) return ced;
    return `${prefix}${numberPart.slice(0, 2)}***${numberPart.slice(-3)}`;
  };

  return (
    <div className="container">
      {/* Institutional Header */}
      <header className="app-header">
        <div className="header-main">
          <div className="header-identity">
            <div className="header-seal" aria-hidden="true" style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/logo_gob.webp" alt="Escudo Gobernación La Guaira" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div className="header-title-group">
              <span className="header-org-name">GOBERNACIÓN DEL ESTADO LA GUAIRA</span>
              <h1>BÚSQUEDA PÚBLICA DE FAMILIARES</h1>
              <p className="header-tagline">Portal de consulta para ciudadanos y familiares</p>
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
      </header>

      {/* Main Search Panel */}
      <div className="tab-view" style={{ marginTop: "1rem" }}>
        <div className="form-card" style={{ padding: "1.5rem" }}>
          <div className="form-section">
            <div className="section-title">Buscar Familiar Afectado</div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Consulte el estado actual de su familiar ingresando su nombre y apellido, número de cédula, teléfono de contacto o dirección.
            </p>
            
            <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
              <input
                type="text"
                placeholder="Escriba aquí para buscar (Ej: Juan Pérez, 12345678, Los Cocos...)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ flex: 1 }}
                required
              />
            </div>
          </div>

          {isOperator && (
            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-start" }}>
              <a href="/" className="btn-ver" style={{ padding: "0.5rem 1rem", textDecoration: "none" }}>
                ← Volver al Acceso de Operadores
              </a>
            </div>
          )}
        </div>

        {/* Results Container */}
        {(searched || loading) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.1rem", color: "var(--text-primary)", fontWeight: "600", margin: 0 }}>
                {loading ? "Buscando coincidencias..." : `Resultados de Búsqueda (${results.length})`}
              </h3>
              {loading && <span className="spinner"></span>}
            </div>

            {!loading && results.length === 0 ? (
              <div className="form-card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                No se encontraron familiares que coincidan con la búsqueda. Por favor verifique los datos ingresados o contacte a los coordinadores del refugio.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
                {results.map((reg) => (
                  <div key={reg.id} className="form-card" style={{ padding: "1.25rem", borderLeft: reg.retirado === "SI" ? "4px solid #ef4444" : "4px solid var(--color-success)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <h4 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>
                          {reg.nombreApellido}
                        </h4>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Cédula: {maskCedula(reg.cedula)} &middot; {reg.edad} años
                        </span>
                      </div>
                      <span className={`estado-pill ${reg.estadoFisico === "LESIONADO" ? "estado-pill--danger" : "estado-pill--ok"}`}>
                        {reg.estadoFisico}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.25rem", borderTop: "1px solid var(--border-color)", paddingTop: "0.5rem" }}>
                      <div><strong>Campamento Transitorio:</strong> <span style={{ color: "var(--color-primary-hover)", fontWeight: "600" }}>{reg.refugio || "Complejo Educativo República de Panamá"}</span></div>
                      <div><strong>Comunidad:</strong> {reg.comunidad} ({reg.parroquia})</div>
                      <div><strong>Sector:</strong> {reg.sector}</div>
                      {reg.telefono && <div><strong>Contacto Autorizado:</strong> <a href={`tel:${reg.telefono}`} style={{ color: "var(--color-primary-hover)", fontWeight: "600", textDecoration: "underline" }}>{reg.telefono}</a></div>}
                    </div>

                    {reg.retirado === "SI" && (
                      <div style={{ fontSize: "0.8rem", color: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.1)", padding: "0.5rem", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                        <strong>ESTADO: EGRESADO / RETIRADO</strong>
                        {reg.retiradoRazon && <div>Razón: {reg.retiradoRazon}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Toasts */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
