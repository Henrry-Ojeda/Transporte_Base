/**
 * Utilidades para orden cronológico y trazabilidad temporal en Timelapse y listas de paradas.
 */

/**
 * Obtiene el timestamp numérico representativo de una parada de ticket para orden cronológico.
 * Da prioridad a la fecha de modificación (cuando se registraron los litros por primera vez),
 * luego a la fecha de creación (cuando se agregó la finca al ticket), y finalmente a la fecha base o id.
 */
export const getTimestampParada = (p: any): number => {
  if (!p) return 0;
  const lts = Number(p.litros ?? p.Litros ?? p.litrosLeche ?? p.litrosCargados ?? 0);

  // 1. Si ya tiene litros registrados (> 0): la fecha en que se registraron los litros
  if (lts > 0 && !p.esPlanificada) {
    const rawMod = p.modifiedAt || p.ModifiedAt;
    if (rawMod) {
      const t = new Date(rawMod).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
  }

  // 2. Fecha de creación de la parada en el ticket (cuando se agregó libre o asignada por admin)
  const rawCre = p.createdAt || p.CreatedAt;
  if (rawCre) {
    const t = new Date(rawCre).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 3. Fallback a fecha general del registro
  const rawF = p.fecha || p.Fecha;
  if (rawF) {
    const t = new Date(rawF).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  return Number(p.id || p.Id || 0);
};

/**
 * Formatea la fecha y hora de creación o primera recolección de litros de la parada:
 * Formato: "10/11/2026 07:08 PM" o "10/11 07:08 PM"
 */
export const formatFechaHoraParada = (p: any, incluirAnio = false): string => {
  if (!p) return '';
  const ts = getTimestampParada(p);
  if (!ts || ts < 100000) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';

  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  let horas = d.getHours();
  const minutos = String(d.getMinutes()).padStart(2, '0');
  const ampm = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12;
  horas = horas ? horas : 12;
  const horaStr = String(horas).padStart(2, '0');

  return incluirAnio
    ? `${dia}/${mes}/${anio} ${horaStr}:${minutos} ${ampm}`
    : `${dia}/${mes} ${horaStr}:${minutos} ${ampm}`;
};

