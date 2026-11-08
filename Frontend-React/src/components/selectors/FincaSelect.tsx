import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { catalogosApi } from '@/api/catalogos.api';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';
import type { FincaDto } from '@/types';

interface FincaSelectProps {
  value: number | string | undefined | null;
  onChange: (value: number, finca?: FincaDto) => void;
  rutaLogisticaId?: number | null;
  rutasLogisticasIds?: number[] | null;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
  className?: string;
  dropDirection?: 'auto' | 'down' | 'up';
}

export const FincaSelect: React.FC<FincaSelectProps> = ({
  value,
  onChange,
  rutaLogisticaId,
  rutasLogisticasIds,
  placeholder = '-- Seleccionar Finca Ganadera --',
  searchPlaceholder = 'Buscar finca por nombre o productor...',
  disabled = false,
  required = false,
  allowClear = true,
  style,
  className,
  dropDirection = 'down',
}) => {
  const { data: fincas = [], isLoading } = useQuery<FincaDto[]>({
    queryKey: ['fincas-catalogos'],
    queryFn: () => catalogosApi.getFincas(true),
    staleTime: 1000 * 60 * 5,
  });

  const idsRutasEfectivas = useMemo(() => {
    const list: number[] = [];
    if (rutaLogisticaId && rutaLogisticaId > 0) list.push(rutaLogisticaId);
    if (rutasLogisticasIds && rutasLogisticasIds.length > 0) {
      rutasLogisticasIds.forEach((id) => {
        if (id > 0 && !list.includes(id)) list.push(id);
      });
    }
    return list;
  }, [rutaLogisticaId, rutasLogisticasIds]);

  const options: SelectOption[] = useMemo(() => {
    const sorted = [...fincas].sort((a, b) => {
      if (idsRutasEfectivas.length > 0) {
        const aEnRuta = a.rutaId ? idsRutasEfectivas.includes(a.rutaId) : false;
        const bEnRuta = b.rutaId ? idsRutasEfectivas.includes(b.rutaId) : false;
        if (aEnRuta && !bEnRuta) return -1;
        if (!aEnRuta && bEnRuta) return 1;
      }
      return a.nombre.localeCompare(b.nombre);
    });

    return sorted.map((f) => {
      const esDeRutaActual = f.rutaId ? idsRutasEfectivas.includes(f.rutaId) : false;
      return {
        value: f.id,
        label: f.nombre,
        subLabel: f.propietarioNombre ? `Ganadero: ${f.propietarioNombre}` : (f.rutaNombre ? `Ruta: ${f.rutaNombre}` : undefined),
        badge: esDeRutaActual ? '⭐ En esta ruta' : (f.tipoLeche === 'BUFALA' ? '🐃 BÚFALA' : '🥛 VACA'),
      };
    });
  }, [fincas, idsRutasEfectivas]);

  const handleChange = (val: string | number) => {
    const num = Number(val) || 0;
    const match = fincas.find((f) => f.id === num);
    onChange(num, match);
  };

  return (
    <SearchableSelect
      options={options}
      value={value ? Number(value) : ''}
      onChange={handleChange}
      placeholder={isLoading ? 'Cargando fincas...' : placeholder}
      searchPlaceholder={searchPlaceholder}
      disabled={disabled || isLoading}
      required={required}
      allowClear={allowClear}
      style={style}
      className={className}
      dropDirection={dropDirection}
    />
  );
};

