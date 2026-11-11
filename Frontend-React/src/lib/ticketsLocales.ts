/**
 * Tickets (turnos / viajes) creados SIN conexión desde la app móvil del chofer.
 *
 * Cuando no hay internet, el chofer puede igualmente "Iniciar Nuevo Turno": se crea un ticket local
 * con ID negativo (temporal) que se guarda en el teléfono. Al recuperar señal, el SyncEngine crea el
 * ticket real en la central y registra la equivalencia ID local -> ID servidor, para que las cargas de
 * fincas registradas contra el ticket local se envíen al ticket correcto.
 */

const KEY_PENDIENTES = 'movil_tickets_locales_pendientes';
const KEY_MAPA = 'movil_tickets_locales_map';

export interface TicketLocalPendiente {
  /** ID temporal negativo del ticket local */
  localId: number;
  creadoEn: string;
  /** Payload exacto que se enviará a /control-rutas/iniciar-viaje */
  payload: {
    fecha?: string;
    choferId?: number;
    conductorId?: number;
    camionId?: number;
    rutaLogisticaId?: number;
    observaciones?: string;
  };
  /** Representación (ControlRutaDto) para mostrar el ticket en la app mientras no se sincroniza */
  ticket: any;
  /** Último error al intentar subirlo (para mostrarlo al chofer) */
  ultimoError?: string;
  intentos?: number;
  ultimoIntento?: string;
}

const leer = <T>(key: string, def: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : def;
  } catch {
    return def;
  }
};

const escribir = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota llena: tolerante */
  }
};

export const ticketsLocales = {
  esLocal: (id?: number | null): boolean => typeof id === 'number' && id < 0,

  listarPendientes: (): TicketLocalPendiente[] => leer<TicketLocalPendiente[]>(KEY_PENDIENTES, []),

  mapa: (): Record<string, number> => leer<Record<string, number>>(KEY_MAPA, {}),

  /** Devuelve el ID real del servidor si el ticket local ya fue sincronizado; si no, el mismo ID. */
  resolverId: (id?: number | null): number => {
    if (!id) return 0;
    if (id > 0) return id;
    const real = ticketsLocales.mapa()[String(id)];
    return real || id;
  },

  agregar: (t: TicketLocalPendiente) => {
    const lista = ticketsLocales.listarPendientes();
    lista.push(t);
    escribir(KEY_PENDIENTES, lista);
  },

  marcarSincronizado: (localId: number, serverId: number) => {
    const lista = ticketsLocales.listarPendientes().filter((t) => t.localId !== localId);
    escribir(KEY_PENDIENTES, lista);
    const mapa = ticketsLocales.mapa();
    mapa[String(localId)] = serverId;
    escribir(KEY_MAPA, mapa);
  },

  nuevoIdLocal: (): number => -Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 1000),

  /** Identificador único del turno: la central lo usa para NO duplicar el ticket si el envío se repite. */
  nuevoUuid: (): string => {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    } catch {
      /* usa respaldo */
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  },

  /** Candado entre pestañas/ventanas para que solo una envíe los tickets locales a la vez. */
  tomarCandadoEnvio: (): boolean => {
    try {
      const k = 'movil_tickets_locales_lock';
      const t = Number(localStorage.getItem(k) || 0);
      if (Date.now() - t < 45000) return false;
      localStorage.setItem(k, String(Date.now()));
      return true;
    } catch {
      return true;
    }
  },
  soltarCandadoEnvio: () => {
    try {
      localStorage.removeItem('movil_tickets_locales_lock');
    } catch {
      /* tolerante */
    }
  },

  /** Guarda el último motivo por el que el ticket local aún no pudo subirse a la central. */
  registrarError: (localId: number, mensaje: string) => {
    const lista = ticketsLocales.listarPendientes().map((t) =>
      t.localId === localId
        ? { ...t, ultimoError: mensaje, intentos: (t.intentos || 0) + 1, ultimoIntento: new Date().toISOString() }
        : t
    );
    escribir(KEY_PENDIENTES, lista);
  },
};
