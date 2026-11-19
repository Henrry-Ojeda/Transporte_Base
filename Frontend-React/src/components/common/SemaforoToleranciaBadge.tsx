import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { sistemaApi } from '@/api/sistema.api';
import { useAuthStore } from '@/stores/authStore';

interface SemaforoToleranciaBadgeProps {
  litrosEsperados: number;
  litrosReales: number;
  etiqueta?: string;
  compact?: boolean;
}

/**
 * Semáforo Operativo de Tolerancia de Merma (Módulo SaaS: MOD_TOLERANCIA_MERMA)
 * - Verde: Sin faltante (0% o sobrante)
 * - Amarillo: Faltante > 0 y <= TOLERANCIA_MERMA_PCT
 * - Rojo: Faltante > TOLERANCIA_MERMA_PCT
 */
export const SemaforoToleranciaBadge: React.FC<SemaforoToleranciaBadgeProps> = ({
  litrosEsperados,
  litrosReales,
  etiqueta,
  compact = false,
}) => {
  const hasTolerancia = useAuthStore((s) => s.hasTenantModule('MOD_TOLERANCIA_MERMA'));

  const { data: parametros = [] } = useQuery<any[]>({
    queryKey: ['parametros-tolerancia-merma'],
    queryFn: () => sistemaApi.getConfiguracion().catch(() => []),
    staleTime: 1000 * 60 * 10,
    enabled: hasTolerancia,
  });

  if (!hasTolerancia || !litrosEsperados || litrosEsperados <= 0 || !litrosReales || litrosReales <= 0) {
    return null;
  }

  const paramTol = parametros.find(
    (p: any) => String(p.clave || p.Clave || '').toUpperCase() === 'TOLERANCIA_MERMA_PCT'
  );
  const toleranciaPct = Number(paramTol?.valor ?? paramTol?.Valor ?? 1.5) || 1.5;

  const diff = litrosReales - litrosEsperados; // negativo = faltante/merma
  const faltante = diff < 0 ? Math.abs(diff) : 0;
  const pctFaltante = litrosEsperados > 0 ? (faltante / litrosEsperados) * 100 : 0;

  let estado: 'VERDE' | 'AMARILLO' | 'ROJO' = 'VERDE';
  if (faltante > 0) {
    estado = pctFaltante <= toleranciaPct ? 'AMARILLO' : 'ROJO';
  }

  const estilos = {
    VERDE: { bg: '#dcfce7', color: '#15803d', border: '#86efac', dot: '#16a34a', texto: diff > 0 ? `Sobrante +${diff.toLocaleString()} L` : 'Sin merma (0%)' },
    AMARILLO: { bg: '#fef3c7', color: '#b45309', border: '#fcd34d', dot: '#f59e0b', texto: `Dentro de tolerancia (-${faltante.toLocaleString()} L • ${pctFaltante.toFixed(2)}% ≤ ${toleranciaPct}%)` },
    ROJO: { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', dot: '#ef4444', texto: `Excede tolerancia (-${faltante.toLocaleString()} L • ${pctFaltante.toFixed(2)}% > ${toleranciaPct}%)` },
  }[estado];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: compact ? '2px 8px' : '4px 10px',
        borderRadius: '999px',
        background: estilos.bg,
        color: estilos.color,
        border: `1px solid ${estilos.border}`,
        fontSize: compact ? '10.5px' : '11.5px',
        fontWeight: 800,
        lineHeight: 1.2,
      }}
      title={`Tolerancia configurada: ${toleranciaPct}% | Esperado: ${litrosEsperados.toLocaleString()} L | Real: ${litrosReales.toLocaleString()} L`}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: estilos.dot,
          flexShrink: 0,
        }}
      />
      <span>
        {etiqueta ? `${etiqueta}: ` : ''}
        {estilos.texto}
      </span>
    </span>
  );
};
