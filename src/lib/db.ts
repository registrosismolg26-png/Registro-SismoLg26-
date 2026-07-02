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
    patologiaDescripcion?: string;
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
const DB_VERSION = 3; // Version 3 for full CNE padrón model mapping
const STORE_NAME = 'registros';
const PADRON_STORE = 'padron';

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
      if (db.objectStoreNames.contains(PADRON_STORE)) {
        db.deleteObjectStore(PADRON_STORE);
      }
      db.createObjectStore(PADRON_STORE, { keyPath: 'cedula' });
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
        // Al re-guardar (edición), volver a 'pending' si estaba en error y limpiar backoff.
        status: existing?.status === 'synced' ? 'synced' : 'pending',
        attempts: existing?.attempts || 0,
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

export async function isPadronCargado(): Promise<boolean> {
  const count = await getLocalPadronCount();
  return count > 0;
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
