import apiClient from './client';
import type {
  InventarioCombustibleDto,
  CombustibleHistorialDto,
  RegistrarDespachoCombustibleDto,
  RegistrarCompraCombustibleDto,
  AjustarStockCombustibleDto,
  CamionSimpleDto,
} from '@/types';

export const combustibleApi = {
  getInventario: async (): Promise<InventarioCombustibleDto[]> => {
    const res = await apiClient.get<InventarioCombustibleDto[]>('/combustible/inventario');
    return Array.isArray(res.data) ? res.data : [];
  },

  getHistorial: async (
    tipoCombustible?: string,
    camionId?: number,
    top = 100,
    tipoMovimiento?: string
  ): Promise<CombustibleHistorialDto[]> => {
    const params: Record<string, any> = { top };
    if (tipoCombustible) params.tipoCombustible = tipoCombustible;
    if (tipoMovimiento) params.tipoMovimiento = tipoMovimiento;
    if (camionId) params.camionId = camionId;
    const res = await apiClient.get<CombustibleHistorialDto[]>('/combustible/historial', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  eliminarMovimiento: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/combustible/historial/${id}`);
    return res.data;
  },

  registrarDespacho: async (dto: RegistrarDespachoCombustibleDto): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/combustible/despacho', dto);
    return res.data;
  },

  registrarCompra: async (dto: RegistrarCompraCombustibleDto): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/combustible/compra', dto);
    return res.data;
  },

  ajustarStock: async (dto: AjustarStockCombustibleDto): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/combustible/ajuste', dto);
    return res.data;
  },

  getCamiones: async (): Promise<CamionSimpleDto[]> => {
    const res = await apiClient.get<CamionSimpleDto[]>('/camiones?soloActivos=true');
    return Array.isArray(res.data) ? res.data : [];
  },
};

