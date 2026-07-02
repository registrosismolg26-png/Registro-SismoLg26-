"use client";

// ── Pestaña: Gestión de Usuarios / Operadores (solo super-admin) ────────────
// Todo el subsistema de usuarios (estado, handlers, tabla y modales) vive aquí.
// Del context global solo consume: currentUser, isPowerAdmin, isOnline, showToast.

import { useState, useEffect, type FormEvent } from "react";
import { useAppContext } from "@/context/AppContext";

export default function UsuariosTab() {
  const { currentUser, isPowerAdmin, isOnline, showToast } = useAppContext();

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
  const [createUserClosing, setCreateUserClosing] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editUserClosing, setEditUserClosing] = useState(false);
  const [userShowPassword, setUserShowPassword] = useState(false);
  const [userShowConfirmPassword, setUserShowConfirmPassword] = useState(false);

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

  // Carga inicial al entrar al tab y recarga al recuperar conexión
  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const closeCreateUserModal = () => {
    setCreateUserClosing(true);
    setTimeout(() => {
      setCreateUserModalOpen(false);
      setCreateUserClosing(false);
    }, 200);
  };

  const closeEditUserModal = () => {
    setEditUserClosing(true);
    setTimeout(() => {
      setEditUserModalOpen(false);
      setEditUserClosing(false);
    }, 200);
  };

  const handleCreateUser = async (e: FormEvent) => {
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

  const handleUpdateUser = async (e: FormEvent) => {
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

  return (
    <>
      <div className="tab-view tab-enter">

        <div className="dashboard-section">

          {/* Header */}
          <div className="config-section-header" style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span className="dashboard-section-label">OPERADORES DEL SISTEMA</span>
                {systemUsers.length > 0 && (
                  <span className="users-count-badge">{systemUsers.length}</span>
                )}
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
                Gestione cuentas de operadores, campamentos y niveles de acceso.
              </p>
            </div>
            {isOnline && (
              <button
                type="button"
                className="btn-submit"
                style={{ width: "auto", padding: "0 1.25rem", display: "inline-flex", alignItems: "center", gap: "0.5rem", height: "var(--element-height)", flexShrink: 0 }}
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
                Nuevo Operador
              </button>
            )}
          </div>

          {!isOnline && (
            <div className="users-offline-notice">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
              Sin conexión — no es posible listar o registrar operadores.
            </div>
          )}

          {loadingUsers ? (
            <div className="users-skeleton-list">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="user-skeleton-row" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="user-skeleton-avatar"></div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <span className="skeleton-cell" style={{ width: "40%", height: "12px" }}></span>
                    <span className="skeleton-cell" style={{ width: "60%", height: "10px" }}></span>
                  </div>
                  <span className="skeleton-cell skeleton-cell--pill" style={{ width: "80px" }}></span>
                  <span className="skeleton-cell" style={{ width: "32px", height: "32px", borderRadius: "50%" }}></span>
                </div>
              ))}
            </div>
          ) : systemUsers.length === 0 ? (
            <div className="users-empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <p>No hay operadores registrados en el sistema.</p>
            </div>
          ) : (
            <div className="registro-table-wrapper">
              <table className="registro-table">
                <thead>
                  <tr>
                    <th>Operador</th>
                    <th>Correo de Acceso</th>
                    <th>Rol</th>
                    <th>Campamento Asignado</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {systemUsers.map((usr, i) => (
                    <tr key={usr.id} className="user-row-enter" style={{ animationDelay: `${i * 40}ms` }}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                          <div className="user-table-avatar">
                            {usr.nombre.trim().split(/\s+/).slice(0,2).map((w: string) => w[0]||"").join("").toUpperCase()}
                          </div>
                          <strong style={{ fontSize: "0.875rem" }}>{usr.nombre}</strong>
                        </div>
                      </td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "0.825rem" }}>{usr.email}</td>
                      <td>
                        <span className={`user-role-badge user-role-badge--${usr.role.toLowerCase()}`}>
                          {usr.role === "ADMIN" ? "ADMIN" : usr.role === "VISUALIZADOR" ? "VISUALIZADOR" : "REGISTRADOR"}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "0.825rem" }}>
                        {usr.campamentoTransitorio || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin campamento</span>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isOnline && (
                          <button
                            type="button"
                            className="btn-edit-user"
                            data-tip="Editar operador"
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
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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

      {/* Modal: Crear Nuevo Usuario */}
      {createUserModalOpen && (
        <div className={`modal-overlay${createUserClosing ? " modal-overlay--closing" : ""}`} onClick={closeCreateUserModal}>
          <div className={`modal-content modal-content--detail${createUserClosing ? " modal-content--closing" : ""}`} onClick={e => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div className="modal-avatar" style={{ background: "var(--color-success-light)", color: "var(--color-success)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <span className="modal-title">Nuevo Operador</span>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>Complete los datos del nuevo acceso</p>
                </div>
              </div>
              <button className="modal-close" onClick={closeCreateUserModal}>
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
                  <button type="button" className="pwd-toggle-btn" onClick={() => setUserShowPassword(p => !p)}>
                    {userShowPassword ? (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
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
                  <button type="button" className="pwd-toggle-btn" onClick={() => setUserShowConfirmPassword(p => !p)}>
                    {userShowConfirmPassword ? (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
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
                <button type="button" className="btn-secondary" onClick={closeCreateUserModal}>
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
        <div className={`modal-overlay${editUserClosing ? " modal-overlay--closing" : ""}`} onClick={closeEditUserModal}>
          <div className={`modal-content modal-content--detail${editUserClosing ? " modal-content--closing" : ""}`} onClick={e => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div className="modal-avatar">
                  {userForm.nombre.trim().split(/\s+/).slice(0,2).map((w: string) => w[0]||"").join("").toUpperCase() || "OP"}
                </div>
                <div>
                  <span className="modal-title">{userForm.nombre || "Editar Operador"}</span>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>Modifique los datos del operador</p>
                </div>
              </div>
              <button className="modal-close" onClick={closeEditUserModal}>
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
                  <button type="button" className="pwd-toggle-btn" onClick={() => setUserShowPassword(p => !p)}>
                    {userShowPassword ? (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
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
                  <button type="button" className="pwd-toggle-btn" onClick={() => setUserShowConfirmPassword(p => !p)}>
                    {userShowConfirmPassword ? (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
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
                <button type="button" className="btn-secondary" onClick={closeEditUserModal}>
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
    </>
  );
}
