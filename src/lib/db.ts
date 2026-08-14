// La ficha de caracterización se encola con la misma forma que las demás
// (import type: se borra en compilación → sin ciclo aunque @/types re-exporte de aquí).
import type { LocalCaracterizacion } from "@/types";

export interface LocalConsulta {
  id: string;
  type?: 'new';
  data: {
    cedula: string;
    nombreApellido: string;
    registroId?: string;  // UID del Registro del censo (null si no está censado)
    genero?: string;
    edad?: number;
    fechaNacimiento?: string;  // yyyy-mm-dd; la edad se DERIVA de aquí (nunca manual)
    tipoPaciente?: string;     // REFUGIADO | APOYO_INSTITUCIONAL | APOYO_COMUNITARIO | EMERGENCIA
    tipoNota?: string;         // nota opcional para atenciones de apoyo
    fechaConsulta?: string;    // ISO de la fecha-hora REAL de la consulta (elegida a mano)
    lesiones?: { tipoId: string; zona: string; estado: string; cura: string }[];
    estadoFisico?: string;     // "ILESO" / "LESIONADO" (estado explícito, se sincroniza al censo)
    embarazo?: string;         // "SI" / "NO" (estado explícito, se sincroniza al censo)
    refugio: string;
    // Por-ID: patologías = ids del catálogo; medicamentos = { id, dosis, periodo }.
    antecedentesPatologiaIds: string[];
    antecedentesMedicamentoIds: { id: string; dosis: string; periodo: string }[];
    diagnosticoPatologiaIds: string[];
    diagnosticoMedicamentoIds: { id: string; dosis: string; periodo: string }[];
    notasDoctor?: string;
  };
  status: 'pending' | 'synced' | 'error';
  attempts: number;
  createdAt: string;
  userId?: string;
  nextAttemptAt?: number;
  permanentError?: string;
}

export interface LocalRegistro {
  id: string;
  type?: 'new' | 'update';
  data: {
    parroquia: string;
    sector: string;
    comunidad: string;
    direccionExacta: string;
    nombreApellido: string;
    cedula: string;
    jefeFamilia: string;
    genero: string;
    fechaNacimiento: string;
    edad: number;
    perteneceNucleo: string;
    cedulaJefeFamilia?: string;
    estadoFisico: string;
    patologia: string;
    // Por-ID: ids de patologías del catálogo + medicamentos { id, dosis, periodo }.
    patologiaIds?: string[];
    medicamentoIds?: { id: string; dosis: string; periodo: string }[];
    gpsLat?: number;
    gpsLng?: number;
    telefono?: string;
  };
  status: 'pending' | 'synced' | 'error';
  syncResult?: 'registrado' | 'duplicado' | 'error';
  attempts: number;
  createdAt: string;
  refugio?: string;        // refugio sellado del creador (determinismo + lookup offline)
  userId?: string;         // operador que originó el registro
  nextAttemptAt?: number;  // timestamp (ms) para backoff exponencial
  permanentError?: string; // razón si el back lo rechazó definitivamente (401/403/400)
}

export interface PadrónCiudadano {
  cedula: string;
  nacionalidad: string;
  nombreCompleto: string;
  sexo: string;
  fechaNacimiento: string;
  parroquia: string;
}

const DB_NAME = 'registro-sismo-db';
// ⚠️ NUNCA BAJAR este número. IndexedDB no puede abrirse con una versión MENOR a la
// que ya tiene el navegador → `VersionError` y falla TODO guardado local. Si un build
// local llegó a una versión mayor (p. ej. 10 en máquinas del equipo), este valor debe
// quedar por ENCIMA. Subido a 11 tras detectar navegadores con la 10.
const DB_VERSION = 11;
const STORE_NAME = 'registros';
const PADRON_STORE = 'padron';
const CONSULTAS_STORE = 'consultas';
const LOGS_STORE = 'activity_logs';
const CARACTERIZACION_STORE = 'caracterizacion';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is only available in the browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      
      // Queue Store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      
      // Offline electoral registry store
      if (!db.objectStoreNames.contains(PADRON_STORE)) {
        db.createObjectStore(PADRON_STORE, { keyPath: 'cedula' });
      }

      // Offline medical consultations store
      if (!db.objectStoreNames.contains(CONSULTAS_STORE)) {
        db.createObjectStore(CONSULTAS_STORE, { keyPath: 'id' });
      }

      // Cola offline de logs de actividad (imprimir PDF / descargar Excel)
      if (!db.objectStoreNames.contains(LOGS_STORE)) {
        db.createObjectStore(LOGS_STORE, { keyPath: 'id' });
      }

      // Cola offline de fichas de caracterización (1 registro = ficha de una familia)
      if (!db.objectStoreNames.contains(CARACTERIZACION_STORE)) {
        db.createObjectStore(CARACTERIZACION_STORE, { keyPath: 'id' });
      }
    };
  });
}

// QUEUE STORE METHODS
export async function saveLocal(registro: Omit<LocalRegistro, 'status' | 'attempts' | 'createdAt'>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const getRequest = store.get(registro.id);
    
    getRequest.onsuccess = () => {
      const existing = getRequest.result as LocalRegistro | undefined;
      const fullRecord: LocalRegistro = {
        id: registro.id,
        type: registro.type ?? existing?.type,
        data: registro.data,
        refugio: registro.refugio ?? existing?.refugio,
        userId: registro.userId ?? existing?.userId,
        // Un saveLocal SIEMPRE trae datos nuevos que enviar → SIEMPRE 'pending'.
        // (Antes, si el registro ya estaba 'synced', una re-edición quedaba 'synced'
        //  y getPending la ignoraba → la 2da edición nunca se sincronizaba.)
        status: 'pending',
        attempts: 0,
        nextAttemptAt: undefined,
        permanentError: undefined,
        createdAt: existing?.createdAt || new Date().toISOString()
      };
      
      const putRequest = store.put(fullRecord);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function getPending(): Promise<LocalRegistro[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result as LocalRegistro[];
      // Solo pendientes cuyo backoff ya venció (nextAttemptAt en el pasado o ausente).
      const now = Date.now();
      resolve(all.filter(r => r.status === 'pending' && (!r.nextAttemptAt || r.nextAttemptAt <= now)));
    };

    request.onerror = () => reject(request.error);
  });
}

// Reenvío INTELIGENTE: reencola lo que la DB NUNCA confirmó. Un registro se
// considera confirmado SOLO si status === 'synced' **y** tiene `syncResult` (que
// únicamente pone `markSynced` cuando el backend respondió OK). Los 'synced' SIN
// `syncResult` son del BUG viejo (el saveLocal legacy los marcaba 'synced' sin
// enviarlos) → esos SÍ se reenvían. Devuelve cuántos reencoló.
export async function resetAllLocalToPending(): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    let count = 0;
    request.onsuccess = () => {
      const all = request.result as LocalRegistro[];
      for (const r of all) {
        const confirmadoPorDB = r.status === 'synced' && !!r.syncResult;
        if (!confirmadoPorDB) {   // reencola pending/error y los 'synced' legacy sin syncResult
          r.status = 'pending';
          r.attempts = 0;
          r.nextAttemptAt = undefined;
          r.permanentError = undefined;
          store.put(r);
          count++;
        }
      }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(count);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllLocal(): Promise<LocalRegistro[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as LocalRegistro[]);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function markSynced(id: string, result?: 'registrado' | 'duplicado' | 'error'): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as LocalRegistro | undefined;
      if (record) {
        record.status = 'synced';
        if (result) record.syncResult = result;
        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function incrementAttempt(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as LocalRegistro | undefined;
      if (record) {
        record.attempts += 1;
        // Backoff exponencial: 15s, 30s, 60s, ... con tope de 5 min.
        // Evita quemar la poca señal y la batería reintentando en bucle cerrado.
        const delay = Math.min(15000 * Math.pow(2, record.attempts - 1), 300000);
        record.nextAttemptAt = Date.now() + delay;
        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function resetAttempts(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as LocalRegistro | undefined;
      if (record) {
        record.attempts = 0;
        record.status = 'pending';
        record.nextAttemptAt = undefined;
        record.permanentError = undefined;
        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// Marca un registro con error PERMANENTE (rechazo definitivo del backend:
// 401/403/400). No se reintenta automáticamente: sale de la cola de pendientes
// y se muestra al operador con su razón para que decida (re-login, corregir, etc.).
export async function markPermanentError(id: string, reason: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as LocalRegistro | undefined;
      if (record) {
        record.status = 'error';
        record.permanentError = reason;
        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// OFFLINE PADRON METHODS
export async function getLocalPadronCount(): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(PADRON_STORE, 'readonly');
      const store = transaction.objectStore(PADRON_STORE);
      const countRequest = store.count();

      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => resolve(0);
    });
  } catch (e) {
    return 0;
  }
}

// Clear all offline electoral registry records
export async function clearLocalPadron(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PADRON_STORE, 'readwrite');
    const store = transaction.objectStore(PADRON_STORE);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Optimized Batch load into IndexedDB (batches of 5,000 records)
// Yields control to the main UI thread between batches using a progress callback
export async function cargarPadronEnCliente(
  lista: any[][], 
  onProgress: (inserted: number) => void
): Promise<void> {
  const db = await getDB();
  const chunkSize = 5000;
  let index = 0;

  const saveChunk = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PADRON_STORE, 'readwrite');
      const store = transaction.objectStore(PADRON_STORE);

      transaction.oncomplete = () => {
        index += chunkSize;
        const currentProgress = Math.min(index, lista.length);
        onProgress(currentProgress);
        resolve();
      };
      
      transaction.onerror = () => reject(transaction.error);

      const limit = Math.min(index + chunkSize, lista.length);
      for (let i = index; i < limit; i++) {
        const item = lista[i]; // item is [cedula, nacionalidad, nombreCompleto, sexo, fechaNacimiento, parroquia]
        const record: PadrónCiudadano = {
          cedula: String(item[0]).trim(),
          nacionalidad: String(item[1]),
          nombreCompleto: String(item[2]),
          sexo: String(item[3]),
          fechaNacimiento: String(item[4]),
          parroquia: String(item[5])
        };
        store.put(record);
      }
    });
  };

  while (index < lista.length) {
    await saveChunk();
    // Yield to the browser rendering loop to keep UI active and prevent frozen tab
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// Exporta TODO el padrón local como líneas NDJSON (un array posicional por línea) — MISMO
// formato que /api/padron/download y que consume cargarPadronEnCliente. Listo para
// comprimir (gzip) y compartir dispositivo-a-dispositivo.
export async function exportPadronNdjson(): Promise<string> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PADRON_STORE, 'readonly');
    const store = transaction.objectStore(PADRON_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = (request.result as PadrónCiudadano[]) || [];
      let out = "";
      for (const c of rows) {
        out += JSON.stringify([c.cedula, c.nacionalidad, c.nombreCompleto, c.sexo, c.fechaNacimiento, c.parroquia]) + "\n";
      }
      resolve(out);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function buscarCedulaEnCliente(cedula: string): Promise<PadrónCiudadano | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PADRON_STORE, 'readonly');
    const store = transaction.objectStore(PADRON_STORE);
    
    const request = store.get(cedula.trim());

    request.onsuccess = () => {
      resolve(request.result || null);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// --- QUEUE METHODS FOR MEDICAL CONSULTATIONS (MORBILIDAD) ---
export async function saveLocalConsulta(consulta: Omit<LocalConsulta, 'status' | 'attempts' | 'createdAt'> & { createdAt?: string }): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONSULTAS_STORE, 'readwrite');
    const store = transaction.objectStore(CONSULTAS_STORE);
    
    const getRequest = store.get(consulta.id);
    
    getRequest.onsuccess = () => {
      const existing = getRequest.result as LocalConsulta | undefined;
      const fullRecord: LocalConsulta = {
        id: consulta.id,
        type: 'new',
        data: consulta.data,
        userId: consulta.userId ?? existing?.userId,
        // Igual que en saveLocal: re-guardar = datos nuevos → siempre 'pending'.
        status: 'pending',
        attempts: 0,
        nextAttemptAt: undefined,
        permanentError: undefined,
        // Preserva la fecha original: la del registro local si existe; si no, la que
        // venga (al EDITAR una consulta remota se pasa su createdAt); si no, ahora.
        createdAt: existing?.createdAt || consulta.createdAt || new Date().toISOString()
      };
      
      const putRequest = store.put(fullRecord);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function getPendingConsultas(): Promise<LocalConsulta[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONSULTAS_STORE, 'readonly');
    const store = transaction.objectStore(CONSULTAS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result as LocalConsulta[];
      const now = Date.now();
      resolve(all.filter(c => c.status === 'pending' && (!c.nextAttemptAt || c.nextAttemptAt <= now)));
    };

    request.onerror = () => reject(request.error);
  });
}

// ══ Cola offline de LOGS de actividad (imprimir / exportar) ══════════════════
// INDEPENDIENTE de la cola de registros. Mismo patrón: 'pending' → reintenta con
// backoff exponencial; al confirmar la DB se BORRA (ya vive en AuditLog); un
// error PERMANENTE (400/401/403) queda como 'error' con su razón y NO se reintenta.
export interface LocalActivityLog {
  id: string;
  payload:
    | {
        accion: 'PRINT' | 'EXPORT';
        recurso: string;
        formato?: string;
        refugio?: string;
        filtros?: string;
        total?: number;
      }
    | {
        accion: 'ERROR';        // error del cliente capturado en campo (no-PII)
        mensaje: string;
        stack?: string;
        ruta?: string;
        origen?: string;
      };
  status: 'pending' | 'error';
  attempts: number;
  nextAttemptAt?: number;
  permanentError?: string;
  createdAt: string;
}

export async function saveLog(payload: LocalActivityLog['payload']): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(LOGS_STORE, 'readwrite').objectStore(LOGS_STORE);
    const rec: LocalActivityLog = {
      id: crypto.randomUUID(),
      payload,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: undefined,
      permanentError: undefined,
      createdAt: new Date().toISOString(),
    };
    const put = store.put(rec);
    put.onsuccess = () => resolve();
    put.onerror = () => reject(put.error);
  });
}

export async function getPendingLogs(): Promise<LocalActivityLog[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(LOGS_STORE, 'readonly').objectStore(LOGS_STORE).getAll();
    request.onsuccess = () => {
      const now = Date.now();
      const all = request.result as LocalActivityLog[];
      resolve(all.filter(l => l.status === 'pending' && (!l.nextAttemptAt || l.nextAttemptAt <= now)));
    };
    request.onerror = () => reject(request.error);
  });
}

// Confirmado por la DB → se BORRA de la cola (el log ya está en AuditLog).
export async function markLogSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const del = db.transaction(LOGS_STORE, 'readwrite').objectStore(LOGS_STORE).delete(id);
    del.onsuccess = () => resolve();
    del.onerror = () => reject(del.error);
  });
}

// Error TEMPORAL (red / timeout / 5xx) → backoff exponencial (15s·2^n, tope 5min).
export async function incrementLogAttempt(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(LOGS_STORE, 'readwrite').objectStore(LOGS_STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const rec = get.result as LocalActivityLog | undefined;
      if (!rec) { resolve(); return; }
      rec.attempts += 1;
      rec.nextAttemptAt = Date.now() + Math.min(15000 * Math.pow(2, rec.attempts - 1), 300000);
      const put = store.put(rec);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

// Error PERMANENTE (400/401/403) → 'error' con razón; sale de los reintentos.
export async function markLogPermanentError(id: string, reason: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(LOGS_STORE, 'readwrite').objectStore(LOGS_STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const rec = get.result as LocalActivityLog | undefined;
      if (!rec) { resolve(); return; }
      rec.status = 'error';
      rec.permanentError = reason;
      rec.nextAttemptAt = undefined;
      const put = store.put(rec);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

// Reenvío INTELIGENTE de consultas: reencola SOLO las que la DB nunca confirmó
// (status !== 'synced'). Las ya confirmadas NO se reenvían.
export async function resetAllConsultasToPending(): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONSULTAS_STORE, 'readwrite');
    const store = transaction.objectStore(CONSULTAS_STORE);
    const request = store.getAll();
    let count = 0;
    request.onsuccess = () => {
      const all = request.result as LocalConsulta[];
      for (const c of all) {
        if (c.status !== 'synced') {   // NO tocar lo ya confirmado por la DB
          c.status = 'pending';
          c.attempts = 0;
          c.nextAttemptAt = undefined;
          c.permanentError = undefined;
          store.put(c);
          count++;
        }
      }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(count);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllLocalConsultas(): Promise<LocalConsulta[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONSULTAS_STORE, 'readonly');
      const store = transaction.objectStore(CONSULTAS_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as LocalConsulta[]);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error(e);
    return [];
  }
}

// Borra una consulta del store local (cola offline). Se usa al eliminar una
// consulta: la remota la borra el backend; ésta limpia la copia local.
export async function deleteLocalConsulta(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONSULTAS_STORE, 'readwrite');
    const store = transaction.objectStore(CONSULTAS_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function markConsultaSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONSULTAS_STORE, 'readwrite');
    const store = transaction.objectStore(CONSULTAS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as LocalConsulta | undefined;
      if (record) {
        record.status = 'synced';
        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function incrementConsultaAttempt(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONSULTAS_STORE, 'readwrite');
    const store = transaction.objectStore(CONSULTAS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as LocalConsulta | undefined;
      if (record) {
        record.attempts += 1;
        const delay = Math.min(15000 * Math.pow(2, record.attempts - 1), 300000);
        record.nextAttemptAt = Date.now() + delay;
        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function markConsultaPermanentError(id: string, reason: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONSULTAS_STORE, 'readwrite');
    const store = transaction.objectStore(CONSULTAS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as LocalConsulta | undefined;
      if (record) {
        record.status = 'error';
        record.permanentError = reason;
        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// ══ Cola offline de CARACTERIZACIÓN (ficha por familia) ══════════════════════
// 1 registro = la ficha de una familia (hogar + personas). Mismo patrón que las
// demás colas: re-guardar = 'pending'; backoff exponencial 15s·2ⁿ (tope 5min);
// error permanente 400/401/403. El `id` = jefeRegistroId (ancla → upsert idempotente).
export async function saveLocalCaracterizacion(
  ficha: Omit<LocalCaracterizacion, 'status' | 'attempts' | 'createdAt'> & { createdAt?: string }
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CARACTERIZACION_STORE, 'readwrite');
    const store = transaction.objectStore(CARACTERIZACION_STORE);
    const getRequest = store.get(ficha.id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result as LocalCaracterizacion | undefined;
      const fullRecord: LocalCaracterizacion = {
        id: ficha.id,
        type: 'new',
        data: ficha.data,
        refugio: ficha.refugio ?? existing?.refugio,
        userId: ficha.userId ?? existing?.userId,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: undefined,
        permanentError: undefined,
        createdAt: existing?.createdAt || ficha.createdAt || new Date().toISOString(),
      };
      const putRequest = store.put(fullRecord);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function getPendingCaracterizacion(): Promise<LocalCaracterizacion[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CARACTERIZACION_STORE, 'readonly');
    const store = transaction.objectStore(CARACTERIZACION_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result as LocalCaracterizacion[];
      const now = Date.now();
      resolve(all.filter(c => c.status === 'pending' && (!c.nextAttemptAt || c.nextAttemptAt <= now)));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAllLocalCaracterizacion(): Promise<LocalCaracterizacion[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CARACTERIZACION_STORE, 'readonly');
      const store = transaction.objectStore(CARACTERIZACION_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as LocalCaracterizacion[]);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function markCaracterizacionSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CARACTERIZACION_STORE, 'readwrite');
    const store = transaction.objectStore(CARACTERIZACION_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as LocalCaracterizacion | undefined;
      if (record) {
        record.status = 'synced';
        const u = store.put(record);
        u.onsuccess = () => resolve();
        u.onerror = () => reject(u.error);
      } else resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function incrementCaracterizacionAttempt(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CARACTERIZACION_STORE, 'readwrite');
    const store = transaction.objectStore(CARACTERIZACION_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as LocalCaracterizacion | undefined;
      if (record) {
        record.attempts += 1;
        record.nextAttemptAt = Date.now() + Math.min(15000 * Math.pow(2, record.attempts - 1), 300000);
        const u = store.put(record);
        u.onsuccess = () => resolve();
        u.onerror = () => reject(u.error);
      } else resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function markCaracterizacionPermanentError(id: string, reason: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CARACTERIZACION_STORE, 'readwrite');
    const store = transaction.objectStore(CARACTERIZACION_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as LocalCaracterizacion | undefined;
      if (record) {
        record.status = 'error';
        record.permanentError = reason;
        const u = store.put(record);
        u.onsuccess = () => resolve();
        u.onerror = () => reject(u.error);
      } else resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
