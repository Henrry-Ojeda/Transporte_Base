import apiClient from './client';
import type {
  CicloSemanalDto,
  PreliquidacionFincaDto,
  AdelantoDto,
  AbonoCompaniaDto,
  PagoPersonalDto,
} from '@/types';

export const finanzasApi = {
  // SEMANAS / CICLOS
  getCiclos: async (): Promise<CicloSemanalDto[]> => {
    const res = await apiClient.get<CicloSemanalDto[]>('/ciclos');
    const list = Array.isArray(res.data) ? res.data : [];
    // Regla de negocio: Semanas operativas 44 y 45 son las activas/visibles; desde la 46 en adelante no debe verse en ningún lado
    return list.filter((c) => {
      const num = Number(c.numeroSemana || c.id || 0);
      if (num >= 46) return false;
      if (c.fechaInicio && new Date(c.fechaInicio) > new Date('2026-11-09T23:59:59')) {
        return false;
      }
      return true;
    });
  },
  getCicloActivo: async (): Promise<CicloSemanalDto> => {
    const res = await apiClient.get<CicloSemanalDto>('/catalogos/ciclo-activo');
    return res.data;
  },
  crearCiclo: async (dto: { codigo: string; fechaInicio: string; fechaFin: string; observaciones?: string; numeroSemana?: number; año?: number }): Promise<{ id: number; message: string }> => {
    const payload = {
      ...dto,
      codigo: dto.codigo || `Semana #${dto.numeroSemana || 1} (${dto.año || new Date().getFullYear()})`,
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
      observaciones: dto.observaciones || '',
    };
    const res = await apiClient.post('/ciclos', payload);
    return res.data;
  },
  editarCiclo: async (id: number, dto: { codigo: string; fechaInicio: string; fechaFin: string; observaciones?: string }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/ciclos/${id}`, dto);
    return res.data;
  },
  generar52Semanas: async (dto: { anio: number; diaInicio: number; diaFin: number; fechaPrimerInicio?: string }): Promise<{ message: string; creadas?: number; totalCreadas?: number }> => {
    const res = await apiClient.post('/ciclos/generar-anual', {
      anio: dto.anio,
      diaInicio: dto.diaInicio,
      diaFin: dto.diaFin,
    });
    return res.data;
  },
  validarActivacionCiclo: async (id: number): Promise<any> => {
    const res = await apiClient.get(`/ciclos/${id}/validar-activacion`).catch(() => ({ data: null }));
    return res.data;
  },
  activarCiclo: async (id: number, stockInicialPersonalizado?: number): Promise<{ success: boolean; message: string }> => {
    const body = stockInicialPersonalizado !== undefined ? { stockInicialPersonalizado } : {};
    const res = await apiClient.post(`/ciclos/${id}/activar`, body);
    return res.data;
  },
  getResumenCierreCiclo: async (id: number): Promise<any> => {
    const res = await apiClient.get(`/ciclos/${id}/resumen-cierre`).catch(() => ({ data: null }));
    return res.data;
  },
  cerrarCiclo: async (id: number, stockFinalTanques: number, tasaBCV?: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post(`/ciclos/${id}/cerrar`, { stockFinalTanques, tasaBCV });
    return res.data;
  },
  reabrirCiclo: async (id: number, motivo: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post(`/ciclos/${id}/reabrir`, { motivo });
    return res.data;
  },

  // PRELIQUIDACIÓN & LIQUIDACIÓN
  getPreliquidacion: async (cicloId?: number): Promise<PreliquidacionFincaDto[]> => {
    const params: Record<string, any> = {};
    if (cicloId) params.cicloId = cicloId;
    const res = await apiClient.get<any[]>('/catalogos/preliquidacion', { params });
    const rawList = Array.isArray(res.data) ? res.data : [];
    return rawList.map((p) => {
      const propietario = p.propietarioNombre || p.propietario || p.Propietario || '';
      const tasa = Number(p.tasaBCV || p.tasaBcv || p.TasaBcv || 1);
      const totalLitros = Number(p.totalLitros || p.TotalLitros || 0);
      const precioLitro = Number(p.precioLitroUSD || p.PrecioLitroUSD || 0);
      const brutoUSD = Number(p.totalBrutoUSD ?? p.totalUSD ?? p.TotalUSD ?? (totalLitros * precioLitro));
      const adelantoUSD = Number(p.totalAdelantosUSD ?? p.TotalAdelantosUSD ?? 0);
      const netoUSD = Number(p.totalNetoUSD ?? Math.max(0, brutoUSD - adelantoUSD));
      const netoBs = Number(p.totalNetoBs ?? p.paidTotalNetoBs ?? p.PaidTotalNetoBs ?? (netoUSD * tasa));
      return {
        ...p,
        fincaId: Number(p.fincaId || p.FincaId),
        fincaCodigo: p.fincaCodigo || p.FincaCodigo || undefined,
        fincaNombre: p.fincaNombre || p.FincaNombre || 'Finca',
        propietarioId: Number(p.propietarioId || p.PropietarioId || 0),
        propietarioNombre: propietario,
        bancoNombre: p.bancoNombre || p.BancoNombre || p.propietarioBancoNombre || '',
        numeroCuenta: p.numeroCuenta || p.NumeroCuenta || p.propietarioNumeroCuenta || '',
        pagoMovil: p.pagoMovil || p.PagoMovil || '',
        cedulaRif: p.cedulaRIF || p.cedulaRif || p.CedulaRIF || '',
        totalLitros,
        precioLitroUSD: precioLitro,
        totalBrutoUSD: brutoUSD,
        totalAdelantosUSD: adelantoUSD,
        totalNetoUSD: netoUSD,
        totalNetoBs: netoBs,
        tasaBCV: tasa,
        pagado: Boolean(p.pagado ?? p.esPagado ?? p.EsPagado),
        fechaPago: p.fechaPago || p.FechaPago,
        referenciaPago: p.referenciaPago || p.ReferenciaPago,
      };
    });
  },
  pagarPreliquidacion: async (dto: { fincaId: number; cicloId: number; referenciaPago: string; montoUSD: number; montoBs: number; tasaBCV: number }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/catalogos/pre-liquidacion/pagar', dto);
    return res.data;
  },
  actualizarTasaPendientes: async (cicloId: number, nuevaTasa: number): Promise<{ affectedRows: number; message: string }> => {
    const res = await apiClient.post('/catalogos/pre-liquidacion/actualizar-tasa-pendientes', { cicloId, nuevaTasa });
    return res.data;
  },

  // ADELANTOS
  getAdelantos: async (tipoEntidad?: string, fincaId?: number, usuarioId?: number): Promise<AdelantoDto[]> => {
    const params: Record<string, any> = {};
    if (tipoEntidad) params.tipoEntidad = tipoEntidad;
    if (fincaId) params.fincaId = fincaId;
    if (usuarioId) params.usuarioId = usuarioId;
    const res = await apiClient.get<AdelantoDto[]>('/adelantos', { params });
    return Array.isArray(res.data) ? res.data : [];
  },
  getAdelantoPorId: async (id: number): Promise<any> => {
    const res = await apiClient.get(`/adelantos/${id}`);
    return res.data;
  },
  crearAdelanto: async (dto: {
    tipoEntidad: string;
    entidadId?: number;
    fincaId?: number;
    usuarioId?: number;
    companiaId?: number;
    montoTotalUSD: number;
    numeroCuotas: number;
    semanaOperativaIdInicio?: number;
    observaciones?: string;
    cuotasPersonalizadas?: { semanaOperativaId: number; cuotaPactadaUSD: number }[];
    [key: string]: any;
  }): Promise<any> => {
    const res = await apiClient.post('/adelantos', dto);
    return res.data;
  },
  actualizarCuota: async (cuotaId: number, dto: any): Promise<{ message: string }> => {
    const res = await apiClient.put(`/adelantos/cuotas/${cuotaId}`, dto);
    return res.data;
  },
  posponerCuota: async (cuotaId: number, semanaDestinoOrDto: any, motivo?: string): Promise<{ message: string }> => {
    let payload: any = {};
    if (typeof semanaDestinoOrDto === 'object' && semanaDestinoOrDto !== null) {
      payload = semanaDestinoOrDto;
    } else {
      payload = {
        semanaOperativaIdDestino: semanaDestinoOrDto,
        motivo,
      };
    }
    const res = await apiClient.post(`/adelantos/cuotas/${cuotaId}/posponer`, payload);
    return res.data;
  },
  dividirCuota: async (cuotaId: number, dto: any): Promise<{ success: boolean; message: string }> => {
    const payload = {
      montoDescontarUSD: dto.montoDescontarUSD ?? dto.montoCobrarActual ?? 0,
      semanaOperativaIdDestino: dto.semanaOperativaIdDestino ?? dto.cicloDestinoId ?? 0,
      motivo: dto.motivo,
      ...dto,
    };
    const res = await apiClient.post(`/adelantos/cuotas/${cuotaId}/dividir`, payload);
    return res.data;
  },
  reestructurarCuotas: async (id: number, dto: any): Promise<{ message: string }> => {
    const payload = {
      numeroCuotas: dto.numeroCuotas ?? dto.nuevasCuotas ?? 1,
      semanaOperativaIdInicio: dto.semanaOperativaIdInicio ?? dto.cicloInicialId ?? 0,
      ...dto,
    };
    const res = await apiClient.post(`/adelantos/${id}/reestructurar-cuotas`, payload);
    return res.data;
  },
  actualizarTasaActivos: async (tipoEntidadOrDto: any, tasaBcv?: number): Promise<{ success: boolean; message: string; actualizados?: number }> => {
    const payload = typeof tipoEntidadOrDto === 'object' && tipoEntidadOrDto !== null
      ? tipoEntidadOrDto
      : { tipoEntidad: tipoEntidadOrDto, tasaBcv };
    const res = await apiClient.post('/adelantos/actualizar-tasa-activos', payload);
    return res.data;
  },
  getAbonos: async (tipoEntidadOrParams?: any, cicloId?: number): Promise<any[]> => {
    let params: Record<string, any> = {};
    if (typeof tipoEntidadOrParams === 'object' && tipoEntidadOrParams !== null) {
      params = tipoEntidadOrParams;
    } else {
      if (tipoEntidadOrParams) params.tipoEntidad = tipoEntidadOrParams;
      if (cicloId) params.cicloId = cicloId;
    }
    const res = await apiClient.get<any[]>('/adelantos/abonos', { params });
    return Array.isArray(res.data) ? res.data : [];
  },
  registrarAbonoDirecto: async (dto: any): Promise<{ success: boolean; message: string }> => {
    const payload = {
      adelantoId: dto.adelantoId,
      cuotaId: dto.cuotaId,
      montoAbonoUSD: dto.montoAbonoUSD ?? dto.montoUSD ?? 0,
      numeroReferencia: dto.numeroReferencia ?? dto.referenciaBancaria,
      notas: dto.notas ?? dto.observaciones,
      ...dto,
    };
    const res = await apiClient.post('/adelantos/abonos/directo', payload);
    return res.data;
  },
  amortizarAdelanto: async (id: number, montoUSD: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post(`/adelantos/${id}/amortizar`, { montoUSD });
    return res.data;
  },
  eliminarAdelanto: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/adelantos/${id}`);
    return res.data;
  },

  // ABONOS COMPAÑÍAS
  getAbonosCompanias: async (companiaId?: number): Promise<AbonoCompaniaDto[]> => {
    const params: Record<string, any> = {};
    if (companiaId) params.companiaId = companiaId;
    const res = await apiClient.get<AbonoCompaniaDto[]>('/catalogos/companias/abonos', { params }).catch(() => ({ data: [] }));
    return Array.isArray(res.data) ? res.data : [];
  },
  crearAbonoCompania: async (dto: {
    companiaId: number;
    fecha?: string;
    montoUSD: number;
    montoBs?: number;
    tasaBcv?: number;
    referenciaBancaria?: string;
    bancoId?: number;
    controlCompaniaId?: number;
    fechaLecheAbonada?: string;
    litrosAbonados?: number;
    observaciones?: string;
    tipoPago?: string;
  }): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/catalogos/companias/abonos', dto);
    return res.data;
  },
  getResumenCobranzasCompanias: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/catalogos/companias/resumen-cobranzas').catch(() => ({ data: [] }));
    return Array.isArray(res.data) ? res.data : [];
  },

  // PAGOS PERSONAL & CHOFERES
  getPagosPersonal: async (usuarioId?: number): Promise<PagoPersonalDto[]> => {
    const params: Record<string, any> = {};
    if (usuarioId) params.usuarioId = usuarioId;
    const res = await apiClient.get<PagoPersonalDto[]>('/pagos-usuarios', { params });
    return Array.isArray(res.data) ? res.data : [];
  },
  crearPagoPersonal: async (dto: { usuarioId: number; fecha: string; montoUSD: number; tipoPago: string; descripcion?: string; referenciaBancaria?: string }): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/pagos-usuarios', dto);
    return res.data;
  },
};

