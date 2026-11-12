/**
 * Utilidades para orden cronológico y trazabilidad temporal en Timelapse y listas de paradas.
 */

/**
 * Parsea componentes directos de fecha y hora sin desvío de zona horaria UTC.
 * Como el backend almacena GETDATE() (hora local de Venezuela), extraer los componentes
 * directos del ISO string evita que JavaScript le reste 4 horas.
 */
export const parseRawDateComponents = (raw: any): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  ampm: string;
  horaStr: string;
  minutoStr: string;
  formatted: string;
} | null => {
  if (!raw) return null;

  if (typeof raw === 'string') {
    // Si viene solo hora: "14:30" o "02:30 PM"
    const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const ap = timeMatch[3] ? timeMatch[3].toUpperCase() : (h >= 12 ? 'PM' : 'AM');
      h = h % 12;
      h = h ? h : 12;
      const hStr = String(h).padStart(2, '0');
      const mStr = String(m).padStart(2, '0');
      return {
        year: 0,
        month: 0,
        day: 0,
        hours: h,
        minutes: m,
        ampm: ap,
        horaStr: hStr,
        minutoStr: mStr,
        formatted: `${hStr}:${mStr} ${ap}`,
      };
    }

    // Formato ISO estándar: YYYY-MM-DD[T ]HH:mm:ss
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      let hours = parseInt(isoMatch[4], 10);
      const minutes = parseInt(isoMatch[5], 10);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const hStr = String(hours).padStart(2, '0');
      const mStr = String(minutes).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const monStr = String(month).padStart(2, '0');
      return {
        year,
        month,
        day,
        hours,
        minutes,
        ampm,
        horaStr: hStr,
        minutoStr: mStr,
        formatted: `${dStr}/${monStr} ${hStr}:${mStr} ${ampm}`,
      };
    }
  }

  // Fallback si es número o Date
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  const dia = d.getDate();
  const mes = d.getMonth() + 1;
  const anio = d.getFullYear();
  let horas = d.getHours();
  const minutos = d.getMinutes();
  const ampm = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12;
  horas = horas ? horas : 12;
  const hStr = String(horas).padStart(2, '0');
  const mStr = String(minutos).padStart(2, '0');
  const dStr = String(dia).padStart(2, '0');
  const monStr = String(mes).padStart(2, '0');

  return {
    year: anio,
    month: mes,
    day: dia,
    hours: horas,
    minutes: minutos,
    ampm,
    horaStr: hStr,
    minutoStr: mStr,
    formatted: `${dStr}/${monStr} ${hStr}:${mStr} ${ampm}`,
  };
};

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
      const parsed = parseRawDateComponents(rawMod);
      if (parsed && parsed.year > 2000) {
        return new Date(parsed.year, parsed.month - 1, parsed.day, (parsed.ampm === 'PM' && parsed.hours !== 12 ? parsed.hours + 12 : (parsed.ampm === 'AM' && parsed.hours === 12 ? 0 : parsed.hours)), parsed.minutes).getTime();
      }
      const t = new Date(rawMod).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
  }

  // 2. Fecha de creación de la parada en el ticket (cuando se agregó libre o asignada por admin)
  const rawCre = p.createdAt || p.CreatedAt;
  if (rawCre) {
    const parsed = parseRawDateComponents(rawCre);
    if (parsed && parsed.year > 2000) {
      return new Date(parsed.year, parsed.month - 1, parsed.day, (parsed.ampm === 'PM' && parsed.hours !== 12 ? parsed.hours + 12 : (parsed.ampm === 'AM' && parsed.hours === 12 ? 0 : parsed.hours)), parsed.minutes).getTime();
    }
    const t = new Date(rawCre).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 3. Fallback a fecha general del registro
  const rawF = p.fecha || p.Fecha;
  if (rawF) {
    const parsed = parseRawDateComponents(rawF);
    if (parsed && parsed.year > 2000) {
      return new Date(parsed.year, parsed.month - 1, parsed.day, (parsed.ampm === 'PM' && parsed.hours !== 12 ? parsed.hours + 12 : (parsed.ampm === 'AM' && parsed.hours === 12 ? 0 : parsed.hours)), parsed.minutes).getTime();
    }
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

  // 1. Si la parada tiene hora explícita string ("14:30", "02:30 PM")
  if (p.hora || p.Hora) {
    const parsed = parseRawDateComponents(p.hora || p.Hora);
    if (parsed) return parsed.formatted;
  }

  // 2. Probar raw modifiedAt o createdAt
  const rawDate = p.modifiedAt || p.ModifiedAt || p.createdAt || p.CreatedAt || p.fecha || p.Fecha;
  if (rawDate) {
    const parsed = parseRawDateComponents(rawDate);
    if (parsed && parsed.year > 2000) {
      const dStr = String(parsed.day).padStart(2, '0');
      const monStr = String(parsed.month).padStart(2, '0');
      return incluirAnio
        ? `${dStr}/${monStr}/${parsed.year} ${parsed.horaStr}:${parsed.minutoStr} ${parsed.ampm}`
        : `${dStr}/${monStr} ${parsed.horaStr}:${parsed.minutoStr} ${parsed.ampm}`;
    }
  }

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

