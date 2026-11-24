import apiClient from './client';

export interface ParametroCalidadLecheDto {
  id: number;
  nombre: string;
  tipoLeche: string;
  esPrincipal: boolean;
  activo: boolean;
  grasaMin?: number | null;
  grasaMax?: number | null;
  sngMin?: number | null;
  sngMax?: number | null;
  densidadMin?: number | null;
  densidadMax?: number | null;
  lactosaMin?: number | null;
  lactosaMax?: number | null;
  salesMin?: number | null;
  salesMax?: number | null;
  proteinaMin?: number | null;
  proteinaMax?: number | null;
  solidosTotalesMin?: number | null;
  solidosTotalesMax?: number | null;
  aguaAdicionadaMin?: number | null;
  aguaAdicionadaMax?: number | null;
  temperaturaMin?: number | null;
  temperaturaMax?: number | null;
  puntoCongelacionMin?: number | null;
  puntoCongelacionMax?: number | null;
  phMin?: number | null;
  phMax?: number | null;
  conductividadMin?: number | null;
  conductividadMax?: number | null;
  observacion?: string | null;
  createdAt?: string;
  modifiedAt?: string | null;
}

export type GuardarParametroCalidadLecheDto = Omit<ParametroCalidadLecheDto, 'id' | 'createdAt' | 'modifiedAt'>;

export interface ExamenLecheDto {
  id: number;
  fecha: string;
  horaPrueba?: string | null;
  nivelPrueba: 'TICKET' | 'FINCA' | string;
  controlRutaId?: number | null;
  controlCompaniaId?: number | null;
  rutaRecoleccionId?: number | null;
  fincaId?: number | null;
  fincaNombre?: string | null;
  camionId?: number | null;
  camionPlaca?: string | null;
  choferId?: number | null;
  nombreChofer?: string | null;
  parametroCalidadId?: number | null;
  parametroCalidadNombre?: string | null;
  litrosAsociados?: number | null;
  tipoLeche: string;
  equipo?: string | null;
  numeroSerial?: string | null;
  calibracion?: string | null;
  grasaPct?: number | null;
  sngPct?: number | null;
  densidad?: number | null;
  lactosaPct?: number | null;
  salesPct?: number | null;
  proteinaPct?: number | null;
  solidosTotalesPct?: number | null;
  aguaAdicionadaPct?: number | null;
  temperaturaC?: number | null;
  puntoCongelacion?: number | null;
  ph?: number | null;
  conductividad?: number | null;
  resultado: string;
  fueraDeRango: boolean;
  imagenExamen?: string | null;
  imagenRecibo?: string | null;
  observacion?: string | null;
  createdAt: string;
  creadoPorNombre?: string | null;
}

export interface GuardarExamenLecheDto {
  fecha?: string;
  horaPrueba?: string | null;
  nivelPrueba?: 'TICKET' | 'FINCA' | string;
  controlRutaId?: number | null;
  controlCompaniaId?: number | null;
  rutaRecoleccionId?: number | null;
  fincaId?: number | null;
  camionId?: number | null;
  choferId?: number | null;
  parametroCalidadId?: number | null;
  litrosAsociados?: number | null;
  tipoLeche?: string;
  equipo?: string | null;
  numeroSerial?: string | null;
  calibracion?: string | null;
  grasaPct?: number | null;
  sngPct?: number | null;
  densidad?: number | null;
  lactosaPct?: number | null;
  salesPct?: number | null;
  proteinaPct?: number | null;
  solidosTotalesPct?: number | null;
  aguaAdicionadaPct?: number | null;
  temperaturaC?: number | null;
  puntoCongelacion?: number | null;
  ph?: number | null;
  conductividad?: number | null;
  resultado?: string;
  imagenExamen?: string | null;
  imagenRecibo?: string | null;
  observacion?: string | null;
}

export interface HistorialIntegralFincaItemDto {
  fecha: string;
  horaPrueba?: string | null;
  controlRutaId?: number | null;
  rutaRecoleccionId?: number | null;
  fincaId: number;
  fincaNombre?: string | null;
  litrosRecogidos: number;
  tipoLeche: string;
  esAcida: boolean;
  choferId?: number | null;
  nombreChofer?: string | null;
  camionId?: number | null;
  camionPlaca?: string | null;
  observacionRecoleccion?: string | null;
  examenId?: number | null;
  nivelPrueba?: 'FINCA' | 'TICKET' | 'SIN_EXAMEN' | string | null;
  equipo?: string | null;
  numeroSerial?: string | null;
  calibracion?: string | null;
  grasaPct?: number | null;
  sngPct?: number | null;
  densidad?: number | null;
  lactosaPct?: number | null;
  salesPct?: number | null;
  proteinaPct?: number | null;
  solidosTotalesPct?: number | null;
  aguaAdicionadaPct?: number | null;
  temperaturaC?: number | null;
  puntoCongelacion?: number | null;
  ph?: number | null;
  conductividad?: number | null;
  resultado?: string | null;
  fueraDeRango: boolean;
  imagenExamen?: string | null;
  imagenRecibo?: string | null;
  observacionExamen?: string | null;
}

export interface OcrLactoscanResponseDto {
  exito: boolean;
  mensaje?: string | null;
  horaPrueba?: string | null;
  fechaDetectada?: string | null;
  equipo?: string | null;
  numeroSerial?: string | null;
  calibracion?: string | null;
  tipoLecheDetectado?: string | null;
  grasaPct?: number | null;
  sngPct?: number | null;
  densidad?: number | null;
  lactosaPct?: number | null;
  salesPct?: number | null;
  proteinaPct?: number | null;
  solidosTotalesPct?: number | null;
  aguaAdicionadaPct?: number | null;
  temperaturaC?: number | null;
  puntoCongelacion?: number | null;
  ph?: number | null;
  conductividad?: number | null;
}

export interface LactoscanFieldDef {
  key: keyof GuardarExamenLecheDto;
  minKey: keyof ParametroCalidadLecheDto;
  maxKey: keyof ParametroCalidadLecheDto;
  label: string;
  shortLabel: string;
  unit: string;
  step: string;
}

export const LACTOSCAN_FIELDS: LactoscanFieldDef[] = [
  { key: 'grasaPct', minKey: 'grasaMin', maxKey: 'grasaMax', label: 'Grasa', shortLabel: 'Grasa %', unit: '%', step: '0.01' },
  { key: 'sngPct', minKey: 'sngMin', maxKey: 'sngMax', label: 'SNG (Sólidos No Grasos)', shortLabel: 'SNG %', unit: '%', step: '0.01' },
  { key: 'densidad', minKey: 'densidadMin', maxKey: 'densidadMax', label: 'Densidad', shortLabel: 'Dens.', unit: '', step: '0.01' },
  { key: 'lactosaPct', minKey: 'lactosaMin', maxKey: 'lactosaMax', label: 'Lactosa', shortLabel: 'Lact. %', unit: '%', step: '0.01' },
  { key: 'salesPct', minKey: 'salesMin', maxKey: 'salesMax', label: 'Sales', shortLabel: 'Sales %', unit: '%', step: '0.01' },
  { key: 'proteinaPct', minKey: 'proteinaMin', maxKey: 'proteinaMax', label: 'Proteína', shortLabel: 'Prot. %', unit: '%', step: '0.01' },
  { key: 'solidosTotalesPct', minKey: 'solidosTotalesMin', maxKey: 'solidosTotalesMax', label: 'Sólidos Totales', shortLabel: 'Sól. Tot. %', unit: '%', step: '0.01' },
  { key: 'aguaAdicionadaPct', minKey: 'aguaAdicionadaMin', maxKey: 'aguaAdicionadaMax', label: 'Agua Adicionada', shortLabel: 'Agua %', unit: '%', step: '0.01' },
  { key: 'temperaturaC', minKey: 'temperaturaMin', maxKey: 'temperaturaMax', label: 'Temp. de la Muestra', shortLabel: 'Temp °C', unit: '°C', step: '0.1' },
  { key: 'puntoCongelacion', minKey: 'puntoCongelacionMin', maxKey: 'puntoCongelacionMax', label: 'Punto de Congelación', shortLabel: 'P. Cong.', unit: '°C', step: '0.001' },
  { key: 'ph', minKey: 'phMin', maxKey: 'phMax', label: 'pH', shortLabel: 'pH', unit: '', step: '0.01' },
  { key: 'conductividad', minKey: 'conductividadMin', maxKey: 'conductividadMax', label: 'Conductividad', shortLabel: 'Cond.', unit: 'mS/cm', step: '0.01' },
];

export function evaluarValorContraParametro(
  valor: number | null | undefined,
  parametro: ParametroCalidadLecheDto | null | undefined,
  minKey: keyof ParametroCalidadLecheDto,
  maxKey: keyof ParametroCalidadLecheDto
): { estado: 'ok' | 'alerta' | 'neutro'; rangoTexto: string } {
  const min = parametro ? (parametro[minKey] as number | null | undefined) : undefined;
  const max = parametro ? (parametro[maxKey] as number | null | undefined) : undefined;

  const rangoTexto =
    min != null && max != null
      ? `${min} – ${max}`
      : min != null
        ? `≥ ${min}`
        : max != null
          ? `≤ ${max}`
          : '';

  if (valor == null || Number.isNaN(Number(valor)) || !parametro) {
    return { estado: 'neutro', rangoTexto };
  }
  const num = Number(valor);
  if ((min != null && num < Number(min)) || (max != null && num > Number(max))) {
    return { estado: 'alerta', rangoTexto };
  }
  if (min != null || max != null) {
    return { estado: 'ok', rangoTexto };
  }
  return { estado: 'neutro', rangoTexto };
}

export function comprimirImagenArchivo(file: File, maxWidth = 1280, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const examenesLecheApi = {
  // Exámenes
  getExamenes: async (params?: {
    fechaInicio?: string;
    fechaFin?: string;
    nivelPrueba?: string;
    fincaId?: number;
    choferId?: number;
    controlRutaId?: number;
    resultado?: string;
    soloFueraDeRango?: boolean;
  }): Promise<ExamenLecheDto[]> => {
    const res = await apiClient.get<ExamenLecheDto[]>('/examenes-leche', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getExamenesPorTicket: async (controlRutaId: number): Promise<ExamenLecheDto[]> => {
    const res = await apiClient.get<ExamenLecheDto[]>(`/examenes-leche/ticket/${controlRutaId}`);
    return Array.isArray(res.data) ? res.data : [];
  },

  getHistorialIntegralFinca: async (
    fincaId: number,
    params?: { fechaInicio?: string; fechaFin?: string }
  ): Promise<HistorialIntegralFincaItemDto[]> => {
    const res = await apiClient.get<HistorialIntegralFincaItemDto[]>(
      `/examenes-leche/finca/${fincaId}/historial`,
      { params }
    );
    return Array.isArray(res.data) ? res.data : [];
  },

  crearExamen: async (dto: GuardarExamenLecheDto): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/examenes-leche', dto);
    return res.data;
  },

  actualizarExamen: async (id: number, dto: GuardarExamenLecheDto): Promise<{ message: string }> => {
    const res = await apiClient.put(`/examenes-leche/${id}`, dto);
    return res.data;
  },

  eliminarExamen: async (id: number): Promise<{ message: string }> => {
    const res = await apiClient.delete(`/examenes-leche/${id}`);
    return res.data;
  },

  leerTicketLactoscanOcr: async (imagenBase64: string): Promise<OcrLactoscanResponseDto> => {
    const res = await apiClient.post<OcrLactoscanResponseDto>('/examenes-leche/ocr-lactoscan', {
      imagenBase64,
    });
    return res.data;
  },

  // Parámetros de Calidad (CRUD + Principal)
  getParametros: async (): Promise<ParametroCalidadLecheDto[]> => {
    const res = await apiClient.get<ParametroCalidadLecheDto[]>('/parametros-calidad-leche');
    return Array.isArray(res.data) ? res.data : [];
  },

  getParametroPrincipal: async (): Promise<ParametroCalidadLecheDto | null> => {
    const res = await apiClient.get<ParametroCalidadLecheDto | null>('/parametros-calidad-leche/principal');
    return res.data || null;
  },

  crearParametro: async (dto: GuardarParametroCalidadLecheDto): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/parametros-calidad-leche', dto);
    return res.data;
  },

  actualizarParametro: async (id: number, dto: GuardarParametroCalidadLecheDto): Promise<{ message: string }> => {
    const res = await apiClient.put(`/parametros-calidad-leche/${id}`, dto);
    return res.data;
  },

  marcarParametroPrincipal: async (id: number): Promise<{ message: string }> => {
    const res = await apiClient.patch(`/parametros-calidad-leche/${id}/principal`);
    return res.data;
  },

  eliminarParametro: async (id: number): Promise<{ message: string }> => {
    const res = await apiClient.delete(`/parametros-calidad-leche/${id}`);
    return res.data;
  },
};
