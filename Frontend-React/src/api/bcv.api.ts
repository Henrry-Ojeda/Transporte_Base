import apiClient from './client';
import type { BcvRateResponse } from '@/types';

export interface BcvHistoricoDto {
  id?: number;
  fecha: string;
  tasaDolarBs?: number;
  tasa?: number;
  fuente?: string;
  observacion?: string;
  createdAt?: string;
  createdBy?: number;
}

export const bcvApi = {
  getTasaHoy: async (): Promise<BcvRateResponse> => {
    const res = await apiClient.get<any>('/bcv/hoy');
    const raw = res.data || {};
    const tasaNormalizada = Number(
      raw.tasaDolarBs ??
      raw.TasaDolarBs ??
      raw.data?.tasaDolarBs ??
      raw.data?.TasaDolarBs ??
      raw.tasa ??
      raw.Tasa ??
      0
    );
    return {
      ...raw,
      tasa: tasaNormalizada,
      tasaDolarBs: tasaNormalizada,
    };
  },

  getHistorial: async (dias = 1000): Promise<BcvHistoricoDto[]> => {
    const res = await apiClient.get<BcvHistoricoDto[]>('/bcv/historial', { params: { dias } });
    return Array.isArray(res.data) ? res.data : [];
  },

  registrarTasa: async (dto: { fecha: string; tasa?: number; tasaDolarBs?: number; fuente?: string; observacion?: string }): Promise<{ success: boolean; message: string }> => {
    const payload = {
      fecha: dto.fecha,
      tasaDolarBs: dto.tasaDolarBs ?? dto.tasa ?? 0,
      tasa: dto.tasa ?? dto.tasaDolarBs ?? 0,
      fuente: dto.fuente || 'BANCO CENTRAL DE VENEZUELA (BCV)',
      observacion: dto.observacion || 'Registro oficial',
    };
    const res = await apiClient.post('/bcv/registrar', payload);
    return res.data;
  },

  editarTasa: async (id: number, dto: { fecha?: string; tasaDolarBs?: number; tasa?: number; fuente?: string; observacion?: string }): Promise<{ success: boolean; message: string }> => {
    const payload = {
      fecha: dto.fecha,
      tasaDolarBs: dto.tasaDolarBs ?? dto.tasa,
      fuente: dto.fuente,
      observacion: dto.observacion,
    };
    const res = await apiClient.put(`/bcv/${id}`, payload);
    return res.data;
  },

  eliminarTasa: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/bcv/${id}`);
    return res.data;
  },

  sincronizarTasaBcvLive: async (): Promise<{ tasa: number; fecha: string; fuente: string }> => {
    let valorTasa = 0;
    let fuenteNombre = 'DolarAPI (BCV)';
    let fechaHoy = new Date().toISOString().split('T')[0];

    try {
      const resp = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        valorTasa = Number(data.promedio || data.valor || 0);
        if (data.fechaActualizacion) {
          fechaHoy = String(data.fechaActualizacion).split('T')[0];
        }
      }
    } catch {
      // Fallback
      try {
        const fallback = await fetch('https://ve.dolarapi.com/v1/dolares', { cache: 'no-store' });
        if (fallback.ok) {
          const arr = await fallback.json();
          if (Array.isArray(arr)) {
            const item = arr.find((d: any) => d.fuente === 'oficial' || d.nombre?.toLowerCase().includes('oficial')) || arr[0];
            valorTasa = Number(item?.promedio || item?.valor || 0);
          }
        }
      } catch {
        // Fallback 2: PyDolar
        try {
          const py = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv', { cache: 'no-store' });
          if (py.ok) {
            const dPy = await py.json();
            valorTasa = Number(dPy?.monitors?.usd?.price || 0);
            fuenteNombre = 'PyDolar (BCV)';
          }
        } catch { }
      }
    }

    if (valorTasa <= 0) {
      throw new Error('No se pudo obtener la tasa oficial en vivo desde las fuentes externas.');
    }

    // Registrar en BD
    await apiClient.post('/bcv/registrar', {
      fecha: fechaHoy,
      tasaDolarBs: valorTasa,
      tasa: valorTasa,
      fuente: fuenteNombre,
      observacion: `Sincronización en vivo (${new Date().toLocaleTimeString('es-VE')})`,
    });

    return { tasa: valorTasa, fecha: fechaHoy, fuente: fuenteNombre };
  },
};
