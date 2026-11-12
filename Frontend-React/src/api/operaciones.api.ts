import apiClient from './client';
import type {
  ControlRutaDto,
  ControlRutaFincaDto,
  ControlRutaEntregaDto,
  RutaLogisticaDto,
  DespachoCompaniaDto,
  BalanceVolumetricoResumenDto,
  BalanceVolumetricoDto,
  ControlTanquesDiarioDto,
  PlanificacionRutaChoferDto,
  GuardarPlanificacionRutaChoferDto,
  FincaPromedioDto,
  RecoleccionFincaResumenDto,
  SolicitudRecoleccionExtraordinariaDto,
  CrearSolicitudExtraordinariaDto,
} from '@/types';

export const operacionesApi = {
  // CONTROL DE RUTAS / VIAJES / TICKETS
  getControles: async (fecha?: string, choferId?: number, estado?: string, fechaInicio?: string, fechaFin?: string): Promise<ControlRutaDto[]> => {
    const params: Record<string, any> = {};

    if (fecha) params.fecha = fecha;
    if (choferId) params.choferId = choferId;
    if (estado) params.estado = estado;
    if (fechaInicio) params.fechaInicio = fechaInicio;
    if (fechaFin) params.fechaFin = fechaFin;
    const res = await apiClient.get<ControlRutaDto[]>('/control-rutas', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getViajeActivo: async (choferId?: number): Promise<ControlRutaDto | null> => {
    try {
      const params: Record<string, any> = {};
      if (choferId) params.choferId = choferId;
      const res = await apiClient.get<ControlRutaDto>('/control-rutas/viaje-activo', { params });
      return res.data || null;
    } catch {
      return null;
    }
  },

  getViajesActivosChofer: async (choferId?: number, fecha?: string): Promise<ControlRutaDto[]> => {
    try {
      const params: Record<string, any> = {};
      if (choferId) params.choferId = choferId;
      if (fecha) params.fecha = fecha;
      const res = await apiClient.get<ControlRutaDto[]>('/control-rutas/viajes-activos', { params });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  getControlPorId: async (id: number): Promise<ControlRutaDto> => {
    const res = await apiClient.get<ControlRutaDto>(`/control-rutas/${id}`);
    return res.data;
  },

  editarControl: async (id: number, dto: any): Promise<{ message: string }> => {
    const res = await apiClient.put(`/control-rutas/${id}`, dto);
    return res.data;
  },

  asignarRutasLogisticas: async (id: number, dto: { rutaLogisticaId?: number; rutasLogisticasIds?: number[]; observacion?: string }): Promise<{ message: string }> => {
    const res = await apiClient.put(`/control-rutas/${id}/rutas-logisticas`, dto);
    return res.data;
  },

  procesarOcrImagen: async (imagenBase64: string): Promise<{ items: any[]; mensaje?: string }> => {
    const res = await apiClient.post('/rutas/ocr-imagen', { imagenBase64 });
    return res.data;
  },

  guardarRutasMasivo: async (payload: {
    fecha: string;
    conductorId: number;
    controlRutaId?: number | null;
    items: any[];
    registrarEntrega?: boolean;
    companiaDestinoId?: number | null;
    litrosRecibidosPlanta?: number | null;
    observacionEntrega?: string;
    finalizarInmediato?: boolean;
  }): Promise<{ message: string; ids?: any[] }> => {
    const res = await apiClient.post('/rutas/masivo', payload);
    return res.data;
  },

  finalizarViajeAdmin: async (id: number, observacion?: string): Promise<{ message: string }> => {
    const res = await apiClient.post(`/control-rutas/${id}/finalizar`, { observacion });
    return res.data;
  },

  revertirProcesoViaje: async (id: number, dto: { nuevoProcesoId?: number; procesoDestinoId?: number; motivo: string }): Promise<{ message: string }> => {
    const payload = {
      nuevoProcesoId: dto.nuevoProcesoId ?? dto.procesoDestinoId ?? 1,
      motivo: dto.motivo,
    };
    const res = await apiClient.post(`/control-rutas/${id}/revertir-proceso`, payload);
    return res.data;
  },

  getHistorialViaje: async (id: number): Promise<any[]> => {
    const res = await apiClient.get<any[]>(`/control-rutas/${id}/historial`);
    return Array.isArray(res.data) ? res.data : [];
  },

  getLogsModificacionesViaje: async (id: number): Promise<any[]> => {
    const res = await apiClient.get<any[]>(`/control-rutas/${id}/logs-modificaciones`);
    return Array.isArray(res.data) ? res.data : [];
  },

  getLogsAuditoriaGlobal: async (params?: {
    fechaDesde?: string;
    fechaHasta?: string;
    tipoEntidad?: string;
    busqueda?: string;
    limite?: number;
  }): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/control-rutas/logs-auditoria-global', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  editarFincaViajeAuditado: async (id: number, rutaId: number, dto: { fincaId: number; litros: number; esAcida?: boolean; esDiferido?: boolean; tipoLeche?: string; motivo?: string; motivoModificacion?: string; observacion?: string }): Promise<{ message: string }> => {
    const payload = {
      fincaId: dto.fincaId,
      litros: dto.litros,
      esAcida: Boolean(dto.esAcida),
      esDiferido: Boolean(dto.esDiferido),
      tipoLeche: dto.tipoLeche || 'VACA',
      observacion: dto.observacion || '',
      motivo: dto.motivo || dto.motivoModificacion || '',
    };
    const res = await apiClient.put(`/control-rutas/${id}/fincas/${rutaId}/editar-auditado`, payload);
    return res.data;
  },

  eliminarFincaViajeAuditado: async (id: number, rutaId: number, motivo: string): Promise<{ message: string }> => {
    const res = await apiClient.delete(`/control-rutas/${id}/fincas/${rutaId}/eliminar-auditado`, { params: { motivo } });
    return res.data;
  },

  editarEntregaViajeAuditado: async (id: number, entregaId: number, dto: { companiaId: number; litros: number; observacion?: string; motivo: string }): Promise<{ message: string }> => {
    const res = await apiClient.put(`/control-rutas/${id}/entregas/${entregaId}/editar-auditado`, dto);
    return res.data;
  },

  iniciarViaje: async (dto: { fecha?: string; camionId?: number; choferId?: number; conductorId?: number; rutaLogisticaId?: number; rutasLogisticasIds?: number[]; fincaIds?: number[]; odometroInicialKm?: number; observaciones?: string; observacion?: string }): Promise<{ id: number; message: string }> => {
    const payload = {
      fecha: dto.fecha || undefined,
      camionId: dto.camionId || undefined,
      conductorId: dto.conductorId || dto.choferId || undefined,
      choferId: dto.choferId || dto.conductorId || undefined,
      rutaLogisticaId: dto.rutaLogisticaId || undefined,
      rutasLogisticasIds: dto.rutasLogisticasIds || undefined,
      fincaIds: dto.fincaIds || undefined,
      odometroInicialKm: dto.odometroInicialKm || undefined,
      observacion: dto.observacion || dto.observaciones || undefined,
      observaciones: dto.observaciones || dto.observacion || undefined,
    };

    const res = await apiClient.post('/control-rutas/iniciar-viaje', payload);
    return res.data;
  },

  cambiarEstadoProceso: async (id: number, nuevoEstado: string, motivo?: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/control-rutas/${id}/proceso`, { nuevoEstado, motivo });
    return res.data;
  },

  agregarFincaViaje: async (id: number, dto: { fincaId: number; litrosLeche?: number; litros?: number; esAcida?: boolean; esDiferido?: boolean; fecha?: string; hora?: string; tipoLeche?: string; observacion?: string; temperatura?: number; fotoComprobante?: string }): Promise<{ success: boolean; message: string }> => {
    const payload = {
      controlRutaId: id,
      fincaId: dto.fincaId,
      litros: dto.litros ?? dto.litrosLeche ?? 0,
      esAcida: Boolean(dto.esAcida),
      esDiferido: Boolean(dto.esDiferido),
      fecha: dto.fecha,
      hora: dto.hora,
      tipoLeche: dto.tipoLeche || 'VACA',
      observacion: dto.observacion || '',
      temperatura: dto.temperatura,
      fotoComprobante: dto.fotoComprobante,
    };
    const res = await apiClient.post(`/control-rutas/${id}/fincas`, payload);
    return res.data;
  },

  getFincasViaje: async (id: number, soloConLitros?: boolean): Promise<ControlRutaFincaDto[]> => {
    const query = soloConLitros ? '?soloConLitros=true' : '';
    const res = await apiClient.get<ControlRutaFincaDto[]>(`/control-rutas/${id}/fincas${query}`);
    return Array.isArray(res.data) ? res.data : [];
  },

  entregarDirectoCompania: async (id: number, dto: { companiaId: number; litrosEntregados: number; ticketReceptoria?: string; observaciones?: string }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post(`/control-rutas/${id}/entregar-compania-directo`, dto);
    return res.data;
  },

  getEntregasViaje: async (id: number): Promise<ControlRutaEntregaDto[]> => {
    const res = await apiClient.get<ControlRutaEntregaDto[]>(`/control-rutas/${id}/entregas`);
    return Array.isArray(res.data) ? res.data : [];
  },

  cerrarViaje: async (id: number, dto: { odometroFinalKm?: number; observaciones?: string }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post(`/control-rutas/${id}/cerrar-viaje`, dto);
    return res.data;
  },

  eliminarControl: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/control-rutas/${id}`);
    return res.data;
  },

  // RUTAS LOGÍSTICAS
  getRutasLogistica: async (): Promise<RutaLogisticaDto[]> => {
    try {
      const res = await apiClient.get<RutaLogisticaDto[]>('/rutas-logistica');
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      const res = await apiClient.get<RutaLogisticaDto[]>('/rutaslogistica');
      return Array.isArray(res.data) ? res.data : [];
    }
  },

  crearRutaLogistica: async (dto: { nombre: string; descripcion?: string; camionPredeterminadoId?: number; choferPredeterminadoId?: number }): Promise<{ id: number; message: string }> => {
    try {
      const res = await apiClient.post('/rutas-logistica', dto);
      return res.data;
    } catch {
      const res = await apiClient.post('/rutaslogistica', dto);
      return res.data;
    }
  },

  actualizarRutaLogistica: async (id: number, dto: { nombre: string; descripcion?: string; camionPredeterminadoId?: number; choferPredeterminadoId?: number; activo?: boolean }): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await apiClient.put(`/rutas-logistica/${id}`, dto);
      return res.data;
    } catch {
      const res = await apiClient.put(`/rutaslogistica/${id}`, dto);
      return res.data;
    }
  },

  getFincasDeRutaLogistica: async (id: number): Promise<{ id: number; codigo: string; nombre: string; propietario?: string; rutaPrincipalId?: number; rutaPrincipalNombre?: string; asignada: number; esPrincipal: number; tipoAsignacion: string }[]> => {
    try {
      const res = await apiClient.get(`/rutas-logistica/${id}/fincas`);
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      const res = await apiClient.get(`/rutaslogistica/${id}/fincas`);
      return Array.isArray(res.data) ? res.data : [];
    }
  },

  asignarFincasARuta: async (
    id: number, 
    fincaIds: number[], 
    habitualesIds?: number[], 
    alternasIds?: number[]
  ): Promise<{ success: boolean; message: string }> => {
    const payload = {
      fincaIds,
      fincasHabitualesIds: habitualesIds,
      fincasAlternasIds: alternasIds,
    };
    try {
      const res = await apiClient.post(`/rutas-logistica/${id}/fincas`, payload);
      return res.data;
    } catch {
      const res = await apiClient.post(`/rutaslogistica/${id}/fincas`, payload);
      return res.data;
    }
  },

  asignarFincaDirecta: async (rutaId: number, fincaId: number): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await apiClient.post(`/rutas-logistica/${rutaId}/asignar-finca-directa/${fincaId}`);
      return res.data;
    } catch {
      const res = await apiClient.post(`/rutaslogistica/${rutaId}/asignar-finca-directa/${fincaId}`);
      return res.data;
    }
  },

  eliminarRutaLogistica: async (id: number): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await apiClient.delete(`/rutas-logistica/${id}`);
      return res.data;
    } catch {
      const res = await apiClient.delete(`/rutaslogistica/${id}`);
      return res.data;
    }
  },

  // PLANIFICACIÓN DE RUTAS - CHOFERES
  getPlanificacionesChoferes: async (fecha?: string): Promise<PlanificacionRutaChoferDto[]> => {
    try {
      const params: Record<string, any> = {};
      if (fecha) params.fecha = fecha;
      const res = await apiClient.get<PlanificacionRutaChoferDto[]>('/rutas-logistica/planificacion-choferes', { params });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  guardarPlanificacionChofer: async (dto: GuardarPlanificacionRutaChoferDto): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/rutas-logistica/planificacion-choferes', dto);
    return res.data;
  },

  eliminarPlanificacionChofer: async (id: number): Promise<{ message: string }> => {
    const res = await apiClient.delete(`/rutas-logistica/planificacion-choferes/${id}`);
    return res.data;
  },

  modificarFincasTicket: async (ticketId: number, fincaIds: number[]): Promise<{ message: string }> => {
    const res = await apiClient.post(`/rutas-logistica/ticket/${ticketId}/modificar-fincas`, fincaIds);
    return res.data;
  },

  getFincasPromedios15Dias: async (rutaId?: number): Promise<FincaPromedioDto[]> => {
    try {
      const params: Record<string, any> = {};
      if (rutaId) params.rutaId = rutaId;
      const res = await apiClient.get<FincaPromedioDto[]>('/rutas-logistica/fincas-promedios-15dias', { params });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  getRecoleccionesHoyFincas: async (fecha?: string): Promise<RecoleccionFincaResumenDto[]> => {
    try {
      const params: Record<string, any> = {};
      if (fecha) params.fecha = fecha;
      const res = await apiClient.get<RecoleccionFincaResumenDto[]>('/rutas-logistica/recolecciones-hoy-fincas', { params });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      try {
        const params: Record<string, any> = {};
        if (fecha) params.fecha = fecha;
        const res = await apiClient.get<RecoleccionFincaResumenDto[]>('/rutaslogistica/recolecciones-hoy-fincas', { params });
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    }
  },

  solicitarRecoleccionExtraordinaria: async (dto: CrearSolicitudExtraordinariaDto): Promise<{ success: boolean; id: number; message: string }> => {
    try {
      const res = await apiClient.post('/rutas-logistica/solicitar-extraordinaria', dto);
      return res.data;
    } catch {
      const res = await apiClient.post('/rutaslogistica/solicitar-extraordinaria', dto);
      return res.data;
    }
  },

  getSolicitudesExtraordinariasHoy: async (fecha?: string): Promise<SolicitudRecoleccionExtraordinariaDto[]> => {
    try {
      const params: Record<string, any> = {};
      if (fecha) params.fecha = fecha;
      const res = await apiClient.get<SolicitudRecoleccionExtraordinariaDto[]>('/rutas-logistica/solicitudes-extraordinarias', { params });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      try {
        const params: Record<string, any> = {};
        if (fecha) params.fecha = fecha;
        const res = await apiClient.get<SolicitudRecoleccionExtraordinariaDto[]>('/rutaslogistica/solicitudes-extraordinarias', { params });
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    }
  },

  responderSolicitudExtraordinaria: async (id: number, aprobar: boolean): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await apiClient.post(`/rutas-logistica/responder-extraordinaria/${id}`, { aprobar });
      return res.data;
    } catch {
      const res = await apiClient.post(`/rutaslogistica/responder-extraordinaria/${id}`, { aprobar });
      return res.data;
    }
  },

  // CONTROL COMPAÑÍAS / RECEPTORÍA
  getTicketActivoDespachoChofer: async (choferId?: number): Promise<DespachoCompaniaDto | null> => {
    try {
      const res = await apiClient.get<DespachoCompaniaDto>('/control-companias/chofer-activo', {
        params: choferId ? { choferId } : undefined,
      });
      return res.data || null;
    } catch {
      return null;
    }
  },

  getTicketsActivosDespachoChofer: async (choferId?: number, controlRutaId?: number): Promise<DespachoCompaniaDto[]> => {
    try {
      const params: Record<string, any> = {};
      if (choferId) params.choferId = choferId;
      if (controlRutaId) params.controlRutaId = controlRutaId;
      const res = await apiClient.get<DespachoCompaniaDto[]>('/control-companias/chofer-activos', { params });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  getDespachosCompanias: async (fecha?: string, companiaId?: number, fechaInicio?: string, fechaFin?: string, usuarioId?: number): Promise<DespachoCompaniaDto[]> => {
    const params: Record<string, any> = {};

    if (fecha) params.fecha = fecha;
    if (companiaId) params.companiaId = companiaId;
    if (fechaInicio) params.fechaInicio = fechaInicio;
    if (fechaFin) params.fechaFin = fechaFin;
    if (usuarioId) params.usuarioId = usuarioId;
    const res = await apiClient.get<DespachoCompaniaDto[]>('/control-companias', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getDespachoCompaniaPorId: async (id: number): Promise<any> => {
    const res = await apiClient.get(`/control-companias/${id}`);
    return res.data;
  },

  eliminarDespachoCompania: async (id: number): Promise<{ message: string }> => {
    const res = await apiClient.delete(`/control-companias/${id}`);
    return res.data;
  },

  crearDespachoCompania: async (dto: {
    fecha?: string;
    camionId?: number;
    usuarioId?: number;
    companiaId: number;
    litrosDespachados: number;
    tipoLeche: string;
    numeroGuiaSADA?: string;
    observaciones?: string;
    observacion?: string;
  }): Promise<{ id: number; message: string }> => {
    const payload = {
      ...dto,
      observacion: dto.observacion || dto.observaciones || '',
    };

    const res = await apiClient.post('/controlcompanias', payload);
    return res.data;
  },

  actualizarDespachoCompania: async (id: number, dto: any): Promise<{ message: string }> => {
    const res = await apiClient.put('/controlcompanias/' + id, dto);
    return res.data;
  },

  validarEntregaCompania: async (id: number, dto: { litrosConfirmados?: number; litrosRecibidosCompania?: number; observaciones?: string; observacion?: string; tipoLeche?: string; fotoReciboUrl?: string }): Promise<{ success: boolean; message: string }> => {
    const lts = Number(dto.litrosRecibidosCompania ?? dto.litrosConfirmados ?? 0);
    const obs = dto.observaciones ?? dto.observacion ?? '';
    const res = await apiClient.post(`/controlcompanias/${id}/validar-entrega`, {
      litrosRecibidosCompania: lts,
      litrosConfirmados: lts,
      observacion: obs,
      observaciones: obs,
      tipoLeche: dto.tipoLeche,
      fotoReciboUrl: dto.fotoReciboUrl,
    });
    return res.data;
  },

  recibirEnReceptoria: async (id: number, dto: {
    litrosRecibidos: number;
    accion?: string;
    litrosCargadosAdicional?: number;
    companiaDestinoId?: number;
    observacion?: string;
    destinos?: Array<{
      companiaId: number;
      litrosDespachados?: number;
      litros?: number;
      tipoLeche?: string;
      numeroGuiaSADA?: string;
      observacion?: string;
    }>;
  }): Promise<{ success?: boolean; message?: string }> => {
    try {
      const res = await apiClient.post(`/control-rutas/${id}/recibir-receptoria`, {
        litrosRecibidos: Math.round(Number(dto.litrosRecibidos)),
        accion: dto.accion || 'DEJAR_EN_RECEPTORIA',
        litrosCargadosAdicional: dto.litrosCargadosAdicional,
        companiaDestinoId: dto.companiaDestinoId,
        observacion: dto.observacion,
        destinos: dto.destinos,
      });
      return res.data;
    } catch {
      const res = await apiClient.post(`/controlrutas/${id}/recibir-receptoria`, {
        litrosRecibidos: Math.round(Number(dto.litrosRecibidos)),
        accion: dto.accion || 'DEJAR_EN_RECEPTORIA',
        litrosCargadosAdicional: dto.litrosCargadosAdicional,
        companiaDestinoId: dto.companiaDestinoId,
        observacion: dto.observacion,
        destinos: dto.destinos,
      });
      return res.data;
    }
  },

  // TRAZABILIDAD BÚFALA
  getTrazabilidadBufala: async (fechaInicio?: string, fechaFin?: string): Promise<any[]> => {
    const params: Record<string, any> = {};

    if (fechaInicio) params.fechaInicio = fechaInicio;
    if (fechaFin) params.fechaFin = fechaFin;
    const res = await apiClient.get<any[]>('/controlcompanias/trazabilidad-bufala', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  // RECEPTORIA HOY / ENTREGAS
  getEntregasHoy: async (fecha?: string): Promise<any[]> => {
    const params: Record<string, any> = {};

    if (fecha) params.fecha = fecha;
    const res = await apiClient.get<any[]>('/receptoria/hoy', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getRutasHoy: async (fecha?: string, fechaInicio?: string, fechaFin?: string, cicloId?: number): Promise<any[]> => {
    const params: Record<string, any> = {};

    if (fecha) params.fecha = fecha;
    if (fechaInicio) params.fechaInicio = fechaInicio;
    if (fechaFin) params.fechaFin = fechaFin;
    if (cicloId) params.cicloId = cicloId;
    const res = await apiClient.get<any[]>('/rutas/hoy', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  guardarEntrega: async (dto: { fecha: string; usuarioId: number; companiaId: number; litros: number; observacion?: string }): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/receptoria', dto);
    return res.data;
  },

  eliminarEntrega: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/receptoria/${id}`);
    return res.data;
  },

  // GESTIÓN OPERATIVA DE VIAJES / TICKETS
  enviarAReceptoria: async (id: number, observacion?: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post(`/control-rutas/${id}/enviar-receptoria`, { observacion });
    return res.data;
  },

  enviarACompania: async (id: number, dto: { companiaId?: number; choferId?: number; litrosDespachados?: number; observacion?: string; destinos?: { companiaId: number; litros: number; tipoLeche: string }[] }): Promise<{ success: boolean; message: string; controlCompaniaId?: number }> => {
    const res = await apiClient.post(`/control-rutas/${id}/enviar-compania`, dto);
    return res.data;
  },

  traspasarLeche: async (id: number, dto: { ticketDestinoId?: number; choferDestinoId?: number; fechaDestino?: string; litrosTraspaso?: number; observacion?: string }): Promise<any> => {
    const res = await apiClient.post(`/control-rutas/${id}/traspasar-leche`, dto);
    return res.data;
  },

  editarRecoleccion: async (id: number, dto: { fincaId?: number; litros?: number; tipoLeche?: string; esAcida?: boolean; esDiferido?: boolean; temperatura?: number; observacion?: string; fotoComprobante?: string }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/rutas/${id}`, dto);
    return res.data;
  },

  eliminarRecoleccion: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/rutas/${id}`);
    return res.data;
  },

  limpiarRecoleccion: async (rutaId: number, controlRutaId?: number): Promise<{ success?: boolean; message: string }> => {
    if (controlRutaId) {
      const res = await apiClient.post(`/control-rutas/${controlRutaId}/fincas/${rutaId}/limpiar`);
      return res.data;
    }
    const res = await apiClient.post(`/rutas/${rutaId}/limpiar-recoleccion`);
    return res.data;
  },

  validarCargaMasivaExcel: async (filas: any[]): Promise<{
    dataValida: boolean;
    totalFilas: number;
    filasValidas: number;
    filasDuplicadas: number;
    filasConError: number;
    mensajeGeneral: string;
    resultados: Array<{
      index: number;
      esValido: boolean;
      esDuplicado: boolean;
      mensaje?: string;
      ticketExistenteId?: number;
      ticketCodigo?: string;
      ticketEstado?: string;
      camionId?: number;
      camionPlaca?: string;
      camionCapacidadLitros?: number;
    }>;
  }> => {
    const res = await apiClient.post('/control-rutas/validar-carga-masiva-excel', { filas });
    return res.data;
  },

  ejecutarCargaMasivaExcel: async (filas: any[]): Promise<{
    success: boolean;
    message: string;
    ticketsCreadosCount: number;
    paradasCreadasCount: number;
    litrosTotales: number;
    tickets: Array<{
      ticketId: number;
      codigoTicket?: string;
      fecha: string;
      conductorId: number;
      conductorNombre?: string;
      camionPlaca?: string;
      totalLitros: number;
      cantidadFincas: number;
    }>;
  }> => {
    const res = await apiClient.post('/control-rutas/ejecutar-carga-masiva-excel', { filas });
    return res.data;
  },

  diferirLitros: async (rutaId: number, dto: { litrosDiferir: number; cicloDestinoId?: number; motivo?: string }): Promise<{ message: string }> => {
    const res = await apiClient.post<{ message: string }>(`/rutas/${rutaId}/diferir-litros`, dto);
    return res.data;
  },

  revertirDiferimiento: async (rutaId: number): Promise<{ message: string }> => {
    const res = await apiClient.post<{ message: string }>(`/rutas/${rutaId}/revertir-diferimiento`);
    return res.data;
  },

  // BALANCE LECHE / MERMAS
  getMermasHoy: async (fechaInicio?: string, fechaFin?: string, choferId?: number): Promise<BalanceVolumetricoResumenDto> => {
    const params: Record<string, any> = {};

    if (fechaInicio) params.fechaInicio = fechaInicio;
    if (fechaFin) params.fechaFin = fechaFin;
    if (choferId) params.choferId = choferId;
    const res = await apiClient.get<BalanceVolumetricoResumenDto>('/catalogos/mermas', { params });
    return res.data;
  },

  // CONTROL DIARIO DE TANQUES / SILOS
  getControlTanquesDiario: async (fecha?: string): Promise<ControlTanquesDiarioDto | null> => {
    try {
      const params: Record<string, any> = {};
      if (fecha) params.fecha = fecha;
      const res = await apiClient.get<ControlTanquesDiarioDto>('/receptoria/control-tanques-diario', { params });
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  guardarControlTanquesDiario: async (dto: ControlTanquesDiarioDto): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/receptoria/control-tanques-diario', dto);
    return res.data;
  },

  confirmarAperturaTanques: async (fecha: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/receptoria/control-tanques-diario/confirmar-apertura', { fecha });
    return res.data;
  },

  confirmarCierreTanques: async (fecha: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/receptoria/control-tanques-diario/confirmar-cierre', { fecha });
    return res.data;
  },

  // BALANCE VOLUMÉTRICO Y AUDITORÍA 1:1
  getBalanceVolumetrico: async (cicloId?: number, fechaInicio?: string, fechaFin?: string): Promise<BalanceVolumetricoDto> => {
    const params: Record<string, any> = {};
    if (cicloId) params.cicloId = cicloId;
    if (fechaInicio) params.fechaInicio = fechaInicio;
    if (fechaFin) params.fechaFin = fechaFin;
    const res = await apiClient.get<BalanceVolumetricoDto>('/receptoria/balance-volumetrico', { params });
    return res.data;
  },

  updateStockInicialTanques: async (cicloId: number, stockInicial: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/ciclos/${cicloId}/stock-inicial`, { stockInicial });
    return res.data;
  },
};


