export const fmtUSD = (val: number | string | null | undefined): string =>
  `$${Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtBs = (val: number | string | null | undefined): string =>
  `${Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;

export const fmtNum = (val: number | string | null | undefined, decimals = 0): string =>
  Number(val || 0).toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export const fmtLitros = (val: number | string | null | undefined): string =>
  `${Number(val || 0).toLocaleString('es-VE')} L`;

export const fmtFecha = (val: string | Date | null | undefined): string => {
  if (!val) return '-';
  const d = typeof val === 'string' ? new Date(val) : val;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-VE');
};

export const fmtFechaHora = (val: string | Date | null | undefined): string => {
  if (!val) return '-';
  const d = typeof val === 'string' ? new Date(val) : val;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-VE');
};
