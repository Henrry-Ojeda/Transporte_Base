import type { ControlRutaDto } from '@/types';

/**
 * Determina estrictamente si un viaje de ruta ha concluido su fase de recolección en campo
 * y ha sido efectivamente despachado / enviado a Receptoría de Planta.
 * 
 * REGLA MAESTRA DE NEGOCIO:
 * Los procesos operativos se respetan obligatoriamente (incluso para ADMIN y SUPER ADMIN).
 * Si un chofer aún no ha terminado la ruta ni ha enviado el viaje a receptoría,
 * la vista de Receptoría NO debe permitir verificar litros ni descargar en silos.
 */
export const viajeEstaEnviadoAReceptoria = (viaje: Partial<ControlRutaDto> | any): boolean => {
  if (!viaje) return false;

  const procesoId = Number(viaje.procesoActualId || viaje.ProcesoActualId || 1);
  const estado = String(viaje.estado || viaje.Estado || '').toUpperCase().trim();
  const codigoProceso = String(viaje.codigoProceso || viaje.CodigoProceso || '').toUpperCase().trim();
  const tipoDestino = String(viaje.tipoDestino || viaje.TipoDestino || '').toUpperCase().trim();
  const fechaLlegada = viaje.fechaLlegadaReceptoria || viaje.FechaLlegadaReceptoria;

  // Si tiene llegada registrada a receptoría o destino fijado a RECEPTORIA
  if (fechaLlegada || tipoDestino === 'RECEPTORIA') return true;

  // ProcesoActualId: 1 = En Ruta / Recolección, 2 = Recibido / Llegada Receptoría, 3 = Descargado / Verificado, 4 = Finalizado
  if (procesoId >= 2) return true;

  // Si los códigos de proceso o estado indican que ya arribó a receptoría o está finalizado
  if (
    codigoProceso === 'RECIBIDO' ||
    codigoProceso === 'EN_RECEPTORIA' ||
    codigoProceso === 'ENTREGADO' ||
    codigoProceso === 'FINALIZADO'
  ) {
    return true;
  }

  if (
    estado === 'RECIBIDO' ||
    estado === 'EN RECEPTORIA' ||
    estado === 'ENTREGADO' ||
    estado === 'FINALIZADO' ||
    estado === 'CERRADO'
  ) {
    return true;
  }

  return false;
};
