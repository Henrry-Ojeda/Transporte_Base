import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  examenesLecheApi,
  LACTOSCAN_FIELDS,
  evaluarValorContraParametro,
  type ExamenLecheDto,
  type ParametroCalidadLecheDto,
  type GuardarParametroCalidadLecheDto,
} from '@/api/examenesLeche.api';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { ChoferSelect } from '@/components/selectors';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { useAuthStore } from '@/stores/authStore';
import { ExamenLecheModal } from './components/ExamenLecheModal';
import { ImagenLightboxModal } from './components/ImagenLightboxModal';

const getFirstDayOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const getTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyParametro = (): GuardarParametroCalidadLecheDto => ({
  nombre: '',
  tipoLeche: 'VACA',
  esPrincipal: false,
  activo: true,
  grasaMin: null,
  grasaMax: null,
  sngMin: null,
  sngMax: null,
  densidadMin: null,
  densidadMax: null,
  lactosaMin: null,
  lactosaMax: null,
  salesMin: null,
  salesMax: null,
  proteinaMin: null,
  proteinaMax: null,
  solidosTotalesMin: null,
  solidosTotalesMax: null,
  aguaAdicionadaMin: 0,
  aguaAdicionadaMax: 0,
  temperaturaMin: null,
  temperaturaMax: null,
  puntoCongelacionMin: null,
  puntoCongelacionMax: null,
  phMin: null,
  phMax: null,
  conductividadMin: null,
  conductividadMax: null,
  observacion: '',
});

export const CalidadLechePage: React.FC = () => {
  const queryClient = useQueryClient();
  const hasBufala = useAuthStore((s) => s.hasTenantModule('MOD_LECHE_BUFALA'));
  const hasActionPermission = useAuthStore((s) => s.hasActionPermission);
  const canCreate = hasActionPermission('CALIDAD_LECHE', 'CREAR');
  const canEdit = hasActionPermission('CALIDAD_LECHE', 'EDITAR');
  const canDelete = hasActionPermission('CALIDAD_LECHE', 'ELIMINAR');

  const [activeTab, setActiveTab] = useState<'examenes' | 'parametros'>('examenes');

  // Filtros Exámenes
  const [fechaInicio, setFechaInicio] = useState(getFirstDayOfMonth());
  const [fechaFin, setFechaFin] = useState(getTodayIso());
  const [nivelPrueba, setNivelPrueba] = useState('TODOS');
  const [fincaId, setFincaId] = useState('');
  const [choferId, setChoferId] = useState('');
  const [resultado, setResultado] = useState('TODOS');
  const [soloFueraDeRango, setSoloFueraDeRango] = useState(false);

  // Modales Exámenes
  const [modalExamenOpen, setModalExamenOpen] = useState(false);
  const [examenEditar, setExamenEditar] = useState<ExamenLecheDto | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);

  // Modales Parámetros CRUD
  const [modalParamOpen, setModalParamOpen] = useState(false);
  const [paramEditId, setParamEditId] = useState<number | null>(null);
  const [paramForm, setParamForm] = useState<GuardarParametroCalidadLecheDto>(emptyParametro());

  const { data: fincas = [] } = useQuery({
    queryKey: ['fincas-selector-calidad'],
    queryFn: () => catalogosApi.getFincas(true),
  });

  const { data: parametros = [], isLoading: loadingParams } = useQuery<ParametroCalidadLecheDto[]>({
    queryKey: ['parametros-calidad-leche'],
    queryFn: () => examenesLecheApi.getParametros(),
  });

  const parametroPrincipal = useMemo(
    () => parametros.find((p) => p.esPrincipal) || null,
    [parametros]
  );

  const { data: examenes = [], isLoading: loadingExamenes } = useQuery<ExamenLecheDto[]>({
    queryKey: ['examenes-leche', fechaInicio, fechaFin, nivelPrueba, fincaId, choferId, resultado, soloFueraDeRango],
    queryFn: () =>
      examenesLecheApi.getExamenes({
        fechaInicio: fechaInicio || undefined,
        fechaFin: fechaFin || undefined,
        nivelPrueba: nivelPrueba !== 'TODOS' ? nivelPrueba : undefined,
        fincaId: fincaId ? Number(fincaId) : undefined,
        choferId: choferId ? Number(choferId) : undefined,
        resultado: resultado !== 'TODOS' ? resultado : undefined,
        soloFueraDeRango: soloFueraDeRango || undefined,
      }),
  });

  const invalidarTodo = () => {
    queryClient.invalidateQueries({ queryKey: ['examenes-leche'] });
    queryClient.invalidateQueries({ queryKey: ['parametros-calidad-leche'] });
    queryClient.invalidateQueries({ queryKey: ['parametro-calidad-principal'] });
  };

  // Mutaciones Exámenes
  const eliminarExamenMutation = useMutation({
    mutationFn: (id: number) => examenesLecheApi.eliminarExamen(id),
    onSuccess: (res) => {
      toast.success(res.message || 'Examen eliminado');
      invalidarTodo();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error al eliminar examen'),
  });

  // Mutaciones Parámetros
  const guardarParamMutation = useMutation({
    mutationFn: (dto: GuardarParametroCalidadLecheDto) =>
      paramEditId ? examenesLecheApi.actualizarParametro(paramEditId, dto) : examenesLecheApi.crearParametro(dto),
    onSuccess: (res) => {
      toast.success(res.message || 'Parámetros guardados');
      invalidarTodo();
      setModalParamOpen(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error al guardar parámetros'),
  });

  const marcarPrincipalMutation = useMutation({
    mutationFn: (id: number) => examenesLecheApi.marcarParametroPrincipal(id),
    onSuccess: (res) => {
      toast.success(res.message || 'Parámetro Principal actualizado');
      invalidarTodo();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error al marcar parámetro principal'),
  });

  const eliminarParamMutation = useMutation({
    mutationFn: (id: number) => examenesLecheApi.eliminarParametro(id),
    onSuccess: (res) => {
      toast.success(res.message || 'Parámetro eliminado');
      invalidarTodo();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error al eliminar parámetro'),
  });

  // KPIs
  const kpis = useMemo(() => {
    const total = examenes.length;
    const grasas = examenes.map((e) => e.grasaPct).filter((v): v is number => v != null);
    const sngs = examenes.map((e) => e.sngPct).filter((v): v is number => v != null);
    const fuera = examenes.filter((e) => e.fueraDeRango).length;
    const conAgua = examenes.filter((e) => (e.aguaAdicionadaPct ?? 0) > 0).length;
    return {
      total,
      promGrasa: grasas.length ? (grasas.reduce((a, b) => a + b, 0) / grasas.length).toFixed(2) : '—',
      promSng: sngs.length ? (sngs.reduce((a, b) => a + b, 0) / sngs.length).toFixed(2) : '—',
      fuera,
      conAgua,
    };
  }, [examenes]);

  const renderMetricBadge = (
    val: number | null | undefined,
    minKey: keyof ParametroCalidadLecheDto,
    maxKey: keyof ParametroCalidadLecheDto,
    suffix = ''
  ) => {
    if (val == null) return <span className="opacity-40">—</span>;
    const ev = evaluarValorContraParametro(val, parametroPrincipal, minKey, maxKey);
    const cls =
      ev.estado === 'alerta'
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200 font-extrabold'
        : ev.estado === 'ok'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-semibold'
          : 'font-medium';
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-xs ${cls}`}
        title={ev.rangoTexto ? `Rango esperado: ${ev.rangoTexto}` : undefined}
      >
        {Number(val).toFixed(suffix === '°C' && Math.abs(val) < 2 ? 3 : 2)}
        {suffix}
      </span>
    );
  };

  const examenesColumns: ColumnDef<ExamenLecheDto>[] = [
    {
      header: 'Fecha',
      accessorKey: 'fecha',
      cell: (r) => (
        <div className="text-xs">
          <div className="font-bold">{r.fecha ? r.fecha.substring(0, 10) : '—'}</div>
          {r.horaPrueba && <div className="opacity-60">{r.horaPrueba}</div>}
        </div>
      ),
    },
    {
      header: 'Nivel / Origen',
      accessorKey: 'nivelPrueba',
      cell: (r) => (
        <div className="space-y-0.5">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              r.nivelPrueba === 'FINCA'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200'
            }`}
          >
            {r.nivelPrueba === 'FINCA' ? 'FINCA' : 'TICKET'}
          </span>
          <div className="text-xs font-bold truncate max-w-[160px]">
            {r.fincaNombre || (r.controlRutaId ? `Ticket #${r.controlRutaId}` : 'General')}
          </div>
          {r.controlRutaId && r.fincaNombre && (
            <div className="text-[10px] opacity-65">Ticket #{r.controlRutaId}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Chofer / Litros',
      accessorKey: 'nombreChofer',
      cell: (r) => (
        <div className="text-xs">
          <div className="font-semibold truncate max-w-[140px]">{r.nombreChofer || '—'}</div>
          <div className="opacity-70">
            {r.litrosAsociados != null ? `${r.litrosAsociados.toLocaleString()} L` : '—'}
            {r.camionPlaca ? ` • ${r.camionPlaca}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Grasa %',
      accessorKey: 'grasaPct',
      cell: (r) => renderMetricBadge(r.grasaPct, 'grasaMin', 'grasaMax', '%'),
    },
    {
      header: 'SNG %',
      accessorKey: 'sngPct',
      cell: (r) => renderMetricBadge(r.sngPct, 'sngMin', 'sngMax', '%'),
    },
    {
      header: 'Dens.',
      accessorKey: 'densidad',
      cell: (r) => renderMetricBadge(r.densidad, 'densidadMin', 'densidadMax'),
    },
    {
      header: 'Prot. %',
      accessorKey: 'proteinaPct',
      cell: (r) => renderMetricBadge(r.proteinaPct, 'proteinaMin', 'proteinaMax', '%'),
    },
    {
      header: 'Agua %',
      accessorKey: 'aguaAdicionadaPct',
      cell: (r) => renderMetricBadge(r.aguaAdicionadaPct, 'aguaAdicionadaMin', 'aguaAdicionadaMax', '%'),
    },
    {
      header: 'Temp °C',
      accessorKey: 'temperaturaC',
      cell: (r) => renderMetricBadge(r.temperaturaC, 'temperaturaMin', 'temperaturaMax', '°C'),
    },
    {
      header: 'pH',
      accessorKey: 'ph',
      cell: (r) => renderMetricBadge(r.ph, 'phMin', 'phMax'),
    },
    {
      header: 'Resultado',
      accessorKey: 'resultado',
      cell: (r) => {
        const badge =
          r.resultado === 'APROBADA'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : r.resultado === 'OBSERVADA'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200';
        return (
          <div className="flex flex-col gap-0.5">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold text-center ${badge}`}>
              {r.resultado}
            </span>
            {r.fueraDeRango && (
              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 text-center">
                <i className="fa-solid fa-triangle-exclamation mr-0.5"></i>Fuera rango
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Fotos',
      accessorKey: 'imagenExamen',
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          {r.imagenExamen ? (
            <button
              type="button"
              onClick={() => setLightbox({ src: r.imagenExamen!, title: `Examen #${r.id} (${r.fincaNombre || `Ticket #${r.controlRutaId || ''}`})` })}
              className="px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200 hover:opacity-80"
              title="Ver foto del examen Lactoscan"
            >
              <i className="fa-solid fa-flask mr-1"></i>Examen
            </button>
          ) : null}
          {r.imagenRecibo ? (
            <button
              type="button"
              onClick={() => setLightbox({ src: r.imagenRecibo!, title: `Recibo #${r.id}` })}
              className="px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200 hover:opacity-80"
              title="Ver foto del recibo de leche"
            >
              <i className="fa-solid fa-receipt mr-1"></i>Recibo
            </button>
          ) : null}
          {!r.imagenExamen && !r.imagenRecibo && <span className="text-xs opacity-40">—</span>}
        </div>
      ),
    },
    {
      header: 'Acciones',
      accessorKey: 'id',
      cell: (r) => (
        <div className="flex items-center gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setExamenEditar(r);
                setModalExamenOpen(true);
              }}
              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
              title="Editar examen"
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirmDeleteOrDeactivate(
                  `¿Eliminar el examen #${r.id}?`,
                  'Esta acción anulará el registro del historial.'
                );
                if (ok) eliminarExamenMutation.mutate(r.id);
              }}
              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
              title="Eliminar examen"
            >
              <i className="fa-solid fa-trash"></i>
            </button>
          )}
        </div>
      ),
    },
  ];

  const abrirCrearParam = () => {
    setParamEditId(null);
    setParamForm(emptyParametro());
    setModalParamOpen(true);
  };

  const abrirEditarParam = (p: ParametroCalidadLecheDto) => {
    setParamEditId(p.id);
    setParamForm({
      nombre: p.nombre,
      tipoLeche: p.tipoLeche || 'VACA',
      esPrincipal: p.esPrincipal,
      activo: p.activo,
      grasaMin: p.grasaMin ?? null,
      grasaMax: p.grasaMax ?? null,
      sngMin: p.sngMin ?? null,
      sngMax: p.sngMax ?? null,
      densidadMin: p.densidadMin ?? null,
      densidadMax: p.densidadMax ?? null,
      lactosaMin: p.lactosaMin ?? null,
      lactosaMax: p.lactosaMax ?? null,
      salesMin: p.salesMin ?? null,
      salesMax: p.salesMax ?? null,
      proteinaMin: p.proteinaMin ?? null,
      proteinaMax: p.proteinaMax ?? null,
      solidosTotalesMin: p.solidosTotalesMin ?? null,
      solidosTotalesMax: p.solidosTotalesMax ?? null,
      aguaAdicionadaMin: p.aguaAdicionadaMin ?? null,
      aguaAdicionadaMax: p.aguaAdicionadaMax ?? null,
      temperaturaMin: p.temperaturaMin ?? null,
      temperaturaMax: p.temperaturaMax ?? null,
      puntoCongelacionMin: p.puntoCongelacionMin ?? null,
      puntoCongelacionMax: p.puntoCongelacionMax ?? null,
      phMin: p.phMin ?? null,
      phMax: p.phMax ?? null,
      conductividadMin: p.conductividadMin ?? null,
      conductividadMax: p.conductividadMax ?? null,
      observacion: p.observacion || '',
    });
    setModalParamOpen(true);
  };

  const fmtRango = (min?: number | null, max?: number | null) => {
    if (min == null && max == null) return '—';
    return `${min ?? '—'} / ${max ?? '—'}`;
  };

  const parametrosColumns: ColumnDef<ParametroCalidadLecheDto>[] = [
    {
      header: 'Parámetro Principal',
      accessorKey: 'esPrincipal',
      cell: (p) => (
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={p.esPrincipal}
            onChange={() => {
              if (!p.esPrincipal) {
                marcarPrincipalMutation.mutate(p.id);
              }
            }}
            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
          />
          {p.esPrincipal ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              PRINCIPAL ACTIVO
            </span>
          ) : (
            <span className="text-[11px] opacity-60">Activar</span>
          )}
        </label>
      ),
    },
    {
      header: 'Nombre del Perfil',
      accessorKey: 'nombre',
      cell: (p) => (
        <div>
          <div className="font-bold text-sm">{p.nombre}</div>
          <div className="text-[11px] opacity-60">{p.tipoLeche}{p.observacion ? ` • ${p.observacion}` : ''}</div>
        </div>
      ),
    },
    { header: 'Grasa %', accessorKey: 'grasaMin', cell: (p) => <span className="text-xs font-semibold">{fmtRango(p.grasaMin, p.grasaMax)}</span> },
    { header: 'SNG %', accessorKey: 'sngMin', cell: (p) => <span className="text-xs font-semibold">{fmtRango(p.sngMin, p.sngMax)}</span> },
    { header: 'Densidad', accessorKey: 'densidadMin', cell: (p) => <span className="text-xs font-semibold">{fmtRango(p.densidadMin, p.densidadMax)}</span> },
    { header: 'Proteína %', accessorKey: 'proteinaMin', cell: (p) => <span className="text-xs font-semibold">{fmtRango(p.proteinaMin, p.proteinaMax)}</span> },
    { header: 'Agua %', accessorKey: 'aguaAdicionadaMax', cell: (p) => <span className="text-xs font-semibold">{fmtRango(p.aguaAdicionadaMin, p.aguaAdicionadaMax)}</span> },
    { header: 'Temp °C', accessorKey: 'temperaturaMax', cell: (p) => <span className="text-xs font-semibold">{fmtRango(p.temperaturaMin, p.temperaturaMax)}</span> },
    { header: 'pH', accessorKey: 'phMin', cell: (p) => <span className="text-xs font-semibold">{fmtRango(p.phMin, p.phMax)}</span> },
    {
      header: 'Acciones',
      accessorKey: 'id',
      cell: (p) => (
        <div className="flex items-center gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={() => abrirEditarParam(p)}
              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
              title="Editar parámetros"
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirmDeleteOrDeactivate(
                  `¿Eliminar el perfil "${p.nombre}"?`,
                  'No afectará exámenes históricos ya guardados.'
                );
                if (ok) eliminarParamMutation.mutate(p.id);
              }}
              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
              title="Eliminar perfil"
            >
              <i className="fa-solid fa-trash"></i>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white flex items-center justify-center shadow-lg">
              <i className="fa-solid fa-flask-vial"></i>
            </span>
            Calidad de Leche &amp; Parámetros (Lactoscan S50)
          </h1>
          <p className="text-xs opacity-70 mt-1">
            Historial de exámenes por Ticket y por Finca, recibos de receptoría y límites Mín/Máx configurables.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (activeTab === 'examenes' ? (
            <button
              type="button"
              onClick={() => {
                setExamenEditar(null);
                setModalExamenOpen(true);
              }}
              className="px-4 py-2 rounded-xl text-sm font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> Nuevo Examen
            </button>
          ) : (
            <button
              type="button"
              onClick={abrirCrearParam}
              className="px-4 py-2 rounded-xl text-sm font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> Nuevo Perfil de Parámetros
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2" style={{ borderColor: 'var(--t-border)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('examenes')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
            activeTab === 'examenes'
              ? 'bg-indigo-600 text-white shadow'
              : 'opacity-75 hover:opacity-100'
          }`}
        >
          <i className="fa-solid fa-vials"></i>
          Historial de Exámenes ({examenes.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('parametros')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
            activeTab === 'parametros'
              ? 'bg-indigo-600 text-white shadow'
              : 'opacity-75 hover:opacity-100'
          }`}
        >
          <i className="fa-solid fa-sliders"></i>
          Parámetros de Leche ({parametros.length})
          {parametroPrincipal && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
              Principal: {parametroPrincipal.nombre}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'examenes' ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl border" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
              <div className="text-[11px] font-bold opacity-65 uppercase">Total Exámenes</div>
              <div className="text-2xl font-extrabold mt-1">{kpis.total}</div>
            </div>
            <div className="p-3.5 rounded-xl border" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
              <div className="text-[11px] font-bold opacity-65 uppercase">Prom. Grasa %</div>
              <div className="text-2xl font-extrabold mt-1 text-indigo-600 dark:text-indigo-400">{kpis.promGrasa}%</div>
            </div>
            <div className="p-3.5 rounded-xl border" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
              <div className="text-[11px] font-bold opacity-65 uppercase">Prom. SNG %</div>
              <div className="text-2xl font-extrabold mt-1 text-cyan-600 dark:text-cyan-400">{kpis.promSng}%</div>
            </div>
            <div className="p-3.5 rounded-xl border" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
              <div className="text-[11px] font-bold opacity-65 uppercase">Fuera de Rango</div>
              <div className="text-2xl font-extrabold mt-1 text-rose-600 dark:text-rose-400">{kpis.fuera}</div>
            </div>
            <div className="p-3.5 rounded-xl border" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
              <div className="text-[11px] font-bold opacity-65 uppercase">Con Agua (&gt;0%)</div>
              <div className="text-2xl font-extrabold mt-1 text-amber-600 dark:text-amber-400">{kpis.conAgua}</div>
            </div>
          </div>

          {/* Filtros */}
          <div
            className="p-4 rounded-2xl border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
            style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}
          >
            <div>
              <label className="block text-xs font-bold mb-1 opacity-75">Desde</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-xs"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-75">Hasta</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-xs"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-75">Nivel</label>
              <SearchableSelect
                value={nivelPrueba}
                onChange={(v) => setNivelPrueba(String(v || 'TODOS'))}
                options={[
                  { value: 'TODOS', label: 'Todos (Ticket + Finca)' },
                  { value: 'TICKET', label: 'Solo Ticket / Camión' },
                  { value: 'FINCA', label: 'Solo Fincas' },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-75">Finca</label>
              <SearchableSelect
                value={fincaId}
                onChange={(v) => setFincaId(String(v || ''))}
                options={[
                  { value: '', label: 'Todas las fincas' },
                  ...fincas.map((f: any) => ({ value: String(f.id), label: f.nombre })),
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-75">Chofer</label>
              <ChoferSelect value={choferId} onChange={(v) => setChoferId(String(v || ''))} placeholder="Todos" />
            </div>
            <div className="space-y-2">
              <SearchableSelect
                value={resultado}
                onChange={(v) => setResultado(String(v || 'TODOS'))}
                options={[
                  { value: 'TODOS', label: 'Resultado: Todos' },
                  { value: 'APROBADA', label: 'APROBADA' },
                  { value: 'OBSERVADA', label: 'OBSERVADA' },
                  { value: 'ACIDA', label: 'ÁCIDA' },
                  { value: 'RECHAZADA', label: 'RECHAZADA' },
                ]}
              />
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloFueraDeRango}
                  onChange={(e) => setSoloFueraDeRango(e.target.checked)}
                  className="accent-rose-600"
                />
                Solo fuera de rango
              </label>
            </div>
          </div>

          {/* Tabla Exámenes */}
          <DataTable
            data={examenes}
            columns={examenesColumns}
            isLoading={loadingExamenes}
            searchPlaceholder="Buscar por finca, chofer, ticket, serial..."
            exportFileName={`Examenes_Calidad_Leche_${fechaInicio}_al_${fechaFin}`}
            emptyMessage="No hay exámenes de leche registrados para el filtro seleccionado."
          />
        </>
      ) : (
        /* TAB 2: PARÁMETROS DE LECHE CRUD */
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl border text-xs flex items-center gap-2.5 bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
            <i className="fa-solid fa-circle-info text-emerald-600 text-base"></i>
            <span>
              <strong>Regla de Parámetro Principal:</strong> Solo <strong>un perfil</strong> puede estar marcado como{' '}
              <strong>Parámetro Principal</strong> a la vez. Todos los exámenes en Receptoría, Fincas y Calidad de Leche se
              evalúan automáticamente contra los límites Mín/Máx de ese perfil activo.
            </span>
          </div>

          <DataTable
            data={parametros}
            columns={parametrosColumns}
            isLoading={loadingParams}
            searchPlaceholder="Buscar perfil de parámetros..."
            exportFileName="Parametros_Calidad_Leche"
            emptyMessage="No hay perfiles de parámetros configurados."
          />
        </div>
      )}

      {/* Modal Examen */}
      <ExamenLecheModal
        isOpen={modalExamenOpen}
        onClose={() => setModalExamenOpen(false)}
        examenEditar={examenEditar}
        onSaved={invalidarTodo}
      />

      {/* Modal CRUD Parámetros */}
      {modalParamOpen && (
        <div className="fixed inset-0 z-[9990] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <div
            className="w-full max-w-4xl rounded-2xl shadow-2xl border overflow-hidden my-4"
            style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <i className="fa-solid fa-sliders"></i>
                {paramEditId ? 'Editar Parámetros de Calidad de Leche' : 'Nuevo Perfil de Parámetros de Leche'}
              </h3>
              <button
                type="button"
                onClick={() => setModalParamOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!paramForm.nombre.trim()) {
                  toast.error('Ingrese el nombre del perfil de parámetros.');
                  return;
                }
                guardarParamMutation.mutate(paramForm);
              }}
              className="p-5 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold mb-1">Nombre del Perfil *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Estándar Leche Vaca 2026"
                    value={paramForm.nombre}
                    onChange={(e) => setParamForm((p) => ({ ...p, nombre: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Tipo de Leche</label>
                  <SearchableSelect
                    value={paramForm.tipoLeche || 'VACA'}
                    onChange={(v) => setParamForm((p) => ({ ...p, tipoLeche: String(v || 'VACA') }))}
                    options={
                      hasBufala
                        ? [
                            { value: 'VACA', label: 'Vaca' },
                            { value: 'BUFALA', label: 'Búfala' },
                            { value: 'AMBAS', label: 'Ambas' },
                          ]
                        : [{ value: 'VACA', label: 'Vaca' }]
                    }
                  />
                </div>
                <div className="pb-1.5">
                  <label className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer font-bold text-xs bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 w-full">
                    <input
                      type="checkbox"
                      checked={paramForm.esPrincipal}
                      onChange={(e) => setParamForm((p) => ({ ...p, esPrincipal: e.target.checked }))}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span>Parámetro Principal (único activo)</span>
                  </label>
                </div>
              </div>

              {/* Grid 12 campos Mín / Máx */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {LACTOSCAN_FIELDS.map((f) => (
                  <div
                    key={String(f.key)}
                    className="p-3 rounded-xl border space-y-1.5"
                    style={{ borderColor: 'var(--t-border)' }}
                  >
                    <div className="text-xs font-extrabold">
                      {f.label} {f.unit ? <span className="opacity-60">({f.unit})</span> : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold opacity-65">Mínimo</label>
                        <input
                          type="number"
                          step={f.step}
                          placeholder="Mín"
                          value={(paramForm as any)[f.minKey] ?? ''}
                          onChange={(e) =>
                            setParamForm((p) => ({
                              ...p,
                              [f.minKey]: e.target.value === '' ? null : Number(e.target.value),
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded-lg border text-xs font-semibold"
                          style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold opacity-65">Máximo</label>
                        <input
                          type="number"
                          step={f.step}
                          placeholder="Máx"
                          value={(paramForm as any)[f.maxKey] ?? ''}
                          onChange={(e) =>
                            setParamForm((p) => ({
                              ...p,
                              [f.maxKey]: e.target.value === '' ? null : Number(e.target.value),
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded-lg border text-xs font-semibold"
                          style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Observación</label>
                <input
                  type="text"
                  placeholder="Notas sobre este perfil de calidad..."
                  value={paramForm.observacion || ''}
                  onChange={(e) => setParamForm((p) => ({ ...p, observacion: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--t-border)' }}>
                <button
                  type="button"
                  onClick={() => setModalParamOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-bold border"
                  style={{ borderColor: 'var(--t-border)' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarParamMutation.isPending}
                  className="px-5 py-2 rounded-xl text-sm font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
                >
                  {guardarParamMutation.isPending ? 'Guardando...' : 'Guardar Parámetros'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ImagenLightboxModal
        src={lightbox?.src || null}
        title={lightbox?.title}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
};

