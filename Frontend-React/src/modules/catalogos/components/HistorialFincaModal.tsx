import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  examenesLecheApi,
  evaluarValorContraParametro,
  type HistorialIntegralFincaItemDto,
  type ParametroCalidadLecheDto,
} from '@/api/examenesLeche.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { ExamenLecheModal } from '@/modules/operaciones/components/ExamenLecheModal';
import { ImagenLightboxModal } from '@/modules/operaciones/components/ImagenLightboxModal';

interface HistorialFincaModalProps {
  finca: { id: number; nombre: string } | null;
  onClose: () => void;
}

export const HistorialFincaModal: React.FC<HistorialFincaModalProps> = ({ finca, onClose }) => {
  const queryClient = useQueryClient();
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [modalNuevoExamen, setModalNuevoExamen] = useState(false);
  const [examenDefaults, setExamenDefaults] = useState<any>(null);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);

  const { data: parametroPrincipal } = useQuery<ParametroCalidadLecheDto | null>({
    queryKey: ['parametro-calidad-principal'],
    queryFn: () => examenesLecheApi.getParametroPrincipal(),
    enabled: !!finca,
  });

  const { data: historial = [], isLoading } = useQuery<HistorialIntegralFincaItemDto[]>({
    queryKey: ['historial-integral-finca', finca?.id, fechaInicio, fechaFin],
    queryFn: () =>
      examenesLecheApi.getHistorialIntegralFinca(finca!.id, {
        fechaInicio: fechaInicio || undefined,
        fechaFin: fechaFin || undefined,
      }),
    enabled: !!finca,
  });

  const kpis = useMemo(() => {
    const totalLitros = historial.reduce((acc, r) => acc + Number(r.litrosRecogidos || 0), 0);
    const conExamen = historial.filter((r) => r.examenId != null);
    const grasas = conExamen.map((r) => r.grasaPct).filter((v): v is number => v != null);
    const sngs = conExamen.map((r) => r.sngPct).filter((v): v is number => v != null);
    const alertas = conExamen.filter((r) => r.fueraDeRango).length;
    return {
      registros: historial.length,
      totalLitros,
      promGrasa: grasas.length ? (grasas.reduce((a, b) => a + b, 0) / grasas.length).toFixed(2) : '—',
      promSng: sngs.length ? (sngs.reduce((a, b) => a + b, 0) / sngs.length).toFixed(2) : '—',
      alertas,
    };
  }, [historial]);

  if (!finca) return null;

  const renderMetric = (
    val: number | null | undefined,
    minKey: keyof ParametroCalidadLecheDto,
    maxKey: keyof ParametroCalidadLecheDto,
    suffix = ''
  ) => {
    if (val == null) return <span className="opacity-35">—</span>;
    const ev = evaluarValorContraParametro(val, parametroPrincipal, minKey, maxKey);
    const cls =
      ev.estado === 'alerta'
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200 font-extrabold'
        : ev.estado === 'ok'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-semibold'
          : 'font-medium';
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs ${cls}`} title={ev.rangoTexto ? `Rango: ${ev.rangoTexto}` : undefined}>
        {Number(val).toFixed(2)}{suffix}
      </span>
    );
  };

  const columns: ColumnDef<HistorialIntegralFincaItemDto>[] = [
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
      header: 'Ticket #',
      accessorKey: 'controlRutaId',
      cell: (r) =>
        r.controlRutaId ? (
          <span className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
            #{r.controlRutaId}
          </span>
        ) : (
          <span className="text-xs opacity-50">Directo</span>
        ),
    },
    {
      header: 'Litros',
      accessorKey: 'litrosRecogidos',
      cell: (r) => (
        <div className="text-xs font-extrabold">
          {Number(r.litrosRecogidos || 0).toLocaleString()} L
          <div className="text-[10px] opacity-65 font-normal">{r.tipoLeche}{r.esAcida ? ' • ÁCIDA' : ''}</div>
        </div>
      ),
    },
    {
      header: 'Chofer / Camión',
      accessorKey: 'nombreChofer',
      cell: (r) => (
        <div className="text-xs">
          <div className="font-semibold truncate max-w-[140px]">{r.nombreChofer || '—'}</div>
          {r.camionPlaca && <div className="text-[10px] opacity-65">{r.camionPlaca}</div>}
        </div>
      ),
    },
    {
      header: 'Prueba',
      accessorKey: 'nivelPrueba',
      cell: (r) => {
        if (r.nivelPrueba === 'FINCA') {
          return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Individual Finca</span>;
        }
        if (r.nivelPrueba === 'TICKET') {
          return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200">Del Ticket</span>;
        }
        return (
          <button
            type="button"
            onClick={() => {
              setExamenDefaults({
                nivelPrueba: 'FINCA',
                fincaId: finca.id,
                fincaNombre: finca.nombre,
                controlRutaId: r.controlRutaId,
                rutaRecoleccionId: r.rutaRecoleccionId,
                choferId: r.choferId,
                camionId: r.camionId,
                litrosAsociados: r.litrosRecogidos,
                fecha: r.fecha,
                tipoLeche: r.tipoLeche,
              });
              setModalNuevoExamen(true);
            }}
            className="px-2 py-0.5 rounded-lg text-[10px] font-bold border border-indigo-400 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          >
            + Examen
          </button>
        );
      },
    },
    { header: 'Grasa %', accessorKey: 'grasaPct', cell: (r) => renderMetric(r.grasaPct, 'grasaMin', 'grasaMax', '%') },
    { header: 'SNG %', accessorKey: 'sngPct', cell: (r) => renderMetric(r.sngPct, 'sngMin', 'sngMax', '%') },
    { header: 'Dens.', accessorKey: 'densidad', cell: (r) => renderMetric(r.densidad, 'densidadMin', 'densidadMax') },
    { header: 'Prot. %', accessorKey: 'proteinaPct', cell: (r) => renderMetric(r.proteinaPct, 'proteinaMin', 'proteinaMax', '%') },
    { header: 'Agua %', accessorKey: 'aguaAdicionadaPct', cell: (r) => renderMetric(r.aguaAdicionadaPct, 'aguaAdicionadaMin', 'aguaAdicionadaMax', '%') },
    { header: 'Temp °C', accessorKey: 'temperaturaC', cell: (r) => renderMetric(r.temperaturaC, 'temperaturaMin', 'temperaturaMax', '°C') },
    { header: 'pH', accessorKey: 'ph', cell: (r) => renderMetric(r.ph, 'phMin', 'phMax') },
    {
      header: 'Evidencias',
      accessorKey: 'imagenExamen',
      cell: (r) => (
        <div className="flex items-center gap-1">
          {r.imagenExamen && (
            <button
              type="button"
              onClick={() => setLightbox({ src: r.imagenExamen!, title: `Examen ${finca.nombre} (${r.fecha.substring(0, 10)})` })}
              className="px-2 py-1 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200"
            >
              <i className="fa-solid fa-flask"></i>
            </button>
          )}
          {r.imagenRecibo && (
            <button
              type="button"
              onClick={() => setLightbox({ src: r.imagenRecibo!, title: `Recibo ${finca.nombre} (${r.fecha.substring(0, 10)})` })}
              className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200"
            >
              <i className="fa-solid fa-receipt"></i>
            </button>
          )}
          {!r.imagenExamen && !r.imagenRecibo && <span className="opacity-35 text-xs">—</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-[9980] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div
        className="w-full max-w-6xl rounded-2xl shadow-2xl border overflow-hidden my-4"
        style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-emerald-600 text-white flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-extrabold flex items-center gap-2">
              <i className="fa-solid fa-clock-rotate-left"></i>
              Historial Integral y Calidad — {finca.nombre}
            </h3>
            <p className="text-xs text-indigo-100">
              Tickets, litros recogidos, chofer, camión, pruebas Lactoscan S50 e imágenes de recibos y exámenes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setExamenDefaults({ nivelPrueba: 'FINCA', fincaId: finca.id, fincaNombre: finca.nombre });
                setModalNuevoExamen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-white text-indigo-700 hover:bg-indigo-50 shadow"
            >
              <i className="fa-solid fa-flask-vial mr-1.5"></i>+ Registrar Examen
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* KPIs + Filtro fechas */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--t-border)' }}>
              <div className="text-[10px] font-bold uppercase opacity-65">Recolecciones</div>
              <div className="text-xl font-extrabold">{kpis.registros}</div>
            </div>
            <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--t-border)' }}>
              <div className="text-[10px] font-bold uppercase opacity-65">Litros Totales</div>
              <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {kpis.totalLitros.toLocaleString()} L
              </div>
            </div>
            <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--t-border)' }}>
              <div className="text-[10px] font-bold uppercase opacity-65">Prom. Grasa</div>
              <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">{kpis.promGrasa}%</div>
            </div>
            <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--t-border)' }}>
              <div className="text-[10px] font-bold uppercase opacity-65">Alertas Rango</div>
              <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400">{kpis.alertas}</div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase opacity-65 mb-1">Desde</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border text-xs"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase opacity-65 mb-1">Hasta</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border text-xs"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>
          </div>

          <DataTable
            data={historial}
            columns={columns}
            isLoading={isLoading}
            searchPlaceholder="Buscar por ticket, chofer, placa..."
            exportFileName={`Historial_Calidad_${finca.nombre.replace(/\s+/g, '_')}`}
            emptyMessage="Esta finca aún no tiene recolecciones ni exámenes registrados."
          />
        </div>
      </div>

      <ExamenLecheModal
        isOpen={modalNuevoExamen}
        onClose={() => setModalNuevoExamen(false)}
        defaults={examenDefaults}
        bloquearContexto={true}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['historial-integral-finca', finca.id] });
          queryClient.invalidateQueries({ queryKey: ['examenes-leche'] });
        }}
      />

      <ImagenLightboxModal
        src={lightbox?.src || null}
        title={lightbox?.title}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
};

