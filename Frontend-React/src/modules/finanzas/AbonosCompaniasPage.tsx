import React, { useState, useMemo, useEffect } from 'react';
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
  precioBufalaLitroUSD: number;
  precioAcidaLitroUSD: number;
  cicloId: number;
  semanaCodigo: string;
  litrosDespachados: number;
  litrosRecibidos: number;
  litrosVaca: number;
  litrosBufala: number;
  litrosAcida: number;
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

interface DespachoSemanaItem {
  id: number;
  fecha: string;
  tipoLeche: string;
  litrosDespachados: number;
  litrosRecibidos: number;
  precioLitroUSD: number;
  montoUSD: number;
  observacion?: string;
}

const fmtUSD = (val: number) =>
  `$${Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtBs = (val: number) =>
  `${Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;

const fmtLitros = (val: number) => `${Number(val || 0).toLocaleString('es-VE')} L`;

const badgeTipoLeche = (tipo: string) => {
  const t = (tipo || 'VACA').toUpperCase();
  if (t === 'BUFALA') {
    return { bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe', label: 'Búfala' };
  }
  if (t === 'ACIDA') {
    return { bg: '#fef3c7', color: '#b45309', border: '#fde68a', label: 'Ácida' };
  }
  return { bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe', label: 'Vaca' };
};

export const AbonosCompaniasPage: React.FC = () => {
  const queryClient = useQueryClient();
  const hoyStr = new Date().toISOString().split('T')[0];

  const [tabActiva, setTabActiva] = useState<'resumen' | 'companias' | 'historial'>('resumen');
  const [filtroCompania, setFiltroCompania] = useState<string>('');
  const [filtroSemana, setFiltroSemana] = useState<string>('');
  const [soloConSaldo, setSoloConSaldo] = useState<boolean>(false);

  // Modal Detalle + Abono de UNA SEMANA ESPECÍFICA
  const [semanaActiva, setSemanaActiva] = useState<FilaSemanaCobro | null>(null);
  const [preciosEditados, setPreciosEditados] = useState<Record<number, string>>({});
  const [tiposEditados, setTiposEditados] = useState<Record<number, string>>({});
  const [semMontoUSD, setSemMontoUSD] = useState<string>('');
  const [semFecha, setSemFecha] = useState<string>(hoyStr);
  const [semTasaBcv, setSemTasaBcv] = useState<number>(0);
  const [semMontoBsManual, setSemMontoBsManual] = useState<string>('');
  const [semTipoPago, setSemTipoPago] = useState<string>('TRANSFERENCIA');
  const [semBancoId, setSemBancoId] = useState<number>(0);
  const [semReferencia, setSemReferencia] = useState<string>('');
  const [semObs, setSemObs] = useState<string>('');

  // Modal General Registrar Abono (para botón superior multi-semana)
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

  // Modal Detalle Consolidado de Compañía (desde tab Resumen por Compañía)
  const [detalleCompania, setDetalleCompania] = useState<FilaCompaniaResumen | null>(null);

  // Modal Comprobante individual de Abono
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

  // Query de despachos diarios de la semana abierta
  const { data: despachosSemanaRaw = [], isLoading: cargandoDespachosSemana } = useQuery<any[]>({
    queryKey: ['compania-semana-despachos', semanaActiva?.companiaId, semanaActiva?.cicloId],
    queryFn: () =>
      semanaActiva
        ? catalogosApi.getDespachosSemanaCompania(semanaActiva.companiaId, semanaActiva.cicloId)
        : Promise.resolve([]),
    enabled: !!semanaActiva,
  });

  const despachosSemana: DespachoSemanaItem[] = useMemo(() => {
    return (despachosSemanaRaw || []).map((d: any) => ({
      id: Number(d.id ?? d.Id ?? 0),
      fecha: d.fecha ?? d.Fecha ?? '',
      tipoLeche: String(d.tipoLeche ?? d.TipoLeche ?? 'VACA').toUpperCase(),
      litrosDespachados: Number(d.litrosDespachados ?? d.LitrosDespachados ?? 0),
      litrosRecibidos: Number(d.litrosRecibidos ?? d.LitrosRecibidos ?? 0),
      precioLitroUSD: Number(d.precioLitroUSD ?? d.PrecioLitroUSD ?? 0),
      montoUSD: Number(d.montoUSD ?? d.MontoUSD ?? 0),
      observacion: d.observacion ?? d.Observacion ?? '',
    }));
  }, [despachosSemanaRaw]);

  useEffect(() => {
    if (!semanaActiva || despachosSemana.length === 0) {
      setPreciosEditados({});
      setTiposEditados({});
      return;
    }
    const pMap: Record<number, string> = {};
    const tMap: Record<number, string> = {};
    for (const d of despachosSemana) {
      pMap[d.id] = d.precioLitroUSD.toFixed(2);
      tMap[d.id] = d.tipoLeche;
    }
    setPreciosEditados(pMap);
    setTiposEditados(tMap);
  }, [semanaActiva?.id, despachosSemana]);

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
          precioBufalaLitroUSD: Number(r.precioBufalaLitroUSD ?? r.PrecioBufalaLitroUSD ?? 0),
          precioAcidaLitroUSD: Number(r.precioAcidaLitroUSD ?? r.PrecioAcidaLitroUSD ?? 0),
          cicloId: cicId,
          semanaCodigo: r.semanaCodigo ?? r.SemanaCodigo ?? `Semana #${cicId}`,
          litrosDespachados: litrosDesp,
          litrosRecibidos: litrosRec,
          litrosVaca: Number(r.litrosVaca ?? r.LitrosVaca ?? 0),
          litrosBufala: Number(r.litrosBufala ?? r.LitrosBufala ?? 0),
          litrosAcida: Number(r.litrosAcida ?? r.LitrosAcida ?? 0),
          cantidadDespachos: cantDesp,
          totalFacturadoUSD: facturado,
          totalAbonadoUSD: abonado,
          saldoPendienteUSD: saldo,
        };
      })
      .filter((f) => f.cantidadDespachos > 0 || f.litrosRecibidos > 0 || f.litrosDespachados > 0);
  }, [resumenSemanasRaw]);

  // Mantener sincronizada la semanaActiva si se actualizan precios o abonos
  const semanaActivaActualizada = useMemo(() => {
    if (!semanaActiva) return null;
    return filasSemanas.find((f) => f.id === semanaActiva.id) || semanaActiva;
  }, [filasSemanas, semanaActiva]);

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

  // Abonos de la semana abierta en el modal de semana
  const abonosDeSemanaActiva = useMemo(() => {
    if (!semanaActivaActualizada) return [];
    return (abonosRaw || []).filter((a: any) => {
      const cId = Number(a.companiaId ?? a.CompaniaId ?? 0);
      const cicId = Number(a.cicloId ?? a.CicloId ?? 0);
      return cId === semanaActivaActualizada.companiaId && cicId === semanaActivaActualizada.cicloId;
    });
  }, [abonosRaw, semanaActivaActualizada]);

  // Abonos de la compañía abierta en el modal consolidado
  const abonosDeCompaniaDetalle = useMemo(() => {
    if (!detalleCompania) return [];
    return (abonosRaw || []).filter(
      (a: any) => Number(a.companiaId ?? a.CompaniaId ?? 0) === detalleCompania.companiaId
    );
  }, [abonosRaw, detalleCompania]);

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

  // Detectar cambios de precio en el modal de semana
  const hayCambiosPrecioSemana = useMemo(() => {
    return despachosSemana.some((d) => {
      const pEdit = Number(preciosEditados[d.id]);
      const tEdit = tiposEditados[d.id] || d.tipoLeche;
      return (
        (!isNaN(pEdit) && Math.abs(pEdit - d.precioLitroUSD) > 0.0001) ||
        tEdit !== d.tipoLeche
      );
    });
  }, [despachosSemana, preciosEditados, tiposEditados]);

  // Totales en vivo de la semana mientras se editan precios
  const totalesLiveSemana = useMemo(() => {
    if (!semanaActivaActualizada) return { facturado: 0, abonado: 0, saldo: 0, vacaL: 0, vacaUSD: 0, bufalaL: 0, bufalaUSD: 0, acidaL: 0, acidaUSD: 0 };
    if (despachosSemana.length === 0) {
      return {
        facturado: semanaActivaActualizada.totalFacturadoUSD,
        abonado: semanaActivaActualizada.totalAbonadoUSD,
        saldo: Math.max(0, semanaActivaActualizada.saldoPendienteUSD),
        vacaL: semanaActivaActualizada.litrosVaca,
        vacaUSD: 0,
        bufalaL: semanaActivaActualizada.litrosBufala,
        bufalaUSD: 0,
        acidaL: semanaActivaActualizada.litrosAcida,
        acidaUSD: 0,
      };
    }
    let facturado = 0;
    let vacaL = 0, vacaUSD = 0, bufalaL = 0, bufalaUSD = 0, acidaL = 0, acidaUSD = 0;
    for (const d of despachosSemana) {
      const p = Number(preciosEditados[d.id] ?? d.precioLitroUSD) || 0;
      const t = (tiposEditados[d.id] ?? d.tipoLeche).toUpperCase();
      const sub = d.litrosRecibidos * p;
      facturado += sub;
      if (t === 'BUFALA') {
        bufalaL += d.litrosRecibidos;
        bufalaUSD += sub;
      } else if (t === 'ACIDA') {
        acidaL += d.litrosRecibidos;
        acidaUSD += sub;
      } else {
        vacaL += d.litrosRecibidos;
        vacaUSD += sub;
      }
    }
    const abonado = semanaActivaActualizada.totalAbonadoUSD;
    const saldo = Math.max(0, facturado - abonado);
    return { facturado, abonado, saldo, vacaL, vacaUSD, bufalaL, bufalaUSD, acidaL, acidaUSD };
  }, [semanaActivaActualizada, despachosSemana, preciosEditados, tiposEditados]);

  const abrirSemanaDetalle = (fila: FilaSemanaCobro, montoPrellenado?: number) => {
    setSemanaActiva(fila);
    setSemMontoUSD(montoPrellenado && montoPrellenado > 0 ? montoPrellenado.toFixed(2) : '');
    setSemFecha(hoyStr);
    setSemTasaBcv(tasaActual);
    setSemMontoBsManual('');
    setSemTipoPago('TRANSFERENCIA');
    setSemBancoId(0);
    setSemReferencia('');
    setSemObs('');
  };

  // Semanas con despachos de la compañía seleccionada en el modal general
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

  const abrirModalGeneral = (compId?: number) => {
    const cid = compId || (filtroCompania ? Number(filtroCompania) : 0);
    setAbonoCompaniaId(cid);
    setAbonoFecha(hoyStr);
    setAbonoBancoId(0);
    setAbonoTipoPago('TRANSFERENCIA');
    setAbonoReferencia('');
    setAbonoObs('');
    setAbonoTasaBcv(tasaActual);
    setAbonoMontoBsManual('');
    setMontosPorSemana({});
    setModalAbonoOpen(true);
  };

  const guardarPreciosMutation = useMutation({
    mutationFn: () => {
      if (!semanaActivaActualizada) throw new Error('Sin semana seleccionada');
      const items = despachosSemana.map((d) => ({
        despachoId: d.id,
        precioLitroUSD: Number(preciosEditados[d.id] ?? d.precioLitroUSD) || 0,
        tipoLeche: tiposEditados[d.id] ?? d.tipoLeche,
      }));
      return catalogosApi.actualizarPreciosDespachosSemana({
        companiaId: semanaActivaActualizada.companiaId,
        cicloId: semanaActivaActualizada.cicloId,
        items,
      });
    },
    onSuccess: () => {
      toast.success('Precios de la semana actualizados correctamente');
      queryClient.invalidateQueries({ queryKey: ['companias-cobranzas-semanas'] });
      queryClient.invalidateQueries({ queryKey: ['compania-semana-despachos'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error al actualizar precios'),
  });

  const crearAbonoSemanaMutation = useMutation({
    mutationFn: () => {
      if (!semanaActivaActualizada) throw new Error('Sin semana seleccionada');
      const monto = Number(semMontoUSD) || 0;
      if (monto <= 0) throw new Error('Ingresa un monto USD mayor a 0');
      const tasaEf = semTasaBcv > 0 ? semTasaBcv : tasaActual;
      const montoBs =
        semMontoBsManual !== '' ? Number(semMontoBsManual) || 0 : Number((monto * tasaEf).toFixed(2));

      return catalogosApi.crearAbonoCompania({
        companiaId: semanaActivaActualizada.companiaId,
        cicloId: semanaActivaActualizada.cicloId,
        fecha: semFecha || hoyStr,
        montoUSD: monto,
        montoBs,
        tasaBcv: tasaEf,
        bancoId: semBancoId > 0 ? semBancoId : undefined,
        tipoPago: semTipoPago,
        referenciaBancaria: semReferencia.trim() || undefined,
        observaciones: semObs.trim() || undefined,
        distribucionSemanas: [{ cicloId: semanaActivaActualizada.cicloId, montoUSD: monto }],
      });
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Abono registrado exitosamente.');
      setSemMontoUSD('');
      setSemMontoBsManual('');
      setSemReferencia('');
      setSemObs('');
      queryClient.invalidateQueries({ queryKey: ['companias-cobranzas-semanas'] });
      queryClient.invalidateQueries({ queryKey: ['companias-abonos-historial'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Error al registrar abono'),
  });

  const crearAbonoGeneralMutation = useMutation({
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
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Error al registrar abono'),
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
          <span style={{ fontWeight: 800, fontSize: '12.5px', color: pagado ? '#15803d' : '#b91c1c' }}>
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
            {pagado ? 'Cancelada' : parcial ? `Parcial (${pct}%)` : 'Pendiente'}
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
            Vaca: {fmtUSD(row.precioLitroUSD)}
            {row.precioBufalaLitroUSD > 0 ? ` • Búf: ${fmtUSD(row.precioBufalaLitroUSD)}` : ''}
            {row.precioAcidaLitroUSD > 0 ? ` • Ác: ${fmtUSD(row.precioAcidaLitroUSD)}` : ''}
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
      header: 'Leche Despachada',
      accessorKey: 'litrosRecibidos',
      sortable: true,
      cell: (row) => (
        <div>
          <strong style={{ color: '#0f172a', fontSize: '13px' }}>{fmtLitros(row.litrosRecibidos)}</strong>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
            {row.litrosVaca > 0 && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#dbeafe', color: '#1d4ed8' }}>
                Vaca: {row.litrosVaca.toLocaleString('es-VE')}L
              </span>
            )}
            {row.litrosBufala > 0 && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#ede9fe', color: '#6d28d9' }}>
                Búfala: {row.litrosBufala.toLocaleString('es-VE')}L
              </span>
            )}
            {row.litrosAcida > 0 && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#b45309' }}>
                Ácida: {row.litrosAcida.toLocaleString('es-VE')}L
              </span>
            )}
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
      cell: (row) => {
        const tieneSaldo = row.saldoPendienteUSD > 0.01;
        return (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              title="Ver días despachados, precios y abonos de esta semana"
              onClick={() => abrirSemanaDetalle(row)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <i className="fa-solid fa-folder-open"></i> Entrar
            </button>
            {tieneSaldo ? (
              <>
                <button
                  type="button"
                  onClick={() => abrirSemanaDetalle(row)}
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
                <button
                  type="button"
                  title="Cancelar el 100% del saldo pendiente de esta semana"
                  onClick={() => abrirSemanaDetalle(row, row.saldoPendienteUSD)}
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
              </>
            ) : (
              <span
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  background: '#dcfce7',
                  color: '#15803d',
                  border: '1px solid #86efac',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="fa-solid fa-circle-check"></i> Cancelada
              </span>
            )}
          </div>
        );
      },
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
            onClick={() => setDetalleCompania(row)}
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
          {row.saldoPendienteUSD > 0.01 && (
            <button
              type="button"
              onClick={() => abrirModalGeneral(row.companiaId)}
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
          )}
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
                Desglose por semana operativa, tipo de leche (Vaca / Búfala / Ácida), precios editables y detalle de cobranzas
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => abrirModalGeneral()}
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
          <i className="fa-solid fa-plus-circle"></i> Registrar Abono (Varias Semanas)
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

      {/* MODAL DETALLE Y ABONO DE UNA SEMANA ESPECÍFICA */}
      {semanaActivaActualizada && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
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
              maxWidth: '880px',
              maxHeight: '92vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
            }}
          >
            {/* Header */}
            <div
              style={{
                flexShrink: 0,
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                padding: '14px 22px',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 900 }}>
                  <i className="fa-solid fa-calendar-week mr-2" style={{ color: '#38bdf8' }}></i>
                  {semanaActivaActualizada.semanaCodigo} — {semanaActivaActualizada.companiaNombre}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                  Desglose de envíos, precios editables y control de abonos de esta semana
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSemanaActiva(null)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, minHeight: 0, padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Barra Resumen Compacta + Tipos de Leche */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Facturado</div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{fmtUSD(totalesLiveSemana.facturado)}</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>{fmtBs(totalesLiveSemana.facturado * tasaActual)}</div>
                  </div>
                  <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '12px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>Abonado</div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669' }}>{fmtUSD(totalesLiveSemana.abonado)}</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803d' }}>{abonosDeSemanaActiva.length} abono(s)</div>
                  </div>
                  <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '12px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: totalesLiveSemana.saldo > 0.01 ? '#b91c1c' : '#15803d', textTransform: 'uppercase' }}>
                      Saldo Pendiente
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: totalesLiveSemana.saldo > 0.01 ? '#dc2626' : '#059669' }}>
                      {fmtUSD(totalesLiveSemana.saldo)}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: totalesLiveSemana.saldo > 0.01 ? '#b91c1c' : '#15803d' }}>
                      {fmtBs(totalesLiveSemana.saldo * tasaActual)}
                    </div>
                  </div>
                </div>

                {(totalesLiveSemana.vacaL > 0 || totalesLiveSemana.bufalaL > 0 || totalesLiveSemana.acidaL > 0) && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                    {totalesLiveSemana.vacaL > 0 && (
                      <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: '#dbeafe', color: '#1d4ed8' }}>
                        Vaca: {fmtLitros(totalesLiveSemana.vacaL)} ({fmtUSD(totalesLiveSemana.vacaUSD)})
                      </span>
                    )}
                    {totalesLiveSemana.bufalaL > 0 && (
                      <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: '#ede9fe', color: '#6d28d9' }}>
                        Búfala: {fmtLitros(totalesLiveSemana.bufalaL)} ({fmtUSD(totalesLiveSemana.bufalaUSD)})
                      </span>
                    )}
                    {totalesLiveSemana.acidaL > 0 && (
                      <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: '#fef3c7', color: '#b45309' }}>
                        Ácida: {fmtLitros(totalesLiveSemana.acidaL)} ({fmtUSD(totalesLiveSemana.acidaUSD)})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 1. DESPACHOS POR DÍA DE LA SEMANA (CON PRECIO EDITABLE) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                    <i className="fa-solid fa-truck-droplet mr-2" style={{ color: '#2563eb' }}></i>
                    Días Despachados en esta Semana (puedes modificar tipo de leche y precio)
                  </h4>
                  {hayCambiosPrecioSemana && (
                    <button
                      type="button"
                      disabled={guardarPreciosMutation.isPending}
                      onClick={() => guardarPreciosMutation.mutate()}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fa-solid fa-floppy-disk mr-1"></i>
                      {guardarPreciosMutation.isPending ? 'Guardando...' : 'Guardar Precios Modificados'}
                    </button>
                  )}
                </div>

                {cargandoDespachosSemana ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>Cargando días despachados...</div>
                ) : despachosSemana.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b', fontSize: '12.5px' }}>
                    No se encontraron despachos individuales en esta semana.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                          <th style={{ padding: '9px 12px', fontWeight: 800 }}>Fecha Envío</th>
                          <th style={{ padding: '9px 12px', fontWeight: 800 }}>Tipo de Leche</th>
                          <th style={{ padding: '9px 12px', fontWeight: 800 }}>Litros</th>
                          <th style={{ padding: '9px 12px', fontWeight: 800 }}>Precio USD/L</th>
                          <th style={{ padding: '9px 12px', fontWeight: 800 }}>Monto USD</th>
                          <th style={{ padding: '9px 12px', fontWeight: 800 }}>Monto Bs (BCV)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {despachosSemana.map((d) => {
                          const tEdit = tiposEditados[d.id] ?? d.tipoLeche;
                          const pEdit = Number(preciosEditados[d.id] ?? d.precioLitroUSD) || 0;
                          const subUSD = d.litrosRecibidos * pEdit;
                          const subBs = subUSD * tasaActual;
                          const badge = badgeTipoLeche(tEdit);
                          return (
                            <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>
                                {d.fecha ? new Date(d.fecha).toLocaleDateString('es-VE') : '-'}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <select
                                  value={tEdit}
                                  onChange={(e) => {
                                    const nuevoTipo = e.target.value;
                                    setTiposEditados((prev) => ({ ...prev, [d.id]: nuevoTipo }));
                                    // Sugerir precio base de ese tipo si existe
                                    let precioSug = semanaActivaActualizada.precioLitroUSD;
                                    if (nuevoTipo === 'BUFALA' && semanaActivaActualizada.precioBufalaLitroUSD > 0) {
                                      precioSug = semanaActivaActualizada.precioBufalaLitroUSD;
                                    } else if (nuevoTipo === 'ACIDA' && semanaActivaActualizada.precioAcidaLitroUSD > 0) {
                                      precioSug = semanaActivaActualizada.precioAcidaLitroUSD;
                                    }
                                    setPreciosEditados((prev) => ({ ...prev, [d.id]: precioSug.toFixed(2) }));
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    border: `1px solid ${badge.border}`,
                                    background: badge.bg,
                                    color: badge.color,
                                    fontWeight: 800,
                                    fontSize: '11.5px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <option value="VACA">Leche Vaca</option>
                                  <option value="BUFALA">Leche Búfala</option>
                                  <option value="ACIDA">Leche Ácida</option>
                                </select>
                              </td>
                              <td style={{ padding: '8px 12px', fontWeight: 800, color: '#334155' }}>
                                {fmtLitros(d.litrosRecibidos)}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontWeight: 800, color: '#64748b' }}>$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={preciosEditados[d.id] ?? ''}
                                    onChange={(e) =>
                                      setPreciosEditados((prev) => ({ ...prev, [d.id]: e.target.value }))
                                    }
                                    style={{
                                      width: '78px',
                                      padding: '4px 7px',
                                      borderRadius: '6px',
                                      border: '1.5px solid #cbd5e1',
                                      fontWeight: 800,
                                      textAlign: 'right',
                                    }}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '8px 12px', fontWeight: 800, color: '#0f172a' }}>{fmtUSD(subUSD)}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>{fmtBs(subBs)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 2. ABONOS QUE TIENE ESTA SEMANA */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                  <i className="fa-solid fa-receipt mr-2" style={{ color: '#059669' }}></i>
                  Abonos Registrados en esta Semana ({abonosDeSemanaActiva.length})
                </h4>

                {abonosDeSemanaActiva.length === 0 ? (
                  <div style={{ padding: '14px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '12.5px' }}>
                    Esta semana aún no tiene abonos registrados.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {abonosDeSemanaActiva.map((ab: any) => {
                      const f = ab.fecha ?? ab.Fecha;
                      const mUsd = Number(ab.montoUSD ?? ab.MontoUSD ?? 0);
                      const mBs = Number(ab.montoBs ?? ab.MontoBs ?? 0);
                      const ref = ab.referenciaBancaria ?? ab.ReferenciaBancaria;
                      const obs = ab.observaciones ?? ab.Observaciones;
                      return (
                        <div
                          key={ab.id ?? ab.Id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            background: '#ffffff',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ color: '#059669', fontSize: '14px' }}>{fmtUSD(mUsd)}</strong>
                              <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>({fmtBs(mBs)})</span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                • {f ? new Date(f).toLocaleDateString('es-VE') : '-'}
                              </span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                              <strong>{ab.tipoPago ?? ab.TipoPago ?? 'TRANSFERENCIA'}</strong>
                              {(ab.bancoNombre ?? ab.BancoNombre) ? ` • ${ab.bancoNombre ?? ab.BancoNombre}` : ''}
                              {ref ? ` • Ref: ${ref}` : ''}
                              {obs ? ` • "${obs}"` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setDetalleAbonoItem(ab)}
                              style={{
                                padding: '4px 9px',
                                borderRadius: '6px',
                                border: '1px solid #bfdbfe',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Comprobante
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await confirmDeleteOrDeactivate(
                                  '¿Eliminar este abono?',
                                  'El saldo de la semana se recalculará automáticamente.'
                                );
                                if (ok) eliminarAbonoMutation.mutate(ab.id ?? ab.Id);
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #fecaca',
                                background: '#fee2e2',
                                color: '#b91c1c',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. AGREGAR ABONO A ESTA SEMANA */}
              {totalesLiveSemana.saldo <= 0.01 ? (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    color: '#15803d',
                    fontWeight: 800,
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className="fa-solid fa-circle-check" style={{ fontSize: '18px' }}></i>
                  Esta semana ya se encuentra cancelada al 100%. No admite nuevas cancelaciones.
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    crearAbonoSemanaMutation.mutate();
                  }}
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#065f46' }}>
                      <i className="fa-solid fa-plus-circle mr-2"></i>
                      Agregar Abono a {semanaActivaActualizada.semanaCodigo}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSemMontoUSD(totalesLiveSemana.saldo.toFixed(2))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fa-solid fa-check-double mr-1"></i>
                      Cancelar Semana Completa ({fmtUSD(totalesLiveSemana.saldo)})
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#065f46', marginBottom: '3px' }}>Fecha Abono *</label>
                      <input
                        type="date"
                        required
                        value={semFecha}
                        onChange={(e) => setSemFecha(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 700, fontSize: '13px', background: '#ffffff' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#065f46', marginBottom: '3px' }}>Monto USD *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={semMontoUSD}
                        onChange={(e) => setSemMontoUSD(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #34d399', fontWeight: 900, fontSize: '14px', background: '#ffffff' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#166534', marginBottom: '3px' }}>Tasa BCV</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={semTasaBcv || ''}
                        onChange={(e) => setSemTasaBcv(Number(e.target.value) || 0)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 800, background: '#ffffff' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#166534', marginBottom: '3px' }}>Monto Bs (auto/manual)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={((Number(semMontoUSD) || 0) * (semTasaBcv || tasaActual)).toFixed(2)}
                        value={semMontoBsManual}
                        onChange={(e) => setSemMontoBsManual(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 800, background: '#ffffff' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '3px' }}>Método de Pago</label>
                      <SearchableSelect
                        options={[
                          { value: 'TRANSFERENCIA', label: 'Transferencia Bancaria' },
                          { value: 'PAGO_MOVIL', label: 'Pago Móvil' },
                          { value: 'EFECTIVO_USD', label: 'Efectivo USD' },
                          { value: 'EFECTIVO_BS', label: 'Efectivo Bs' },
                          { value: 'ZELLE', label: 'Zelle' },
                        ]}
                        value={semTipoPago}
                        onChange={(val) => setSemTipoPago(String(val || 'TRANSFERENCIA'))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '3px' }}>Banco (opcional)</label>
                      <SearchableSelect
                        options={[
                          { value: 0, label: '-- Sin banco --' },
                          ...bancos.map((b: any) => ({ value: b.id ?? b.Id, label: b.nombre ?? b.Nombre })),
                        ]}
                        value={semBancoId}
                        onChange={(val) => setSemBancoId(Number(val) || 0)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '3px' }}>Referencia</label>
                      <input
                        type="text"
                        placeholder="Nro. referencia"
                        value={semReferencia}
                        onChange={(e) => setSemReferencia(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Observaciones (opcional)"
                      value={semObs}
                      onChange={(e) => setSemObs(e.target.value)}
                      style={{ flex: 1, minWidth: '200px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '13px' }}
                    />
                    <button
                      type="submit"
                      disabled={crearAbonoSemanaMutation.isPending || (Number(semMontoUSD) || 0) <= 0}
                      style={{
                        padding: '9px 20px',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #059669, #047857)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: crearAbonoSemanaMutation.isPending || (Number(semMontoUSD) || 0) <= 0 ? 'not-allowed' : 'pointer',
                        opacity: crearAbonoSemanaMutation.isPending || (Number(semMontoUSD) || 0) <= 0 ? 0.65 : 1,
                      }}
                    >
                      {crearAbonoSemanaMutation.isPending
                        ? 'Guardando...'
                        : `Guardar Abono (${fmtUSD(Number(semMontoUSD) || 0)})`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE CONSOLIDADO DE COMPAÑÍA */}
      {detalleCompania && (
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
              maxWidth: '680px',
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
                  Estado Consolidado: {detalleCompania.companiaNombre}
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  {detalleCompania.cantidadSemanas} semanas • {fmtLitros(detalleCompania.litrosRecibidos)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetalleCompania(null)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>FACTURADO</div>
                  <div style={{ fontSize: '17px', fontWeight: 900 }}>{fmtUSD(detalleCompania.totalFacturadoUSD)}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d' }}>ABONADO</div>
                  <div style={{ fontSize: '17px', fontWeight: 900, color: '#059669' }}>{fmtUSD(detalleCompania.totalAbonadoUSD)}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#b91c1c' }}>SALDO</div>
                  <div style={{ fontSize: '17px', fontWeight: 900, color: '#dc2626' }}>{fmtUSD(Math.max(0, detalleCompania.saldoPendienteUSD))}</div>
                </div>
              </div>
              <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800 }}>Historial de Abonos ({abonosDeCompaniaDetalle.length})</h4>
              {abonosDeCompaniaDetalle.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>
                  Sin abonos registrados todavía.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {abonosDeCompaniaDetalle.map((ab: any) => (
                    <div
                      key={ab.id ?? ab.Id}
                      style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <strong style={{ color: '#059669' }}>{fmtUSD(Number(ab.montoUSD ?? ab.MontoUSD ?? 0))}</strong>{' '}
                        <span style={{ fontSize: '12px', color: '#475569' }}>({fmtBs(Number(ab.montoBs ?? ab.MontoBs ?? 0))})</span>{' '}
                        <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '10.5px' }}>
                          {ab.semanaCodigo ?? ab.SemanaCodigo ?? 'General'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetalleAbonoItem(ab)}
                        style={{ padding: '4px 10px', borderRadius: '7px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Comprobante
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

      {/* MODAL GENERAL REGISTRAR ABONO (VARIAS SEMANAS) */}
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
                  💵 Registrar Abono Distribuido (Varias Semanas)
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#a7f3d0' }}>
                  Distribuye un pago entre varias semanas pendientes de una compañía
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
                crearAbonoGeneralMutation.mutate();
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

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#065f46', margin: 0 }}>
                    Semanas pendientes de esta compañía:
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
                    Selecciona una compañía para ver sus semanas pendientes.
                  </div>
                ) : semanasDeCompaniaModal.filter((s) => s.saldoPendienteUSD > 0.01).length === 0 ? (
                  <div style={{ padding: '14px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', fontSize: '12.5px', color: '#15803d', textAlign: 'center', fontWeight: 700 }}>
                    Esta compañía no tiene semanas con saldo pendiente.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', padding: '4px' }}>
                    {semanasDeCompaniaModal
                      .filter((s) => s.saldoPendienteUSD > 0.01)
                      .map((s) => {
                        const ingresado = Number(montosPorSemana[s.cicloId] || 0);
                        const saldoActual = Math.max(0, s.saldoPendienteUSD);
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
                              <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{s.semanaCodigo}</div>
                              <div style={{ fontSize: '11.5px', color: '#475569' }}>
                                {fmtLitros(s.litrosRecibidos)} • Facturado: <strong>{fmtUSD(s.totalFacturadoUSD)}</strong> • Saldo:{' '}
                                <strong style={{ color: '#dc2626' }}>{fmtUSD(saldoActual)}</strong>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  disabled={crearAbonoGeneralMutation.isPending || totalUsdModal <= 0}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: crearAbonoGeneralMutation.isPending || totalUsdModal <= 0 ? 'not-allowed' : 'pointer',
                    opacity: crearAbonoGeneralMutation.isPending || totalUsdModal <= 0 ? 0.65 : 1,
                  }}
                >
                  {crearAbonoGeneralMutation.isPending ? 'Guardando...' : `Guardar Abono (${fmtUSD(totalUsdModal)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
