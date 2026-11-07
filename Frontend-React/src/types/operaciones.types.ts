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
  fincas?: { fincaId: number; fincaNombre: string; ordenSecuencia: number }[];
}

export interface DespachoCompaniaDto {
  id: number;
  fecha: string;
  usuarioId?: number;
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
}



