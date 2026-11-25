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
    const alertas = conExamen.filter((r) => r.fueraDeRango).length;
    return {
      registros: historial.length,
      totalLitros,
      promGrasa: grasas.length ? (grasas.reduce((a, b) => a + b, 0) / grasas.length).toFixed(2) : '—',
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
    if (val == null) return <span style={{ color: 'var(--t-text-muted)' }}>—</span>;
    const ev = evaluarValorContraParametro(val, parametroPrincipal, minKey, maxKey);
    const style: React.CSSProperties =
      ev.estado === 'alerta'
        ? { background: '#fee2e2', color: '#b91c1c', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', fontSize: '12px' }
        : ev.estado === 'ok'
          ? { background: '#dcfce7', color: '#15803d', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', fontSize: '12px' }
          : { fontWeight: 600, fontSize: '12px' };
    return (
      <span style={style} title={ev.rangoTexto ? `Rango: ${ev.rangoTexto}` : undefined}>
        {Number(val).toFixed(2)}{suffix}
      </span>
    );
  };

  const columns: ColumnDef<HistorialIntegralFincaItemDto>[] = [
    {
      header: 'Fecha',
      accessorKey: 'fecha',
      cell: (r) => (
        <div style={{ fontSize: '12px' }}>
          <div style={{ fontWeight: 700 }}>{r.fecha ? r.fecha.substring(0, 10) : '—'}</div>
          {r.horaPrueba && <div style={{ fontSize: '11px', opacity: 0.65 }}>{r.horaPrueba}</div>}
        </div>
      ),
    },
    {
      header: 'Ticket #',
      accessorKey: 'controlRutaId',
      cell: (r) =>
        r.controlRutaId ? (
          <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, background: '#e0e7ff', color: '#3730a3' }}>
            #{r.controlRutaId}
          </span>
        ) : (
          <span style={{ fontSize: '12px', opacity: 0.6 }}>Directo</span>
        ),
    },
    {
      header: 'Litros',
      accessorKey: 'litrosRecogidos',
      cell: (r) => (
        <div style={{ fontSize: '12px', fontWeight: 800 }}>
          {Number(r.litrosRecogidos || 0).toLocaleString()} L
          <div style={{ fontSize: '10.5px', opacity: 0.7, fontWeight: 500 }}>
            {r.tipoLeche}{r.esAcida ? ' • ÁCIDA' : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Chofer / Camión',
      accessorKey: 'nombreChofer',
      cell: (r) => (
        <div style={{ fontSize: '12px' }}>
          <div style={{ fontWeight: 600, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.nombreChofer || '—'}
          </div>
          {r.camionPlaca && <div style={{ fontSize: '10.5px', opacity: 0.7 }}>{r.camionPlaca}</div>}
        </div>
      ),
    },
    {
      header: 'Prueba',
      accessorKey: 'nivelPrueba',
      cell: (r) => {
        if (r.nivelPrueba === 'FINCA') {
          return <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 800, background: '#fef3c7', color: '#92400e' }}>Individual Finca</span>;
        }
        if (r.nivelPrueba === 'TICKET') {
          return <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 800, background: '#cffafe', color: '#155e75' }}>Del Ticket</span>;
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
            style={{
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              border: '1px solid #6366f1',
              background: 'transparent',
              color: '#4f46e5',
              cursor: 'pointer',
            }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {r.imagenExamen && (
            <button
              type="button"
              onClick={() => setLightbox({ src: r.imagenExamen!, title: `Examen ${finca.nombre} (${r.fecha.substring(0, 10)})` })}
              style={{ padding: '4px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: '#e0e7ff', color: '#3730a3', border: 'none', cursor: 'pointer' }}
              title="Ver foto examen"
            >
              <i className="fa-solid fa-flask"></i>
            </button>
          )}
          {r.imagenRecibo && (
            <button
              type="button"
              onClick={() => setLightbox({ src: r.imagenRecibo!, title: `Recibo ${finca.nombre} (${r.fecha.substring(0, 10)})` })}
              style={{ padding: '4px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#15803d', border: 'none', cursor: 'pointer' }}
              title="Ver foto recibo"
            >
              <i className="fa-solid fa-receipt"></i>
            </button>
          )}
          {!r.imagenExamen && !r.imagenRecibo && <span style={{ opacity: 0.4, fontSize: '12px' }}>—</span>}
        </div>
      ),
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9980,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '18px',
          overflow: 'hidden',
          background: 'var(--t-card, #ffffff)',
          color: 'var(--t-text, #0f172a)',
          border: '1px solid var(--t-border, #e2e8f0)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            background: 'linear-gradient(135deg, #3730a3 0%, #0f766e 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-clock-rotate-left"></i>
              Historial Integral y Calidad — {finca.nombre}
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.85)' }}>
              Tickets, litros recogidos, chofer, camión, pruebas Lactoscan S50 e imágenes de recibos y exámenes.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                setExamenDefaults({ nivelPrueba: 'FINCA', fincaId: finca.id, fincaNombre: finca.nombre });
                setModalNuevoExamen(true);
              }}
              style={{
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 800,
                background: '#ffffff',
                color: '#1e3a8a',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}
            >
              <i className="fa-solid fa-flask-vial"></i>+ Registrar Examen
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.18)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
              }}
              aria-label="Cerrar"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '18px 22px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            background: 'var(--t-bg, #f8fafc)',
          }}
        >
          {/* Fila KPIs + Filtro fechas bien alineados */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={{ background: 'var(--t-card, #ffffff)', border: '1px solid var(--t-border, #e2e8f0)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--t-text-muted, #64748b)' }}>
                Recolecciones
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, marginTop: '4px' }}>{kpis.registros}</div>
            </div>
            <div style={{ background: 'var(--t-card, #ffffff)', border: '1px solid var(--t-border, #e2e8f0)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--t-text-muted, #64748b)' }}>
                Litros Totales
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, marginTop: '4px', color: '#059669' }}>
                {kpis.totalLitros.toLocaleString()} L
              </div>
            </div>
            <div style={{ background: 'var(--t-card, #ffffff)', border: '1px solid var(--t-border, #e2e8f0)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--t-text-muted, #64748b)' }}>
                Prom. Grasa
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, marginTop: '4px', color: '#4f46e5' }}>{kpis.promGrasa}%</div>
            </div>
            <div style={{ background: 'var(--t-card, #ffffff)', border: '1px solid var(--t-border, #e2e8f0)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--t-text-muted, #64748b)' }}>
                Alertas Rango
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, marginTop: '4px', color: kpis.alertas > 0 ? '#dc2626' : '#64748b' }}>
                {kpis.alertas}
              </div>
            </div>
            <div style={{ background: 'var(--t-card, #ffffff)', border: '1px solid var(--t-border, #e2e8f0)', borderRadius: '12px', padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--t-text-muted, #64748b)', marginBottom: '4px' }}>
                Desde
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '34px', fontSize: '12px' }}
              />
            </div>
            <div style={{ background: 'var(--t-card, #ffffff)', border: '1px solid var(--t-border, #e2e8f0)', borderRadius: '12px', padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--t-text-muted, #64748b)', marginBottom: '4px' }}>
                Hasta
              </label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '34px', fontSize: '12px' }}
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
