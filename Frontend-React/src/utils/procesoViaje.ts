import type { ControlRutaDto } from '@/types';

/**
 * Detecta de forma inteligente y dinámica si una compañía o nombre de destino
 * corresponde a la Planta / Receptoría Principal del sistema SaaS
 * (ej: Lácteos Campo Verde, Vergel Carrillo, Silos de Recepción, Planta Matriz, etc.)
 */
export const esReceptoriaPrincipal = (nombreOCompania: any): boolean => {
  if (!nombreOCompania) return false;
  let nom = '';
  if (typeof nombreOCompania === 'string') {
    nom = nombreOCompania.toUpperCase().trim();
  } else if (typeof nombreOCompania === 'object') {
    nom = String(
      nombreOCompania.nombre ||
      nombreOCompania.nombreCompania ||
      nombreOCompania.companiaNombre ||
      nombreOCompania.nombreCompaniaDestino ||
      ''
    ).toUpperCase().trim();
    if (
      nombreOCompania.esPrincipal === true ||
      nombreOCompania.EsPrincipal === true ||
      nombreOCompania.esPrincipal === 1 ||
      nombreOCompania.EsPrincipal === 1 ||
      nombreOCompania.esReceptoria === true ||
      Number(nombreOCompania.id || nombreOCompania.companiaId) === 5028
    ) {
      return true;
    }
  }
  if (!nom) return false;

  return (
    nom.includes('RECEPTORIA') ||
    nom.includes('RECEPTORÍA') ||
    nom.includes('CAMPO VERDE') ||
    nom.includes('CAMPOVERDE') ||
    nom.includes('VERGEL') ||
    nom.includes('PLANTA') ||
    nom.includes('MATRIZ') ||
    nom.includes('SILO') ||
    nom.includes('BASE')
  );
};

/**
 * Determina estrictamente si un viaje de ruta ha concluido su fase de recolección en campo
 * y ha sido efectivamente despachado / enviado a Receptoría de Planta o Compañía.
 * 
 * REGLA MAESTRA DE NEGOCIO:
 * Los procesos operativos se respetan obligatoriamente (incluso para ADMIN y SUPER ADMIN).
 * Si un chofer aún no ha terminado la ruta ni ha enviado el viaje a receptoría o compañía,
 * la vista de Receptoría NO debe permitir verificar litros ni descargar en silos.
 */
export const viajeEstaEnviadoAReceptoria = (viaje: Partial<ControlRutaDto> | any): boolean => {
  if (!viaje) return false;

  const procesoId = Number(viaje.procesoActualId || viaje.ProcesoActualId || 1);
  const estado = String(viaje.estado || viaje.Estado || '').toUpperCase().trim();
  const codigoProceso = String(viaje.codigoProceso || viaje.CodigoProceso || '').toUpperCase().trim();
  const tipoDestino = String(viaje.tipoDestino || viaje.TipoDestino || '').toUpperCase().trim();
  const fechaLlegada = viaje.fechaLlegadaReceptoria || viaje.FechaLlegadaReceptoria;
  const nomDestino = String(
    viaje.nombreCompaniaDestino ||
    viaje.NombreCompaniaDestino ||
    viaje.companiaNombre ||
    viaje.nombreCompania ||
    ''
  ).toUpperCase().trim();

  // Si tiene llegada registrada a receptoría o destino fijado a RECEPTORIA o Receptoría Principal
  if (fechaLlegada || tipoDestino === 'RECEPTORIA' || esReceptoriaPrincipal(nomDestino)) {
    return true;
  }

  // ProcesoActualId: 1 = En Ruta / Recolección, 2 = Recibido / Llegada Receptoría, 3 = Descargado / Despachado, 4 = Finalizado
  if (procesoId >= 2) return true;

  // Si los códigos de proceso o estado indican que ya arribó a receptoría o está despachado / finalizado
  if (
    codigoProceso === 'RECIBIDO' ||
    codigoProceso === 'EN_RECEPTORIA' ||
    codigoProceso === 'COMPANIA' ||
    codigoProceso === 'EN_VIA' ||
    codigoProceso === 'RECEPCIONADO' ||
    codigoProceso === 'ENTREGADO' ||
    codigoProceso === 'FINALIZADO'
  ) {
    return true;
  }

  if (
    estado === 'RECIBIDO' ||
    estado === 'EN RECEPTORIA' ||
    estado === 'RECEPCIONADO' ||
    estado === 'EN VIA' ||
    estado === 'ENTREGADO' ||
    estado === 'FINALIZADO' ||
    estado === 'CERRADO'
  ) {
    return true;
  }

  return false;
};


