import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { toast } from 'sonner';
import { finanzasApi } from '@/api/finanzas.api';
import { catalogosApi } from '@/api/catalogos.api';
import { bcvApi } from '@/api/bcv.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import {
  ModalCrearAdelanto,
  ModalActualizarValorDolar,
  ModalEditarCuota,
  ModalDividirCuota,
  ModalPosponerCuota,
  ModalReestructurarCuotas,
  SubRowCuotas,
} from './components/AdelantosCommonModals';
import type { AdelantoDto, FincaDto, CicloSemanalDto } from '@/types';

export const AdelantosFincasPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Estados de modales
  const [modalCrearOpen, setModalCrearOpen] = useState(false);
  const [modalTasaOpen, setModalTasaOpen] = useState(false);
  const [modalEditarCuotaOpen, setModalEditarCuotaOpen] = useState(false);
  const [modalDividirCuotaOpen, setModalDividirCuotaOpen] = useState(false);
  const [modalPosponerCuotaOpen, setModalPosponerCuotaOpen] = useState(false);
  const [modalReestructurarOpen, setModalReestructurarOpen] = useState(false);

  // Selecciones activas para modales de cuotas
  const [adelantoSeleccionado, setAdelantoSeleccionado] = useState<any | null>(null);
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState<any | null>(null);

  // Filtros de barra superior
  const [filtroSemana, setFiltroSemana] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  // 1. Data de Adelantos a Fincas
  const { data: adelantosRaw = [], isLoading } = useQuery<AdelantoDto[]>({
    queryKey: ['adelantos-fincas'],
    queryFn: () => finanzasApi.getAdelantos('FINCA'),
  });

  // 2. Fincas Catálogo
  const { data: fincas = [] } = useQuery<FincaDto[]>({
    queryKey: ['fincas'],
    queryFn: () => catalogosApi.getFincas(true),
  });

  // 3. Semanas Catálogo
  const { data: semanas = [] } = useQuery<CicloSemanalDto[]>({
    queryKey: ['ciclos-semanas'],
    queryFn: () => finanzasApi.getCiclos(),
  });

  // 4. Tasa BCV Actual
  const { data: bcv } = useQuery({
    queryKey: ['bcv-rate'],
    queryFn: () => bcvApi.getTasaHoy(),
  });
  const tasaBcv = bcv?.tasa || 36.5;

  const cicloActivo = useMemo(() => {
    return semanas.find((s) => String(s.estado || '').toUpperCase() === 'ABIERTO') || semanas[0];
  }, [semanas]);

  // Normalización de adelantos para la tabla
  const adelantos = useMemo(() => {
    return adelantosRaw.map((a: any) => {
      const id = a.id ?? a.Id ?? 0;
      const montoTotal = Number(a.montoTotalUSD ?? a.MontoTotalUSD ?? a.montoUSD ?? a.MontoUSD ?? a.monto ?? 0);
      const saldoPend = Number(a.montoPendienteUSD ?? a.MontoPendienteUSD ?? a.saldoPendienteUSD ?? a.SaldoPendienteUSD ?? 0);
      const montoPag = Number(a.montoPagadoUSD ?? a.MontoPagadoUSD ?? Math.max(0, montoTotal - saldoPend));
      const tasaAplicada = Number(a.tasaBCV ?? a.tasaBcvAplicada ?? tasaBcv);
      const montoBs = Number(a.montoBs ?? a.montoTotalBs ?? (montoTotal * tasaAplicada));
      const cuotasList = a.cuotas || a.Cuotas || [];
      const numCuotas = Number(a.numeroCuotas ?? a.NumeroCuotas ?? (cuotasList.length > 0 ? cuotasList.length : 1));
      const cuotaUSD = numCuotas > 0 ? Number((montoTotal / numCuotas).toFixed(2)) : montoTotal;

      const fId = a.entidadId ?? a.EntidadId ?? a.fincaId ?? a.FincaId;
      const fMatch = fincas.find((f) => f.id === fId);
      const fincaNom = a.entidadNombre ?? a.EntidadNombre ?? a.fincaNombre ?? a.FincaNombre ?? fMatch?.nombre ?? 'Finca sin nombre';
      const propNom = fMatch?.propietarioNombre || (fMatch as any)?.propietario || '';

      const semNom =
        a.semanaInicioNombre ||
        a.semanaOperativaCodigo ||
        a.semanaOperativa?.codigo ||
        a.cicloCodigo ||
        (a.semanaInicioId || a.semanaOperativaId ? `Semana #${a.semanaInicioId || a.semanaOperativaId}` : 'Ciclo general');

      const est = String(a.estado || a.Estado || (saldoPend <= 0.001 ? 'PAGADO' : 'ACTIVO')).toUpperCase();

      return {
        ...a,
        id,
        fincaId: fId,
        fincaNombre: fincaNom,
        propietarioNombre: propNom,
        montoTotalUSD: montoTotal,
        montoPendienteUSD: saldoPend,
        montoPagadoUSD: montoPag,
        montoBs,
        tasaBCV: tasaAplicada,
        numeroCuotas: numCuotas,
        cuotaUSD,
        semanaCodigo: semNom,
        estado: est,
        cuotas: cuotasList,
      };
    });
  }, [adelantosRaw, fincas, tasaBcv]);

  // Filtrado según toolbar
  const adelantosFiltrados = useMemo(() => {
    return adelantos.filter((a) => {
      if (filtroSemana) {
        const matchesSemana = String(a.semanaInicioId || a.semanaOperativaId) === filtroSemana ||
          (a.cuotas && a.cuotas.some((c: any) => String(c.semanaOperativaId) === filtroSemana));
        if (!matchesSemana) return false;
      }
      if (filtroEstado) {
        if (filtroEstado === 'ACTIVO' && a.estado !== 'ACTIVO' && a.estado !== 'PENDIENTE') return false;
        if (filtroEstado === 'PAGADO' && a.estado !== 'PAGADO') return false;
        if (filtroEstado === 'POSPUESTO') {
          const hasPospuesta = a.cuotas && a.cuotas.some((c: any) => String(c.estado).toUpperCase() === 'POSPUESTO');
          if (!hasPospuesta) return false;
        }
      }
      return true;
    });
  }, [adelantos, filtroSemana, filtroEstado]);

  // 4 KPIs exactos 1:1 con V2_3_11_26
  const kpis = useMemo(() => {
    let totalAdelantado = 0;
    let totalCobrado = 0;
    let totalPendiente = 0;
    let cuotasPospuestas = 0;
    let cantCuotasCobradas = 0;
    let cantCuotasPendientes = 0;

    adelantos.forEach((a) => {
      totalAdelantado += a.montoTotalUSD;
      totalCobrado += a.montoPagadoUSD;
      totalPendiente += a.montoPendienteUSD;

      (a.cuotas || []).forEach((c: any) => {
        const est = String(c.estado || '').toUpperCase();
        if (est === 'POSPUESTO') cuotasPospuestas++;
        if (est === 'COBRADO') cantCuotasCobradas++;
        if (est === 'PENDIENTE') cantCuotasPendientes++;
      });
    });

    const activos = adelantos.filter((a) => a.estado === 'ACTIVO' || a.montoPendienteUSD > 0.001);

    return {
      totalAdelantadoUSD: totalAdelantado,
      totalCobradoUSD: totalCobrado,
      totalPendienteUSD: totalPendiente,
      cuotasPospuestas,
      cantAdelantos: adelantos.length,
      cantActivos: activos.length,
      cantCuotasCobradas,
      cantCuotasPendientes,
    };
  }, [adelantos]);

  // Eliminar adelanto completo
  const eliminarMutation = useMutation({
    mutationFn: (id: number) => finanzasApi.eliminarAdelanto(id),
    onSuccess: (data: any) => {
      Swal.fire({
        icon: 'success',
        title: '¡Eliminado!',
        text: data?.message || 'Adelanto eliminado correctamente.',
        confirmButtonColor: '#10b981',
      });
      queryClient.invalidateQueries({ queryKey: ['adelantos-fincas'] });
    },
    onError: (err: any) => {
      Swal.fire({
        icon: 'error',
        title: 'Error al Eliminar',
        text: err.response?.data?.message || err.message || 'No se pudo eliminar el adelanto.',
        confirmButtonColor: '#ef4444',
      });
    },
  });

  const handleEliminarAdelanto = (id: number, finca: string) => {
    Swal.fire({
      title: '¿Eliminar Adelanto?',
      text: `Se cancelará el plan de pagos y el adelanto #${id} de "${finca}". Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then((res) => {
      if (res.isConfirmed) {
        eliminarMutation.mutate(id);
      }
    });
  };

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Opciones de fincas para el modal
  const fincasOptions = useMemo(() => {
    return fincas.map((f) => ({
      value: String(f.id),
      label: f.nombre,
      sublabel: f.propietarioNombre ? `Propietario: ${f.propietarioNombre}` : undefined,
    }));
  }, [fincas]);

  // Columnas de la DataTable (12 columnas)
  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'expand',
      header: '',
      size: 40,
      cell: (row) => {
        const isExp = !!expandedRows[row.id];
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleRow(row.id);
            }}
            title={isExp ? 'Ocultar cuotas' : 'Ver cuotas desglosadas'}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              border: `1px solid ${isExp ? '#93c5fd' : '#cbd5e1'}`,
              background: isExp ? '#eff6ff' : '#ffffff',
              color: isExp ? '#2563eb' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 900,
            }}
          >
            <i className={`fa-solid ${isExp ? 'fa-minus' : 'fa-plus'}`}></i>
          </button>
        );
      },
    },
    {
      accessorKey: 'id',
      header: '# ID',
      size: 70,
      cell: (row) => <span style={{ fontWeight: 800, color: '#334155' }}>#{row.id}</span>,
    },
    {
      accessorKey: 'fincaNombre',
      header: 'FINCA / PRODUCTOR',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.fincaNombre}</div>
          {row.propietarioNombre && (
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              <i className="fa-solid fa-user" style={{ marginRight: '4px', fontSize: '10px' }}></i>
              {row.propietarioNombre}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'semanaCodigo',
      header: 'SEMANA COBRO',
      cell: (row) => (
        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0369a1' }}>
          {row.semanaCodigo}
        </span>
      ),
    },
    {
      accessorKey: 'montoTotalUSD',
      header: 'TOTAL ($)',
      cell: (row) => (
        <div style={{ textAlign: 'right', fontWeight: 900, color: '#0f172a' }}>
          $ {(Number(row.montoTotalUSD) || 0).toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'montoBs',
      header: 'MONTO (BS)',
      cell: (row) => (
        <div style={{ textAlign: 'right', fontWeight: 700, color: '#059669', fontSize: '11.5px' }}>
          Bs. {(Number(row.montoBs) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      ),
    },
    {
      accessorKey: 'numeroCuotas',
      header: 'CUOTAS',
      cell: (row) => (
        <div style={{ textAlign: 'center' }}>
          <span
            style={{
              background: '#f1f5f9',
              color: '#334155',
              fontWeight: 800,
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '6px',
            }}
          >
            {row.numeroCuotas} {row.numeroCuotas === 1 ? 'Cuota' : 'Cuotas'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'cuotaUSD',
      header: 'CUOTA ($)',
      cell: (row) => (
        <div style={{ textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>
          $ {(Number(row.cuotaUSD) || 0).toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'montoPagadoUSD',
      header: 'COBRADO ($)',
      cell: (row) => (
        <div style={{ textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
          $ {(Number(row.montoPagadoUSD) || 0).toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'montoPendienteUSD',
      header: 'PENDIENTE ($)',
      cell: (row) => {
        const pend = Number(row.montoPendienteUSD) || 0;
        return (
          <div
            style={{
              textAlign: 'right',
              fontWeight: 900,
              color: pend > 0 ? '#b45309' : '#15803d',
            }}
          >
            $ {pend.toFixed(2)}
          </div>
        );
      },
    },
    {
      accessorKey: 'estado',
      header: 'ESTADO',
      cell: (row) => {
        const pend = Number(row.montoPendienteUSD) || 0;
        const isPagado = row.estado === 'PAGADO' || pend <= 0.001;
        return (
          <div style={{ textAlign: 'center' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                display: 'inline-block',
                background: isPagado ? '#dcfce7' : '#fef3c7',
                color: isPagado ? '#15803d' : '#b45309',
                border: `1px solid ${isPagado ? '#86efac' : '#fde68a'}`,
              }}
            >
              {isPagado ? 'PAGADO' : 'ACTIVO'}
            </span>
          </div>
        );
      },
    },
    {
      id: 'acciones',
      header: 'ACCIONES',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAdelantoSeleccionado(row);
              setModalReestructurarOpen(true);
            }}
            title="Reestructurar plan de pagos"
            style={{
              background: '#f0fdfa',
              color: '#0d9488',
              border: '1px solid #99f6e4',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-calculator"></i>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleEliminarAdelanto(row.id, row.fincaNombre);
            }}
            title="Eliminar adelanto"
            style={{
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      ),
    },
  ], [expandedRows, handleEliminarAdelanto]);

  return (
    <div className="view-container">
      {/* HEADER DE LA VISTA */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 className="view-title">
            <i className="fa-solid fa-leaf" style={{ color: '#10b981', marginRight: '8px' }}></i>
            Adelantos &amp; Préstamos a Fincas
          </h1>
          <p className="view-subtitle">
            Gestión de anticipos fijados en USD, pagaderos en cuotas por ciclo operativo con cálculo dinámico editable en Bs (Tasa BCV)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setModalTasaOpen(true)}
            className="btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 800,
              padding: '9px 16px',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
              color: '#ffffff',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-dollar-sign"></i> Actualizar Valor Dólar (Solo Activos)
          </button>
          <button
            type="button"
            onClick={() => setModalCrearOpen(true)}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              padding: '9px 16px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
            }}
          >
            <i className="fa-solid fa-plus-circle"></i> + Nuevo Adelanto a Finca
          </button>
        </div>
      </div>

      {/* 4 TARJETAS KPI ADELANTOS FINCAS (1:1 V2_3_11_26) */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="kpi-card glass-blue">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-hand-holding-dollar"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Total Adelantado Fincas</span>
            <div className="kpi-value">
              $ {kpis.totalAdelantadoUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="kpi-foot">{kpis.cantAdelantos} Adelantos registrados</span>
          </div>
        </div>

        <div className="kpi-card glass-emerald">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-circle-check"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Total Cobrado (Abonado)</span>
            <div className="kpi-value">
              $ {kpis.totalCobradoUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="kpi-foot">{kpis.cantCuotasCobradas} Cuotas abonadas</span>
          </div>
        </div>

        <div className="kpi-card glass-amber">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-clock-rotate-left"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Monto Pendiente por Cobrar</span>
            <div className="kpi-value">
              $ {kpis.totalPendienteUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="kpi-foot">{kpis.cantCuotasPendientes} Cuotas por cobrar</span>
          </div>
        </div>

        <div className="kpi-card glass-purple">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-calendar-minus"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Cuotas Pospuestas</span>
            <div className="kpi-value">{kpis.cuotasPospuestas}</div>
            <span className="kpi-foot">Reprogramadas a solicitud</span>
          </div>
        </div>
      </div>

      {/* CARD PRINCIPAL CON DATATABLE */}
      <div className="content-card">
        {/* TOOLBAR */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
            paddingBottom: '14px',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <select
                value={filtroSemana}
                onChange={(e) => setFiltroSemana(e.target.value)}
                className="form-input"
                style={{
                  height: '38px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#ffffff',
                  color: '#0f172a',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0 12px',
                }}
              >
                <option value="">TODOS LOS CICLOS / SEMANAS</option>
                {semanas.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.codigo || `Semana #${s.id}`} {String(s.estado || '').toUpperCase() === 'ABIERTO' ? '★ (ACTIVA)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="form-input"
                style={{
                  height: '38px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#ffffff',
                  color: '#0f172a',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0 12px',
                }}
              >
                <option value="">TODOS LOS ESTADOS</option>
                <option value="ACTIVO">SOLO ACTIVOS (PENDIENTES)</option>
                <option value="PAGADO">SOLO PAGADOS (LIQUIDADOS)</option>
                <option value="POSPUESTO">CON CUOTAS POSPUESTAS</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['adelantos-fincas'] })}
            className="btn btn-outline"
            title="Refrescar lista"
            style={{ fontWeight: 700, height: '38px', padding: '0 12px', background: '#fff', border: '1.5px solid #cbd5e1' }}
          >
            <i className="fa-solid fa-rotate-right" style={{ marginRight: '6px' }}></i>
            Actualizar
          </button>
        </div>

        {/* TABLA PRINCIPAL DE ADELANTOS CON EXPANDIBLE */}
        <DataTable
          columns={columns}
          data={adelantosFiltrados}
          isLoading={isLoading}
          searchPlaceholder="Buscar por finca, observaciones..."
          isRowExpanded={(row) => !!expandedRows[row.id]}
          renderSubRow={(row) => (
            <SubRowCuotas
              adelanto={row}
              onEditarCuota={(c) => {
                setAdelantoSeleccionado(row);
                setCuotaSeleccionada(c);
                setModalEditarCuotaOpen(true);
              }}
              onDividirCuota={(c) => {
                setAdelantoSeleccionado(row);
                setCuotaSeleccionada(c);
                setModalDividirCuotaOpen(true);
              }}
              onPosponerCuota={(c) => {
                setAdelantoSeleccionado(row);
                setCuotaSeleccionada(c);
                setModalPosponerCuotaOpen(true);
              }}
              onReestructurar={() => {
                setAdelantoSeleccionado(row);
                setModalReestructurarOpen(true);
              }}
            />
          )}
        />
      </div>

      {/* MODAL CREAR ADELANTO A FINCA */}
      <ModalCrearAdelanto
        isOpen={modalCrearOpen}
        onClose={() => setModalCrearOpen(false)}
        tipoEntidad="FINCA"
        entidades={fincasOptions}
        semanas={semanas}
        tasaBcvActual={tasaBcv}
        cicloActivoId={cicloActivo?.id}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['adelantos-fincas'] })}
      />

      {/* MODAL ACTUALIZAR TASA BCV ACTIVOS */}
      <ModalActualizarValorDolar
        isOpen={modalTasaOpen}
        onClose={() => setModalTasaOpen(false)}
        tipoEntidad="FINCA"
        cantActivos={kpis.cantActivos}
        totalPendienteUSD={kpis.totalPendienteUSD}
        tasaBcvActual={tasaBcv}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['adelantos-fincas'] })}
      />

      {/* MODAL EDITAR CUOTA */}
      <ModalEditarCuota
        isOpen={modalEditarCuotaOpen}
        onClose={() => setModalEditarCuotaOpen(false)}
        cuota={cuotaSeleccionada}
        adelanto={adelantoSeleccionado}
        semanas={semanas}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['adelantos-fincas'] })}
      />

      {/* MODAL DIVIDIR CUOTA */}
      <ModalDividirCuota
        isOpen={modalDividirCuotaOpen}
        onClose={() => setModalDividirCuotaOpen(false)}
        cuota={cuotaSeleccionada}
        adelanto={adelantoSeleccionado}
        semanas={semanas}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['adelantos-fincas'] })}
      />

      {/* MODAL POSPONER CUOTA */}
      <ModalPosponerCuota
        isOpen={modalPosponerCuotaOpen}
        onClose={() => setModalPosponerCuotaOpen(false)}
        cuota={cuotaSeleccionada}
        adelanto={adelantoSeleccionado}
        semanas={semanas}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['adelantos-fincas'] })}
      />

      {/* MODAL REESTRUCTURAR CUOTAS */}
      <ModalReestructurarCuotas
        isOpen={modalReestructurarOpen}
        onClose={() => setModalReestructurarOpen(false)}
        adelanto={adelantoSeleccionado}
        semanas={semanas}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['adelantos-fincas'] })}
      />
    </div>
  );
};
