export type MovilLogTipo =
  | 'REGISTRO_CREADO'
  | 'REGISTRO_EDITADO'
  | 'REGISTRO_ELIMINADO'
  | 'SYNC_OK'
  | 'SYNC_ERROR'
  | 'TICKET_EVENTO'
  | 'INFO';

export interface MovilAuditLogEntry {
  id: string;
  fechaHora: string;
  tipo: MovilLogTipo;
  ticketId?: number | string;
  fincaId?: number;
  fincaNombre?: string;
  litros?: number;
  detalle: string;
}

const STORAGE_KEY = 'movil_audit_logs_v1';
const MAX_LOGS = 400;

export const movilAuditLog = {
  listar: (): MovilAuditLogEntry[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  registrar: (entry: Omit<MovilAuditLogEntry, 'id' | 'fechaHora'>): void => {
    if (typeof window === 'undefined') return;
    try {
      const now = new Date();
      const fechaHora = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const nuevo: MovilAuditLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fechaHora,
        ...entry,
      };
      const actuales = movilAuditLog.listar();
      const actualizados = [nuevo, ...actuales].slice(0, MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actualizados));
    } catch {
      // Tolerante si localStorage está lleno
    }
  },

  limpiar: (): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  },
};
