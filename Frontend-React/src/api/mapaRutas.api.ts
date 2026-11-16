import apiClient from './client';

export interface RegistrarPuntoGpsDto {
  controlRutaId: number;
  fincaId?: number | null;
  latitud: number;
  longitud: number;
  precisionMetros?: number | null;
  evento: 'ENTRADA_APP' | 'REGISTRO_LITROS' | 'INICIO_VIAJE';
  fechaHoraDispositivo?: string;
}

export interface PuntoGpsViajeDto {
  id: number;
  controlRutaId: number;
  usuarioId: number;
  choferNombre: string;
  camionId?: number | null;
  camionPlaca?: string | null;
  fincaId?: number | null;
  fincaNombre?: string | null;
  latitud: number;
  longitud: number;
  precisionMetros?: number | null;
  evento: string;
  fechaHoraDispositivo: string;
}

export interface ViajeGpsResumenDto {
  controlRutaId: number;
  fecha: string;
  usuarioId: number;
  choferNombre: string;
  camionId?: number | null;
  camionPlaca?: string | null;
  rutaLogisticaId?: number | null;
  rutaNombre?: string | null;
  rutaColor?: string | null;
  procesoActualId: number;
  estado: string;
  totalLitrosFinca: number;
  cantidadPuntos: number;
  distanciaEstimadaKm: number;
  duracionMinutos: number;
  puntos: PuntoGpsViajeDto[];
}

export interface FincaMapaDto {
  id: number;
  codigo?: string | null;
  nombre: string;
  propietario: string;
  rutaId?: number | null;
  rutaNombre?: string | null;
  rutaColor?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  promedioLitrosDiarios: number;
  activo: boolean;
}

export interface CruceRutasDto {
  rutaAId: number;
  rutaANombre: string;
  rutaAColor?: string | null;
  rutaBId: number;
  rutaBNombre: string;
  rutaBColor?: string | null;
  latitud: number;
  longitud: number;
  descripcion: string;
  distanciaEntrePuntosMetros: number;
}

export interface AnalisisRutasMapaDto {
  fincas: FincaMapaDto[];
  viajes: ViajeGpsResumenDto[];
  cruces: CruceRutasDto[];
}

export const mapaRutasApi = {
  registrarPuntoGps: async (dto: RegistrarPuntoGpsDto): Promise<{ guardado: boolean }> => {
    const res = await apiClient.post<{ guardado: boolean }>('/mapa-rutas/gps/punto', dto);
    return res.data;
  },

  actualizarCoordenadasFinca: async (
    fincaId: number,
    dto: { latitud: number; longitud: number }
  ): Promise<{ message: string }> => {
    const res = await apiClient.put<{ message: string }>(`/mapa-rutas/fincas/${fincaId}/coordenadas`, dto);
    return res.data;
  },

  obtenerAnalisis: async (params?: {
    fechaDesde?: string;
    fechaHasta?: string;
    rutaId?: number;
    camionId?: number;
    choferId?: number;
  }): Promise<AnalisisRutasMapaDto> => {
    const res = await apiClient.get<AnalisisRutasMapaDto>('/mapa-rutas/analisis', { params });
    return res.data;
  },
};
