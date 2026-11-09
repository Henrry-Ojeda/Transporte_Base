import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { operacionesApi } from '@/api/operaciones.api';
import { finanzasApi } from '@/api/finanzas.api';
import { ControlTanquesPage } from './ControlTanquesPage';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import type { CicloSemanalDto, MovimientoLecheDto, BalanceVolumetricoDto } from '@/types';

export const BalanceLechePage: React.FC = () => {
  const queryClient = useQueryClient();

  // Tab activo: por defecto el Análisis Volumétrico y Balance 1:1
  const [activeTab, setActiveTab] = useState<'auditoria' | 'silos'>('auditoria');

  // Filtros
  const [cicloIdSeleccionado, setCicloIdSeleccionado] = useState<number | undefined>(undefined);
  const [procesoFiltro, setProcesoFiltro] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal Ajustar Stock Inicial
  const [modalStockInicial, setModalStockInicial] = useState(false);
  const [nuevoStockInicialInput, setNuevoStockInicialInput] = useState<number>(0);

  // 1. Cargar lista de ciclos operativos
  const { data: ciclos = [] } = useQuery<CicloSemanalDto[]>({
    queryKey: ['ciclos-semanales'],
    queryFn: () => finanzasApi.getCiclos(),
  });

  // Ciclos ordenados descendente
  const ciclosOrdenados = useMemo(() => {
    return [...ciclos].sort((a, b) => (b.id || 0) - (a.id || 0));
  }, [ciclos]);

  // Ciclo activo por defecto
  const cicloActivo = useMemo(() => {
    return (
      ciclos.find(
        (c) =>
          c.estado?.toUpperCase() === 'ABIERTO' ||
          c.estado?.toUpperCase() === 'ACTIVO' ||
          (c as any).Estado === 'ABIERTO' ||
          (c as any).Estado === 'ACTIVO'
      ) || ciclosOrdenados[0]
    );
  }, [ciclos, ciclosOrdenados]);

  // Si no hay ciclo seleccionado, seleccionar el activo
  useEffect(() => {
    if (!cicloIdSeleccionado && cicloActivo) {
      setCicloIdSeleccionado(cicloActivo.id);
    }
  }, [cicloActivo, cicloIdSeleccionado]);

  // 2. Consulta de Balance Volumétrico 1:1 del backend
  const {
    data: balance,
    isLoading,
    refetch,
  } = useQuery<BalanceVolumetricoDto>({
    queryKey: ['balance-volumetrico-api', cicloIdSeleccionado],
    queryFn: () => operacionesApi.getBalanceVolumetrico(cicloIdSeleccionado),
    enabled: !!cicloIdSeleccionado,
  });

  // Mutación para ajustar stock inicial
  const mutationStockInicial = useMutation({
    mutationFn: async (nuevoStock: number) => {
      const targetCicloId = cicloIdSeleccionado || cicloActivo?.id;
      if (!targetCicloId) throw new Error('No hay un ciclo operativo seleccionado.');
      return operacionesApi.updateStockInicialTanques(targetCicloId, nuevoStock);
    },
    onSuccess: () => {
      toast.success('¡Stock inicial de tanques actualizado con éxito!');
      setModalStockInicial(false);
      queryClient.invalidateQueries({ queryKey: ['balance-volumetrico-api'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Error al actualizar stock inicial');
    },
  });

  // Helper formato numérico
  const fmtNum = (n: number | undefined | null) => (Number(n || 0)).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  // Valores maestros de balance
  const stockActual = balance?.stockActualTanque ?? 0;
  const stockInicial = balance?.stockInicialTanque ?? 0;
  const totalEntradas = balance?.totalEntradasTanque ?? 0;
  const totalSalidas = balance?.totalSalidasTanque ?? 0;
  const totalRecolectado = balance?.totalRecolectadoFincas ?? 0;
  const totalMermaRuta = balance?.totalMermaRuta ?? 0;
  const totalComercializado = balance?.totalComercializadoCompanias ?? 0;
  const totalDirectas = balance?.totalEntregasDirectas ?? 0;
  const descuadre = balance?.diferenciaDescuadre ?? 0;
  const esCuadradoExacto = Math.abs(descuadre) < 0.01;

  // Barra de nivel estético de stock en tanques
  const porcentajeNivelTanque = useMemo(() => {
    if (totalEntradas <= 0) return 50;
    const pct = (stockActual / (totalEntradas || 1)) * 100;
    return Math.min(100, Math.max(5, Math.round(pct)));
  }, [stockActual, totalEntradas]);

  // Resumen de procesos
  const p1 = balance?.proceso1_FincaReceptoria || { totalLitros: 0, cantidadMovimientos: 0, porcentajeDelTotal: 0 };
  const p2 = balance?.proceso2_FincaReceptoriaCompania || { totalLitros: 0, cantidadMovimientos: 0, porcentajeDelTotal: 0 };
  const p3 = balance?.proceso3_FincaCompania || { totalLitros: 0, cantidadMovimientos: 0, porcentajeDelTotal: 0 };
  const p4 = balance?.proceso4_ReceptoriaCompania || { totalLitros: 0, cantidadMovimientos: 0, porcentajeDelTotal: 0 };

  // Movimientos filtrados
  const movimientos = balance?.movimientos || [];
  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((m) => {
      // Filtro por proceso (0 = todos)
      if (procesoFiltro !== 0 && m.tipoProceso !== procesoFiltro) {
        return false;
      }
      // Filtro por texto en vivo
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchTicket = (m.ticketReferencia || '').toLowerCase().includes(term);
        const matchChofer = (m.conductor || '').toLowerCase().includes(term);
        const matchPlaca = (m.camionPlaca || '').toLowerCase().includes(term);
        const matchOrigen = (m.origen || '').toLowerCase().includes(term);
        const matchDestino = (m.destino || '').toLowerCase().includes(term);
        const matchProceso = (m.tipoProcesoNombre || '').toLowerCase().includes(term);
        const matchObs = (m.observacion || '').toLowerCase().includes(term);
        return matchTicket || matchChofer || matchPlaca || matchOrigen || matchDestino || matchProceso || matchObs;
      }
      return true;
    });
  }, [movimientos, procesoFiltro, searchTerm]);

  // Click en tarjeta de proceso para filtrar
  const handleToggleProceso = (tipo: number) => {
    setProcesoFiltro((prev) => (prev === tipo ? 0 : tipo));
  };

  // Exportar Excel / CSV 1:1
  const exportarAuditoriaExcel = () => {
    if (!movimientos || movimientos.length === 0) {
      toast.warning('No hay movimientos registrados para exportar.');
      return;
    }

    const rows = movimientosFiltrados.map((m) => ({
      Fecha: m.fecha ? m.fecha.split('T')[0] : '',
      Proceso: m.tipoProcesoNombre,
      Ticket: m.ticketReferencia || `#${m.id}`,
      Conductor: m.conductor,
      Placa: m.camionPlaca || '',
      Origen: m.origen,
      Destino: m.destino,
      'Entrada Tanque (+)': m.litrosEntradaTanque || 0,
      'Salida Tanque (-)': m.litrosSalidaTanque || 0,
      'Entrega Directa (Ruta)': m.litrosEntregaDirecta || 0,
      'Saldo Tanque': m.saldoTanque || 0,
      'Info Verificación': m.infoVerificacion || '',
      Estado: m.estado || '',
      Observación: m.observacion || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BalanceVolumetrico');
    const codigoCiclo = balance?.codigoCiclo ? balance.codigoCiclo.replace(/\s+/g, '_') : 'Ciclo';
    XLSX.writeFile(wb, `Balance_Volumetrico_Receptoria_${codigoCiclo}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('¡Auditoría volumétrica exportada exitosamente!');
  };

  // Badges y estilos por proceso
  const getBadgeProceso = (tipo: number, nombre?: string) => {
    switch (tipo) {
      case 0:
        return { label: '📦 Stock Inicial', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
      case 1:
        return { label: '📥 1. Finca ➔ Receptoría', bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' };
      case 2:
        return { label: '🔄 2. Finca ➔ Recept ➔ Cía', bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe' };
      case 3:
        return { label: '🚛 3. Finca ➔ Cía (Directa)', bg: '#ffedd5', color: '#ea580c', border: '#fed7aa' };
      case 4:
        return { label: '📤 4. Receptoría ➔ Cía', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
      default:
        return { label: nombre || `Proceso ${tipo}`, bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
    }
  };

  // Columnas para DataTable (Master Rule #2)
  const columns: ColumnDef<MovimientoLecheDto>[] = [
    {
      header: 'Fecha',
      accessorKey: 'fecha',
      sortable: true,
      cell: (row) => (
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
          {row.fecha ? row.fecha.split('T')[0] : '-'}
        </span>
      ),
    },
    {
      header: 'Proceso',
      accessorKey: 'tipoProceso',
      sortable: true,
      cell: (row) => {
        const b = getBadgeProceso(row.tipoProceso, row.tipoProcesoNombre);
        return (
          <span
            className="badge"
            style={{
              background: b.bg,
              color: b.color,
              border: `1px solid ${b.border}`,
              fontWeight: 800,
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            {b.label}
          </span>
        );
      },
    },
    {
      header: 'Referencia / Ticket',
      accessorKey: 'ticketReferencia',
      sortable: true,
      cell: (row) => (
        <strong style={{ color: '#0f172a', fontFamily: 'monospace', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
          {row.ticketReferencia || `#${row.id}`}
        </strong>
      ),
    },
    {
      header: 'Conductor & Vehículo',
      accessorKey: 'conductor',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '12.5px' }}>{row.conductor || 'Sin Chofer'}</div>
          {row.camionPlaca && (
            <small style={{ color: '#64748b', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-truck" style={{ fontSize: '10px' }}></i> {row.camionPlaca}
            </small>
          )}
        </div>
      ),
    },
    {
      header: 'Origen ➔ Destino',
      cell: (row) => (
        <div style={{ fontSize: '12px' }}>
          <span style={{ color: '#475569', fontWeight: 600 }}>{row.origen}</span>
          <i className="fa-solid fa-arrow-right" style={{ color: '#94a3b8', margin: '0 6px', fontSize: '10px' }}></i>
          <strong style={{ color: '#0f172a' }}>{row.destino}</strong>
        </div>
      ),
    },
    {
      header: 'Entrada (+)',
      accessorKey: 'litrosEntradaTanque',
      sortable: true,
      cell: (row) => {
        if (!row.litrosEntradaTanque || row.litrosEntradaTanque <= 0) {
          return <span style={{ color: '#cbd5e1' }}>-</span>;
        }
        return (
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: '#16a34a', fontWeight: 800, fontFamily: 'monospace', fontSize: '13px' }}>
              +{fmtNum(row.litrosEntradaTanque)} Lts
            </span>
            {row.infoVerificacion && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#0369a1',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  marginTop: '2px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <i className="fa-solid fa-scale-balanced" style={{ marginRight: '3px' }}></i>
                {row.infoVerificacion}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Salida (-)',
      accessorKey: 'litrosSalidaTanque',
      sortable: true,
      cell: (row) => {
        if (!row.litrosSalidaTanque || row.litrosSalidaTanque <= 0) {
          return <span style={{ color: '#cbd5e1' }}>-</span>;
        }
        return (
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: '#dc2626', fontWeight: 800, fontFamily: 'monospace', fontSize: '13px' }}>
              -{fmtNum(row.litrosSalidaTanque)} Lts
            </span>
            {row.infoVerificacion && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#4338ca',
                  background: '#eef2ff',
                  border: '1px solid #c7d2fe',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  marginTop: '2px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <i className="fa-solid fa-clipboard-check" style={{ marginRight: '3px' }}></i>
                {row.infoVerificacion}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Directa (Ruta)',
      accessorKey: 'litrosEntregaDirecta',
      sortable: true,
      cell: (row) => {
        if (!row.litrosEntregaDirecta || row.litrosEntregaDirecta <= 0) {
          return <span style={{ color: '#cbd5e1' }}>-</span>;
        }
        return (
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: '#0284c7', fontWeight: 800, fontFamily: 'monospace', fontSize: '13px' }}>
              {fmtNum(row.litrosEntregaDirecta)} Lts
            </span>
          </div>
        );
      },
    },
    {
      header: 'Saldo Tanque',
      accessorKey: 'saldoTanque',
      sortable: true,
      cell: (row) => {
        const esNegativo = (row.saldoTanque || 0) < 0;
        return (
          <div style={{ textAlign: 'right' }}>
            <span
              className="badge"
              style={{
                background: esNegativo ? '#450a0a' : '#0f172a',
                color: esNegativo ? '#ef4444' : '#38bdf8',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: '6px',
                display: 'inline-block',
              }}
            >
              {fmtNum(row.saldoTanque)} Lts
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      {/* PESTAÑAS DE VISTA: ANÁLISIS VOLUMÉTRICO VS FORMULARIO SILOS-01 */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('auditoria')}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: 800,
            borderBottom: activeTab === 'auditoria' ? '3px solid #0284c7' : 'none',
            color: activeTab === 'auditoria' ? '#0284c7' : '#64748b',
            background: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-chart-line"></i> Análisis Volumétrico y Balance de Tanques
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('silos')}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: 800,
            borderBottom: activeTab === 'silos' ? '3px solid #0284c7' : 'none',
            color: activeTab === 'silos' ? '#0284c7' : '#64748b',
            background: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-clipboard-list"></i> Formulario Silos-01 (Control Diario Receptoría)
        </button>
      </div>

      {activeTab === 'silos' ? (
        <ControlTanquesPage />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* VISTA 1:1 REPLICADA DE C:\Users\Usuario\Downloads\Transporte_V2_3_11_26   */}
          {/* ========================================================================= */}

          {/* HEADER 1:1 */}
          <div
            className="view-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span
                  className="badge"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '20px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  <i className="fa-solid fa-scale-balanced" style={{ marginRight: '4px' }}></i> Conciliación y Custodia 100%
                </span>
                <span
                  id="badgeCuadraturaGlobal"
                  className="badge"
                  style={{
                    background: esCuadradoExacto ? '#10b981' : '#ef4444',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '20px',
                  }}
                >
                  <i className={esCuadradoExacto ? 'fa-solid fa-check-double' : 'fa-solid fa-triangle-exclamation'} style={{ marginRight: '4px' }}></i>
                  {esCuadradoExacto
                    ? 'CUADRATURA EXACTA: 0 LTS FALTANTES'
                    : `DESCUADRE DETECTADO: ${fmtNum(descuadre)} LTS`}
                </span>
              </div>
              <h1
                className="view-title"
                style={{
                  fontSize: '26px',
                  fontWeight: 900,
                  color: '#0f172a',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <i className="fa-solid fa-chart-line" style={{ color: '#0284c7' }}></i>
                Análisis Volumétrico y Balance de Tanques
              </h1>
              <p className="view-subtitle" style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
                Control litro a litro de entradas, salidas, transferencias y stock físico permanente en receptoría según los 4 procesos operativos.
              </p>
            </div>

            {/* ACCIONES RÁPIDAS SUPERIORES */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => refetch()}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, borderRadius: '10px', padding: '9px 16px' }}
              >
                <i className="fa-solid fa-rotate"></i> Actualizar Balance
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={exportarAuditoriaExcel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  borderRadius: '10px',
                  padding: '9px 16px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                }}
              >
                <i className="fa-solid fa-file-excel"></i> Exportar Auditoría
              </button>
            </div>
          </div>

          {/* BARRA DE FILTROS SUPERIOR */}
          <div
            className="content-card"
            style={{
              marginBottom: '24px',
              padding: '16px 20px',
              borderRadius: '14px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {/* Selector de Ciclo */}
                <div>
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    <i className="fa-regular fa-calendar-check" style={{ color: '#0284c7', marginRight: '4px' }}></i> Ciclo Operativo / Semana:
                  </label>
                  <select
                    value={cicloIdSeleccionado || ''}
                    onChange={(e) => setCicloIdSeleccionado(e.target.value ? Number(e.target.value) : undefined)}
                    className="form-input"
                    style={{
                      height: '40px',
                      minWidth: '280px',
                      fontWeight: 700,
                      fontSize: '13.5px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      background: '#f8fafc',
                    }}
                  >
                    {ciclosOrdenados.map((c) => {
                      const esActivo =
                        c.id === cicloActivo?.id ||
                        c.estado?.toUpperCase() === 'ABIERTO' ||
                        c.estado?.toUpperCase() === 'ACTIVO' ||
                        (c as any).Estado === 'ABIERTO' ||
                        (c as any).Estado === 'ACTIVO';
                      const fIni = c.fechaInicio ? new Date(c.fechaInicio).toLocaleDateString('es-VE') : '';
                      const fFin = c.fechaFin ? new Date(c.fechaFin).toLocaleDateString('es-VE') : '';
                      return (
                        <option key={c.id} value={c.id}>
                          Semana #{c.numeroSemana || c.id} ({fIni} al {fFin}) {esActivo ? '★ ACTIVO' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Filtro de Proceso Rápido */}
                <div>
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    <i className="fa-solid fa-diagram-project" style={{ color: '#8b5cf6', marginRight: '4px' }}></i> Filtrar por Proceso:
                  </label>
                  <select
                    value={procesoFiltro}
                    onChange={(e) => setProcesoFiltro(Number(e.target.value))}
                    className="form-input"
                    style={{
                      height: '40px',
                      minWidth: '250px',
                      fontWeight: 700,
                      fontSize: '13.5px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      background: '#f8fafc',
                    }}
                  >
                    <option value="0">⚡ Todos los Procesos (4)</option>
                    <option value="1">📥 1. Finca ➔ Receptoría (Descarga Tanque)</option>
                    <option value="2">🔄 2. Finca ➔ Receptoría ➔ Compañía (Tránsito)</option>
                    <option value="3">🚛 3. Finca ➔ Compañía (Entrega Directa)</option>
                    <option value="4">📤 4. Receptoría ➔ Compañía (Despacho Tanque)</option>
                  </select>
                </div>
              </div>

              {/* Buscador en Vivo */}
              <div style={{ flex: 1, minWidth: '260px', maxWidth: '400px' }}>
                <label
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  <i className="fa-solid fa-magnifying-glass" style={{ color: '#64748b', marginRight: '4px' }}></i> Búsqueda en Vivo:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por ticket, chofer, finca o compañía..."
                    className="form-input"
                    style={{
                      height: '40px',
                      width: '100%',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      paddingLeft: '36px',
                    }}
                  />
                  <i
                    className="fa-solid fa-search"
                    style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}
                  ></i>
                </div>
              </div>
            </div>
          </div>

          {/* TARJETAS KPI MAESTRAS Y ESTADO DE TANQUES */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {/* KPI 1: STOCK FÍSICO ACTUAL EN TANQUES */}
            <div
              className="content-card"
              style={{
                background: 'linear-gradient(145deg, #0f172a, #1e293b)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                borderRadius: '16px',
                padding: '20px',
                color: '#fff',
                boxShadow: '0 10px 25px rgba(15, 23, 42, 0.4)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: '#38bdf8',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Custodia Física en Receptoría
                  </span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '4px 0 0 0' }}>
                    Stock Actual en Tanques
                  </h3>
                </div>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    color: '#38bdf8',
                  }}
                >
                  <i className="fa-solid fa-cubes-stacked"></i>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
                <span
                  style={{
                    fontSize: '32px',
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    color: '#38bdf8',
                    fontFamily: 'monospace',
                  }}
                >
                  {fmtNum(stockActual)}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>Lts en custodia</span>
              </div>

              {/* Barra de nivel estético */}
              <div style={{ background: 'rgba(255,255,255,0.1)', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                <div
                  style={{
                    background: 'linear-gradient(90deg, #38bdf8, #3b82f6)',
                    height: '100%',
                    width: `${porcentajeNivelTanque}%`,
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                  }}
                ></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '6px' }}>
                <span>
                  Total Entrado: <strong style={{ color: '#4ade80' }}>{fmtNum(totalEntradas)} Lts</strong>
                </span>
                <span>
                  Total Salido: <strong style={{ color: '#f87171' }}>{fmtNum(totalSalidas)} Lts</strong>
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '6px',
                  borderTop: '1px dashed rgba(255,255,255,0.15)',
                  fontSize: '11px',
                  color: '#94a3b8',
                }}
              >
                <span>
                  Stock Inicial: <strong style={{ color: '#38bdf8' }}>{fmtNum(stockInicial)} Lts</strong>
                </span>
                <button
                  className="btn btn-xs"
                  type="button"
                  onClick={() => {
                    setNuevoStockInicialInput(stockInicial);
                    setModalStockInicial(true);
                  }}
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 800,
                    borderRadius: '6px',
                    background: 'rgba(56, 189, 248, 0.2)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-pen-to-square"></i> Ajustar Inicial
                </button>
              </div>
            </div>

            {/* KPI 2: TOTAL RECOLECTADO EN FINCAS */}
            <div
              className="content-card"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: '#f59e0b',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Ingreso al Circuito
                  </span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
                    Total Recolección Fincas
                  </h3>
                </div>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    color: '#f59e0b',
                  }}
                >
                  <i className="fa-solid fa-cow"></i>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
                  {fmtNum(totalRecolectado)}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Lts brutos</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Merma en Ruta de Choferes: <strong style={{ color: totalMermaRuta > 0 ? '#ef4444' : '#10b981' }}>{fmtNum(totalMermaRuta)} Lts</strong>
              </div>
            </div>

            {/* KPI 3: TOTAL COMERCIALIZADO A COMPAÑÍAS */}
            <div
              className="content-card"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: '#10b981',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Ventas &amp; Entregas
                  </span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
                    Total Facturado Plantas
                  </h3>
                </div>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    color: '#10b981',
                  }}
                >
                  <i className="fa-solid fa-building-circle-check"></i>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '32px', fontWeight: 900, color: '#10b981', fontFamily: 'monospace' }}>
                  {fmtNum(totalComercializado)}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Lts vendidos</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Ruta Directa: <strong style={{ color: '#0284c7' }}>{fmtNum(totalDirectas)} Lts</strong> | Tanques:{' '}
                <strong style={{ color: '#8b5cf6' }}>{fmtNum(totalSalidas)} Lts</strong>
              </div>
            </div>

            {/* KPI 4: AUDITORÍA DE BALANCE (DESCUADRE) */}
            <div
              className="content-card"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: '#6366f1',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Auditoría Integral
                  </span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
                    Cuadratura de Litros
                  </h3>
                </div>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(99, 102, 241, 0.12)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    color: '#6366f1',
                  }}
                >
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <span
                  style={{
                    fontSize: '32px',
                    fontWeight: 900,
                    color: esCuadradoExacto ? '#10b981' : '#ef4444',
                    fontFamily: 'monospace',
                  }}
                >
                  {fmtNum(descuadre)}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Lts diferencia</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Estado:{' '}
                <span
                  className={`badge ${esCuadradoExacto ? 'badge-success' : 'badge-danger'}`}
                  style={{
                    fontWeight: 800,
                    background: esCuadradoExacto ? '#dcfce7' : '#fee2e2',
                    color: esCuadradoExacto ? '#15803d' : '#b91c1c',
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  <i className={esCuadradoExacto ? 'fa-solid fa-check-double' : 'fa-solid fa-triangle-exclamation'} style={{ marginRight: '4px' }}></i>
                  {esCuadradoExacto ? '100% Cuadrado' : 'Descuadre Detectado'}
                </span>
              </div>
            </div>
          </div>

          {/* PANEL DE LOS 4 PROCESOS OPERATIVOS */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3
                style={{
                  fontSize: '16.5px',
                  fontWeight: 900,
                  color: '#0f172a',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <i className="fa-solid fa-network-wired" style={{ color: '#0284c7' }}></i>
                Los 4 Procesos de Manejo y Transporte de Leche
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Haz clic en cualquier proceso para filtrar la tabla de movimientos
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              {/* PROCESO 1: FINCA -> RECEPTORÍA */}
              <div
                onClick={() => handleToggleProceso(1)}
                style={{
                  cursor: 'pointer',
                  background: '#ffffff',
                  border: procesoFiltro === 1 ? '2px solid #0284c7' : '2px solid #bae6fd',
                  borderRadius: '14px',
                  padding: '16px',
                  transition: 'all 0.25s',
                  boxShadow: procesoFiltro === 1 ? '0 10px 20px rgba(2, 132, 199, 0.2)' : '0 4px 10px rgba(2, 132, 199, 0.06)',
                  transform: procesoFiltro === 1 ? 'translateY(-3px)' : 'none',
                  opacity: procesoFiltro === 0 || procesoFiltro === 1 ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span
                    className="badge"
                    style={{
                      background: '#e0f2fe',
                      color: '#0284c7',
                      fontWeight: 800,
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    PROCESO 1
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      fontWeight: 800,
                      fontSize: '10.5px',
                    }}
                  >
                    <i className="fa-solid fa-plus"></i> SUMA A TANQUES
                  </span>
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                  📥 Finca ➔ Receptoría
                </h4>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                  Descargas que ingresan físicamente al tanque con medición <strong>verificada en receptoría</strong>.
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#0284c7', fontFamily: 'monospace' }}>
                      {fmtNum(p1.totalLitros)} Lts
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>{p1.cantidadMovimientos || 0} viajes</div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      fontWeight: 700,
                      fontSize: '11px',
                    }}
                  >
                    {(p1.porcentajeDelTotal || 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* PROCESO 2: FINCA -> RECEPTORÍA -> COMPAÑÍA */}
              <div
                onClick={() => handleToggleProceso(2)}
                style={{
                  cursor: 'pointer',
                  background: '#ffffff',
                  border: procesoFiltro === 2 ? '2px solid #7c3aed' : '2px solid #ddd6fe',
                  borderRadius: '14px',
                  padding: '16px',
                  transition: 'all 0.25s',
                  boxShadow: procesoFiltro === 2 ? '0 10px 20px rgba(124, 58, 237, 0.2)' : '0 4px 10px rgba(139, 92, 246, 0.06)',
                  transform: procesoFiltro === 2 ? 'translateY(-3px)' : 'none',
                  opacity: procesoFiltro === 0 || procesoFiltro === 2 ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span
                    className="badge"
                    style={{
                      background: '#ede9fe',
                      color: '#7c3aed',
                      fontWeight: 800,
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    PROCESO 2
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: '#f3f4f6',
                      color: '#4b5563',
                      fontWeight: 800,
                      fontSize: '10.5px',
                    }}
                  >
                    <i className="fa-solid fa-arrows-split-up-and-left"></i> RUTA MIXTA / PASO
                  </span>
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                  🔄 Finca ➔ Receptoría ➔ Cía
                </h4>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                  Rutas que descargan parte en tanque (verificada) y entregan el resto a planta en el mismo circuito.
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#7c3aed', fontFamily: 'monospace' }}>
                      {fmtNum(p2.totalLitros)} Lts
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>{p2.cantidadMovimientos || 0} entregas</div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      fontWeight: 700,
                      fontSize: '11px',
                    }}
                  >
                    {(p2.porcentajeDelTotal || 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* PROCESO 3: FINCA -> COMPAÑÍA (DIRECTA) */}
              <div
                onClick={() => handleToggleProceso(3)}
                style={{
                  cursor: 'pointer',
                  background: '#ffffff',
                  border: procesoFiltro === 3 ? '2px solid #ea580c' : '2px solid #fed7aa',
                  borderRadius: '14px',
                  padding: '16px',
                  transition: 'all 0.25s',
                  boxShadow: procesoFiltro === 3 ? '0 10px 20px rgba(234, 88, 12, 0.2)' : '0 4px 10px rgba(249, 115, 22, 0.06)',
                  transform: procesoFiltro === 3 ? 'translateY(-3px)' : 'none',
                  opacity: procesoFiltro === 0 || procesoFiltro === 3 ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span
                    className="badge"
                    style={{
                      background: '#ffedd5',
                      color: '#ea580c',
                      fontWeight: 800,
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    PROCESO 3
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: '#f1f5f9',
                      color: '#64748b',
                      fontWeight: 800,
                      fontSize: '10.5px',
                    }}
                  >
                    ⚪ NEUTRO (DIRECTO A PLANTA)
                  </span>
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                  🚛 Finca ➔ Compañía
                </h4>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                  Entrega directa en ruta desde camión a la quesera/planta sin entrar a tanques.
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#ea580c', fontFamily: 'monospace' }}>
                      {fmtNum(p3.totalLitros)} Lts
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>{p3.cantidadMovimientos || 0} viajes</div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      fontWeight: 700,
                      fontSize: '11px',
                    }}
                  >
                    {(p3.porcentajeDelTotal || 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* PROCESO 4: RECEPTORÍA -> COMPAÑÍA */}
              <div
                onClick={() => handleToggleProceso(4)}
                style={{
                  cursor: 'pointer',
                  background: '#ffffff',
                  border: procesoFiltro === 4 ? '2px solid #15803d' : '2px solid #bbf7d0',
                  borderRadius: '14px',
                  padding: '16px',
                  transition: 'all 0.25s',
                  boxShadow: procesoFiltro === 4 ? '0 10px 20px rgba(21, 128, 61, 0.2)' : '0 4px 10px rgba(16, 185, 129, 0.06)',
                  transform: procesoFiltro === 4 ? 'translateY(-3px)' : 'none',
                  opacity: procesoFiltro === 0 || procesoFiltro === 4 ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span
                    className="badge"
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      fontWeight: 800,
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    PROCESO 4
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: '#fee2e2',
                      color: '#b91c1c',
                      fontWeight: 800,
                      fontSize: '10.5px',
                    }}
                  >
                    <i className="fa-solid fa-minus"></i> RESTA DE TANQUES
                  </span>
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                  📤 Receptoría ➔ Compañía
                </h4>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                  Despacho de leche <strong>directo de tanques de receptoría</strong> hacia plantas (UPACA, GENICA...).
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#15803d', fontFamily: 'monospace' }}>
                      {fmtNum(p4.totalLitros)} Lts
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>{p4.cantidadMovimientos || 0} despachos</div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      fontWeight: 700,
                      fontSize: '11px',
                    }}
                  >
                    {(p4.porcentajeDelTotal || 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* TABLA DE TRAZABILIDAD Y AUDITORÍA LITRO A LITRO */}
          <div
            className="content-card"
            style={{
              borderRadius: '14px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                  <i className="fa-solid fa-list-check" style={{ color: '#0284c7', marginRight: '6px' }}></i>
                  Libro Mayor de Entradas, Salidas y Saldos en Tanque
                </span>
                <span className="badge badge-info" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  {movimientosFiltrados.length} de {movimientos.length} Movimientos
                </span>
              </div>

              {/* Badges explicativos de columnas */}
              <div style={{ display: 'flex', gap: '12px', fontSize: '11.5px', fontWeight: 700, flexWrap: 'wrap' }}>
                <span style={{ color: '#16a34a' }}>
                  <i className="fa-solid fa-arrow-down" style={{ marginRight: '4px' }}></i> Entrada Tanque (Verificada)
                </span>
                <span style={{ color: '#dc2626' }}>
                  <i className="fa-solid fa-arrow-up" style={{ marginRight: '4px' }}></i> Salida Tanque (Directo Receptoría)
                </span>
                <span style={{ color: '#4338ca' }}>
                  <i className="fa-solid fa-clipboard-check" style={{ marginRight: '4px' }}></i> Recepción Quesera (Info)
                </span>
                <span style={{ color: '#0284c7' }}>
                  <i className="fa-solid fa-arrow-right" style={{ marginRight: '4px' }}></i> Entrega Directa
                </span>
                <span style={{ color: '#0f172a', fontWeight: 800 }}>= Saldo en Tanque</span>
              </div>
            </div>

            {/* TABLA USANDO DATATABLE CON BUSCADOR, PAGINADOR Y EXPORTACIÓN (MASTER RULE #2) */}
            <DataTable
              data={movimientosFiltrados}
              columns={columns}
              isLoading={isLoading}
              searchPlaceholder="Buscar por ticket, chofer, placa, origen, destino..."
              exportFileName={`balance_volumetrico_${balance?.codigoCiclo || 'auditoria'}`}
              searchFilter={(row, term) => {
                const t = term.toLowerCase();
                return (
                  (row.ticketReferencia || '').toLowerCase().includes(t) ||
                  (row.conductor || '').toLowerCase().includes(t) ||
                  (row.camionPlaca || '').toLowerCase().includes(t) ||
                  (row.origen || '').toLowerCase().includes(t) ||
                  (row.destino || '').toLowerCase().includes(t) ||
                  (row.tipoProcesoNombre || '').toLowerCase().includes(t) ||
                  (row.observacion || '').toLowerCase().includes(t) ||
                  row.id.toString().includes(t)
                );
              }}
            />
          </div>

          {/* MODAL AJUSTAR STOCK INICIAL */}
          {modalStockInicial && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <div
                className="content-card"
                style={{ width: '100%', maxWidth: '440px', padding: '0', overflow: 'hidden', borderRadius: '16px' }}
              >
                <div
                  style={{
                    padding: '16px 20px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    <i className="fa-solid fa-pen-to-square" style={{ color: '#0284c7', marginRight: '8px' }}></i>
                    Ajustar Stock Inicial de Tanques
                  </h3>
                  <button
                    type="button"
                    onClick={() => setModalStockInicial(false)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}
                  >
                    &times;
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutationStockInicial.mutate(nuevoStockInicialInput);
                  }}
                  style={{ padding: '20px' }}
                >
                  <div style={{ textAlign: 'left', fontSize: '13px', color: '#475569', marginBottom: '14px' }}>
                    <p style={{ margin: '0 0 8px 0' }}>
                      Ingrese los litros físicos reales que estaban en los tanques al momento de{' '}
                      <strong>abrir este ciclo operativo ({balance?.codigoCiclo || 'Ciclo Actual'})</strong>:
                    </p>
                    <div
                      style={{
                        background: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        borderRadius: '8px',
                        padding: '10px',
                        fontSize: '12px',
                        color: '#0369a1',
                      }}
                    >
                      <i className="fa-solid fa-circle-info" style={{ marginRight: '4px' }}></i>
                      Este valor establece el punto de partida (T=0) del balance para que los despachos de leche no generen saldo negativo ni desbalances ficticios.
                    </div>
                  </div>

                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                    Litros en Tanques al Iniciar:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={nuevoStockInicialInput}
                    onChange={(e) => setNuevoStockInicialInput(Number(e.target.value))}
                    className="form-input"
                    style={{ width: '100%', height: '42px', fontSize: '16px', fontWeight: 800, borderRadius: '8px', marginBottom: '16px' }}
                    required
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setModalStockInicial(false)}
                      className="btn btn-outline"
                      style={{ height: '38px', padding: '0 16px', borderRadius: '8px', fontWeight: 700 }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={mutationStockInicial.isPending}
                      className="btn btn-primary"
                      style={{
                        height: '38px',
                        padding: '0 18px',
                        borderRadius: '8px',
                        background: '#0284c7',
                        border: 'none',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {mutationStockInicial.isPending ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i> Guardando...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-floppy-disk"></i> Guardar Stock Inicial
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BalanceLechePage;
