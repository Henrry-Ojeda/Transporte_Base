import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogosApi } from '@/api/catalogos.api';
import { bcvApi } from '@/api/bcv.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { esReceptoriaPrincipal } from '@/utils/procesoViaje';
import type { CompaniaDto } from '@/types';

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

interface FilaCompaniaResumen {
  companiaId: number;
  companiaNombre: string;
  precioLitroUSD: number;
  cantidadSemanas: number;
  cantidadDespachos: number;
  litrosRecibidos: number;
  totalFacturadoUSD: number;
  totalAbonadoUSD: number;
  saldoPendienteUSD: number;
}

const fmtUSD = (val: number) =>
  `$${Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtBs = (val: number) =>
  `${Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;

const fmtLitros = (val: number) => `${Number(val || 0).toLocaleString('es-VE')} L`;

export const AbonosCompaniasPage: React.FC = () => {
  const queryClient = useQueryClient();
  const hoyStr = new Date().toISOString().split('T')[0];

  const [tabActiva, setTabActiva] = useState<'resumen' | 'companias' | 'historial'>('resumen');
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

  // Modal Detalle de Cuenta (Compañía + Semana, o Compañía general)
  const [detalleCuenta, setDetalleCuenta] = useState<{
    companiaId: number;
    companiaNombre: string;
    cicloId?: number;
    semanaCodigo?: string;
    litrosRecibidos: number;
    cantidadDespachos: number;
    totalFacturadoUSD: number;
    totalAbonadoUSD: number;
    saldoPendienteUSD: number;
  } | null>(null);

  // Modal Detalle de Abono individual (comprobante)
  const [detalleAbonoItem, setDetalleAbonoItem] = useState<any | null>(null);

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

  // Normalizar filas Compañía + Semana (solo semanas que tengan despachos)
  const filasSemanas: FilaSemanaCobro[] = useMemo(() => {
    return (resumenSemanasRaw || [])
      .map((r: any) => {
        const compId = Number(r.companiaId ?? r.CompaniaId ?? 0);
        const cicId = Number(r.cicloId ?? r.CicloId ?? 0);
        const litrosRec = Number(r.litrosRecibidos ?? r.LitrosRecibidos ?? 0);
        const litrosDesp = Number(r.litrosDespachados ?? r.LitrosDespachados ?? 0);
        const cantDesp = Number(r.cantidadDespachos ?? r.CantidadDespachos ?? 0);
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
          litrosDespachados: litrosDesp,
          litrosRecibidos: litrosRec,
          cantidadDespachos: cantDesp,
          totalFacturadoUSD: facturado,
          totalAbonadoUSD: abonado,
          saldoPendienteUSD: saldo,
        };
      })
      .filter((f) => f.cantidadDespachos > 0 || f.litrosRecibidos > 0 || f.litrosDespachados > 0);
  }, [resumenSemanasRaw]);

  // Solo semanas que tienen despachos (para el selector de filtro)
  const semanasConDespachos = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of filasSemanas) {
      if (filtroCompania && String(f.companiaId) !== filtroCompania) continue;
      if (f.cicloId > 0 && !map.has(f.cicloId)) {
        map.set(f.cicloId, f.semanaCodigo);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([id, codigo]) => ({ id, codigo }));
  }, [filasSemanas, filtroCompania]);

  const filasFiltradas = useMemo(() => {
    return filasSemanas.filter((f) => {
      if (filtroCompania && String(f.companiaId) !== filtroCompania) return false;
      if (filtroSemana && String(f.cicloId) !== filtroSemana) return false;
      if (soloConSaldo && f.saldoPendienteUSD <= 0.01) return false;
      return true;
    });
  }, [filasSemanas, filtroCompania, filtroSemana, soloConSaldo]);

  // Agrupado por Compañía
  const filasPorCompania: FilaCompaniaResumen[] = useMemo(() => {
    const map = new Map<number, FilaCompaniaResumen>();
    for (const f of filasFiltradas) {
      const existing = map.get(f.companiaId);
      if (existing) {
        existing.cantidadSemanas += 1;
        existing.cantidadDespachos += f.cantidadDespachos;
        existing.litrosRecibidos += f.litrosRecibidos;
        existing.totalFacturadoUSD += f.totalFacturadoUSD;
        existing.totalAbonadoUSD += f.totalAbonadoUSD;
        existing.saldoPendienteUSD += f.saldoPendienteUSD;
      } else {
        map.set(f.companiaId, {
          companiaId: f.companiaId,
          companiaNombre: f.companiaNombre,
          precioLitroUSD: f.precioLitroUSD,
          cantidadSemanas: 1,
          cantidadDespachos: f.cantidadDespachos,
          litrosRecibidos: f.litrosRecibidos,
          totalFacturadoUSD: f.totalFacturadoUSD,
          totalAbonadoUSD: f.totalAbonadoUSD,
          saldoPendienteUSD: f.saldoPendienteUSD,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.saldoPendienteUSD - a.saldoPendienteUSD);
  }, [filasFiltradas]);

  const abonosFiltrados = useMemo(() => {
    return (abonosRaw || []).filter((a: any) => {
      if (filtroCompania && String(a.companiaId ?? a.CompaniaId) !== filtroCompania) return false;
      if (filtroSemana && String(a.cicloId ?? a.CicloId ?? 0) !== filtroSemana) return false;
      return true;
    });
  }, [abonosRaw, filtroCompania, filtroSemana]);

  // Abonos asociados al modal de Detalle de Cuenta abierto
  const abonosDetalleCuenta = useMemo(() => {
    if (!detalleCuenta) return [];
    return (abonosRaw || []).filter((a: any) => {
      const cId = Number(a.companiaId ?? a.CompaniaId ?? 0);
      const cicId = Number(a.cicloId ?? a.CicloId ?? 0);
      if (cId !== detalleCuenta.companiaId) return false;
      if (detalleCuenta.cicloId && cicId !== detalleCuenta.cicloId) return false;
      return true;
    });
  }, [abonosRaw, detalleCuenta]);

  // KPIs
  const kpis = useMemo(() => {
    const facturado = filasFiltradas.reduce((acc, f) => acc + f.totalFacturadoUSD, 0);
    const abonado = filasFiltradas.reduce((acc, f) => acc + f.totalAbonadoUSD, 0);
    const saldo = filasFiltradas.reduce((acc, f) => acc + Math.max(0, f.saldoPendienteUSD), 0);
    const litros = filasFiltradas.reduce((acc, f) => acc + f.litrosRecibidos, 0);
    const companiasDeudoras = new Set(
      filasFiltradas.filter((f) => f.saldoPendienteUSD > 0.01).map((f) => f.companiaId)
    ).size;
    const pctCobrado = facturado > 0 ? Math.min(100, (abonado / facturado) * 100) : 0;
    return { facturado, abonado, saldo, litros, companiasDeudoras, pctCobrado };
  }, [filasFiltradas]);

  // Semanas con despachos de la compañía seleccionada en el modal
  const semanasDeCompaniaModal = useMemo(() => {
    if (!abonoCompaniaId) return [];
    return filasSemanas.filter((f) => f.companiaId === abonoCompaniaId);
  }, [filasSemanas, abonoCompaniaId]);

  const totalUsdModal = useMemo(() => {
    return Object.values(montosPorSemana).reduce((acc, v) => acc + (Number(v) || 0), 0);
  }, [montosPorSemana]);

  const tasaEfectivaModal = abonoTasaBcv > 0 ? abonoTasaBcv : tasaActual;
  const totalBsCalculadoModal =
    abonoMontoBsManual !== ''
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
      setDetalleAbonoItem(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error al eliminar abono'),
  });

  const renderProgressAndEstado = (facturado: number, abonado: number, saldo: number) => {
    const pct = facturado > 0 ? Math.min(100, Math.round((abonado / facturado) * 100)) : 0;
    const pagado = saldo <= 0.01;
    const parcial = !pagado && abonado > 0.01;

    return (
      <div style={{ minWidth: '140px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: '12.5px',
              color: pagado ? '#15803d' : '#b91c1c',
            }}
          >
            {fmtUSD(Math.max(0, saldo))}
          </span>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: '999px',
              background: pagado ? '#dcfce7' : parcial ? '#fef3c7' : '#fee2e2',
              color: pagado ? '#15803d' : parcial ? '#b45309' : '#b91c1c',
            }}
          >
            {pagado ? 'Pagado' : parcial ? `Parcial (${pct}%)` : 'Pendiente'}
          </span>
        </div>
        <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: pagado ? '#10b981' : parcial ? '#f59e0b' : '#ef4444',
              borderRadius: '999px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>
    );
  };

  const colsResumen: ColumnDef<FilaSemanaCobro>[] = [
    {
      header: 'Compañía / Quesera',
      accessorKey: 'companiaNombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13.5px' }}>{row.companiaNombre}</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            Tarifa base: <strong style={{ color: '#475569' }}>{fmtUSD(row.precioLitroUSD)} / L</strong>
          </div>
        </div>
      ),
    },
    {
      header: 'Semana Operativa',
      accessorKey: 'semanaCodigo',
      sortable: true,
      cell: (row) => (
        <span
          className="badge"
          style={{
            background: '#eff6ff',
            color: '#1d4ed8',
            border: '1px solid #bfdbfe',
            fontWeight: 800,
            fontSize: '11.5px',
            padding: '4px 10px',
            borderRadius: '8px',
          }}
        >
          <i className="fa-regular fa-calendar mr-1"></i> {row.semanaCodigo}
        </span>
      ),
    },
    {
      header: 'Despachos',
      accessorKey: 'litrosRecibidos',
      sortable: true,
      cell: (row) => (
        <div>
          <strong style={{ color: '#0f172a', fontSize: '13px' }}>{fmtLitros(row.litrosRecibidos)}</strong>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {row.cantidadDespachos} despacho{row.cantidadDespachos === 1 ? '' : 's'}
          </div>
        </div>
      ),
    },
    {
      header: 'Facturado',
      accessorKey: 'totalFacturadoUSD',
      sortable: true,
      cell: (row) => <strong style={{ color: '#1e293b' }}>{fmtUSD(row.totalFacturadoUSD)}</strong>,
    },
    {
      header: 'Abonado',
      accessorKey: 'totalAbonadoUSD',
      sortable: true,
      cell: (row) => (
        <strong style={{ color: row.totalAbonadoUSD > 0 ? '#059669' : '#94a3b8' }}>
          {fmtUSD(row.totalAbonadoUSD)}
        </strong>
      ),
    },
    {
      header: 'Saldo Pendiente',
      accessorKey: 'saldoPendienteUSD',
      sortable: true,
      cell: (row) => renderProgressAndEstado(row.totalFacturadoUSD, row.totalAbonadoUSD, row.saldoPendienteUSD),
    },
    {
      header: 'Acciones',
      accessorKey: 'id',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            title="Ver detalle de abonos y despachos"
            onClick={() =>
              setDetalleCuenta({
                companiaId: row.companiaId,
                companiaNombre: row.companiaNombre,
                cicloId: row.cicloId,
                semanaCodigo: row.semanaCodigo,
                litrosRecibidos: row.litrosRecibidos,
                cantidadDespachos: row.cantidadDespachos,
                totalFacturadoUSD: row.totalFacturadoUSD,
                totalAbonadoUSD: row.totalAbonadoUSD,
                saldoPendienteUSD: row.saldoPendienteUSD,
              })
            }
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <i className="fa-solid fa-eye"></i> Detalles
          </button>
          <button
            type="button"
            onClick={() => abrirModalAbono(row.companiaId, row.cicloId)}
            style={{
              padding: '6px 10px',
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
          {row.saldoPendienteUSD > 0.01 && (
            <button
              type="button"
              title="Pagar el 100% del saldo pendiente de esta semana"
              onClick={() => abrirModalAbono(row.companiaId, row.cicloId, row.saldoPendienteUSD)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <i className="fa-solid fa-check-double"></i> Cancelar Semana
            </button>
          )}
        </div>
      ),
    },
  ];

  const colsPorCompania: ColumnDef<FilaCompaniaResumen>[] = [
    {
      header: 'Compañía / Quesera',
      accessorKey: 'companiaNombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13.5px' }}>{row.companiaNombre}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {row.cantidadSemanas} semana{row.cantidadSemanas === 1 ? '' : 's'} con despachos • Base {fmtUSD(row.precioLitroUSD)}/L
          </div>
        </div>
      ),
    },
    {
      header: 'Total Litros',
      accessorKey: 'litrosRecibidos',
      sortable: true,
      cell: (row) => (
        <div>
          <strong style={{ color: '#0f172a' }}>{fmtLitros(row.litrosRecibidos)}</strong>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{row.cantidadDespachos} despachos</div>
        </div>
      ),
    },
    {
      header: 'Total Facturado',
      accessorKey: 'totalFacturadoUSD',
      sortable: true,
      cell: (row) => <strong style={{ color: '#1e293b' }}>{fmtUSD(row.totalFacturadoUSD)}</strong>,
    },
    {
      header: 'Total Abonado',
      accessorKey: 'totalAbonadoUSD',
      sortable: true,
      cell: (row) => (
        <strong style={{ color: row.totalAbonadoUSD > 0 ? '#059669' : '#94a3b8' }}>
          {fmtUSD(row.totalAbonadoUSD)}
        </strong>
      ),
    },
    {
      header: 'Deuda Total',
      accessorKey: 'saldoPendienteUSD',
      sortable: true,
      cell: (row) => renderProgressAndEstado(row.totalFacturadoUSD, row.totalAbonadoUSD, row.saldoPendienteUSD),
    },
    {
      header: 'Acciones',
      accessorKey: 'companiaId',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() =>
              setDetalleCuenta({
                companiaId: row.companiaId,
                companiaNombre: row.companiaNombre,
                litrosRecibidos: row.litrosRecibidos,
                cantidadDespachos: row.cantidadDespachos,
                totalFacturadoUSD: row.totalFacturadoUSD,
                totalAbonadoUSD: row.totalAbonadoUSD,
                saldoPendienteUSD: row.saldoPendienteUSD,
              })
            }
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <i className="fa-solid fa-eye"></i> Detalles
          </button>
          <button
            type="button"
            onClick={() => abrirModalAbono(row.companiaId)}
            style={{
              padding: '6px 12px',
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
        </div>
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
        return (
          <span style={{ fontWeight: 700, color: '#334155' }}>
            {f ? new Date(f).toLocaleDateString('es-VE') : '-'}
          </span>
        );
      },
    },
    {
      header: 'Compañía',
      accessorKey: 'companiaNombre',
      sortable: true,
      cell: (row) => <strong style={{ color: '#0f172a' }}>{row.companiaNombre ?? row.CompaniaNombre}</strong>,
    },
    {
      header: 'Semana Abonada',
      accessorKey: 'semanaCodigo',
      sortable: true,
      cell: (row) => (
        <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, border: '1px solid #bfdbfe' }}>
          {row.semanaCodigo ?? row.SemanaCodigo ?? 'General'}
        </span>
      ),
    },
    {
      header: 'Monto USD',
      accessorKey: 'montoUSD',
      sortable: true,
      cell: (row) => <strong style={{ color: '#059669', fontSize: '13.5px' }}>{fmtUSD(Number(row.montoUSD ?? row.MontoUSD ?? 0))}</strong>,
    },
    {
      header: 'Equivalente Bs',
      accessorKey: 'montoBs',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 700, color: '#334155' }}>{fmtBs(Number(row.montoBs ?? row.MontoBs ?? 0))}</div>
          {Number(row.tasaBcv ?? row.TasaBcv ?? 0) > 0 && (
            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
              Tasa: {Number(row.tasaBcv ?? row.TasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Pago / Referencia',
      accessorKey: 'referenciaBancaria',
      cell: (row) => (
        <div style={{ fontSize: '12px' }}>
          <div style={{ fontWeight: 700, color: '#1e293b' }}>{row.tipoPago ?? row.TipoPago ?? 'TRANSFERENCIA'}</div>
          <div style={{ color: '#64748b' }}>
            {row.bancoNombre ?? row.BancoNombre ?? 'Sin banco'}
            {(row.referenciaBancaria ?? row.ReferenciaBancaria) ? ` • Ref: ${row.referenciaBancaria ?? row.ReferenciaBancaria}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Acciones',
      accessorKey: 'id',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            title="Ver comprobante detallado"
            onClick={() => setDetalleAbonoItem(row)}
            style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              borderRadius: '7px',
              padding: '5px 9px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <i className="fa-solid fa-eye"></i> Detalle
          </button>
          <button
            type="button"
            title="Eliminar abono"
            onClick={async () => {
              const ok = await confirmDeleteOrDeactivate(
                '¿Eliminar este abono?',
                'El saldo pendiente de la compañía se recalculará automáticamente.'
              );
              if (ok) eliminarAbonoMutation.mutate(row.id ?? row.Id);
            }}
            style={{
              background: '#fee2e2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              borderRadius: '7px',
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-container fade-in">
      {/* Header Ejecutivo */}
      <div
        className="content-card"
        style={{
          padding: '18px 22px',
          marginBottom: '18px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: '#34d399',
              }}
            >
              <i className="fa-solid fa-building-columns"></i>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: '#ffffff' }}>
                Cuentas por Cobrar y Abonos a Compañías
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                Control de despachos por semana operativa, saldos pendientes y detalle de cobranzas en USD / Bs
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => abrirModalAbono()}
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 18px',
            fontWeight: 800,
            fontSize: '13.5px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 6px 16px rgba(16, 185, 129, 0.3)',
          }}
        >
          <i className="fa-solid fa-plus-circle"></i> Registrar Abono
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '18px' }}>
        <div className="kpi-card glass-blue">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-file-invoice-dollar"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Total Facturado</span>
            <div className="kpi-value">{fmtUSD(kpis.facturado)}</div>
            <span className="kpi-foot">{kpis.litros.toLocaleString('es-VE')} Lts despachados</span>
          </div>
        </div>
        <div className="kpi-card glass-emerald">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-money-bill-trend-up"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Total Abonado</span>
            <div className="kpi-value">{fmtUSD(kpis.abonado)}</div>
            <span className="kpi-foot">
              {abonosFiltrados.length} cobro(s) • {kpis.pctCobrado.toFixed(1)}% recuperado
            </span>
          </div>
        </div>
        <div className="kpi-card glass-amber">
          <div className="kpi-icon-wrap"><i className="fa-solid fa-scale-unbalanced"></i></div>
          <div className="kpi-content">
            <span className="kpi-title">Por Cobrar (Saldo)</span>
            <div className="kpi-value" style={{ color: kpis.saldo > 0.01 ? '#dc2626' : '#059669' }}>
              {fmtUSD(kpis.saldo)}
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
              onChange={(val) => {
                setFiltroCompania(String(val || ''));
                setFiltroSemana('');
              }}
              placeholder="Todas las Compañías"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Semana Operativa (solo con despachos)
            </label>
            <SearchableSelect
              options={[
                { value: '', label: `Todas las Semanas (${semanasConDespachos.length})` },
                ...semanasConDespachos.map((s) => ({ value: String(s.id), label: s.codigo })),
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

        <div style={{ display: 'flex', gap: '6px', borderBottom: '1.5px solid #e2e8f0', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setTabActiva('resumen')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '13px',
              color: tabActiva === 'resumen' ? '#1d4ed8' : '#64748b',
              borderBottom: tabActiva === 'resumen' ? '3px solid #2563eb' : '3px solid transparent',
            }}
          >
            <i className="fa-solid fa-table-list mr-2"></i> Por Compañía y Semana ({filasFiltradas.length})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('companias')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '13px',
              color: tabActiva === 'companias' ? '#1d4ed8' : '#64748b',
              borderBottom: tabActiva === 'companias' ? '3px solid #2563eb' : '3px solid transparent',
            }}
          >
            <i className="fa-solid fa-building mr-2"></i> Resumen por Compañía ({filasPorCompania.length})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('historial')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '13px',
              color: tabActiva === 'historial' ? '#1d4ed8' : '#64748b',
              borderBottom: tabActiva === 'historial' ? '3px solid #2563eb' : '3px solid transparent',
            }}
          >
            <i className="fa-solid fa-receipt mr-2"></i> Historial de Abonos ({abonosFiltrados.length})
          </button>
        </div>
      </div>

      {tabActiva === 'resumen' && (
        <DataTable
          data={filasFiltradas}
          columns={colsResumen}
          isLoading={cargandoResumen}
          searchPlaceholder="Buscar compañía o semana..."
          exportFileName="Cuentas_Por_Cobrar_Companias_Semanas"
        />
      )}

      {tabActiva === 'companias' && (
        <DataTable
          data={filasPorCompania}
          columns={colsPorCompania}
          isLoading={cargandoResumen}
          searchPlaceholder="Buscar compañía..."
          exportFileName="Resumen_Deuda_Por_Compania"
        />
      )}

      {tabActiva === 'historial' && (
        <DataTable
          data={abonosFiltrados}
          columns={colsHistorial}
          isLoading={cargandoAbonos}
          searchPlaceholder="Buscar por compañía, semana o referencia..."
          exportFileName="Historial_Abonos_Companias"
        />
      )}

      {/* MODAL DETALLE DE CUENTA (COMPAÑÍA / SEMANA + SUS ABONOS) */}
      {detalleCuenta && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(4px)',
            zIndex: 9998,
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
              maxWidth: '720px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                padding: '16px 22px',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 900 }}>
                  <i className="fa-solid fa-file-invoice-dollar mr-2" style={{ color: '#38bdf8' }}></i>
                  Estado de Cuenta: {detalleCuenta.companiaNombre}
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  {detalleCuenta.semanaCodigo ? detalleCuenta.semanaCodigo : 'Consolidado de todas las semanas con despachos'} •{' '}
                  {fmtLitros(detalleCuenta.litrosRecibidos)} ({detalleCuenta.cantidadDespachos} despachos)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetalleCuenta(null)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Resumen financiero */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ padding: '12px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Facturado</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                    {fmtUSD(detalleCuenta.totalFacturadoUSD)}
                  </div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Total Abonado</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
                    {fmtUSD(detalleCuenta.totalAbonadoUSD)}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: detalleCuenta.saldoPendienteUSD > 0.01 ? '#fef2f2' : '#f0fdf4',
                    border: `1px solid ${detalleCuenta.saldoPendienteUSD > 0.01 ? '#fecaca' : '#bbf7d0'}`,
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: detalleCuenta.saldoPendienteUSD > 0.01 ? '#b91c1c' : '#15803d', textTransform: 'uppercase' }}>
                    Saldo Pendiente
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: detalleCuenta.saldoPendienteUSD > 0.01 ? '#dc2626' : '#059669', marginTop: '2px' }}>
                    {fmtUSD(Math.max(0, detalleCuenta.saldoPendienteUSD))}
                  </div>
                </div>
              </div>

              {/* Lista de Abonos */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
                    <i className="fa-solid fa-receipt mr-2" style={{ color: '#059669' }}></i>
                    Abonos Registrados ({abonosDetalleCuenta.length})
                  </h4>
                  {detalleCuenta.saldoPendienteUSD > 0.01 && (
                    <button
                      type="button"
                      onClick={() => {
                        const dc = detalleCuenta;
                        setDetalleCuenta(null);
                        abrirModalAbono(dc.companiaId, dc.cicloId, dc.saldoPendienteUSD);
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#059669',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fa-solid fa-plus mr-1"></i> Registrar Abono
                    </button>
                  )}
                </div>

                {abonosDetalleCuenta.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '13px' }}>
                    No se han registrado abonos para esta selección todavía.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {abonosDetalleCuenta.map((ab: any) => {
                      const f = ab.fecha ?? ab.Fecha;
                      const mUsd = Number(ab.montoUSD ?? ab.MontoUSD ?? 0);
                      const mBs = Number(ab.montoBs ?? ab.MontoBs ?? 0);
                      const tasa = Number(ab.tasaBcv ?? ab.TasaBcv ?? 0);
                      const ref = ab.referenciaBancaria ?? ab.ReferenciaBancaria;
                      const obs = ab.observaciones ?? ab.Observaciones;
                      return (
                        <div
                          key={ab.id ?? ab.Id}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            background: '#ffffff',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ color: '#059669', fontSize: '14.5px' }}>{fmtUSD(mUsd)}</strong>
                              <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>({fmtBs(mBs)})</span>
                              <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '10.5px', fontWeight: 700 }}>
                                {ab.semanaCodigo ?? ab.SemanaCodigo ?? 'General'}
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                • {f ? new Date(f).toLocaleDateString('es-VE') : '-'}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                              <strong>{ab.tipoPago ?? ab.TipoPago ?? 'TRANSFERENCIA'}</strong>
                              {(ab.bancoNombre ?? ab.BancoNombre) ? ` • ${ab.bancoNombre ?? ab.BancoNombre}` : ''}
                              {ref ? ` • Ref: ${ref}` : ''}
                              {tasa > 0 ? ` • Tasa BCV: ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''}
                            </div>
                            {obs && (
                              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', fontStyle: 'italic' }}>
                                "{obs}"
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setDetalleAbonoItem(ab)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              border: '1px solid #bfdbfe',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Comprobante
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COMPROBANTE INDIVIDUAL DE ABONO */}
      {detalleAbonoItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
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
              maxWidth: '480px',
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
                  <i className="fa-solid fa-receipt mr-2"></i> Detalle del Abono #{detalleAbonoItem.id ?? detalleAbonoItem.Id}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#a7f3d0' }}>
                  Comprobante de cobranza registrada
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetalleAbonoItem(null)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', padding: '14px', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Monto Abonado</div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669' }}>
                  {fmtUSD(Number(detalleAbonoItem.montoUSD ?? detalleAbonoItem.MontoUSD ?? 0))}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                  {fmtBs(Number(detalleAbonoItem.montoBs ?? detalleAbonoItem.MontoBs ?? 0))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 }}>Compañía</div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{detalleAbonoItem.companiaNombre ?? detalleAbonoItem.CompaniaNombre}</div>
                </div>
                <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 }}>Semana Aplicada</div>
                  <div style={{ fontWeight: 800, color: '#1d4ed8' }}>{detalleAbonoItem.semanaCodigo ?? detalleAbonoItem.SemanaCodigo ?? 'General'}</div>
                </div>
                <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 }}>Fecha de Pago</div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    {(detalleAbonoItem.fecha ?? detalleAbonoItem.Fecha)
                      ? new Date(detalleAbonoItem.fecha ?? detalleAbonoItem.Fecha).toLocaleDateString('es-VE')
                      : '-'}
                  </div>
                </div>
                <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 }}>Tasa BCV</div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    {Number(detalleAbonoItem.tasaBcv ?? detalleAbonoItem.TasaBcv ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/USD
                  </div>
                </div>
                <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 }}>Método de Pago</div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{detalleAbonoItem.tipoPago ?? detalleAbonoItem.TipoPago ?? 'TRANSFERENCIA'}</div>
                </div>
                <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 }}>Banco / Referencia</div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    {detalleAbonoItem.bancoNombre ?? detalleAbonoItem.BancoNombre ?? 'Sin banco'}
                    {(detalleAbonoItem.referenciaBancaria ?? detalleAbonoItem.ReferenciaBancaria)
                      ? ` • ${detalleAbonoItem.referenciaBancaria ?? detalleAbonoItem.ReferenciaBancaria}`
                      : ''}
                  </div>
                </div>
              </div>

              {(detalleAbonoItem.observaciones ?? detalleAbonoItem.Observaciones) && (
                <div style={{ padding: '10px 12px', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', fontSize: '12.5px', color: '#78350f' }}>
                  <strong>Observaciones:</strong> {detalleAbonoItem.observaciones ?? detalleAbonoItem.Observaciones}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setDetalleAbonoItem(null)}
                  style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
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
              maxWidth: '660px',
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
                  Selecciona o distribuye el pago entre las semanas con despachos de esta compañía
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

              {/* Semanas con despachos de la compañía */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#065f46', margin: 0 }}>
                    Semanas con despachos de esta compañía (ingresa el monto USD a abonar):
                  </label>
                  {semanasDeCompaniaModal.some((s) => s.saldoPendienteUSD > 0.01) && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const all: Record<number, string> = {};
                          for (const s of semanasDeCompaniaModal) {
                            if (s.saldoPendienteUSD > 0.01) {
                              all[s.cicloId] = s.saldoPendienteUSD.toFixed(2);
                            }
                          }
                          setMontosPorSemana(all);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '7px',
                          border: '1px solid #bae6fd',
                          background: '#e0f2fe',
                          color: '#0369a1',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        <i className="fa-solid fa-check-double mr-1"></i> Cancelar Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setMontosPorSemana({})}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '7px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#475569',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Limpiar
                      </button>
                    </div>
                  )}
                </div>
                {abonoCompaniaId <= 0 ? (
                  <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', fontSize: '12.5px', color: '#64748b', textAlign: 'center' }}>
                    Selecciona primero una compañía para ver sus semanas con despachos.
                  </div>
                ) : semanasDeCompaniaModal.length === 0 ? (
                  <div style={{ padding: '14px', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', fontSize: '12.5px', color: '#92400e', textAlign: 'center' }}>
                    Esta compañía aún no tiene semanas con despachos registrados.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', padding: '4px' }}>
                    {semanasDeCompaniaModal.map((s) => {
                      const ingresado = Number(montosPorSemana[s.cicloId] || 0);
                      const saldoActual = Math.max(0, s.saldoPendienteUSD);
                      const restante = Math.max(0, saldoActual - ingresado);
                      return (
                        <div
                          key={s.cicloId}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            gap: '10px',
                            alignItems: 'center',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            border: ingresado > 0 ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                            background: ingresado > 0 ? '#f0fdf4' : '#f8fafc',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{s.semanaCodigo}</span>
                              {saldoActual <= 0.01 && (
                                <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '999px', background: '#dcfce7', color: '#15803d' }}>
                                  Pagado
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                              {fmtLitros(s.litrosRecibidos)} • Facturado: <strong>{fmtUSD(s.totalFacturadoUSD)}</strong> • Abonado:{' '}
                              <strong>{fmtUSD(s.totalAbonadoUSD)}</strong> • Saldo:{' '}
                              <strong style={{ color: saldoActual > 0.01 ? '#dc2626' : '#059669' }}>{fmtUSD(saldoActual)}</strong>
                            </div>
                            {ingresado > 0 && (
                              <div style={{ fontSize: '11px', color: '#047857', fontWeight: 700, marginTop: '2px' }}>
                                Saldo luego del abono: {fmtUSD(restante)}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {saldoActual > 0.01 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setMontosPorSemana((prev) => ({
                                    ...prev,
                                    [s.cicloId]: saldoActual.toFixed(2),
                                  }))
                                }
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #a7f3d0',
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                              >
                                Cancelar Semana
                              </button>
                            )}
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
                              style={{ width: '105px', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800, textAlign: 'right' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Resumen USD + Tasa BCV + Bolívares */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '12px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534' }}>Total USD</span>
                  <div style={{ fontSize: '19px', fontWeight: 900, color: '#059669' }}>{fmtUSD(totalUsdModal)}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '2px' }}>Tasa BCV</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={abonoTasaBcv || ''}
                    onChange={(e) => setAbonoTasaBcv(Number(e.target.value) || 0)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '2px' }}>Total Bs (opcional)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={(totalUsdModal * tasaEfectivaModal).toFixed(2)}
                    value={abonoMontoBsManual}
                    onChange={(e) => setAbonoMontoBsManual(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 800 }}
                  />
                </div>
              </div>

              {/* Método de pago, banco, referencia y observaciones */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Método de Pago</label>
                  <SearchableSelect
                    options={[
                      { value: 'TRANSFERENCIA', label: 'Transferencia Bancaria' },
                      { value: 'PAGO_MOVIL', label: 'Pago Móvil' },
                      { value: 'EFECTIVO_USD', label: 'Efectivo USD' },
                      { value: 'EFECTIVO_BS', label: 'Efectivo Bs' },
                      { value: 'ZELLE', label: 'Zelle' },
                    ]}
                    value={abonoTipoPago}
                    onChange={(val) => setAbonoTipoPago(String(val || 'TRANSFERENCIA'))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Banco (opcional)</label>
                  <SearchableSelect
                    options={[
                      { value: 0, label: '-- Sin banco --' },
                      ...bancos.map((b: any) => ({ value: b.id ?? b.Id, label: b.nombre ?? b.Nombre })),
                    ]}
                    value={abonoBancoId}
                    onChange={(val) => setAbonoBancoId(Number(val) || 0)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Referencia bancaria / comprobante"
                  value={abonoReferencia}
                  onChange={(e) => setAbonoReferencia(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
                <input
                  type="text"
                  placeholder="Observaciones (opcional)"
                  value={abonoObs}
                  onChange={(e) => setAbonoObs(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setModalAbonoOpen(false)}
                  style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={crearAbonoMutation.isPending || totalUsdModal <= 0}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: crearAbonoMutation.isPending || totalUsdModal <= 0 ? 'not-allowed' : 'pointer',
                    opacity: crearAbonoMutation.isPending || totalUsdModal <= 0 ? 0.65 : 1,
                  }}
                >
                  {crearAbonoMutation.isPending ? 'Guardando...' : `Guardar Abono (${fmtUSD(totalUsdModal)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
