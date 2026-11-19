import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogosApi } from '@/api/catalogos.api';
import { finanzasApi } from '@/api/finanzas.api';
import { bcvApi } from '@/api/bcv.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { esReceptoriaPrincipal } from '@/utils/procesoViaje';
import type { CompaniaDto, CicloSemanalDto } from '@/types';

interface FilaSemanaCobro {
  id: string;
  companiaId: number;
  companiaNombre: string;
  precioLitroUSD: number;
  cicloId: number;
  semanaCodigo: string;
  litrosDespachados: number;
  litrosRecibidos: number;
  cantidadDespachos: number;
  totalFacturadoUSD: number;
  totalAbonadoUSD: number;
  saldoPendienteUSD: number;
}

export const AbonosCompaniasPage: React.FC = () => {
  const queryClient = useQueryClient();
  const hoyStr = new Date().toISOString().split('T')[0];

  const [tabActiva, setTabActiva] = useState<'resumen' | 'historial'>('resumen');
  const [filtroCompania, setFiltroCompania] = useState<string>('');
  const [filtroSemana, setFiltroSemana] = useState<string>('');
  const [soloConSaldo, setSoloConSaldo] = useState<boolean>(false);

  // Modal Registrar Abono (1 o varias semanas)
  const [modalAbonoOpen, setModalAbonoOpen] = useState<boolean>(false);
  const [abonoCompaniaId, setAbonoCompaniaId] = useState<number>(0);
  const [abonoFecha, setAbonoFecha] = useState<string>(hoyStr);
  const [abonoBancoId, setAbonoBancoId] = useState<number>(0);
  const [abonoTipoPago, setAbonoTipoPago] = useState<string>('TRANSFERENCIA');
  const [abonoReferencia, setAbonoReferencia] = useState<string>('');
  const [abonoObs, setAbonoObs] = useState<string>('');
  const [abonoTasaBcv, setAbonoTasaBcv] = useState<number>(0);
  const [abonoMontoBsManual, setAbonoMontoBsManual] = useState<string>('');
  const [montosPorSemana, setMontosPorSemana] = useState<Record<number, string>>({});

  // Queries
  const { data: resumenSemanasRaw = [], isLoading: cargandoResumen } = useQuery<any[]>({
    queryKey: ['companias-cobranzas-semanas'],
    queryFn: () => catalogosApi.getResumenCobranzasSemanas(),
  });

  const { data: abonosRaw = [], isLoading: cargandoAbonos } = useQuery<any[]>({
    queryKey: ['companias-abonos-historial'],
    queryFn: () => catalogosApi.getAbonosCompanias(),
  });

  const { data: companiasRaw = [] } = useQuery<CompaniaDto[]>({
    queryKey: ['companias-activas-cobranza'],
    queryFn: () => catalogosApi.getCompanias(true),
  });

  const { data: semanas = [] } = useQuery<CicloSemanalDto[]>({
    queryKey: ['ciclos-semanas'],
    queryFn: () => finanzasApi.getCiclos(),
  });

  const { data: bancos = [] } = useQuery<any[]>({
    queryKey: ['bancos-catalogo'],
    queryFn: () => catalogosApi.getBancos(),
  });

  const { data: bcv } = useQuery({
    queryKey: ['bcv-rate'],
    queryFn: () => bcvApi.getTasaHoy(),
  });
  const tasaActual = Number(bcv?.tasa || 0) || 1;

  const companiasExternas = useMemo(
    () => (companiasRaw || []).filter((c) => !esReceptoriaPrincipal(c)),
    [companiasRaw]
  );

  // Normalizar filas Compañía + Semana
  const filasSemanas: FilaSemanaCobro[] = useMemo(() => {
    return (resumenSemanasRaw || []).map((r: any) => {
      const compId = Number(r.companiaId ?? r.CompaniaId ?? 0);
      const cicId = Number(r.cicloId ?? r.CicloId ?? 0);
      const facturado = Number(r.totalFacturadoUSD ?? r.TotalFacturadoUSD ?? 0);
      const abonado = Number(r.totalAbonadoUSD ?? r.TotalAbonadoUSD ?? 0);
      const saldo = Number(r.saldoPendienteUSD ?? r.SaldoPendienteUSD ?? (facturado - abonado));
      return {
        id: `${compId}-${cicId}`,
        companiaId: compId,
        companiaNombre: r.companiaNombre ?? r.CompaniaNombre ?? `Compañía #${compId}`,
        precioLitroUSD: Number(r.precioLitroUSD ?? r.PrecioLitroUSD ?? 0),
        cicloId: cicId,
        semanaCodigo: r.semanaCodigo ?? r.SemanaCodigo ?? `Semana #${cicId}`,
        litrosDespachados: Number(r.litrosDespachados ?? r.LitrosDespachados ?? 0),
        litrosRecibidos: Number(r.litrosRecibidos ?? r.LitrosRecibidos ?? 0),
        cantidadDespachos: Number(r.cantidadDespachos ?? r.CantidadDespachos ?? 0),
        totalFacturadoUSD: facturado,
        totalAbonadoUSD: abonado,
        saldoPendienteUSD: saldo,
      };
    });
  }, [resumenSemanasRaw]);

  const filasFiltradas = useMemo(() => {
    return filasSemanas.filter((f) => {
      if (filtroCompania && String(f.companiaId) !== filtroCompania) return false;
      if (filtroSemana && String(f.cicloId) !== filtroSemana) return false;
      if (soloConSaldo && f.saldoPendienteUSD <= 0.01) return false;
      return true;
    });
  }, [filasSemanas, filtroCompania, filtroSemana, soloConSaldo]);

  const abonosFiltrados = useMemo(() => {
    return (abonosRaw || []).filter((a: any) => {
      if (filtroCompania && String(a.companiaId ?? a.CompaniaId) !== filtroCompania) return false;
      if (filtroSemana && String(a.cicloId ?? a.CicloId ?? 0) !== filtroSemana) return false;
      return true;
    });
  }, [abonosRaw, filtroCompania, filtroSemana]);

  // KPIs
  const kpis = useMemo(() => {
    const facturado = filasFiltradas.reduce((acc, f) => acc + f.totalFacturadoUSD, 0);
    const abonado = filasFiltradas.reduce((acc, f) => acc + f.totalAbonadoUSD, 0);
    const saldo = filasFiltradas.reduce((acc, f) => acc + Math.max(0, f.saldoPendienteUSD), 0);
    const litros = filasFiltradas.reduce((acc, f) => acc + f.litrosRecibidos, 0);
    const companiasDeudoras = new Set(filasFiltradas.filter((f) => f.saldoPendienteUSD > 0.01).map((f) => f.companiaId)).size;
    return { facturado, abonado, saldo, litros, companiasDeudoras };
  }, [filasFiltradas]);

  // Semanas disponibles de la compañía seleccionada en el modal
  const semanasDeCompaniaModal = useMemo(() => {
    if (!abonoCompaniaId) return [];
    return filasSemanas.filter((f) => f.companiaId === abonoCompaniaId);
  }, [filasSemanas, abonoCompaniaId]);

  const totalUsdModal = useMemo(() => {
    return Object.values(montosPorSemana).reduce((acc, v) => acc + (Number(v) || 0), 0);
  }, [montosPorSemana]);

  const tasaEfectivaModal = abonoTasaBcv > 0 ? abonoTasaBcv : tasaActual;
  const totalBsCalculadoModal = abonoMontoBsManual !== ''
    ? Number(abonoMontoBsManual) || 0
    : Number((totalUsdModal * tasaEfectivaModal).toFixed(2));

  const abrirModalAbono = (compId?: number, cicloId?: number, saldoSugerido?: number) => {
    const cid = compId || (filtroCompania ? Number(filtroCompania) : 0);
    setAbonoCompaniaId(cid);
    setAbonoFecha(hoyStr);
    setAbonoBancoId(0);
    setAbonoTipoPago('TRANSFERENCIA');
    setAbonoReferencia('');
    setAbonoObs('');
    setAbonoTasaBcv(tasaActual);
    setAbonoMontoBsManual('');
    if (cicloId && saldoSugerido && saldoSugerido > 0) {
      setMontosPorSemana({ [cicloId]: saldoSugerido.toFixed(2) });
    } else if (cicloId) {
      setMontosPorSemana({ [cicloId]: '' });
    } else {
      setMontosPorSemana({});
    }
    setModalAbonoOpen(true);
  };

  const crearAbonoMutation = useMutation({
    mutationFn: () => {
      const distribucion = Object.entries(montosPorSemana)
        .map(([cId, val]) => ({ cicloId: Number(cId), montoUSD: Number(val) || 0 }))
        .filter((x) => x.montoUSD > 0);

      if (distribucion.length === 0) {
        throw new Error('Ingresa al menos un monto en USD para alguna semana.');
      }

      return catalogosApi.crearAbonoCompania({
        companiaId: abonoCompaniaId,
        cicloId: distribucion.length === 1 ? distribucion[0].cicloId : undefined,
        fecha: abonoFecha,
        montoUSD: totalUsdModal,
        montoBs: totalBsCalculadoModal,
        tasaBcv: tasaEfectivaModal,
        bancoId: abonoBancoId > 0 ? abonoBancoId : undefined,
        tipoPago: abonoTipoPago,
        referenciaBancaria: abonoReferencia.trim() || undefined,
        observaciones: abonoObs.trim() || undefined,
        distribucionSemanas: distribucion,
      });
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Abono registrado exitosamente.');
      setModalAbonoOpen(false);
      queryClient.invalidateQueries({ queryKey: ['companias-cobranzas-semanas'] });
      queryClient.invalidateQueries({ queryKey: ['companias-abonos-historial'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Error al registrar abono');
    },
  });

  const eliminarAbonoMutation = useMutation({
    mutationFn: (id: number) => catalogosApi.eliminarAbonoCompania(id),
    onSuccess: () => {
      toast.success('Abono eliminado correctamente');
      queryClient.invalidateQueries({ queryKey: ['companias-cobranzas-semanas'] });
      queryClient.invalidateQueries({ queryKey: ['companias-abonos-historial'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error al eliminar abono'),
  });

  const colsResumen: ColumnDef<FilaSemanaCobro>[] = [
    {
      header: 'Compañía / Quesera',
      accessorKey: 'companiaNombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.companiaNombre}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            Precio base: ${row.precioLitroUSD.toFixed(2)} / L
          </div>
        </div>
      ),
    },
    {
      header: 'Semana Operativa',
      accessorKey: 'semanaCodigo',
      sortable: true,
      cell: (row) => (
        <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 800 }}>
          {row.semanaCodigo}
        </span>
      ),
    },
    {
      header: 'Litros Despachados',
      accessorKey: 'litrosRecibidos',
      sortable: true,
      cell: (row) => (
        <div>
          <strong style={{ color: '#0f172a' }}>{row.litrosRecibidos.toLocaleString('es-VE')} L</strong>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {row.cantidadDespachos} despacho{row.cantidadDespachos === 1 ? '' : 's'}
          </div>
        </div>
      ),
    },
    {
      header: 'Facturado (USD)',
      accessorKey: 'totalFacturadoUSD',
      sortable: true,
      cell: (row) => <strong style={{ color: '#334155' }}>${row.totalFacturadoUSD.toFixed(2)}</strong>,
    },
    {
      header: 'Abonado (USD)',
      accessorKey: 'totalAbonadoUSD',
      sortable: true,
      cell: (row) => <strong style={{ color: '#059669' }}>${row.totalAbonadoUSD.toFixed(2)}</strong>,
    },
    {
      header: 'Saldo Pendiente',
      accessorKey: 'saldoPendienteUSD',
      sortable: true,
      cell: (row) => {
        const debe = row.saldoPendienteUSD > 0.01;
        return (
          <span
            className="badge"
            style={{
              background: debe ? '#fee2e2' : '#dcfce7',
              color: debe ? '#b91c1c' : '#15803d',
              border: `1px solid ${debe ? '#fca5a5' : '#86efac'}`,
              fontWeight: 800,
              fontSize: '12px',
              padding: '4px 10px',
            }}
          >
            ${Math.max(0, row.saldoPendienteUSD).toFixed(2)}
          </span>
        );
      },
    },
    {
      header: 'Acción',
      accessorKey: 'id',
      cell: (row) => (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => abrirModalAbono(row.companiaId, row.cicloId, Math.max(0, row.saldoPendienteUSD))}
          style={{
            padding: '5px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #059669, #047857)',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <i className="fa-solid fa-hand-holding-dollar"></i> Abonar
        </button>
      ),
    },
  ];

  const colsHistorial: ColumnDef<any>[] = [
    {
      header: 'Fecha',
      accessorKey: 'fecha',
      sortable: true,
      cell: (row) => {
        const f = row.fecha ?? row.Fecha;
        return f ? new Date(f).toLocaleDateString('es-VE') : '-';
      },
    },
    {
      header: 'Compañía',
      accessorKey: 'companiaNombre',
      sortable: true,
      cell: (row) => <strong>{row.companiaNombre ?? row.CompaniaNombre}</strong>,
    },
    {
      header: 'Semana Abonada',
      accessorKey: 'semanaCodigo',
      sortable: true,
      cell: (row) => (
        <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }}>
          {row.semanaCodigo ?? row.SemanaCodigo ?? 'General'}
        </span>
      ),
    },
    {
      header: 'Monto USD',
      accessorKey: 'montoUSD',
      sortable: true,
      cell: (row) => <strong style={{ color: '#059669' }}>${Number(row.montoUSD ?? row.MontoUSD ?? 0).toFixed(2)}</strong>,
    },
    {
      header: 'Monto Bs',
      accessorKey: 'montoBs',
      sortable: true,
      cell: (row) => `${Number(row.montoBs ?? row.MontoBs ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`,
    },
    {
      header: 'Pago / Ref.',
      accessorKey: 'referenciaBancaria',
      cell: (row) => (
        <div style={{ fontSize: '12px' }}>
          <div style={{ fontWeight: 700 }}>{row.tipoPago ?? row.TipoPago ?? 'TRANSFERENCIA'}</div>
          <div style={{ color: '#64748b' }}>
            {row.bancoNombre ?? row.BancoNombre ?? ''} {(row.referenciaBancaria ?? row.ReferenciaBancaria) ? `• Ref: ${row.referenciaBancaria ?? row.ReferenciaBancaria}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Observaciones',
      accessorKey: 'observaciones',
      cell: (row) => <span style={{ fontSize: '12px', color: '#475569' }}>{row.observaciones ?? row.Observaciones ?? '-'}</span>,
    },
    {
      header: 'Acciones',
      accessorKey: 'id',
      cell: (row) => (
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            const ok = await confirmDeleteOrDeactivate('¿Eliminar este abono?', 'El saldo pendiente de la compañía se recalculará automáticamente.');
            if (ok) eliminarAbonoMutation.mutate(row.id ?? row.Id);
          }}
          style={{
            background: '#fee2e2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '4px 8px',
            cursor: 'pointer',
          }}
          title="Eliminar abono"
        >
          <i className="fa-solid fa-trash"></i>
        </button>
      ),
    },
  ];

  return (
    <section className="tab-content active" style={{ display: 'block' }}>
      <div className="view-header">
        <div>
          <h1 className="view-title">Abonos y Cobranzas a Compañías</h1>
          <p className="view-subtitle">
            Control de litros despachados por semana, deuda en USD/Bs y registro de abonos a una o varias semanas
          </p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => abrirModalAbono()}
            style={{
              background: 'linear-gradient(135deg, #059669, #047857)',
              border: 'none',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i className="fa-solid fa-plus-circle"></i> Registrar Abono
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: '18px' }}>
        <div className="kpi-card glass-blue">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-file-invoice-dollar"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Total Facturado</span>
            <div className="kpi-value">${kpis.facturado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
            <span className="kpi-foot">{kpis.litros.toLocaleString('es-VE')} Lts despachados</span>
          </div>
        </div>
        <div className="kpi-card glass-emerald">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-money-bill-trend-up"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Total Abonado</span>
            <div className="kpi-value">${kpis.abonado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
            <span className="kpi-foot">Cobros registrados</span>
          </div>
        </div>
        <div className="kpi-card glass-amber">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-scale-unbalanced"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Por Cobrar (Saldo)</span>
            <div className="kpi-value" style={{ color: kpis.saldo > 0.01 ? '#dc2626' : '#059669' }}>
              ${kpis.saldo.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </div>
            <span className="kpi-foot">{kpis.companiasDeudoras} compañía(s) con deuda</span>
          </div>
        </div>
      </div>

      {/* Filtros + Tabs */}
      <div className="content-card" style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'end', marginBottom: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Compañía / Quesera</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todas las Compañías' },
                ...companiasExternas.map((c) => ({ value: String(c.id), label: c.nombre })),
              ]}
              value={filtroCompania}
              onChange={(val) => setFiltroCompania(String(val || ''))}
              placeholder="Todas las Compañías"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Semana Operativa</label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todas las Semanas' },
                ...semanas.map((s) => ({ value: String(s.id), label: s.codigo || `Semana #${s.id}` })),
              ]}
              value={filtroSemana}
              onChange={(val) => setFiltroSemana(String(val || ''))}
              placeholder="Todas las Semanas"
            />
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155', paddingBottom: '8px' }}>
            <input
              type="checkbox"
              checked={soloConSaldo}
              onChange={(e) => setSoloConSaldo(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
            />
            Solo semanas con saldo pendiente
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', borderBottom: '1.5px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => setTabActiva('resumen')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '13.5px',
              color: tabActiva === 'resumen' ? '#1d4ed8' : '#64748b',
              borderBottom: tabActiva === 'resumen' ? '3px solid #2563eb' : '3px solid transparent',
            }}
          >
            <i className="fa-solid fa-table-list mr-2"></i> Deuda por Compañía y Semana ({filasFiltradas.length})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('historial')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '13.5px',
              color: tabActiva === 'historial' ? '#1d4ed8' : '#64748b',
              borderBottom: tabActiva === 'historial' ? '3px solid #2563eb' : '3px solid transparent',
            }}
          >
            <i className="fa-solid fa-receipt mr-2"></i> Historial de Abonos ({abonosFiltrados.length})
          </button>
        </div>
      </div>

      {tabActiva === 'resumen' ? (
        <DataTable
          data={filasFiltradas}
          columns={colsResumen}
          isLoading={cargandoResumen}
          searchPlaceholder="Buscar compañía o semana..."
          exportFileName="Cuentas_Por_Cobrar_Companias_Semanas"
        />
      ) : (
        <DataTable
          data={abonosFiltrados}
          columns={colsHistorial}
          isLoading={cargandoAbonos}
          searchPlaceholder="Buscar por compañía, semana o referencia..."
          exportFileName="Historial_Abonos_Companias"
        />
      )}

      {/* MODAL REGISTRAR ABONO (1 O VARIAS SEMANAS) */}
      {modalAbonoOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '640px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
                padding: '16px 20px',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                  💵 Registrar Abono de Compañía
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#a7f3d0' }}>
                  Puedes abonar a una sola semana o distribuir el pago entre varias semanas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalAbonoOpen(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!abonoCompaniaId) {
                  toast.error('Selecciona una compañía');
                  return;
                }
                if (totalUsdModal <= 0) {
                  toast.error('Ingresa el monto en USD en al menos una semana');
                  return;
                }
                crearAbonoMutation.mutate();
              }}
              style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>Compañía *</label>
                  <SearchableSelect
                    options={companiasExternas.map((c) => ({ value: c.id, label: c.nombre }))}
                    value={abonoCompaniaId || ''}
                    onChange={(val) => {
                      setAbonoCompaniaId(Number(val) || 0);
                      setMontosPorSemana({});
                    }}
                    placeholder="-- Seleccionar compañía --"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>Fecha de Abono *</label>
                  <input
                    type="date"
                    required
                    value={abonoFecha}
                    onChange={(e) => setAbonoFecha(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Semanas de la compañía para asignar montos */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#065f46', marginBottom: '6px' }}>
                  Semanas con despachos de esta compañía (ingresa el monto USD a abonar en cada una):
                </label>
                {abonoCompaniaId <= 0 ? (
                  <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', fontSize: '12px', color: '#64748b' }}>
                    Selecciona primero una compañía para ver sus semanas pendientes.
                  </div>
                ) : semanasDeCompaniaModal.length === 0 ? (
                  <div style={{ padding: '12px', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>
                    Esta compañía no tiene despachos registrados aún. Selecciona una semana manualmente abajo si deseas registrar un anticipo:
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ flex: 2 }}>
                        <SearchableSelect
                          options={semanas.map((s) => ({ value: s.id, label: s.codigo || `Semana #${s.id}` }))}
                          value={Object.keys(montosPorSemana)[0] ? Number(Object.keys(montosPorSemana)[0]) : ''}
                          onChange={(val) => {
                            const cId = Number(val) || 0;
                            const prevMonto = Object.values(montosPorSemana)[0] || '';
                            setMontosPorSemana(cId ? { [cId]: prevMonto } : {});
                          }}
                          placeholder="Elegir semana..."
                        />
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="USD"
                        value={Object.values(montosPorSemana)[0] || ''}
                        onChange={(e) => {
                          const cId = Number(Object.keys(montosPorSemana)[0] || semanas[0]?.id || 0);
                          if (cId) setMontosPorSemana({ [cId]: e.target.value });
                        }}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800 }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '210px', overflowY: 'auto', padding: '4px' }}>
                    {semanasDeCompaniaModal.map((s) => (
                      <div
                        key={s.cicloId}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: '10px',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: Number(montosPorSemana[s.cicloId] || 0) > 0 ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                          background: Number(montosPorSemana[s.cicloId] || 0) > 0 ? '#f0fdf4' : '#f8fafc',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{s.semanaCodigo}</div>
                          <div style={{ fontSize: '11.5px', color: '#475569' }}>
                            {s.litrosRecibidos.toLocaleString('es-VE')} L • Facturado: <strong>${s.totalFacturadoUSD.toFixed(2)}</strong> • Abonado: <strong>${s.totalAbonadoUSD.toFixed(2)}</strong> • Saldo: <strong style={{ color: s.saldoPendienteUSD > 0.01 ? '#dc2626' : '#059669' }}>${Math.max(0, s.saldoPendienteUSD).toFixed(2)}</strong>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, color: '#059669' }}>$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={montosPorSemana[s.cicloId] ?? ''}
                            onChange={(e) =>
                              setMontosPorSemana((prev) => ({
                                ...prev,
                                [s.cicloId]: e.target.value,
                              }))
                            }
                            style={{ width: '110px', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800, textAlign: 'right' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resumen USD + Bolívares */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '12px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#065f46' }}>Total USD</span>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669' }}>${totalUsdModal.toFixed(2)}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#065f46', marginBottom: '2px' }}>Tasa BCV</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={abonoTasaBcv || ''}
                    onChange={(e) => setAbonoTasaBcv(Number(e.target.value) || 0)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#065f46', marginBottom: '2px' }}>Total Bs (opcional)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={totalBsCalculadoModal.toFixed(2)}
                    value={abonoMontoBsManual}
                    onChange={(e) => setAbonoMontoBsManual(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 800 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Método de Pago</label>
                  <SearchableSelect
                    options={[
                      { value: 'TRANSFERENCIA', label: 'Transferencia Bancaria' },
                      { value: 'PAGO_MOVIL', label: 'Pago Móvil' },
                      { value: 'EFECTIVO_USD', label: 'Efectivo USD' },
                      { value: 'ZELLE', label: 'Zelle' },
                    ]}
                    value={abonoTipoPago}
                    onChange={(val) => setAbonoTipoPago(String(val || 'TRANSFERENCIA'))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Banco (opcional)</label>
                  <SearchableSelect
                    options={[
                      { value: '', label: '-- Sin banco --' },
                      ...(bancos || []).map((b: any) => ({ value: b.id, label: b.nombre })),
                    ]}
                    value={abonoBancoId || ''}
                    onChange={(val) => setAbonoBancoId(Number(val) || 0)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Referencia bancaria / comprobante"
                  value={abonoReferencia}
                  onChange={(e) => setAbonoReferencia(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
                <input
                  type="text"
                  placeholder="Observaciones (opcional)"
                  value={abonoObs}
                  onChange={(e) => setAbonoObs(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setModalAbonoOpen(false)}
                  style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={crearAbonoMutation.isPending}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {crearAbonoMutation.isPending ? 'Guardando...' : `Guardar Abono ($${totalUsdModal.toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default AbonosCompaniasPage;
