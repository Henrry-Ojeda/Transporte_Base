import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { catalogosApi } from '@/api/catalogos.api';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';
import { esReceptoriaPrincipal } from '@/utils/procesoViaje';
import type { CompaniaDto } from '@/types';

interface CompaniaSelectProps {
  value: number | string | undefined | null;
  onChange: (value: number, compania?: CompaniaDto) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const CompaniaSelect: React.FC<CompaniaSelectProps> = ({
  value,
  onChange,
  placeholder = '-- Seleccionar Compañía / Planta --',
  searchPlaceholder = 'Buscar planta o compañía...',
  disabled = false,
  required = false,
  allowClear = true,
  style,
  className,
}) => {
  const { data: companias = [], isLoading } = useQuery<CompaniaDto[]>({
    queryKey: ['companias-catalogos'],
    queryFn: () => catalogosApi.getCompanias(true),
    staleTime: 1000 * 60 * 5,
  });

  const options: SelectOption[] = useMemo(() => {
    return companias.map((c) => {
      const esRecep = esReceptoriaPrincipal(c);
      return {
        value: c.id,
        label: esRecep ? `🏢 ${c.nombre} (Receptoría Principal)` : c.nombre,
        subLabel: esRecep
          ? '🏢 Planta Matriz / Receptoría Principal de Silos'
          : (c.contacto ? `Contacto: ${c.contacto}` : undefined),
      };
    });
  }, [companias]);

  const handleChange = (val: string | number) => {
    const num = Number(val) || 0;
    const match = companias.find((c) => c.id === num);
    onChange(num, match);
  };

  return (
    <SearchableSelect
      options={options}
      value={value ? Number(value) : ''}
      onChange={handleChange}
      placeholder={isLoading ? 'Cargando plantas...' : placeholder}
      searchPlaceholder={searchPlaceholder}
      disabled={disabled || isLoading}
      required={required}
      allowClear={allowClear}
      style={style}
      className={className}
    />
  );
};

