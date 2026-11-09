import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { catalogosApi } from '@/api/catalogos.api';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';

interface ChoferSelectProps {
  value: number | string | undefined | null;
  onChange: (value: number, chofer?: any) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
  className?: string;
  dropDirection?: 'auto' | 'down' | 'up';
}

export const ChoferSelect: React.FC<ChoferSelectProps> = ({
  value,
  onChange,
  placeholder = '-- Seleccionar Conductor / Chofer --',
  searchPlaceholder = 'Buscar chofer por nombre...',
  disabled = false,
  required = false,
  allowClear = true,
  style,
  className,
  dropDirection = 'down',
}) => {
  const { data: choferes = [], isLoading } = useQuery<any[]>({
    queryKey: ['choferes-catalogos'],
    queryFn: () => catalogosApi.getChoferes(),
    staleTime: 1000 * 60 * 5,
  });

  const options: SelectOption[] = useMemo(() => {
    const seen = new Set<number>();
    const opts: SelectOption[] = [];
    for (const u of choferes) {
      if (!u || !u.id || seen.has(u.id)) continue;
      seen.add(u.id);
      opts.push({
        value: u.id,
        label: u.nombreCompleto || u.nombre || u.nombreUsuario || `Chofer #${u.id}`,
        subLabel: u.nombreUsuario ? `Usuario: ${u.nombreUsuario} | Rol: ${u.rol || 'CHOFER'}` : undefined,
      });
    }
    return opts;
  }, [choferes]);

  const handleChange = (val: string | number) => {
    const num = Number(val) || 0;
    const match = choferes.find((u) => u.id === num);
    onChange(num, match);
  };

  return (
    <SearchableSelect
      options={options}
      value={value ? Number(value) : ''}
      onChange={handleChange}
      placeholder={isLoading ? 'Cargando conductores...' : placeholder}
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

