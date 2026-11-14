export interface ControlRutaDto {
  id: number;
  codigoTicket?: string;
  fecha: string;
  cicloId?: number;
  usuarioId?: number;
  nombreConductor?: string;
  camionId?: number;
  camionPlaca?: string;
  capacidadCamionLitros?: number;
  choferId?: number;
  choferNombre?: string;
  procesoActualId?: number;
  rutaLogisticaId?: number;
  rutasLogisticasIds?: number[];
  rutasLogisticasNombres?: string;
  rutaLogisticaNombre?: string;
  rutaNombre?: string;
  totalLitrosFinca?: number;
  totalLitrosRecogidos?: number;
  totalLitrosReceptoria?: number;
  litrosEntregadosCompania?: number;
  totalLitrosEntregados?: number;
  diferenciaLitros?: number;
  mermaTotalLitros?: number;
  mermaLitros?: number;
  porcentajeMerma?: number;
  mermaPorcentaje?: number;
  estado?: string;
  estadoProceso?: string; // INICIADO, EN_RUTA, EN_RECEPTORIA, ENTREGADO_COMPANIA, CERRADO
  codigoProceso?: string;
  nombreProceso?: string;
  colorProceso?: string;
  iconoProceso?: string;
  odometroInicialKm?: number;
  odometroFinalKm?: number;
  observacion?: string;
  observaciones?: string;
  fincasPlanificadasIds?: number[];
  createdAt: string;
  fincasDetalle?: ControlRutaFincaDto[];
  entregasDetalle?: ControlRutaEntregaDto[];
}

export interface ControlRutaFincaDto {
  id: number;
  controlRutaId: number;
  fincaId: number;
  fincaNombre?: string;
  propietarioNombre?: string;
  litrosLeche: number;
  litros?: number;
  temperatura?: number;
  tipoLeche?: string;
  esAcida?: boolean;
  esDiferido?: boolean;
  fecha?: string;
  horaRecoleccion?: string;
  precioLitroUSD?: number;
  observacion?: string;
  fotoComprobante?: string;
  createdAt?: string;
}

export interface ControlRutaEntregaDto {
  id: number;
  controlRutaId: number;
  companiaId: number;
  companiaNombre?: string;
  litrosEntregados: number;
  ticketReceptoria?: string;
  fechaHora?: string;
  precioLitroUSD?: number;
  observaciones?: string;
}

export interface RutaLogisticaDto {
  id: number;
  nombre: string;
  codigo?: string;
  descripcion?: string;
  activo: boolean;
  camionPredeterminadoId?: number;
  camionPlaca?: string;
  capacidadCamionLitros?: number;
  choferPredeterminadoId?: number;
  choferNombre?: string;
  totalLitrosEstimados?: number;
  totalFincas?: number;
  totalFincasAsignadas?: number;
  totalFincasHabituales?: number;
  totalFincasAlternas?: number;
  fincas?: { fincaId: number; fincaNombre: string; ordenSecuencia: number }[];
}

export interface DespachoCompaniaDto {
  id: number;
  fecha: string;
  usuarioId?: number;
  conductorId?: number;
  nombreConductor?: string;
  camionId?: number;
  camionPlaca?: string;
  choferNombre?: string;
  companiaId: number;
  companiaNombre?: string;
  nombreCompania?: string;
  litrosDespachados: number;
  litrosConfirmados?: number;
  litrosRecibidosCompania?: number;
  diferenciaLitros?: number;
  porcentajeMerma?: number;
  tipoLeche: string;
  estado: string; // EN_TRANSITO, RECIBIDO_COMPANIA, CONCILIADO
  numeroGuiaSADA?: string;
  observaciones?: string;
  observacion?: string;
  controlRutaId?: number;
  codigoTicket?: string;
  esPrincipal?: boolean;
  fotoReciboUrl?: string;
  createdAt?: string;
}

export interface BalanceVolumetricoResumenDto {
  totalLitrosRecogidos: number;
  totalLitrosEntregados: number;
  mermaLitros: number;
  mermaPorcentaje: number;
  totalViajes: number;
  totalFincasVisitadas: number;
  fechaInicio?: string;
  fechaFin?: string;
}

export interface ControlTanquesDiarioDto {
  id?: number;
  fecha: string;
  tanque1Inicial: number;
  tanque2Inicial: number;
  tanque3Inicial: number;
  tanque4Inicial: number;
  tanque5Inicial: number;
  totalInicialLitros: number;
  aperturaConfirmada: boolean;
  aperturaConfirmadaPorId?: number;
  aperturaConfirmadaPorNombre?: string;
  aperturaConfirmadaAt?: string;
  totalEntradasRutasLitros: number;
  totalSalidasPlantasLitros: number;
  tanque1Final: number;
  tanque2Final: number;
  tanque3Final: number;
  tanque4Final: number;
  tanque5Final: number;
  totalFinalFisicoLitros: number;
  totalTeoricoLitros: number;
  diferenciaMermaLitros: number;
  cierreConfirmado: boolean;
  cierreConfirmadoPorId?: number;
  cierreConfirmadoPorNombre?: string;
  cierreConfirmadoAt?: string;
  estado?: string;
  filasRecepcionJson?: string;
  observaciones?: string;
  puedeModificar?: boolean;
}

export interface PlanificacionRutaChoferDto {
  id: number;
  fecha: string;
  camionId: number;
  camionPlaca?: string;
  capacidadCamionLitros: number;
  conductorId: number;
  conductorNombre?: string;
  rutaLogisticaId?: number;
  rutaLogisticaNombre?: string;
  rutasIds?: string;
  fincasIds: string;
  listaFincasIds: number[];
  totalFincas: number;
  litrosEstimados: number;
  porcentajeOcupacion: number;
  observacion?: string;
  activo: boolean;
  controlRutaId?: number | null;
  estadoTicket?: string;
  litrosRecolectadosReal?: number;
  fincasRecolectadasIds?: number[];
  createdAt: string;
}

export interface GuardarPlanificacionRutaChoferDto {
  id?: number;
  fecha: string;
  camionId: number;
  conductorId: number;
  rutaLogisticaId?: number;
  rutasIds?: string;
  fincasIds: number[];
  litrosEstimados: number;
  observacion?: string;
}

export interface FincaPromedioDto {
  fincaId: number;
  fincaNombre: string;
  propietario?: string;
  rutaId?: number;
  tipoLeche?: string;
  promedioLitros: number;
  esAlterna?: boolean;
  rutaPrincipalNombre?: string;
  rutasAsignadasIds?: number[];
}

export interface ResumenProcesoDto {
  tipoProceso: number;
  nombre: string;
  descripcion: string;
  totalLitros: number;
  cantidadMovimientos: number;
  porcentajeDelTotal: number;
  impactoTanque: string;
}

export interface MovimientoLecheDto {
  id: number;
  fecha: string;
  tipoProceso: number;
  tipoProcesoNombre: string;
  ticketReferencia: string;
  conductor: string;
  camionPlaca?: string;
  origen: string;
  destino: string;
  litrosEntradaTanque: number;
  litrosSalidaTanque: number;
  litrosEntregaDirecta: number;
  saldoTanque: number;
  litrosVerificados?: number;
  diferenciaVerificacion?: number;
  infoVerificacion?: string;
  estado: string;
  observacion?: string;
}

export interface BalanceVolumetricoDto {
  cicloId?: number;
  codigoCiclo?: string;
  fechaInicio?: string;
  fechaFin?: string;
  stockInicialTanque: number;
  totalRecolectadoFincas: number;
  totalEntradasTanque: number;
  totalSalidasTanque: number;
  stockActualTanque: number;
  totalEntregasDirectas: number;
  totalComercializadoCompanias: number;
  totalMermaRuta: number;
  diferenciaDescuadre: number;
  proceso1_FincaReceptoria: ResumenProcesoDto;
  proceso2_FincaReceptoriaCompania: ResumenProcesoDto;
  proceso3_FincaCompania: ResumenProcesoDto;
  proceso4_ReceptoriaCompania: ResumenProcesoDto;
  movimientos: MovimientoLecheDto[];
}

export interface RecoleccionFincaResumenDto {
  recoleccionId: number;
  fincaId: number;
  fincaNombre: string;
  controlRutaId?: number;
  ticketCodigo?: string;
  conductorId?: number;
  conductorNombre?: string;
  camionPlaca?: string;
  litros: number;
  esAcida: boolean;
  tipoLeche?: string;
  createdAt: string;
}

export interface SolicitudRecoleccionExtraordinariaDto {
  id: number;
  fecha: string;
  fincaId: number;
  fincaNombre?: string;
  rutaLogisticaId?: number;
  rutaNombre?: string;
  controlRutaId?: number;
  choferSolicitanteId: number;
  choferSolicitanteNombre?: string;
  camionPlaca?: string;
  motivo?: string;
  estado: string;
  aprobadoPorUsuarioId?: number;
  aprobadoPorNombre?: string;
  fechaAprobacion?: string;
  createdAt: string;
}

export interface CrearSolicitudExtraordinariaDto {
  fincaId: number;
  rutaLogisticaId?: number;
  controlRutaId?: number;
  motivo?: string;
}




