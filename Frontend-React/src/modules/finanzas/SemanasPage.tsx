import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { finanzasApi } from '@/api/finanzas.api';
import { operacionesApi } from '@/api/operaciones.api';
import { catalogosApi } from '@/api/catalogos.api';
import { useAuthStore } from '@/stores/authStore';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { esReceptoriaPrincipal } from '@/utils/procesoViaje';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { SemaforoToleranciaBadge } from '@/components/common/SemaforoToleranciaBadge';
import type { CicloSemanalDto } from '@/types';

const ANIOS_OPTIONS = [
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
];

const DIAS_INICIO_OPTIONS = [
  { value: '2', label: 'Martes (Default)' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Lunes' },
];

const DIAS_FIN_OPTIONS = [
  { value: '1', label: 'Lunes (Default)' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

function getDefaultMartesALunes() {
  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const diffMartes = (2 - diaSemana + 7) % 7;
  const martes = new Date(hoy);
  martes.setDate(hoy.getDate() + diffMartes);

  const lunes = new Date(martes);
  lunes.setDate(martes.getDate() + 6);

  const fInicioStr = martes.toISOString().split('T')[0];
  const fFinStr = lunes.toISOString().split('T')[0];

  return {
    codigo: `Semana (${fInicioStr} al ${fFinStr})`,
    fechaInicio: fInicioStr,
    fechaFin: fFinStr,
    observaciones: '',
  };
}

export const SemanasPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { canCreate, canEdit } = useModulePermissions('CICLOS');

  // Filtro por pastillas 1:1 con V2_3_11_26 (ACTIVA | PROGRAMADO | CERRADO | TODAS)
  const [filtroEstado, setFiltroEstado] = useState<'ACTIVA' | 'PROGRAMADO' | 'CERRADO' | 'TODAS'>('ACTIVA');

  // Modal 1: Crear Semana Manual
  const [modalCrear, setModalCrear] = useState(false);
  const [formCrear, setFormCrear] = useState(getDefaultMartesALunes);

  // Modal 2: Generar 52 Semanas
  const [modalGenerar52, setModalGenerar52] = useState(false);
  const [form52, setForm52] = useState({
    anio: String(new Date().getFullYear()),
    diaInicio: '2',
    diaFin: '1',
    fechaPrimerInicio: '',
  });

  // Modal 3: Editar Semana
  const [modalEditar, setModalEditar] = useState(false);
  const [formEditar, setFormEditar] = useState({
    id: 0,
    codigo: '',
    fechaInicio: '',
    fechaFin: '',
    observaciones: '',
  });

  // Modal 4: Activar Semana (con validación de secuencia y traspaso de stock)
  const [modalActivar, setModalActivar] = useState(false);
  const [cicloActivar, setCicloActivar] = useState<any | null>(null);
  const [validacionActivar, setValidacionActivar] = useState<any | null>(null);
  const [stockTransferir, setStockTransferir] = useState<number>(0);
  const [cargandoValidacionActivar, setCargandoValidacionActivar] = useState(false);

  // Modal 5: Cerrar Semana Operativa (con balance de tanques y alerta de fincas sin pagar)
  const [modalCerrar, setModalCerrar] = useState(false);
  const [cicloCerrar, setCicloCerrar] = useState<any | null>(null);
  const [resumenCierre, setResumenCierre] = useState<any | null>(null);
  const [fincasSinPagar, setFincasSinPagar] = useState<any[]>([]);
  const [stockFinalTanques, setStockFinalTanques] = useState<number>(0);
  const [cargandoResumenCierre, setCargandoResumenCierre] = useState(false);

  // Modal 6: Reabrir Semana Cerrada (con motivo obligatorio para log)
  const [modalReabrir, setModalReabrir] = useState(false);
  const [cicloReabrir, setCicloReabrir] = useState<any | null>(null);
  const [motivoReabrir, setMotivoReabrir] = useState('');

  // Queries
  const hasTolerancia = useAuthStore((s) => s.hasTenantModule('MOD_TOLERANCIA_MERMA'));
  const { data: ciclosRaw = [], isLoading } = useQuery<any[]>({
    queryKey: ['ciclos-semanas'],
    queryFn: () => finanzasApi.getCiclos(),
  });

  const { data: toleranciaCompaniasCierre = [] } = useQuery<any[]>({
    queryKey: ['cierre-tolerancia-companias', cicloCerrar?.id || cicloCerrar?.Id],
    enabled: Boolean(modalCerrar && cicloCerrar && hasTolerancia),
    queryFn: async () => {
      const fIni = cicloCerrar?.fechaInicio ? String(cicloCerrar.fechaInicio).split('T')[0] : undefined;
      const fFin = cicloCerrar?.fechaFin ? String(cicloCerrar.fechaFin).split('T')[0] : undefined;
      const [despachos, companiasCat] = await Promise.all([
        operacionesApi.getDespachosCompanias(undefined, undefined, fIni, fFin).catch(() => []),
        catalogosApi.getCompanias(true).catch(() => []),
      ]);
      const mapa = new Map<string, { nombre: string; despachado: number; recibido: number; viajes: number }>();
      (despachos || []).forEach((d: any) => {
        const compId = Number(d.companiaId || d.CompaniaId || 0);
        const compMatch = companiasCat.find((c: any) => c.id === compId);
        if ((compMatch && esReceptoriaPrincipal(compMatch)) || esReceptoriaPrincipal(d)) return;
        const nom = d.nombreCompania || d.companiaNombre || compMatch?.nombre || `Compañía #${compId}`;
        const prev = mapa.get(nom) || { nombre: nom, despachado: 0, recibido: 0, viajes: 0 };
        prev.despachado += Number(d.litrosDespachados || 0);
        prev.recibido += Number(d.litrosRecibidosCompania || d.litrosConfirmados || d.litrosDespachados || 0);
        prev.viajes += 1;
        mapa.set(nom, prev);
      });
      return Array.from(mapa.values());
    },
  });

  const ciclos = useMemo(() => {
    const copia = [...ciclosRaw];
    copia.sort((a, b) => {
      const estA = String(a.estado || a.Estado || '').toUpperCase();
      const estB = String(b.estado || b.Estado || '').toUpperCase();
      if (estA === 'ABIERTO' && estB !== 'ABIERTO') return -1;
      if (estA !== 'ABIERTO' && estB === 'ABIERTO') return 1;
      const fA = new Date(a.fechaInicio || a.FechaInicio || 0).getTime();
      const fB = new Date(b.fechaInicio || b.FechaInicio || 0).getTime();
      return fB - fA; // Orden descendente: la semana activa actual (más reciente) va primero
    });
    return copia;
  }, [ciclosRaw]);

  const semanaActiva = useMemo(() => {
    return ciclos.find((c) => String(c.estado || c.Estado || '').toUpperCase() === 'ABIERTO') || ciclos[0];
  }, [ciclos]);

  const ciclosFiltrados = useMemo(() => {
    return ciclos.filter((s) => {
      const est = String(s.estado || s.Estado || '').toUpperCase();
      if (filtroEstado === 'ACTIVA') return est === 'ABIERTO';
      if (filtroEstado === 'PROGRAMADO') return est === 'PROGRAMADO';
      if (filtroEstado === 'CERRADO') return est === 'CERRADO';
      return true;
    });
  }, [ciclos, filtroEstado]);

  // Previsualización de las 52 semanas
  const preview52Items = useMemo(() => {
    const anio = parseInt(form52.anio) || new Date().getFullYear();
    const diaInicio = parseInt(form52.diaInicio || '2');
    let cursor: Date;

    if (form52.fechaPrimerInicio) {
      cursor = new Date(`${form52.fechaPrimerInicio}T12:00:00`);
    } else {
      cursor = new Date(anio, 0, 1, 12, 0, 0);
      const diff = (diaInicio - cursor.getDay() + 7) % 7;
      cursor.setDate(cursor.getDate() + diff);
    }

    const items: { num: string; fIni: string; fFin: string }[] = [];
    for (let sem = 1; sem <= 52; sem++) {
      const fIni = new Date(cursor);
      const fFin = new Date(cursor);
      fFin.setDate(cursor.getDate() + 6);

      items.push({
        num: `Semana ${String(sem).padStart(2, '0')}`,
        fIni: fIni.toISOString().split('T')[0],
        fFin: fFin.toISOString().split('T')[0],
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return items;
  }, [form52]);

  const refrescarTodo = () => {
    queryClient.invalidateQueries({ queryKey: ['ciclos-semanas'] });
    queryClient.invalidateQueries({ queryKey: ['ciclo-activo'] });
  };

  // Mutaciones
  const crearMutation = useMutation({
    mutationFn: (dto: typeof formCrear) => finanzasApi.crearCiclo(dto),
    onSuccess: (data) => {
      toast.success(data?.message || 'Semana operativa creada exitosamente.');
      refrescarTodo();
      setModalCrear(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'No se pudo crear la semana.');
    },
  });

  const editarMutation = useMutation({
    mutationFn: (dto: typeof formEditar) =>
      finanzasApi.editarCiclo(dto.id, {
        codigo: dto.codigo,
        fechaInicio: dto.fechaInicio,
        fechaFin: dto.fechaFin,
        observaciones: dto.observaciones,
      }),
    onSuccess: (data) => {
      toast.success(data?.message || 'Fechas de semana actualizadas correctamente.');
      refrescarTodo();
      setModalEditar(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al modificar semana.');
    },
  });

  const generar52Mutation = useMutation({
    mutationFn: () =>
      finanzasApi.generar52Semanas({
        anio: parseInt(form52.anio),
        diaInicio: parseInt(form52.diaInicio),
        diaFin: parseInt(form52.diaFin),
        fechaPrimerInicio: form52.fechaPrimerInicio || undefined,
      }),
    onSuccess: (data) => {
      toast.success(data?.message || 'Se han planificado las 52 semanas del año.');
      refrescarTodo();
      setModalGenerar52(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'No se pudieron generar las semanas.');
    },
  });

  const completar52Mutation = useMutation({
    mutationFn: (anio?: number) => finanzasApi.completar52Semanas(anio),
    onSuccess: (data) => {
      toast.success(data?.message || 'Semanas completadas hasta la Semana 52.');
      refrescarTodo();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'No se pudieron completar las 52 semanas.');
    },
  });

  const handleCompletar52 = async () => {
    const anioDefault = parseInt(form52.anio) || new Date().getFullYear();
    const res = await Swal.fire({
      title: 'Completar hasta la Semana 52',
      text: `Se generarán automáticamente las semanas faltantes a partir de la última semana registrada hasta llegar a la Semana 52 (${anioDefault}), sin duplicar ni alterar las existentes.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, completar 52 semanas',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0284c7',
    });
    if (res.isConfirmed) {
      completar52Mutation.mutate(anioDefault);
    }
  };

  const activarMutation = useMutation({
    mutationFn: ({ id, stockPersonalizado }: { id: number; stockPersonalizado?: number }) =>
      finanzasApi.activarCiclo(id, stockPersonalizado),
    onSuccess: (data) => {
      toast.success(data?.message || 'Semana activada como ciclo corriente.');
      refrescarTodo();
      setModalActivar(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al activar ciclo.');
    },
  });

  const cerrarMutation = useMutation({
    mutationFn: ({ id, stockFinal }: { id: number; stockFinal: number }) =>
      finanzasApi.cerrarCiclo(id, stockFinal),
    onSuccess: (data) => {
      toast.success(data?.message || 'Ciclo cerrado con éxito.');
      refrescarTodo();
      setModalCerrar(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al cerrar semana.');
    },
  });

  const reabrirMutation = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      finanzasApi.reabrirCiclo(id, motivo),
    onSuccess: (data) => {
      toast.success(data?.message || 'Semana reabierta exitosamente y registrada en el log de auditoría.');
      refrescarTodo();
      setModalReabrir(false);
      setMotivoReabrir('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al reabrir la semana.');
    },
  });

  // Handlers de apertura de modales
  const handleAbrirCrear = () => {
    setFormCrear(getDefaultMartesALunes());
    setModalCrear(true);
  };

  const handleAbrirEditar = (s: any) => {
    const est = String(s.estado || s.Estado || '').toUpperCase();
    if (est === 'CERRADO') {
      toast.warning('Esta semana ya ha sido cerrada y no permite modificaciones en sus fechas.');
      return;
    }
    const fIni = (s.fechaInicio || s.FechaInicio || '').split('T')[0];
    const fFin = (s.fechaFin || s.FechaFin || '').split('T')[0];
    setFormEditar({
      id: s.id || s.Id,
      codigo: s.codigo || s.Codigo || `Semana #${s.id}`,
      fechaInicio: fIni,
      fechaFin: fFin,
      observaciones: s.observaciones || s.Observaciones || '',
    });
    setModalEditar(true);
  };

  const handleAbrirActivar = async (s: any) => {
    const id = s.id || s.Id;
    setCicloActivar(s);
    setValidacionActivar(null);
    setStockTransferir(0);
    setModalActivar(true);
    setCargandoValidacionActivar(true);
    try {
      const val = await finanzasApi.validarActivacionCiclo(id);
      if (val) {
        setValidacionActivar(val);
        setStockTransferir(Number(val.ultimoCicloCerradoStockFinal || 0));
      }
    } finally {
      setCargandoValidacionActivar(false);
    }
  };

  const handleAbrirCerrar = async (s: any) => {
    if (!s) return;
    const id = s.id || s.Id;
    setCicloCerrar(s);
    setResumenCierre(null);
    setFincasSinPagar([]);
    setStockFinalTanques(0);
    setModalCerrar(true);
    setCargandoResumenCierre(true);
    try {
      const [resResumen, resPreliq] = await Promise.all([
        finanzasApi.getResumenCierreCiclo(id),
        finanzasApi.getPreliquidacion(id).catch(() => []),
      ]);
      if (resResumen) {
        setResumenCierre(resResumen);
        setStockFinalTanques(Number(resResumen.balanceCalculadoTanque || 0));
      }
      const items = Array.isArray(resPreliq) ? resPreliq : [];
      const sinPagar = items.filter((f: any) => {
        const lts = Number(f.totalLitros || f.TotalLitros || 0);
        const pag = !!(f.esPagado || f.EsPagado || f.pagado);
        return lts > 0 && !pag;
      });
      setFincasSinPagar(sinPagar);
    } finally {
      setCargandoResumenCierre(false);
    }
  };

  const handleAbrirReabrir = (s: any) => {
    setCicloReabrir(s);
    setMotivoReabrir('');
    setModalReabrir(true);
  };

  // Columnas 1:1 con tablaSemanasHistorial de V2_3_11_26 (10 columnas)
  const columns: ColumnDef<any>[] = [
    {
      header: 'Código / Nombre',
      accessorKey: 'codigo',
      sortable: true,
      cell: (s) => {
        const esActiva = String(s.estado || s.Estado || '').toUpperCase() === 'ABIERTO';
        const codigo = s.codigo || s.Codigo || `Semana #${s.numeroSemana || s.id}`;
        return (
          <div
            style={{
              fontWeight: 800,
              color: esActiva ? '#2563eb' : '#0f172a',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13.5px',
            }}
          >
            {esActiva && <i className="fa-solid fa-play" style={{ color: '#059669', fontSize: '11px' }}></i>}
            <span>{codigo}</span>
          </div>
        );
      },
    },
    {
      header: 'Inicio',
      accessorKey: 'fechaInicio',
      sortable: true,
      cell: (s) => {
        const fIni = (s.fechaInicio || s.FechaInicio || '').split('T')[0] || '-';
        return <span style={{ color: '#334155', fontWeight: 600, fontSize: '13px' }}>{fIni}</span>;
      },
    },
    {
      header: 'Cierre',
      accessorKey: 'fechaFin',
      sortable: true,
      cell: (s) => {
        const fFin = (s.fechaFin || s.FechaFin || '').split('T')[0] || '-';
        return <span style={{ color: '#334155', fontWeight: 600, fontSize: '13px' }}>{fFin}</span>;
      },
    },
    {
      header: 'Total Litros',
      accessorKey: 'totalLitros',
      sortable: true,
      cell: (s) => (
        <strong style={{ color: '#047857', fontSize: '14px', fontWeight: 800 }}>
          {Number(s.totalLitros || s.TotalLitros || 0).toLocaleString()} Lts
        </strong>
      ),
    },
    {
      header: 'Total USD ($)',
      accessorKey: 'totalMontoUSD',
      sortable: true,
      cell: (s) => (
        <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '13.5px' }}>
          ${Number(s.totalMontoUSD || s.TotalMontoUSD || 0).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Bruto Bs',
      accessorKey: 'totalBrutoBs',
      sortable: true,
      cell: (s) => {
        const bs = Number(s.totalBrutoBs ?? s.TotalBrutoBs ?? s.totalMontoBs ?? 0);
        return (
          <strong style={{ color: '#0f172a', fontWeight: 700, fontSize: '13px' }}>
            Bs. {bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
        );
      },
    },
    {
      header: 'Fincas',
      accessorKey: 'totalFincasParticipantes',
      cell: (s) => (
        <span
          className="badge badge-secondary"
          style={{
            fontSize: '11.5px',
            fontWeight: 700,
            background: '#f1f5f9',
            color: '#334155',
            border: '1px solid #cbd5e1',
          }}
        >
          {Number(s.totalFincasParticipantes ?? s.TotalFincasParticipantes ?? 0)} Fincas
        </span>
      ),
    },
    {
      header: 'Plantas',
      accessorKey: 'totalCompaniasParticipantes',
      cell: (s) => (
        <span
          className="badge badge-secondary"
          style={{
            fontSize: '11.5px',
            fontWeight: 700,
            background: '#f1f5f9',
            color: '#334155',
            border: '1px solid #cbd5e1',
          }}
        >
          {Number(s.totalCompaniasParticipantes ?? s.TotalCompaniasParticipantes ?? 0)} Plantas
        </span>
      ),
    },
    {
      header: 'Estado',
      accessorKey: 'estado',
      sortable: true,
      cell: (s) => {
        const est = String(s.estado || s.Estado || '').toUpperCase();
        const esActiva = est === 'ABIERTO';
        const esCerrada = est === 'CERRADO';
        return (
          <span
            className={`badge ${esActiva ? 'badge-success' : esCerrada ? 'badge-danger' : 'badge-info'}`}
            style={{ fontSize: '11.5px' }}
          >
            {esActiva ? 'ACTIVA' : esCerrada ? 'CERRADA' : 'PROGRAMADA'}
          </span>
        );
      },
    },
    {
      header: 'Acciones',
      className: 'text-center',
      cell: (s) => {
        const est = String(s.estado || s.Estado || '').toUpperCase();
        const esActiva = est === 'ABIERTO';
        const esCerrada = est === 'CERRADO';

        return (
          <div
            style={{
              display: 'inline-flex',
              gap: '6px',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {!esCerrada && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleAbrirEditar(s)}
                title="Modificar Fechas"
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#2563eb',
                  borderColor: '#93c5fd',
                  background: '#eff6ff',
                  borderRadius: '6px',
                }}
              >
                <i className="fa-solid fa-pen-to-square"></i> Editar
              </button>
            )}

            {canEdit && !esActiva && !esCerrada && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleAbrirActivar(s)}
                title="Establecer como Activa (En Curso)"
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#047857',
                  borderColor: '#6ee7b7',
                  background: '#ecfdf5',
                  borderRadius: '6px',
                }}
              >
                <i className="fa-solid fa-play"></i> Activar
              </button>
            )}

            {canEdit && esActiva && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleAbrirCerrar(s)}
                title="Cerrar Ciclo Operativo"
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#dc2626',
                  borderColor: '#fca5a5',
                  background: '#fef2f2',
                  borderRadius: '6px',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.15)',
                }}
              >
                <i className="fa-solid fa-lock"></i> Cerrar Semana
              </button>
            )}

            {canEdit && esCerrada && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleAbrirReabrir(s)}
                title="Reabrir Ciclo Operativo para registrar o corregir tickets"
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#d97706',
                  borderColor: '#fcd34d',
                  background: '#fffbeb',
                  borderRadius: '6px',
                  boxShadow: '0 2px 6px rgba(217, 119, 6, 0.15)',
                }}
              >
                <i className="fa-solid fa-lock-open"></i> Reabrir Semana
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const activaFIni = semanaActiva ? (semanaActiva.fechaInicio || semanaActiva.FechaInicio || '').split('T')[0] : '-';
  const activaFFin = semanaActiva ? (semanaActiva.fechaFin || semanaActiva.FechaFin || '').split('T')[0] : '-';
  const activaEsAbierta = semanaActiva
    ? String(semanaActiva.estado || semanaActiva.Estado || '').toUpperCase() === 'ABIERTO'
    : false;

  return (
    <section id="tab-semanas" className="tab-content active" style={{ display: 'block' }}>
      {/* CABECERA VISTA 1:1 */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Gestión de Semanas Operativas</h1>
          <p className="view-subtitle">
            Apertura y control de semanas de recolección (por defecto Martes a Lunes con días flexibles)
          </p>
        </div>
        <div className="view-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {canCreate && (
            <button
              type="button"
              className="btn btn-outline"
              id="btnModalCrearSemana"
              onClick={handleAbrirCrear}
            >
              <i className="fa-solid fa-plus"></i> Nueva Semana Manual
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              className="btn btn-gradient-purple"
              id="btnModalGenerar52"
              onClick={() => setModalGenerar52(true)}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
              }}
            >
              <i className="fa-solid fa-wand-magic-sparkles"></i> Generar 52 Semanas (Año Completo)
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              className="btn"
              id="btnCompletar52"
              onClick={handleCompletar52}
              disabled={completar52Mutation.isPending}
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
            }}
          >
            <i className={completar52Mutation.isPending ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-calendar-check'}></i>{' '}
            {completar52Mutation.isPending ? 'Completando...' : 'Terminar las 52 Semanas'}
          </button>
          )}
        </div>
      </div>

      {/* BANNER SEMANA OPERATIVA ACTIVA (5 KPIs 1:1 CON V2_3_11_26) */}
      {semanaActiva && (
        <div
          className="content-card"
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-border)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: 'var(--t-shadow)',
            marginBottom: '20px',
          }}
        >
          <div
            className="card-head"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              marginBottom: '16px',
              borderBottom: '1px solid var(--t-border)',
              paddingBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3
                className="card-title"
                style={{ marginBottom: 0, color: 'var(--t-text)', fontSize: '16px', fontWeight: 800 }}
              >
                <i className="fa-solid fa-star" style={{ color: '#fbbf24', marginRight: '6px' }}></i>
                Semana Operativa Activa para Recolecciones
              </h3>
              <span
                className="badge"
                id="badgeSemanaEstado"
                style={{
                  background: activaEsAbierta ? '#059669' : '#475569',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: activaEsAbierta ? '1px solid #34d399' : '1px solid #94a3b8',
                }}
              >
                <i className="fa-solid fa-circle-check" style={{ marginRight: '4px' }}></i>
                {activaEsAbierta ? 'ACTIVA (EN CURSO)' : semanaActiva.estado}
              </span>
            </div>

            <div>
              <button
                type="button"
                className="btn"
                id="btnCerrarSemanaBanner"
                onClick={() => {
                  if (activaEsAbierta) {
                    handleAbrirCerrar(semanaActiva);
                  } else {
                    toast.info('No hay ninguna semana operativa actualmente activa.');
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <i className="fa-solid fa-lock" style={{ fontSize: '14px' }}></i> CERRAR ESTA SEMANA OPERATIVA
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              marginTop: '12px',
            }}
          >
            <div
              style={{
                background: 'var(--t-surface-2)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--t-border)',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--t-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                CÓDIGO / SEMANA
              </span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--t-text)' }}>
                {semanaActiva.codigo || semanaActiva.Codigo || `Semana #${semanaActiva.id}`}
              </div>
            </div>

            <div
              style={{
                background: 'var(--t-surface-2)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--t-border)',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--t-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                RANGO DE FECHAS
              </span>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0284c7' }}>
                {activaFIni}  al  {activaFFin}
              </div>
            </div>

            <div
              style={{
                background: 'var(--t-surface-2)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--t-border)',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--t-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                LITROS ACUMULADOS
              </span>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#16a34a' }}>
                {Number(semanaActiva.totalLitros || semanaActiva.TotalLitros || 0).toLocaleString()} Lts
              </div>
            </div>

            <div
              style={{
                background: 'var(--t-surface-2)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--t-border)',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--t-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                FINCAS CON ENTREGAS
              </span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--t-text)' }}>
                {Number(semanaActiva.totalFincasParticipantes ?? semanaActiva.TotalFincasParticipantes ?? 0)} Fincas
              </div>
            </div>

            <div
              style={{
                background: 'var(--t-surface-2)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--t-border)',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--t-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                PLANTAS RECEPTORAS
              </span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0284c7' }}>
                {Number(semanaActiva.totalCompaniasParticipantes ?? semanaActiva.TotalCompaniasParticipantes ?? 0)} Plantas
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CALENDARIO DE SEMANAS OPERATIVAS 1:1 */}
      <div className="content-card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 className="card-title" style={{ marginBottom: 0 }}>
              <i className="fa-solid fa-calendar-days" style={{ marginRight: '6px' }}></i>
              Calendario de Semanas Operativas
            </h3>
            <span className="badge badge-info" id="badgeContadorSemanas">
              {ciclosFiltrados.length} {ciclosFiltrados.length === 1 ? 'Registro' : 'Registros'}
            </span>
          </div>

          {/* 4 Pastillas de Filtro por Sección / Estado 1:1 */}
          <div className="filter-pills-bar" id="filtroPillsSemanas" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`filter-pill ${filtroEstado === 'ACTIVA' ? 'active' : ''}`}
              onClick={() => setFiltroEstado('ACTIVA')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: filtroEstado === 'ACTIVA' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                background: filtroEstado === 'ACTIVA' ? '#eff6ff' : '#ffffff',
                color: filtroEstado === 'ACTIVA' ? '#1d4ed8' : '#475569',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-play" style={{ color: '#34d399' }}></i> En Curso / Activa
            </button>
            <button
              type="button"
              className={`filter-pill ${filtroEstado === 'PROGRAMADO' ? 'active' : ''}`}
              onClick={() => setFiltroEstado('PROGRAMADO')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: filtroEstado === 'PROGRAMADO' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                background: filtroEstado === 'PROGRAMADO' ? '#eff6ff' : '#ffffff',
                color: filtroEstado === 'PROGRAMADO' ? '#1d4ed8' : '#475569',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-calendar-plus" style={{ color: '#38bdf8' }}></i> Programadas (Futuras)
            </button>
            <button
              type="button"
              className={`filter-pill ${filtroEstado === 'CERRADO' ? 'active' : ''}`}
              onClick={() => setFiltroEstado('CERRADO')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: filtroEstado === 'CERRADO' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                background: filtroEstado === 'CERRADO' ? '#eff6ff' : '#ffffff',
                color: filtroEstado === 'CERRADO' ? '#1d4ed8' : '#475569',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-box-archive" style={{ color: '#fbbf24' }}></i> Histórico Anterior (Cerradas)
            </button>
            <button
              type="button"
              className={`filter-pill ${filtroEstado === 'TODAS' ? 'active' : ''}`}
              onClick={() => setFiltroEstado('TODAS')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: filtroEstado === 'TODAS' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                background: filtroEstado === 'TODAS' ? '#eff6ff' : '#ffffff',
                color: filtroEstado === 'TODAS' ? '#1d4ed8' : '#475569',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-globe"></i> Todas las Semanas
            </button>
          </div>
        </div>

        <DataTable
          data={ciclosFiltrados}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Buscar por código, fecha, estado..."
          exportFileName="semanas_operativas"
          emptyMessage="No se encontraron semanas en esta sección"
        />
      </div>

      {/* ========================================================================
          MODAL 1: ABRIR NUEVA SEMANA OPERATIVA MANUAL (1:1 V2_3_11_26)
         ======================================================================== */}
      {modalCrear && (
        <div
          className="modal-custom-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            className="modal-custom-card"
            style={{
              width: '100%',
              maxWidth: '500px',
              background: '#ffffff',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
            }}
          >
            <div
              className="modal-custom-header"
              style={{
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid rgba(96, 165, 250, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60a5fa',
                    fontSize: '18px',
                  }}
                >
                  <i className="fa-regular fa-calendar-plus"></i>
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#ffffff' }}>
                    Abrir Nueva Semana Operativa
                  </h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    Configura el rango de fechas para el ciclo de recolección
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalCrear(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '22px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                crearMutation.mutate(formCrear);
              }}
            >
              <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Nombre o Código de la Semana *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formCrear.codigo}
                    onChange={(e) => setFormCrear({ ...formCrear, codigo: e.target.value })}
                    placeholder="Ej: Semana 33 (2026-08-18 al 2026-08-24)"
                    required
                    style={{ width: '100%', height: '40px', fontWeight: 600 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Fecha Inicio (Martes) *
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={formCrear.fechaInicio}
                      onChange={(e) => setFormCrear({ ...formCrear, fechaInicio: e.target.value })}
                      required
                      style={{ width: '100%', height: '40px', fontWeight: 600 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Fecha Cierre (Lunes) *
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={formCrear.fechaFin}
                      onChange={(e) => setFormCrear({ ...formCrear, fechaFin: e.target.value })}
                      required
                      style={{ width: '100%', height: '40px', fontWeight: 600 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Notas / Observaciones (Opcional)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formCrear.observaciones}
                    onChange={(e) => setFormCrear({ ...formCrear, observaciones: e.target.value })}
                    placeholder="Ej: Semana con ajuste por feriado bancario"
                    style={{ width: '100%', height: '40px' }}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: '14px 22px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                <button type="button" className="btn btn-outline" onClick={() => setModalCrear(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={crearMutation.isPending}>
                  <i className="fa-solid fa-check"></i> {crearMutation.isPending ? 'Guardando...' : 'Abrir Semana'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 2: GENERADOR AUTOMÁTICO DE 52 SEMANAS (1:1 V2_3_11_26)
         ======================================================================== */}
      {modalGenerar52 && (
        <div
          className="modal-custom-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            className="modal-custom-card modal-lg"
            style={{
              width: '100%',
              maxWidth: '640px',
              background: '#ffffff',
              borderRadius: '16px',
              overflow: 'visible',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
                padding: '18px 22px',
                borderRadius: '16px 16px 0 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(168, 85, 247, 0.25)',
                    border: '1px solid rgba(192, 132, 252, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#d8b4fe',
                    fontSize: '18px',
                  }}
                >
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#ffffff' }}>
                    Generador Automático de 52 Semanas
                  </h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#cbd5e1' }}>
                    Planifica y crea en 1 clic las 52 semanas del año completo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalGenerar52(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '22px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                generar52Mutation.mutate();
              }}
            >
              <div style={{ padding: '20px 22px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Año a Planificar *
                    </label>
                    <SearchableSelect
                      options={ANIOS_OPTIONS}
                      value={form52.anio}
                      onChange={(val) => setForm52({ ...form52, anio: String(val || '2026') })}
                      placeholder="Año..."
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Día de Inicio *
                    </label>
                    <SearchableSelect
                      options={DIAS_INICIO_OPTIONS}
                      value={form52.diaInicio}
                      onChange={(val) => setForm52({ ...form52, diaInicio: String(val || '2') })}
                      placeholder="Día inicio..."
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Día de Cierre *
                    </label>
                    <SearchableSelect
                      options={DIAS_FIN_OPTIONS}
                      value={form52.diaFin}
                      onChange={(val) => setForm52({ ...form52, diaFin: String(val || '1') })}
                      placeholder="Día cierre..."
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Fecha del Primer Martes de Inicio (Opcional - Calculada Automática)
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={form52.fechaPrimerInicio}
                    onChange={(e) => setForm52({ ...form52, fechaPrimerInicio: e.target.value })}
                    style={{ width: '100%', height: '38px' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                      <i className="fa-solid fa-list-ol" style={{ marginRight: '5px' }}></i>
                      Vista Previa de las 52 Semanas a Generar:
                    </label>
                    <span className="badge badge-info">52 Semanas</span>
                  </div>
                  <div
                    style={{
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: '#0f172a',
                      borderRadius: '10px',
                      border: '1px solid #334155',
                      padding: '6px 0',
                    }}
                  >
                    {preview52Items.map((it) => (
                      <div
                        key={it.num}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 14px',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          fontSize: '12px',
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#60a5fa' }}>{it.num}</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                          {it.fIni} al {it.fFin}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>(7 días)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: '14px 22px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  borderRadius: '0 0 16px 16px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                <button type="button" className="btn btn-outline" onClick={() => setModalGenerar52(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={generar52Mutation.isPending}
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    color: '#ffffff',
                    fontWeight: 800,
                    border: 'none',
                  }}
                >
                  <i className="fa-solid fa-wand-magic-sparkles"></i>{' '}
                  {generar52Mutation.isPending ? 'Planificando...' : 'Generar las 52 Semanas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 3: MODIFICAR FECHAS DE SEMANA (1:1 V2_3_11_26)
         ======================================================================== */}
      {modalEditar && (
        <div
          className="modal-custom-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            className="modal-custom-card"
            style={{
              width: '100%',
              maxWidth: '500px',
              background: '#ffffff',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60a5fa',
                    fontSize: '18px',
                  }}
                >
                  <i className="fa-regular fa-pen-to-square"></i>
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#ffffff' }}>
                    Modificar Fechas de Semana
                  </h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    Actualiza el rango operativo para el ciclo seleccionado
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalEditar(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '22px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                editarMutation.mutate(formEditar);
              }}
            >
              <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Nombre o Código de la Semana <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formEditar.codigo}
                    onChange={(e) => setFormEditar({ ...formEditar, codigo: e.target.value })}
                    required
                    style={{ width: '100%', height: '42px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Fecha Inicio (Martes) <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={formEditar.fechaInicio}
                      onChange={(e) => setFormEditar({ ...formEditar, fechaInicio: e.target.value })}
                      required
                      style={{ width: '100%', height: '42px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Fecha Cierre (Lunes) <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={formEditar.fechaFin}
                      onChange={(e) => setFormEditar({ ...formEditar, fechaFin: e.target.value })}
                      required
                      style={{ width: '100%', height: '42px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Observaciones
                  </label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={formEditar.observaciones}
                    onChange={(e) => setFormEditar({ ...formEditar, observaciones: e.target.value })}
                    placeholder="Motivo del ajuste de fechas u observaciones..."
                    style={{ width: '100%', fontSize: '13.5px', color: '#0f172a' }}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: '14px 22px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                <button type="button" className="btn btn-outline" onClick={() => setModalEditar(false)}>
                  <i className="fa-solid fa-xmark"></i> Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={editarMutation.isPending}>
                  <i className="fa-solid fa-floppy-disk"></i>{' '}
                  {editarMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 4: ACTIVAR SEMANA OPERATIVA (1:1 V2_3_11_26 CON SECUENCIA Y STOCK)
         ======================================================================== */}
      {modalActivar && cicloActivar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              background: '#0f172a',
              color: '#ffffff',
              borderRadius: '16px',
              border: '1.5px solid #334155',
              padding: '22px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            {cargandoValidacionActivar ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#38bdf8' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '26px', marginBottom: '8px' }}></i>
                <div>Validando secuencia de ciclos...</div>
              </div>
            ) : validacionActivar && validacionActivar.esSecuenciaCorrecta === false ? (
              <>
                <h3 style={{ margin: '0 0 14px 0', fontSize: '17px', fontWeight: 800, color: '#ffffff' }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f59e0b', marginRight: '8px' }}></i>
                  ¡Advertencia de Secuencia de Ciclos!
                </h3>
                <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
                  <div
                    style={{
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1.5px solid #f59e0b',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '13.5px', marginBottom: '6px' }}>
                      <i className="fa-solid fa-shuffle" style={{ marginRight: '6px' }}></i>
                      Salto de Ciclo Detectado
                    </div>
                    <p style={{ margin: '0 0 6px 0', color: '#f8fafc' }}>
                      El último ciclo cerrado fue:{' '}
                      <strong style={{ color: '#93c5fd' }}>{validacionActivar.ultimoCicloCerradoCodigo || 'N/A'}</strong>{' '}
                      con{' '}
                      <strong style={{ color: '#38bdf8' }}>
                        {Number(validacionActivar.ultimoCicloCerradoStockFinal || 0).toLocaleString('es-VE')} Lts
                      </strong>{' '}
                      en tanque.
                    </p>
                    <p style={{ margin: '0 0 6px 0', color: '#f8fafc' }}>
                      El ciclo correlativo que corresponde activar es:{' '}
                      <strong style={{ color: '#4ade80' }}>{validacionActivar.cicloSiguienteEsperadoCodigo || 'N/A'}</strong>.
                    </p>
                    <p style={{ margin: 0, color: '#fca5a5' }}>
                      Estás a punto de activar:{' '}
                      <strong style={{ color: '#ef4444', fontSize: '14px' }}>
                        {cicloActivar.codigo || cicloActivar.Codigo}
                      </strong>.
                    </p>
                  </div>

                  <div
                    style={{
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      padding: '10px',
                      marginBottom: '16px',
                    }}
                  >
                    <label
                      style={{
                        display: 'block',
                        fontWeight: 700,
                        color: '#f8fafc',
                        fontSize: '12.5px',
                        marginBottom: '6px',
                      }}
                    >
                      Stock Inicial a asignar a {cicloActivar.codigo || cicloActivar.Codigo} (Lts):
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={stockTransferir}
                      onChange={(e) => setStockTransferir(Number(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        height: '40px',
                        fontSize: '15px',
                        fontWeight: 800,
                        color: '#0284c7',
                        background: '#ffffff',
                        border: '2px solid #38bdf8',
                        borderRadius: '6px',
                        textAlign: 'center',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setModalActivar(false)}
                    style={{ background: '#64748b', color: '#ffffff', border: 'none', fontWeight: 700 }}
                  >
                    Cancelar y Revisar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={activarMutation.isPending}
                    onClick={() =>
                      activarMutation.mutate({
                        id: cicloActivar.id || cicloActivar.Id,
                        stockPersonalizado: stockTransferir,
                      })
                    }
                    style={{ background: '#f59e0b', color: '#ffffff', border: 'none', fontWeight: 800 }}
                  >
                    <i className="fa-solid fa-arrow-right-arrow-left"></i>{' '}
                    {activarMutation.isPending ? 'Activando...' : 'Transferir Stock y Activar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                  ¿Activar {cicloActivar.codigo || cicloActivar.Codigo}?
                </h3>
                <p style={{ fontSize: '13.5px', color: '#f1f5f9', marginBottom: '12px' }}>
                  Este ciclo se convertirá en el <strong>ciclo ACTIVO</strong> para el registro de recolecciones y despachos.
                </p>
                {stockTransferir > 0 && (
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1.5px solid #10b981',
                      borderRadius: '8px',
                      padding: '10px',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ color: '#34d399', fontWeight: 700, fontSize: '12.5px' }}>
                      <i className="fa-solid fa-oil-well" style={{ marginRight: '5px' }}></i>
                      Traspaso de Stock Automático:
                    </div>
                    <span style={{ color: '#f8fafc', fontSize: '13px' }}>
                      Heredará <strong>{stockTransferir.toLocaleString('es-VE')} Lts</strong> de stock en tanque del ciclo anterior.
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setModalActivar(false)}
                    style={{ background: '#64748b', color: '#ffffff', border: 'none', fontWeight: 700 }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={activarMutation.isPending}
                    onClick={() => activarMutation.mutate({ id: cicloActivar.id || cicloActivar.Id })}
                    style={{ background: '#10b981', color: '#ffffff', border: 'none', fontWeight: 800 }}
                  >
                    <i className="fa-solid fa-play"></i>{' '}
                    {activarMutation.isPending ? 'Activando...' : 'Sí, Activar Ciclo'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 5: CERRAR CICLO OPERATIVO (1:1 V2_3_11_26 CON BALANCE DE TANQUES Y ALERTA FINCAS)
         ======================================================================== */}
      {modalCerrar && cicloCerrar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#0f172a',
              color: '#ffffff',
              borderRadius: '16px',
              border: '1.5px solid #334155',
              padding: '22px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
              maxHeight: '92vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                <i className="fa-solid fa-lock" style={{ color: '#ef4444', marginRight: '8px' }}></i>
                Cerrar Ciclo: {resumenCierre?.codigo || cicloCerrar.codigo || cicloCerrar.Codigo}
              </h3>
              <button
                type="button"
                onClick={() => setModalCerrar(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '22px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            {cargandoResumenCierre ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#38bdf8' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '28px', marginBottom: '8px' }}></i>
                <div>Calculando balance de tanques y verificando liquidaciones...</div>
              </div>
            ) : (
              <div style={{ textAlign: 'left', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
                {/* ALERTA DE FINCAS SIN PAGAR CON BOTÓN IR A LIQUIDACIÓN */}
                {fincasSinPagar.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1.5px solid #ef4444',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      marginBottom: '14px',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{
                          color: '#f87171',
                          fontWeight: 800,
                          fontSize: '13px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '16px', color: '#ef4444' }}></i>
                        <span>
                          ¡Atención! Hay <strong>{fincasSinPagar.length}</strong> finca(s) sin pagar en esta semana
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setModalCerrar(false);
                          navigate('/liquidaciones');
                        }}
                        style={{
                          background: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          fontWeight: 800,
                          fontSize: '12px',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className="fa-solid fa-money-bill-wave"></i> Ir a Liquidación
                      </button>
                    </div>

                    <div
                      style={{
                        maxHeight: '110px',
                        overflowY: 'auto',
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        marginBottom: '8px',
                      }}
                    >
                      {fincasSinPagar.map((f: any, idx: number) => {
                        const nom = f.fincaNombre || f.FincaNombre || 'Finca';
                        const prop = f.propietario || f.Propietario || '';
                        const lts = Number(f.totalLitros || f.TotalLitros || 0).toLocaleString('es-VE');
                        const neto = Number(f.totalNetoBs || f.TotalNetoBs || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                        });
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '5px 8px',
                              borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
                              fontSize: '12px',
                            }}
                          >
                            <div>
                              <strong style={{ color: '#fef08a' }}>{nom}</strong>
                              {prop && prop !== 'N/A' && prop !== nom && (
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}> ({prop})</span>
                              )}
                            </div>
                            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{lts} L</span>
                              <span style={{ color: '#f87171', fontWeight: 800, marginLeft: '8px' }}>Bs. {neto}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#cbd5e1', lineHeight: 1.4 }}>
                      <i className="fa-solid fa-circle-info" style={{ color: '#38bdf8', marginRight: '4px' }}></i>
                      Si deseas pagar primero haz clic en <strong>"Ir a Liquidación"</strong>. Si prefieres cerrar la
                      semana ahora, presiona <strong>"Continuar y Cerrar Ciclo"</strong> abajo.
                    </div>
                  </div>
                )}

                <p style={{ marginBottom: '10px', color: '#f1f5f9' }}>
                  Revisa el <strong>balance operativo rápido</strong> antes de confirmar el cierre definitivo:
                </p>

                {/* TARJETA DE DETALLE RÁPIDO OPERATIVO */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1.5px solid #334155',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      fontSize: '12.5px',
                      marginBottom: '8px',
                    }}
                  >
                    <div
                      style={{
                        background: '#1e293b',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        borderLeft: '3px solid #38bdf8',
                      }}
                    >
                      <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>
                        Stock Inicial Tanque:
                      </span>
                      <strong style={{ color: '#38bdf8', fontSize: '13.5px' }}>
                        {Number(resumenCierre?.stockInicialTanques || 0).toLocaleString('es-VE')} Lts
                      </strong>
                    </div>
                    <div
                      style={{
                        background: '#1e293b',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        borderLeft: '3px solid #10b981',
                      }}
                    >
                      <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>Recolectado Fincas:</span>
                      <strong style={{ color: '#10b981', fontSize: '13.5px' }}>
                        {Number(
                          resumenCierre?.totalRecolectadoFincas ?? cicloCerrar.totalLitros ?? 0
                        ).toLocaleString('es-VE')}{' '}
                        Lts
                      </strong>
                    </div>
                    <div
                      style={{
                        background: '#1e293b',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        borderLeft: '3px solid #06b6d4',
                      }}
                    >
                      <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>
                        Ingreso a Receptoría:
                      </span>
                      <strong style={{ color: '#06b6d4', fontSize: '13.5px' }}>
                        {Number(resumenCierre?.totalEntregasReceptoria || 0).toLocaleString('es-VE')} Lts
                      </strong>
                    </div>
                    <div
                      style={{
                        background: '#1e293b',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        borderLeft: '3px solid #f59e0b',
                      }}
                    >
                      <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>
                        Despachado a Plantas:
                      </span>
                      <strong style={{ color: '#f59e0b', fontSize: '13.5px' }}>
                        {Number(resumenCierre?.totalDespachosCompanias || 0).toLocaleString('es-VE')} Lts
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: '6px',
                      borderTop: '1px solid #334155',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ color: '#94a3b8' }}>
                      <i className="fa-solid fa-route" style={{ marginRight: '4px' }}></i>
                      Merma Rutas:{' '}
                      <strong style={{ color: '#f87171' }}>
                        {Number(resumenCierre?.totalMerma || 0).toLocaleString('es-VE')} Lts
                      </strong>
                    </span>
                    <span style={{ color: '#cbd5e1' }}>
                      <i className="fa-solid fa-oil-well" style={{ color: '#38bdf8', marginRight: '4px' }}></i>
                      Saldo Tanque Calculado:{' '}
                      <strong style={{ color: '#38bdf8', fontSize: '14px' }}>
                        {Number(resumenCierre?.balanceCalculadoTanque || 0).toLocaleString('es-VE')} Lts
                      </strong>
                    </span>
                  </div>
                </div>

                {/* TARJETA DE TRASPASO AL SIGUIENTE CICLO */}
                <div
                  style={{
                    background: 'rgba(6, 182, 212, 0.1)',
                    border: '1.5px solid #0891b2',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ color: '#22d3ee', fontWeight: 800, fontSize: '12.5px', marginBottom: '4px' }}>
                    <i className="fa-solid fa-forward-step" style={{ marginRight: '5px' }}></i>
                    Traspaso al Siguiente Ciclo:
                  </div>
                  <p style={{ margin: 0, color: '#f8fafc', fontSize: '12.5px' }}>
                    El stock final que confirmes se guardará y asignará automáticamente como{' '}
                    <strong>Stock Inicial</strong> de:{' '}
                    <strong style={{ color: '#67e8f9' }}>
                      {resumenCierre?.siguienteCicloCodigo || 'Siguiente Ciclo Correlativo'}
                    </strong>
                    .
                  </p>
                </div>

                {/* CAMPO DE CONFIRMACIÓN O AJUSTE DE STOCK FINAL */}
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    border: '1.5px solid #475569',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    marginBottom: '18px',
                  }}
                >
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 800,
                      color: '#f8fafc',
                      fontSize: '13px',
                      marginBottom: '6px',
                    }}
                  >
                    Confirmar Litros Finales que quedan en Tanque:
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={stockFinalTanques}
                    onChange={(e) => setStockFinalTanques(Math.max(0, Number(e.target.value) || 0))}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      height: '44px',
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#0284c7',
                      background: '#ffffff',
                      border: '2px solid #38bdf8',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}
                  />
                  <small style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>
                    * Si el volumen físico real medido en tanque difiere, puedes ajustar el número aquí antes de cerrar.
                  </small>
                </div>

                {hasTolerancia && toleranciaCompaniasCierre.length > 0 && (
                  <div
                    style={{
                      marginBottom: '16px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'rgba(15, 23, 42, 0.45)',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                    }}
                  >
                    <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#e2e8f0', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-traffic-light text-amber-400"></i>
                      Tolerancia de Merma por Compañía (Cierre Semanal)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {toleranciaCompaniasCierre.map((c: any) => (
                        <div
                          key={c.nombre}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: 'rgba(30, 41, 59, 0.8)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#ffffff' }}>{c.nombre}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                              Enviado: {c.despachado.toLocaleString()} L • Recibido: {c.recibido.toLocaleString()} L ({c.viajes} despacho{c.viajes === 1 ? '' : 's'})
                            </div>
                          </div>
                          <SemaforoToleranciaBadge litrosEsperados={c.despachado} litrosReales={c.recibido} compact />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setModalCerrar(false)}
                    style={{ background: '#64748b', color: '#ffffff', border: 'none', fontWeight: 700 }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={cerrarMutation.isPending}
                    onClick={() =>
                      cerrarMutation.mutate({
                        id: cicloCerrar.id || cicloCerrar.Id,
                        stockFinal: stockFinalTanques,
                      })
                    }
                    style={{ background: '#ef4444', color: '#ffffff', border: 'none', fontWeight: 800 }}
                  >
                    <i className="fa-solid fa-check"></i>{' '}
                    {cerrarMutation.isPending
                      ? 'Cerrando...'
                      : fincasSinPagar.length > 0
                      ? 'Continuar y Cerrar Ciclo de Todas Formas'
                      : 'Confirmar y Cerrar Ciclo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 6: REABRIR SEMANA OPERATIVA CERRADA (1:1 V2_3_11_26)
         ======================================================================== */}
      {modalReabrir && cicloReabrir && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              background: '#1e293b',
              color: '#ffffff',
              borderRadius: '16px',
              border: '1.5px solid #334155',
              padding: '22px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
            }}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
              <i className="fa-solid fa-lock-open" style={{ color: '#f59e0b', marginRight: '8px' }}></i>
              ¿Reabrir Ciclo Operativo?
            </h3>
            <p style={{ fontSize: '13.5px', color: '#94a3b8', marginBottom: '14px' }}>
              Se reactivará la <strong>{cicloReabrir.codigo || cicloReabrir.Codigo || 'Semana'}</strong> para permitir
              registrar, corregir tickets o conciliar rutas rezagadas.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!motivoReabrir.trim()) {
                  toast.warning('¡Debe ingresar el motivo de la re-apertura para el registro en el log de auditoría!');
                  return;
                }
                reabrirMutation.mutate({
                  id: cicloReabrir.id || cicloReabrir.Id,
                  motivo: motivoReabrir.trim(),
                });
              }}
            >
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#e2e8f0',
                    marginBottom: '6px',
                  }}
                >
                  Motivo de la Re-apertura (Requerido para Auditoría y Log) *
                </label>
                <textarea
                  value={motivoReabrir}
                  onChange={(e) => setMotivoReabrir(e.target.value)}
                  placeholder="Ej: Carga de ruta rezagada del chofer, corrección de tickets, ajuste contable..."
                  required
                  style={{
                    width: '100%',
                    height: '90px',
                    fontSize: '13px',
                    color: '#ffffff',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '10px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setModalReabrir(false)}
                  style={{ background: '#64748b', color: '#ffffff', border: 'none', fontWeight: 700 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={reabrirMutation.isPending}
                  style={{ background: '#d97706', color: '#ffffff', border: 'none', fontWeight: 800 }}
                >
                  <i className="fa-solid fa-lock-open"></i>{' '}
                  {reabrirMutation.isPending ? 'Reabriendo...' : 'Sí, Reabrir Semana'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default SemanasPage;
