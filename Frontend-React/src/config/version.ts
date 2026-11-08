/**
 * Sistema Centralizado de Versionado Semántico
 * 
 * Reglas de Versionado del Proyecto:
 * 1. Solo cambio de Diseño (UI/Estilos/Visual): 2.1.1 -> 2.1.2 (Patch)
 * 2. Cambio de Diseño y Lógica (Funciones/Hooks/Flujos): 2.1.x -> 2.2.1 (Minor)
 * 3. Cambio de Estructura (Arquitectura/Base de Datos/Módulos mayores): 2.x.x -> 3.1.1 (Major)
 */

export type TipoCambioVersion = 'DISEÑO' | 'DISEÑO_LOGICA' | 'ESTRUCTURA';

export interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  tag: string;
  ultimaActualizacion: string;
  tipoUltimoCambio: TipoCambioVersion;
  descripcion: string;
}

export const VERSION_DATA: VersionInfo = {
  major: 3,
  minor: 1,
  patch: 1,
  tag: 'v3.1.1',
  ultimaActualizacion: '2026-11-08',
  tipoUltimoCambio: 'ESTRUCTURA',
  descripcion: 'Arquitectura de Base de Datos Local IndexedDB y Motor de Sincronización Bidireccional Multi-Rol (Chofer, Taller, Receptoría, Admin/SuperAdmin)',
};

export const APP_VERSION = VERSION_DATA.tag;

/**
 * Calcula la siguiente versión según la regla del proyecto
 */
export function calcularSiguienteVersion(versionActual: string, tipo: TipoCambioVersion): string {
  const limpia = versionActual.replace(/^v/i, '');
  const [majStr, minStr, patStr] = limpia.split('.').map(Number);
  let major = isNaN(majStr) ? 2 : majStr;
  let minor = isNaN(minStr) ? 2 : minStr;
  let patch = isNaN(patStr) ? 1 : patStr;

  switch (tipo) {
    case 'DISEÑO':
      // 2.1.1 -> 2.1.2
      patch += 1;
      break;
    case 'DISEÑO_LOGICA':
      // 2.1.x -> 2.2.1
      minor += 1;
      patch = 1;
      break;
    case 'ESTRUCTURA':
      // 2.x.x -> 3.1.1
      major += 1;
      minor = 1;
      patch = 1;
      break;
  }

  return `v${major}.${minor}.${patch}`;
}

export default APP_VERSION;
