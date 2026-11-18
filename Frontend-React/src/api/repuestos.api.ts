import apiClient from './client';
import type {
  RepuestoDto,
  GuardarRepuestoDto,
  MovimientoRepuestoDto,
  RegistrarMovimientoRepuestoDto,
} from '@/types';

export const repuestosApi = {
  getRepuestos: async (categoria?: string, soloActivos = true): Promise<RepuestoDto[]> => {
    const params: Record<string, any> = { soloActivos };
    if (categoria) params.categoria = categoria;
    const res = await apiClient.get<RepuestoDto[]>('/repuestos', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getPorId: async (id: number): Promise<RepuestoDto> => {
    const res = await apiClient.get<RepuestoDto>(`/repuestos/${id}`);
    return res.data;
  },

  crear: async (dto: GuardarRepuestoDto): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/repuestos', dto);
    return res.data;
  },

  actualizar: async (id: number, dto: GuardarRepuestoDto): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/repuestos/${id}`, dto);
    return res.data;
  },

  eliminar: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/repuestos/${id}`);
    return res.data;
  },

  getMovimientos: async (repuestoId?: number, camionId?: number, top = 100): Promise<MovimientoRepuestoDto[]> => {
    const params: Record<string, any> = { top };
    if (repuestoId) params.repuestoId = repuestoId;
    if (camionId) params.camionId = camionId;
    const res = await apiClient.get<MovimientoRepuestoDto[]>('/repuestos/movimientos', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  registrarMovimiento: async (
    dto: RegistrarMovimientoRepuestoDto
  ): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/repuestos/movimientos', dto);
    return res.data;
  },
};

