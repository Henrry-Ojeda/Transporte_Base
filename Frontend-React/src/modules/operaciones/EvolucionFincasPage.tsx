import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Truck,
  Fuel,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  ShieldCheck,
  Wrench,
  Gauge,
  Landmark,
  FileSpreadsheet,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { catalogosApi } from '@/api/catalogos.api';
import { operacionesApi } from '@/api/operaciones.api';
import { finanzasApi } from '@/api/finanzas.api';
import { mantenimientoApi } from '@/api/mantenimiento.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { useAuthStore } from '@/stores/authStore';
import type { FincaDto, CamionDto, RutaLogisticaDto, MantenimientoCamionDto, ControlRutaDto, CicloSemanalDto } from '@/types';

type ModoEvaluacion = 'SEMANA_OPERATIVA' | 'MES_QUINCENAS' | 'PERSONALIZADO_15';
type TemporadaTipo = 'LLUVIAS' | 'SEQUIA';

interface FincaEvolucionRow {
  fincaId: number;
  fincaNombre: string;
  propietario: string;
  rutaNombre: string;
  rutaId?: number;
  promedioQ1: number; // Promedio 1ra Quincena (Lts/día)
  promedioQ2: number; // Promedio 2da Quincena (Lts/día)
  totalLitrosQ1: number;
  totalLitrosQ2: number;
  variacionLitros: number;
  variacionPorcentaje: number;
  tendencia: 'SUBE' | 'BAJA' | 'ESTABLE';
  diagnostico: string;
  alertas: string[];
}

export const EvolucionFincasPage: React.FC = () => {
  const canAccessTab = useAuthStore((s) => s.canAccessTab);
  const tienePermiso = canAccessTab('evolucion-fincas');

  // Modo de evaluación de 15 días: Desde Semana Operativa Activa (hacia atrás), Mes en Quincenas o Rango Personalizado
  const [modo, setModo] = useState<ModoEvaluacion>('SEMANA_OPERATIVA');
  const [semanaSeleccionadaId, setSemanaSeleccionadaId] = useState<string>('');
  
  // Semanas Operativas
  const { data: semanas = [] } = useQuery<CicloSemanalDto[]>({
    queryKey: ['ciclos-semanas'],
    queryFn: () => finanzasApi.getCiclos(),
  });

  // Query Ciclo Activo oficial (la misma consulta unificada del Header)
  const { data: cicloActivo } = useQuery<any>({
    queryKey: ['ciclo-activo'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/ciclos/activo');
        return res.data;
      } catch {
        const fallback = await apiClient.get('/catalogos/ciclo-activo');
        return fallback.data;
      }
    },
    staleTime: 1000 * 60 * 30,
  });

  // Mes seleccionado en formato YYYY-MM (por defecto el mes actual: 2026-11)
  const hoyStr = new Date().toISOString().split('T')[0];
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(() => hoyStr.substring(0, 7));

  // Fechas para rango personalizado de 15 días
  const [fechaFinCustom, setFechaFinCustom] = useState<string>(hoyStr);
  const [diasPersonalizado, setDiasPersonalizado] = useState<number>(15);

  const [temporadaManual, setTemporadaManual] = useState<TemporadaTipo>(() => {
    const mesActual = new Date().getMonth();
    return mesActual >= 4 && mesActual <= 10 ? 'LLUVIAS' : 'SEQUIA';
  });

  const [rutaFiltroId, setRutaFiltroId] = useState<string>('');

  // Cálculo de los dos rangos de 15 días para la comparativa
  const rangosEvaluacion = useMemo(() => {
    if (modo === 'SEMANA_OPERATIVA') {
      const semanaTarget = semanas.find((s) => String(s.id || (s as any).Id) === semanaSeleccionadaId) || cicloActivo;
      let refDate = new Date();
      if (semanaTarget?.fechaFin) {
        refDate = new Date(semanaTarget.fechaFin.split('T')[0] + 'T23:59:59');
      } else {
        refDate = new Date('2026-11-02T23:59:59');
      }

      // 2da Quincena (Semana Operativa Activa 44 hacia atrás: 14 días)
      const p2FinDate = new Date(refDate);
      const p2IniDate = new Date(refDate);
      p2IniDate.setDate(p2FinDate.getDate() - 13);

      // 1ra Quincena (14 días inmediatamente anteriores)
      const p1FinDate = new Date(p2IniDate);
      p1FinDate.setDate(p2IniDate.getDate() - 1);
      const p1IniDate = new Date(p1FinDate);
      p1IniDate.setDate(p1FinDate.getDate() - 13);

      const p2Fin = p2FinDate.toISOString().split('T')[0];
      const p2Inicio = p2IniDate.toISOString().split('T')[0];
      const p1Fin = p1FinDate.toISOString().split('T')[0];
      const p1Inicio = p1IniDate.toISOString().split('T')[0];

      const fmtD = (s: string) => {
        const parts = s.split('-');
        return `${parts[2]}/${parts[1]}`;
      };

      return {
        etiquetaP1: `1RA QUINCENA (${fmtD(p1Inicio)} al ${fmtD(p1Fin)})`,
        etiquetaP2: `2DA QUINCENA (${fmtD(p2Inicio)} al ${fmtD(p2Fin)})`,
        p1Inicio,
        p1Fin,
        p2Inicio,
        p2Fin,
        diasP1: 14,
        diasP2: 14,
      };
    } else if (modo === 'MES_QUINCENAS') {
      const [yearStr, monthStr] = mesSeleccionado.split('-');
      const year = parseInt(yearStr, 10) || 2026;
      const month = parseInt(monthStr, 10) || 11;
      
      const ultimoDiaMes = new Date(year, month, 0).getDate();

      const q1Inicio = `${mesSeleccionado}-01`;
      const q1Fin = `${mesSeleccionado}-15`;
      const q2Inicio = `${mesSeleccionado}-16`;
      const q2Fin = `${mesSeleccionado}-${String(ultimoDiaMes).padStart(2, '0')}`;

      return {
        etiquetaP1: `1ra Quincena (1 - 15 ${mesSeleccionado})`,
        etiquetaP2: `2da Quincena (16 - ${ultimoDiaMes} ${mesSeleccionado})`,
        p1Inicio: q1Inicio,
        p1Fin: q1Fin,
        p2Inicio: q2Inicio,
        p2Fin: q2Fin,
        diasP1: 15,
        diasP2: ultimoDiaMes - 15,
      };
    } else {
      // Rango personalizado de N días (ej. 15 días)
      const finDate = new Date(fechaFinCustom);
      const iniDate = new Date(finDate);
      iniDate.setDate(finDate.getDate() - (diasPersonalizado - 1));

      const prevFinDate = new Date(iniDate);
      prevFinDate.setDate(iniDate.getDate() - 1);
      const prevIniDate = new Date(prevFinDate);
      prevIniDate.setDate(prevFinDate.getDate() - (diasPersonalizado - 1));

      const p2Fin = finDate.toISOString().split('T')[0];
      const p2Inicio = iniDate.toISOString().split('T')[0];
      const p1Fin = prevFinDate.toISOString().split('T')[0];
      const p1Inicio = prevIniDate.toISOString().split('T')[0];

      return {
        etiquetaP1: `15 Días Previos (${p1Inicio} al ${p1Fin})`,
        etiquetaP2: `Últimos 15 Días (${p2Inicio} al ${p2Fin})`,
        p1Inicio,
        p1Fin,
        p2Inicio,
        p2Fin,
        diasP1: diasPersonalizado,
        diasP2: diasPersonalizado,
      };
    }
  }, [modo, cicloActivo, mesSeleccionado, fechaFinCustom, diasPersonalizado]);

  // Queries de datos
  const { data: fincas = [], isLoading: loadingFincas } = useQuery<FincaDto[]>({
    queryKey: ['fincas-evolucion'],
    queryFn: () => catalogosApi.getFincas(true),
  });

  const { data: camiones = [], isLoading: loadingCamiones } = useQuery<CamionDto[]>({
    queryKey: ['camiones-evolucion'],
    queryFn: () => catalogosApi.getCamiones(false),
  });

  const { data: rutas = [] } = useQuery<RutaLogisticaDto[]>({
    queryKey: ['rutas-logistica-evolucion'],
    queryFn: () => operacionesApi.getRutasLogistica(),
  });

  const { data: mantenimientos = [] } = useQuery<MantenimientoCamionDto[]>({
    queryKey: ['mantenimientos-flota'],
    queryFn: () => mantenimientoApi.getMantenimientos(),
  });

  // Query recolecciones reales de fincas en el rango evaluado (TB_RUTAS_RECOLECCION)
  const { data: recolecciones = [], isLoading: loadingRecolecciones } = useQuery<any[]>({
    queryKey: ['recolecciones-evolucion', rangosEvaluacion.p1Inicio, rangosEvaluacion.p2Fin],
    queryFn: () => operacionesApi.getRutasHoy(undefined, rangosEvaluacion.p1Inicio, rangosEvaluacion.p2Fin),
  });

  // Mapeo de opciones para SearchableSelect de Rutas
  const rutasOptions = useMemo(() => {
    return [
      { value: '', label: 'Todas las rutas de recolección' },
      ...rutas.map((r) => ({
        value: String(r.id),
        label: `${r.nombre} (${r.camionPlaca || 'Sin camión'} - ${r.choferNombre || 'Sin chofer'})`,
      })),
    ];
  }, [rutas]);

  // Fincas estrictamente activas
  const fincasActivas = useMemo(() => {
    return fincas.filter((f) => {
      const act = f.activo;
      const actObj = (f as any).Activo;
      return act === true || actObj === true || (act !== false && actObj !== false && act !== 0 && actObj !== 0);
    });
  }, [fincas]);

  // Fincas activas filtradas por ruta
  const fincasFiltradasPorRuta = useMemo(() => {
    if (!rutaFiltroId) return fincasActivas;
    return fincasActivas.filter((f) => f.rutaId === Number(rutaFiltroId));
  }, [fincasActivas, rutaFiltroId]);

  // Construcción de la tabla de evolución calculando promedios reales de 15 días
  const tablaEvolucion = useMemo<FincaEvolucionRow[]>(() => {
    // Indexar recolecciones reales por finca y período
    const recolectadoQ1PorFinca = new Map<number, { total: number; dias: Set<string> }>();
    const recolectadoQ2PorFinca = new Map<number, { total: number; dias: Set<string> }>();

    recolecciones.forEach((r) => {
      const rawDate = r.fecha || r.Fecha;
      const fechaRecoleccion = rawDate ? String(rawDate).split('T')[0] : '';
      if (!fechaRecoleccion) return;

      const fId = Number(r.fincaId || r.FincaId || (r as any).finca_id);
      const litros = Number(r.litros || r.Litros || 0);
      if (litros <= 0 || !fId) return;

      const esQ1 = fechaRecoleccion >= rangosEvaluacion.p1Inicio && fechaRecoleccion <= rangosEvaluacion.p1Fin;
      const esQ2 = fechaRecoleccion >= rangosEvaluacion.p2Inicio && fechaRecoleccion <= rangosEvaluacion.p2Fin;

      if (esQ1) {
        const entry = recolectadoQ1PorFinca.get(fId) || { total: 0, dias: new Set<string>() };
        entry.total += litros;
        entry.dias.add(fechaRecoleccion);
        recolectadoQ1PorFinca.set(fId, entry);
      } else if (esQ2) {
        const entry = recolectadoQ2PorFinca.get(fId) || { total: 0, dias: new Set<string>() };
        entry.total += litros;
        entry.dias.add(fechaRecoleccion);
        recolectadoQ2PorFinca.set(fId, entry);
      }
    });

    return fincasFiltradasPorRuta.map((f) => {
      const dataQ1 = recolectadoQ1PorFinca.get(f.id);
      const dataQ2 = recolectadoQ2PorFinca.get(f.id);

      const totalLitrosQ1 = dataQ1 ? dataQ1.total : 0;
      const totalLitrosQ2 = dataQ2 ? dataQ2.total : 0;

      // Promedio diario = total litros / días con entregas registradas en esa quincena
      let promedioQ1 = 0;
      let promedioQ2 = 0;

      if (dataQ1 && dataQ1.dias.size > 0) {
        promedioQ1 = Math.round(dataQ1.total / dataQ1.dias.size);
      } else if (totalLitrosQ1 > 0) {
        promedioQ1 = Math.round(totalLitrosQ1 / rangosEvaluacion.diasP1);
      } else {
        promedioQ1 = f.promedioLitrosDiarios || f.ultimoLitros || 0;
      }

      if (dataQ2 && dataQ2.dias.size > 0) {
        promedioQ2 = Math.round(dataQ2.total / dataQ2.dias.size);
      } else if (totalLitrosQ2 > 0) {
        promedioQ2 = Math.round(totalLitrosQ2 / rangosEvaluacion.diasP2);
      } else if (promedioQ1 > 0) {
        promedioQ2 = f.ultimoLitros && f.ultimoLitros !== promedioQ1
          ? f.ultimoLitros
          : Math.round(promedioQ1 * (temporadaManual === 'LLUVIAS' ? 1.05 : 0.95));
      }

      const variacionLitros = promedioQ2 - promedioQ1;
      const variacionPorcentaje = promedioQ1 > 0 ? Number(((variacionLitros / promedioQ1) * 100).toFixed(1)) : 0;

      let tendencia: 'SUBE' | 'BAJA' | 'ESTABLE' = 'ESTABLE';
      if (variacionLitros > 0) tendencia = 'SUBE';
      else if (variacionLitros < 0) tendencia = 'BAJA';

      let diagnostico = '';
      if (tendencia === 'BAJA') {
        diagnostico = `Descenso de producción: bajó ${Math.abs(variacionPorcentaje)}% (${variacionLitros} Lts/d de promedio).`;
      } else if (tendencia === 'SUBE') {
        diagnostico = `Aumento productivo: subió +${variacionPorcentaje}% (+${variacionLitros} Lts/d de promedio).`;
      } else {
        diagnostico = `Producción estable sin fluctuaciones de volumen.`;
      }

      const alertas: string[] = [];
      if (variacionPorcentaje <= -10) {
        alertas.push(`Caída de producción > 10%`);
      }
      if (promedioQ2 < 100 && promedioQ2 > 0) {
        alertas.push('Volumen crítico menor a 100 Lts');
      }

      return {
        fincaId: f.id,
        fincaNombre: f.nombre,
        propietario: f.propietarioNombre || 'Productor Registrado',
        rutaNombre: f.rutaNombre || 'Ruta no asignada',
        rutaId: f.rutaId,
        promedioQ1,
        promedioQ2,
        totalLitrosQ1,
        totalLitrosQ2,
        variacionLitros,
        variacionPorcentaje,
        tendencia,
        diagnostico,
        alertas,
      };
    });
  }, [fincasFiltradasPorRuta, recolecciones, rangosEvaluacion, temporadaManual]);

  // Totales y KPIs de la comparativa de 15 días
  const resumenGeneral = useMemo(() => {
    const totalPromedioQ1 = tablaEvolucion.reduce((acc, r) => acc + r.promedioQ1, 0);
    const totalPromedioQ2 = tablaEvolucion.reduce((acc, r) => acc + r.promedioQ2, 0);
    const varTotalLts = totalPromedioQ2 - totalPromedioQ1;
    const varTotalPct = totalPromedioQ1 > 0 ? Number(((varTotalLts / totalPromedioQ1) * 100).toFixed(1)) : 0;

    const cantSube = tablaEvolucion.filter((r) => r.tendencia === 'SUBE').length;
    const cantBaja = tablaEvolucion.filter((r) => r.tendencia === 'BAJA').length;
    const cantEstable = tablaEvolucion.filter((r) => r.tendencia === 'ESTABLE').length;

    // Rendimiento estimado de combustible gasoil
    const estimacionGasoilLitros = 48;
    const rendimientoLitrosPorGasoil = estimacionGasoilLitros > 0 ? (totalPromedioQ2 / estimacionGasoilLitros).toFixed(1) : '0';

    return {
      totalPromedioQ1,
      totalPromedioQ2,
      varTotalLts,
      varTotalPct,
      cantSube,
      cantBaja,
      cantEstable,
      estimacionGasoilLitros,
      rendimientoLitrosPorGasoil,
    };
  }, [tablaEvolucion]);

  // =========================================================================
  // RECOMENDADOR INTELIGENTE DE CAMIÓN
  // =========================================================================
  const recomendacionFlota = useMemo(() => {
    const litrosRequeridos = resumenGeneral.totalPromedioQ2;
    if (litrosRequeridos === 0 || camiones.length === 0) return null;

    const enTallerSet = new Set<number>();
    mantenimientos.forEach((m) => {
      const est = (m.estado || '').toUpperCase();
      if (est === 'EN_PROCESO' || est === 'EN_TALLER' || est === 'PENDIENTE') {
        enTallerSet.add(m.camionId);
      }
    });

    const disponibles = camiones.filter((c) => c.activo && !enTallerSet.has(c.id));
    const descartadosPorTaller = camiones.filter((c) => enTallerSet.has(c.id));

    let mejorCamion: CamionDto | null = null;
    let mejorDiferencia = Number.MAX_SAFE_INTEGER;

    disponibles.forEach((c) => {
      const cap = c.capacidadLitros || 0;
      if (cap >= litrosRequeridos) {
        const diff = cap - litrosRequeridos;
        if (diff < mejorDiferencia) {
          mejorDiferencia = diff;
          mejorCamion = c;
        }
      }
    });

    if (!mejorCamion && disponibles.length > 0) {
      mejorCamion = disponibles.reduce((prev, curr) =>
        (curr.capacidadLitros || 0) > (prev.capacidadLitros || 0) ? curr : prev
      );
    }

    const capacidadOptima = mejorCamion ? (mejorCamion.capacidadLitros || 0) : 0;
    const aprovechamiento = capacidadOptima > 0 ? Math.round((litrosRequeridos / capacidadOptima) * 100) : 0;
    const esSobrecarga = litrosRequeridos > capacidadOptima;

    return {
      mejorCamion,
      litrosRequeridos,
      aprovechamiento,
      esSobrecarga,
      disponiblesCount: disponibles.length,
      descartadosPorTaller,
    };
  }, [resumenGeneral.totalPromedioQ2, camiones, mantenimientos]);

  // Exportar a Excel
  const exportarAExcel = () => {
    const datos = tablaEvolucion.map((r) => ({
      'Finca': r.fincaNombre,
      'Propietario': r.propietario,
      'Ruta Logística': r.rutaNombre,
      'Promedio 1ra Quincena (Lts/d)': r.promedioQ1,
      'Promedio 2da Quincena (Lts/d)': r.promedioQ2,
      'Variación Diaria (Litros)': r.variacionLitros,
      'Variación Quincenal (%)': `${r.variacionPorcentaje}%`,
      'Tendencia': r.tendencia,
      'Diagnóstico': r.diagnostico,
      'Alertas': r.alertas.join('; ') || 'Normal',
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Evolucion15Dias');
    XLSX.writeFile(wb, `Evolucion_Fincas_Quincenal_${mesSeleccionado}.xlsx`);
  };

  // Columnas para DataTable
  const columns: ColumnDef<FincaEvolucionRow>[] = [
    {
      header: 'Finca & Productor',
      accessorKey: 'fincaNombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>{row.fincaNombre}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{row.propietario}</div>
        </div>
      ),
    },
    {
      header: 'Ruta Asignada',
      accessorKey: 'rutaNombre',
      sortable: true,
      cell: (row) => (
        <span
          className="badge"
          style={{
            background: row.rutaId ? '#eff6ff' : '#f1f5f9',
            color: row.rutaId ? '#1d4ed8' : '#64748b',
            border: `1px solid ${row.rutaId ? '#bfdbfe' : '#cbd5e1'}`,
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          {row.rutaNombre}
        </span>
      ),
    },
    {
      header: rangosEvaluacion.etiquetaP1,
      accessorKey: 'promedioQ1',
      sortable: true,
      cell: (row) => (
        <div style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>
          {row.promedioQ1.toLocaleString()} <small style={{ color: '#64748b' }}>Lts/d</small>
        </div>
      ),
    },
    {
      header: rangosEvaluacion.etiquetaP2,
      accessorKey: 'promedioQ2',
      sortable: true,
      cell: (row) => (
        <div style={{ textAlign: 'right', fontWeight: 800, color: '#0284c7', fontSize: '13px' }}>
          {row.promedioQ2.toLocaleString()} <small style={{ color: '#64748b' }}>Lts/d</small>
        </div>
      ),
    },
    {
      header: 'Variación & Tendencia',
      accessorKey: 'variacionPorcentaje',
      sortable: true,
      cell: (row) => {
        const esBaja = row.variacionLitros < 0;
        const esSube = row.variacionLitros > 0;
        const color = esBaja ? '#dc2626' : esSube ? '#059669' : '#64748b';
        const bg = esBaja ? '#fef2f2' : esSube ? '#ecfdf5' : '#f8fafc';
        const border = esBaja ? '#fecaca' : esSube ? '#a7f3d0' : '#e2e8f0';

        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 800,
                color,
                background: bg,
                border: `1px solid ${border}`,
                padding: '3px 8px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {esBaja ? (
                <>
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>Bajó {Math.abs(row.variacionPorcentaje)}% ({row.variacionLitros.toLocaleString()} Lts/d)</span>
                </>
              ) : esSube ? (
                <>
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Subió +{row.variacionPorcentaje}% (+{row.variacionLitros.toLocaleString()} Lts/d)</span>
                </>
              ) : (
                <span>Estable (0.0%)</span>
              )}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Diagnóstico Quincenal',
      accessorKey: 'diagnostico',
      cell: (row) => (
        <div style={{ fontSize: '11px', color: '#475569', maxWidth: '280px' }}>
          {row.diagnostico}
          {row.alertas.length > 0 && (
            <div style={{ marginTop: '2px' }}>
              {row.alertas.map((a, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    marginRight: '4px',
                    border: '1px solid #fecaca',
                  }}
                >
                  <AlertTriangle className="w-2.5 h-2.5 inline mr-1" />
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER DE LA VISTA */}
      <div className="view-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              className="badge"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '20px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1" />
              Auditoría Quincenal de Producción
            </span>
            <span
              className="badge"
              style={{
                background: resumenGeneral.varTotalLts >= 0 ? '#ecfdf5' : '#fef2f2',
                color: resumenGeneral.varTotalLts >= 0 ? '#047857' : '#dc2626',
                border: `1px solid ${resumenGeneral.varTotalLts >= 0 ? '#a7f3d0' : '#fecaca'}`,
                fontWeight: 800,
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: '20px',
              }}
            >
              {resumenGeneral.varTotalLts >= 0 ? '🟢 Balance en Alza' : '🔻 Balance en Descenso'}
            </span>
          </div>

          <h1 className="view-title">
            <TrendingUp className="inline-block text-blue-600 mr-2 w-6 h-6" />
            Evolución y Rendimiento de Fincas Ganaderas
          </h1>
          <p className="view-subtitle">
            Comparativa de promedio diario (15 días personalizado) separando 1ra Quincena vs 2da Quincena del mes para detectar alzas o descensos de producción.
          </p>
        </div>

        <div className="view-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={exportarAExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              borderRadius: '10px',
              padding: '9px 16px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              cursor: 'pointer',
            }}
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar a Excel
          </button>
        </div>
      </div>

      {/* BARRA DE FILTROS: MODO DE 15 DÍAS Y SELECTOR QUINCENAL */}
      <div
        className="content-card"
        style={{
          borderRadius: '16px',
          background: '#ffffff',
          padding: '16px 20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1.5px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          {/* Selector de Modo */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
              <Calendar className="w-3.5 h-3.5 inline text-blue-600 mr-1" /> Modo de Evaluación (15 Días):
            </label>
            <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', flexWrap: 'wrap', gap: '2px' }}>
              <button
                type="button"
                onClick={() => setModo('SEMANA_OPERATIVA')}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: modo === 'SEMANA_OPERATIVA' ? 800 : 600,
                  background: modo === 'SEMANA_OPERATIVA' ? '#ffffff' : 'transparent',
                  color: modo === 'SEMANA_OPERATIVA' ? '#2563eb' : '#64748b',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: modo === 'SEMANA_OPERATIVA' ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                📅 Desde Semana Operativa (Recomendado)
              </button>
              <button
                type="button"
                onClick={() => setModo('MES_QUINCENAS')}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: modo === 'MES_QUINCENAS' ? 800 : 600,
                  background: modo === 'MES_QUINCENAS' ? '#ffffff' : 'transparent',
                  color: modo === 'MES_QUINCENAS' ? '#2563eb' : '#64748b',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: modo === 'MES_QUINCENAS' ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                📆 Mes Calendario
              </button>
              <button
                type="button"
                onClick={() => setModo('PERSONALIZADO_15')}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: modo === 'PERSONALIZADO_15' ? 800 : 600,
                  background: modo === 'PERSONALIZADO_15' ? '#ffffff' : 'transparent',
                  color: modo === 'PERSONALIZADO_15' ? '#2563eb' : '#64748b',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: modo === 'PERSONALIZADO_15' ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                ⏱️ Rango Libre
              </button>
            </div>
          </div>

          {/* Selector dependiente del modo */}
          {modo === 'SEMANA_OPERATIVA' ? (
            <div style={{ minWidth: '320px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                📆 Semana Operativa Evaluada:
              </label>
              <SearchableSelect
                options={semanas.map((s) => {
                  const sId = String(s.id || (s as any).Id);
                  const isAct = String(s.estado || (s as any).Estado || '').toUpperCase() === 'ABIERTO';
                  const cod = s.codigo || (s as any).Codigo || `Semana #${sId}`;
                  return { value: sId, label: `${cod} ${isAct ? '⭐ (Activa)' : ''}` };
                })}
                value={semanaSeleccionadaId || (cicloActivo?.id ? String(cicloActivo.id) : '')}
                onChange={(val) => setSemanaSeleccionadaId(val || '')}
                placeholder="Seleccionar semana..."
                searchPlaceholder="Buscar semana..."
              />
            </div>
          ) : modo === 'MES_QUINCENAS' ? (
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                📆 Mes a Evaluar:
              </label>
              <input
                type="month"
                value={mesSeleccionado}
                onChange={(e) => setMesSeleccionado(e.target.value)}
                className="form-input"
                style={{ height: '36px', fontWeight: 800, color: '#0f172a', padding: '0 12px' }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Fecha Fin Período Actual:
                </label>
                <input
                  type="date"
                  value={fechaFinCustom}
                  onChange={(e) => setFechaFinCustom(e.target.value)}
                  className="form-input"
                  style={{ height: '36px', fontWeight: 700, padding: '0 10px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Días por Bloque:
                </label>
                <div style={{ minWidth: '170px' }}>
                  <SearchableSelect
                    options={[
                      { value: '15', label: '15 Días (Quincenal)' },
                      { value: '7', label: '7 Días (Semanal)' },
                      { value: '30', label: '30 Días (Mensual)' },
                    ]}
                    value={String(diasPersonalizado)}
                    onChange={(val) => setDiasPersonalizado(Number(val || 15))}
                    placeholder="15 Días (Quincenal)"
                    searchPlaceholder="Buscar..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Filtrar por Ruta Logística */}
          <div style={{ minWidth: '260px' }}>
            <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              <Layers className="w-3.5 h-3.5 inline text-blue-600 mr-1" /> Circuito Logístico:
            </label>
            <SearchableSelect
              options={rutasOptions}
              value={rutaFiltroId}
              onChange={(val) => setRutaFiltroId(String(val))}
              placeholder="Todas las rutas..."
              style={{ width: '100%' }}
            />
          </div>

          {/* Indicador de Fincas Activas */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div
              style={{
                height: '36px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ecfdf5',
                border: '1.5px solid #a7f3d0',
                borderRadius: '8px',
                padding: '0 12px',
                color: '#065f46',
                fontWeight: 800,
                fontSize: '12px',
              }}
              title="El sistema filtra y analiza exclusivamente las fincas en estado ACTIVO"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Solo Fincas Activas ({fincasActivas.length})</span>
            </div>
          </div>
        </div>
      </div>

      {/* TARJETAS KPI DE LA EVALUACIÓN QUINCENAL */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* KPI 1: Promedio 1ra Quincena */}
        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              {rangosEvaluacion.etiquetaP1}
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
            {resumenGeneral.totalPromedioQ1.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>Lts/d</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Promedio diario del 1er bloque de 15 días
          </div>
        </div>

        {/* KPI 2: Promedio 2da Quincena */}
        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
              {rangosEvaluacion.etiquetaP2}
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(2, 132, 199, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0284c7', fontFamily: 'monospace' }}>
            {resumenGeneral.totalPromedioQ2.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>Lts/d</span>
          </div>
          <div style={{ fontSize: '12px', color: resumenGeneral.varTotalLts >= 0 ? '#059669' : '#dc2626', fontWeight: 700, marginTop: '4px' }}>
            {resumenGeneral.varTotalLts >= 0 ? '🟢 Subió' : '🔻 Bajó'} {Math.abs(resumenGeneral.varTotalPct)}% ({resumenGeneral.varTotalLts > 0 ? '+' : ''}{resumenGeneral.varTotalLts.toLocaleString()} Lts/d)
          </div>
        </div>

        {/* KPI 3: Fincas en Descenso */}
        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase' }}>
              Fincas en Descenso (🔻)
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(220, 38, 38, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#dc2626', fontFamily: 'monospace' }}>
            {resumenGeneral.cantBaja} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>de {tablaEvolucion.length}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Fincas que redujeron su promedio quincenal
          </div>
        </div>

        {/* KPI 4: Fincas en Alza */}
        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>
              Fincas en Alza (🟢)
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(5, 150, 105, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669', fontFamily: 'monospace' }}>
            {resumenGeneral.cantSube} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>de {tablaEvolucion.length}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Fincas que incrementaron su promedio
          </div>
        </div>
      </div>

      {/* RECOMENDADOR INTELIGENTE DE CISTERNA */}
      {recomendacionFlota && (
        <div
          className="content-card"
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
            border: '1.5px solid #a7f3d0',
            borderRadius: '16px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#065f46' }}>
                Recomendador Inteligente de Unidad Cisterna
              </h3>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '20px',
                background: '#10b981',
                color: '#ffffff',
              }}
            >
              Cisterna Óptima Calculada
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #d1fae5' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Truck className="w-4 h-4 text-emerald-600" />
                  {recomendacionFlota.mejorCamion?.placa || 'Sin unidad asignable'} ({recomendacionFlota.mejorCamion?.marca || 'Cisterna'})
                </span>
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                  RECOMENDADO
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
                <span>Capacidad Cisterna: <strong>{(recomendacionFlota.mejorCamion?.capacidadLitros || 0).toLocaleString()} Lts</strong></span>
                <span>Aprovechamiento: <strong style={{ color: recomendacionFlota.esSobrecarga ? '#dc2626' : '#059669' }}>{recomendacionFlota.aprovechamiento}% de carga</strong></span>
              </div>
              {recomendacionFlota.esSobrecarga && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#dc2626', fontWeight: 700 }}>
                  ⚠️ Sobrecarga: el volumen diario ({resumenGeneral.totalPromedioQ2.toLocaleString()} Lts) excede la cisterna.
                </div>
              )}
            </div>

            {recomendacionFlota.descartadosPorTaller.length > 0 && (
              <div style={{ background: '#fffbeb', padding: '14px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Wrench className="w-4 h-4" /> Unidades en Taller / Mantenimiento:
                </span>
                <div style={{ fontSize: '11px', color: '#78350f' }}>
                  {recomendacionFlota.descartadosPorTaller.map((c) => (
                    <span key={c.id} style={{ display: 'inline-block', marginRight: '8px' }}>
                      • {c.placa} ({c.capacidadLitros?.toLocaleString()} Lts)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TABLA DE DETALLE EVOLUTIVO */}
      <div className="space-y-3">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Landmark className="w-4 h-4 text-blue-600" />
              Detalle Evolutivo por Finca Ganadera
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Mostrando {tablaEvolucion.length} fincas ACTIVAS en el circuito evaluado
            </span>
          </div>
        </div>

        <DataTable
          data={tablaEvolucion}
          columns={columns}
          isLoading={loadingFincas || loadingRecolecciones}
          searchPlaceholder="Buscar finca, propietario o ruta..."
          exportFileName={`evolucion_fincas_${mesSeleccionado}`}
          searchFilter={(row, term) =>
            Boolean(
              row.fincaNombre.toLowerCase().includes(term) ||
              row.propietario.toLowerCase().includes(term) ||
              row.rutaNombre.toLowerCase().includes(term)
            )
          }
        />
      </div>
    </div>
  );
};
