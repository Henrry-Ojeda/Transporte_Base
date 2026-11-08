import { apiClient } from './client';

export interface NotificacionMovil {
  id: number;
  usuarioId: number;
  tipo: 'RUTA_ASIGNADA' | 'SALIDA_COMPANIA' | 'AVISO_GENERAL' | string;
  titulo: string;
  mensaje: string;
  fechaOperativa?: string;
  referenciaId?: number;
  leido: boolean;
  createdAt: string;
}

export const notificacionesApi = {
  getMisNotificaciones: async (limite = 30): Promise<NotificacionMovil[]> => {
    const res = await apiClient.get<NotificacionMovil[]>('/notificaciones/mis-notificaciones', {
      params: { limite },
    });
    return Array.isArray(res.data) ? res.data : [];
  },

  marcarLeida: async (id: number): Promise<{ success: boolean }> => {
    const res = await apiClient.put(`/notificaciones/${id}/leer`);
    return res.data;
  },

  marcarTodasLeidas: async (): Promise<{ success: boolean }> => {
    const res = await apiClient.put('/notificaciones/marcar-todas-leidas');
    return res.data;
  },

  enviarNotificacion: async (dto: {
    usuarioId: number;
    tipo?: string;
    titulo: string;
    mensaje: string;
    fechaOperativa?: string;
    referenciaId?: number;
  }): Promise<{ success: boolean; id?: number }> => {
    const res = await apiClient.post('/notificaciones/enviar', dto);
    return res.data;
  },
};

