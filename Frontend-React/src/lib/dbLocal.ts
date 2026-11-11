/**
 * Base de Datos Local Ultra-Resiliente (IndexedDB)
 * 
 * Permite almacenamiento local offline de alta capacidad (hasta Gigabytes),
 * transaccional (ACID), con soporte multi-tenant por empresa y acceso irrestricto
 * para el rol SUPERADMIN.
 */

export interface RecoleccionLocal {
  idLocal?: number;
  empresaCodigo: string;
  ticketId: number;
  fincaId: number;
  fincaNombre: string;
  productorNombre?: string;
  litros: number;
  tipoLeche: 'VACA' | 'BUFALA';
  esDiferida: boolean;
  esAcida: boolean;
  temperatura?: number | null;
  foto?: string | null;
  observaciones?: string;
  fechaRegistro: string;
  odometroKm?: number | null;
  estadoSync: 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR';
  fechaSync?: string | null;
  errorSync?: string | null;
}

export interface FincaCacheLocal {
  idKey: string; // `${empresaCodigo}_${fincaId}`
  empresaCodigo: string;
  fincaId: number;
  nombre: string;
  productor: string;
  codigo?: string;
  ubicacion?: string;
  orden?: number;
  tipoLecheDefault?: string;
  activa: boolean;
  updatedAt: string;
}

export interface ViajeCacheLocal {
  idKey: string; // `${empresaCodigo}_${ticketId}`
  empresaCodigo: string;
  ticketId: number;
  numeroTicket?: string;
  conductorId: number;
  conductorNombre: string;
  camionId: number;
  camionPlaca: string;
  rutaNombre?: string;
  estado: string;
  totalLitros: number;
  fecha: string;
  paradas: any[];
  updatedAt: string;
}

export interface CombustibleLocal {
  idLocal?: number;
  empresaCodigo: string;
  choferId: number;
  camionId: number;
  tipoCombustible: 'GASOIL' | 'GASOLINA';
  litros: number;
  odometroKm: number;
  estacion?: string;
  comprobanteFoto?: string | null;
  fecha: string;
  estadoSync: 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR';
  fechaSync?: string | null;
}

export interface AveriaLocal {
  idLocal?: number;
  empresaCodigo: string;
  camionId: number;
  conductorId: number;
  titulo: string;
  descripcion: string;
  urgencia: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  odometroKm?: number | null;
  foto?: string | null;
  fecha: string;
  estadoSync: 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR';
  fechaSync?: string | null;
}

export interface ReceptoriaDescargaLocal {
  idLocal?: number;
  empresaCodigo: string;
  ticketId?: number | null;
  camionId?: number | null;
  siloId: number;
  litrosDescargados: number;
  temperatura?: number | null;
  acidezDornic?: number | null;
  esAcida?: boolean;
  operadorId?: number;
  fecha: string;
  estadoSync: 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR';
  fechaSync?: string | null;
}

export interface NotificacionLocal {
  idKey: string; // `${empresaCodigo}_${notifId}`
  empresaCodigo: string;
  usuarioId: number;
  notificacionId: number | string;
  titulo: string;
  mensaje: string;
  tipo: string;
  leida: boolean;
  fecha: string;
}

const DB_NAME = 'TransporteLocalDB_v3';
const DB_VERSION = 2;

class LocalDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB no está disponible en este entorno'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Recolecciones de campo (Litros de fincas)
        if (!db.objectStoreNames.contains('recolecciones')) {
          const store = db.createObjectStore('recolecciones', { keyPath: 'idLocal', autoIncrement: true });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
          store.createIndex('ticketId', 'ticketId', { unique: false });
          store.createIndex('fincaId', 'fincaId', { unique: false });
          store.createIndex('estadoSync', 'estadoSync', { unique: false });
          store.createIndex('empresa_ticket', ['empresaCodigo', 'ticketId'], { unique: false });
        }

        // 2. Caché de Fincas
        if (!db.objectStoreNames.contains('fincas_cache')) {
          const store = db.createObjectStore('fincas_cache', { keyPath: 'idKey' });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
        }

        // 3. Caché de Viajes y Circuitos
        if (!db.objectStoreNames.contains('viajes_cache')) {
          const store = db.createObjectStore('viajes_cache', { keyPath: 'idKey' });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
        }

        // 4. Combustible
        if (!db.objectStoreNames.contains('combustible')) {
          const store = db.createObjectStore('combustible', { keyPath: 'idLocal', autoIncrement: true });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
          store.createIndex('estadoSync', 'estadoSync', { unique: false });
        }

        // 5. Averías de Taller / Incidentes
        if (!db.objectStoreNames.contains('averias')) {
          const store = db.createObjectStore('averias', { keyPath: 'idLocal', autoIncrement: true });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
          store.createIndex('estadoSync', 'estadoSync', { unique: false });
        }

        // 6. Receptoría y Silos
        if (!db.objectStoreNames.contains('receptoria_descargas')) {
          const store = db.createObjectStore('receptoria_descargas', { keyPath: 'idLocal', autoIncrement: true });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
          store.createIndex('estadoSync', 'estadoSync', { unique: false });
        }

        // 7. Notificaciones
        if (!db.objectStoreNames.contains('notificaciones')) {
          const store = db.createObjectStore('notificaciones', { keyPath: 'idKey' });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
          store.createIndex('usuarioId', 'usuarioId', { unique: false });
          store.createIndex('leida', 'leida', { unique: false });
        }

        // 8. Caché de Rutas Logísticas
        if (!db.objectStoreNames.contains('rutas_cache')) {
          const store = db.createObjectStore('rutas_cache', { keyPath: 'idKey' });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
        }

        // 9. Caché de Planificaciones de Rutas por Chofer
        if (!db.objectStoreNames.contains('planificaciones_cache')) {
          const store = db.createObjectStore('planificaciones_cache', { keyPath: 'idKey' });
          store.createIndex('empresaCodigo', 'empresaCodigo', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  // =========================================================================
  // 1. RECOLECCIONES (LITROS DE FINCA)
  // =========================================================================

  async guardarRecoleccion(item: RecoleccionLocal): Promise<number> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recolecciones', 'readwrite');
      const store = tx.objectStore('recolecciones');
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  }

  async getRecoleccion(idLocal: number): Promise<RecoleccionLocal | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recolecciones', 'readonly');
      const store = tx.objectStore('recolecciones');
      const req = store.get(idLocal);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getRecoleccionesPorTicket(empresaCodigo: string, ticketId: number): Promise<RecoleccionLocal[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recolecciones', 'readonly');
      const store = tx.objectStore('recolecciones');
      const index = store.index('empresa_ticket');
      const req = index.getAll(IDBKeyRange.only([empresaCodigo, ticketId]));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getRecoleccionesPendientes(empresaCodigo?: string): Promise<RecoleccionLocal[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recolecciones', 'readonly');
      const store = tx.objectStore('recolecciones');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = ((req.result || []) as RecoleccionLocal[]).filter(
          (r) => r.estadoSync !== 'SINCRONIZADO' && Number(r.litros) > 0
        );
        if (empresaCodigo) {
          results = results.filter((r) => !r.empresaCodigo || r.empresaCodigo === empresaCodigo);
        }
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async marcarRecoleccionSincronizada(idLocal: number, fechaSync = new Date().toISOString()): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recolecciones', 'readwrite');
      const store = tx.objectStore('recolecciones');
      const getReq = store.get(idLocal);
      getReq.onsuccess = () => {
        const item: RecoleccionLocal = getReq.result;
        if (item) {
          item.estadoSync = 'SINCRONIZADO';
          item.fechaSync = fechaSync;
          item.errorSync = null;
          store.put(item);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async marcarRecoleccionError(idLocal: number, errorMsg: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recolecciones', 'readwrite');
      const store = tx.objectStore('recolecciones');
      const getReq = store.get(idLocal);
      getReq.onsuccess = () => {
        const item: RecoleccionLocal = getReq.result;
        if (item) {
          // Mantener PENDIENTE para que se reintente automáticamente cuando estabilice el WiFi
          item.estadoSync = 'PENDIENTE';
          item.errorSync = errorMsg;
          store.put(item);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // =========================================================================
  // 2. CACHÉ DE VIAJES Y PARADAS DEL DÍA
  // =========================================================================

  async guardarViajeCache(viaje: ViajeCacheLocal): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('viajes_cache', 'readwrite');
      const store = tx.objectStore('viajes_cache');
      const req = store.put(viaje);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getViajeCache(empresaCodigo: string, ticketId: number): Promise<ViajeCacheLocal | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('viajes_cache', 'readonly');
      const store = tx.objectStore('viajes_cache');
      const key = `${empresaCodigo}_${ticketId}`;
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getUltimoViajeActivoCache(empresaCodigo: string): Promise<ViajeCacheLocal | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('viajes_cache', 'readonly');
      const store = tx.objectStore('viajes_cache');
      const index = store.index('empresaCodigo');
      const req = index.getAll(IDBKeyRange.only(empresaCodigo));
      req.onsuccess = () => {
        const list = (req.result || []) as ViajeCacheLocal[];
        if (list.length === 0) return resolve(null);
        // Ordenar por fecha descendente
        list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(list[0]);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async guardarViajesChoferCache(empresaCodigo: string, choferId: number, viajes: any[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('viajes_cache', 'readwrite');
      const store = tx.objectStore('viajes_cache');
      const now = new Date().toISOString();
      for (const v of viajes) {
        if (!v || !v.id) continue;
        const item: ViajeCacheLocal = {
          idKey: `${empresaCodigo || 'EMP'}_${v.id}`,
          empresaCodigo: empresaCodigo || 'EMP',
          ticketId: Number(v.id),
          numeroTicket: String(v.codigoTicket || v.id),
          conductorId: Number(v.usuarioId || choferId || 0),
          conductorNombre: v.conductorNombre || '',
          camionId: Number(v.camionId || 0),
          camionPlaca: v.camionPlaca || '',
          rutaNombre: v.rutaLogisticaNombre || '',
          estado: v.estado || 'EN RUTA',
          totalLitros: Number(v.totalLitrosFinca || v.totalLitrosRecogidos || 0),
          fecha: v.fecha || now,
          paradas: v.paradas || [],
          updatedAt: now,
        };
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getViajesChoferCache(empresaCodigo: string, choferId: number): Promise<any[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('viajes_cache', 'readonly');
      const store = tx.objectStore('viajes_cache');
      const index = store.index('empresaCodigo');
      const req = index.getAll(IDBKeyRange.only(empresaCodigo || 'EMP'));
      req.onsuccess = () => {
        let list = (req.result || []) as ViajeCacheLocal[];
        if (choferId > 0) {
          list = list.filter((v) => Number(v.conductorId) === Number(choferId));
        }
        list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // 2.1 CACHÉ DE FINCAS (CATÁLOGO OFFLINE DE FINCAS)
  // =========================================================================

  async guardarFincasCache(empresaCodigo: string, fincas: any[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('fincas_cache', 'readwrite');
      const store = tx.objectStore('fincas_cache');
      const now = new Date().toISOString();
      for (const f of fincas) {
        if (!f || !f.id) continue;
        const item: FincaCacheLocal = {
          idKey: `${empresaCodigo || 'EMP'}_${f.id}`,
          empresaCodigo: empresaCodigo || 'EMP',
          fincaId: Number(f.id),
          nombre: f.nombre || '',
          productor: f.propietarioNombre || f.propietario || '',
          codigo: f.codigo || '',
          ubicacion: f.ubicacion || '',
          orden: f.orden || 0,
          tipoLecheDefault: f.tipoLeche || 'VACA',
          activa: f.activa !== false,
          updatedAt: now,
        };
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getFincasCache(empresaCodigo?: string): Promise<any[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('fincas_cache', 'readonly');
      const store = tx.objectStore('fincas_cache');
      const req = empresaCodigo
        ? store.index('empresaCodigo').getAll(IDBKeyRange.only(empresaCodigo))
        : store.getAll();
      req.onsuccess = () => {
        const raw = (req.result || []) as FincaCacheLocal[];
        const mapped = raw.map((item) => ({
          id: item.fincaId,
          nombre: item.nombre,
          propietario: item.productor,
          propietarioNombre: item.productor,
          codigo: item.codigo,
          ubicacion: item.ubicacion,
          orden: item.orden,
          tipoLeche: item.tipoLecheDefault || 'VACA',
          activa: item.activa,
        }));
        resolve(mapped);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // 2.2 CACHÉ DE RUTAS LOGÍSTICAS
  // =========================================================================

  async guardarRutasCache(empresaCodigo: string, rutas: any[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('rutas_cache', 'readwrite');
      const store = tx.objectStore('rutas_cache');
      for (const r of rutas) {
        if (!r || !r.id) continue;
        store.put({
          idKey: `${empresaCodigo || 'EMP'}_${r.id}`,
          empresaCodigo: empresaCodigo || 'EMP',
          ...r,
          updatedAt: new Date().toISOString(),
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getRutasCache(empresaCodigo?: string): Promise<any[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('rutas_cache', 'readonly');
      const store = tx.objectStore('rutas_cache');
      const req = empresaCodigo
        ? store.index('empresaCodigo').getAll(IDBKeyRange.only(empresaCodigo))
        : store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // 2.3 CACHÉ DE PLANIFICACIONES DE RUTAS
  // =========================================================================

  async guardarPlanificacionesCache(empresaCodigo: string, planificaciones: any[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('planificaciones_cache', 'readwrite');
      const store = tx.objectStore('planificaciones_cache');
      for (const p of planificaciones) {
        if (!p || (!p.id && !p.controlRutaId)) continue;
        const key = `${empresaCodigo || 'EMP'}_${p.id || p.controlRutaId}_${p.conductorId || 0}`;
        store.put({
          idKey: key,
          empresaCodigo: empresaCodigo || 'EMP',
          ...p,
          updatedAt: new Date().toISOString(),
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPlanificacionesCache(empresaCodigo?: string): Promise<any[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('planificaciones_cache', 'readonly');
      const store = tx.objectStore('planificaciones_cache');
      const req = empresaCodigo
        ? store.index('empresaCodigo').getAll(IDBKeyRange.only(empresaCodigo))
        : store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // 3. COMBUSTIBLE
  // =========================================================================

  async guardarCombustible(item: CombustibleLocal): Promise<number> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('combustible', 'readwrite');
      const store = tx.objectStore('combustible');
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  }

  async getCombustiblesPendientes(empresaCodigo?: string): Promise<CombustibleLocal[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('combustible', 'readonly');
      const store = tx.objectStore('combustible');
      const index = store.index('estadoSync');
      const req = index.getAll(IDBKeyRange.only('PENDIENTE'));
      req.onsuccess = () => {
        let results = (req.result || []) as CombustibleLocal[];
        if (empresaCodigo) results = results.filter((c) => c.empresaCodigo === empresaCodigo);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async marcarCombustibleSincronizado(idLocal: number): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('combustible', 'readwrite');
      const store = tx.objectStore('combustible');
      const getReq = store.get(idLocal);
      getReq.onsuccess = () => {
        const item: CombustibleLocal = getReq.result;
        if (item) {
          item.estadoSync = 'SINCRONIZADO';
          item.fechaSync = new Date().toISOString();
          store.put(item);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // =========================================================================
  // 4. AVERÍAS / TALLER
  // =========================================================================

  async guardarAveria(item: AveriaLocal): Promise<number> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('averias', 'readwrite');
      const store = tx.objectStore('averias');
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  }

  async getAveriasPendientes(empresaCodigo?: string): Promise<AveriaLocal[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('averias', 'readonly');
      const store = tx.objectStore('averias');
      const index = store.index('estadoSync');
      const req = index.getAll(IDBKeyRange.only('PENDIENTE'));
      req.onsuccess = () => {
        let results = (req.result || []) as AveriaLocal[];
        if (empresaCodigo) results = results.filter((a) => a.empresaCodigo === empresaCodigo);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async marcarAveriaSincronizada(idLocal: number): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('averias', 'readwrite');
      const store = tx.objectStore('averias');
      const getReq = store.get(idLocal);
      getReq.onsuccess = () => {
        const item: AveriaLocal = getReq.result;
        if (item) {
          item.estadoSync = 'SINCRONIZADO';
          item.fechaSync = new Date().toISOString();
          store.put(item);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // =========================================================================
  // 5. RECEPTORÍA / SILOS
  // =========================================================================

  async guardarDescargaReceptoria(item: ReceptoriaDescargaLocal): Promise<number> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('receptoria_descargas', 'readwrite');
      const store = tx.objectStore('receptoria_descargas');
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  }

  async getDescargasReceptoriaPendientes(empresaCodigo?: string): Promise<ReceptoriaDescargaLocal[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('receptoria_descargas', 'readonly');
      const store = tx.objectStore('receptoria_descargas');
      const index = store.index('estadoSync');
      const req = index.getAll(IDBKeyRange.only('PENDIENTE'));
      req.onsuccess = () => {
        let results = (req.result || []) as ReceptoriaDescargaLocal[];
        if (empresaCodigo) results = results.filter((d) => d.empresaCodigo === empresaCodigo);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async marcarDescargaReceptoriaSincronizada(idLocal: number): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('receptoria_descargas', 'readwrite');
      const store = tx.objectStore('receptoria_descargas');
      const getReq = store.get(idLocal);
      getReq.onsuccess = () => {
        const item: ReceptoriaDescargaLocal = getReq.result;
        if (item) {
          item.estadoSync = 'SINCRONIZADO';
          item.fechaSync = new Date().toISOString();
          store.put(item);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // =========================================================================
  // 6. NOTIFICACIONES
  // =========================================================================

  async guardarNotificaciones(notifs: NotificacionLocal[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notificaciones', 'readwrite');
      const store = tx.objectStore('notificaciones');
      for (const n of notifs) {
        store.put(n);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getNotificaciones(empresaCodigo: string, usuarioId?: number): Promise<NotificacionLocal[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notificaciones', 'readonly');
      const store = tx.objectStore('notificaciones');
      const index = store.index('empresaCodigo');
      const req = index.getAll(IDBKeyRange.only(empresaCodigo));
      req.onsuccess = () => {
        let list = (req.result || []) as NotificacionLocal[];
        if (usuarioId && usuarioId > 0) {
          list = list.filter((n) => n.usuarioId === usuarioId || n.usuarioId === 0);
        }
        list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async marcarNotificacionLeida(idKey: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notificaciones', 'readwrite');
      const store = tx.objectStore('notificaciones');
      const getReq = store.get(idKey);
      getReq.onsuccess = () => {
        const item: NotificacionLocal = getReq.result;
        if (item) {
          item.leida = true;
          store.put(item);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // Conteo total de items pendientes de sincronización
  async getConteoTotalPendientes(empresaCodigo?: string): Promise<{
    recolecciones: number;
    combustible: number;
    averias: number;
    receptoria: number;
    total: number;
  }> {
    const [recolecciones, combustible, averias, receptoria] = await Promise.all([
      this.getRecoleccionesPendientes(empresaCodigo),
      this.getCombustiblesPendientes(empresaCodigo),
      this.getAveriasPendientes(empresaCodigo),
      this.getDescargasReceptoriaPendientes(empresaCodigo),
    ]);

    const total = recolecciones.length + combustible.length + averias.length + receptoria.length;
    return {
      recolecciones: recolecciones.length,
      combustible: combustible.length,
      averias: averias.length,
      receptoria: receptoria.length,
      total,
    };
  }
}

export const dbLocal = new LocalDatabase();

