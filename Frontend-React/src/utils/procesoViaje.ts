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
  const fechaLlegada = viaje.fechaLlegadaReceptoria || viaje.FechaLlegadaReceptoria;
  const litrosRecep = Number(viaje.totalLitrosReceptoria || viaje.TotalLitrosReceptoria || 0);

  // 1. ProcesoActualId >= 2 significa que concluyó recolección y pasó a Receptoría (2), Descarga/Despacho (3) o Finalizado (4)
  if (procesoId >= 2) return true;

  // 2. Si tiene fecha de llegada a receptoría registrada o ya se le asignaron litros para receptoría
  if (fechaLlegada != null || litrosRecep > 0) return true;

  // 3. Códigos de proceso o estados que indican que ya arribó a receptoría o está despachado / finalizado
  const estadosEnviado = [
    'RECIBIDO', 'EN RECEPTORIA', 'EN_RECEPTORIA', 'RECEPCIONADO', 
    'EN ESPERA', 'EN_ESPERA_RECEPTORIA', 'POR VERIFICACIÓN', 'POR VERIFICACION', 
    'EN SILOS', 'EN SILO', 'CAMINO_COMPANIA', 'CAMINO A COMPAÑIA', 'EN VIA', 
    'ENTREGADO', 'FINALIZADO', 'CERRADO'
  ];
  if (estadosEnviado.includes(codigoProceso) || estadosEnviado.includes(estado)) {
    return true;
  }

  return false;
};


