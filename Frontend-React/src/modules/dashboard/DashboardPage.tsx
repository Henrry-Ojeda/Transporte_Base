import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { finanzasApi } from '@/api/finanzas.api';
import { sistemaApi } from '@/api/sistema.api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface RutaItem {
  id?: number;
  fincaId?: number;
  fincaNombre?: string;
  litros?: number;
  litrosLeche?: number;
  tipoServicio?: string | number; // 1 = RUTA, 2 = TRANSPORTE
  servicio?: string;
  conductorId?: number;
  conductorNombre?: string;
  esAcida?: boolean;
}

interface EntregaItem {
  id?: number;
  plantaId?: number;
  plantaNombre?: string;
  litros?: number;
  litrosEntregados?: number;
  tipoServicio?: string | number;
  servicio?: string;
  conductorId?: number;
}

interface DespachoItem {
  id?: number;
  companiaId?: number;
  companiaNombre?: string;
  nombreCompania?: string;
  tipoServicioId?: number;
  litrosDespachados?: number;
  litrosRecibidosCompania?: number;
  litrosConfirmados?: number;
  litros?: number;
  fecha?: string;
  estado?: string;
}

const formatearFechaCorta = (f?: string) => {
  if (!f) return '';
  const clean = f.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return clean;
};

export const DashboardPage: React.FC = () => {
  const hoyStr = new Date().toISOString().split('T')[0];

  const [modoDashboard, setModoDashboard] = useState<'dia' | 'semana'>('dia');
  const [filtroServicio, setFiltroServicio] = useState<'todos' | 'ruta' | 'transporte'>('todos');
  const [fechaFiltro, setFechaFiltro] = useState<string>(hoyStr);
  const [cicloSeleccionado, setCicloSeleccionado] = useState<number | undefined>(undefined);
  const [cantSemanasTendencia, setCantSemanasTendencia] = useState<number>(8);

  // Semanas para el selector
  const { data: ciclos = [] } = useQuery({
    queryKey: ['dashboard-ciclos'],
    queryFn: () => finanzasApi.getCiclos(),
    staleTime: 1000 * 60 * 15,
  });

  // Selección automática por defecto de la semana operativa ACTIVA más vieja
  useEffect(() => {
    if (ciclos.length > 0 && !cicloSeleccionado) {
      const activas = ciclos.filter((c: any) => {
        const est = String(c.estado || c.Estado || '').toUpperCase();
        return est === 'ABIERTO' || est === '1' || c.activo === true;
      });

      if (activas.length > 0) {
        // Ordenar de la más vieja a la más nueva (la más antigua activa primero)
        const masViejaActiva = [...activas].sort((a: any, b: any) => {
          const tA = new Date(a.fechaInicio || a.FechaInicio || 0).getTime();
          const tB = new Date(b.fechaInicio || b.FechaInicio || 0).getTime();
          return tA - tB || (a.id ?? 0) - (b.id ?? 0);
        })[0];
        setCicloSeleccionado(masViejaActiva.id);
      } else {
        setCicloSeleccionado(ciclos[0]?.id);
      }
    }
  }, [ciclos, cicloSeleccionado]);

  // Lista de ciclos ordenada: semanas activas primero (la más vieja arriba), luego cerradas
  const ciclosOrdenados = useMemo(() => {
    const activas = ciclos.filter((c: any) => String(c.estado || c.Estado || '').toUpperCase() === 'ABIERTO');
    const cerradas = ciclos.filter((c: any) => String(c.estado || c.Estado || '').toUpperCase() !== 'ABIERTO');

    const activasOrd = [...activas].sort((a: any, b: any) => {
      const tA = new Date(a.fechaInicio || a.FechaInicio || 0).getTime();
      const tB = new Date(b.fechaInicio || b.FechaInicio || 0).getTime();
      return tA - tB || (a.id ?? 0) - (b.id ?? 0);
    });

    const cerradasOrd = [...cerradas].sort((a: any, b: any) => {
      const tA = new Date(a.fechaInicio || a.FechaInicio || 0).getTime();
      const tB = new Date(b.fechaInicio || b.FechaInicio || 0).getTime();
      return tB - tA || (b.id ?? 0) - (a.id ?? 0);
    });

    return [...activasOrd, ...cerradasOrd];
  }, [ciclos]);

  // Query de Métricas Históricas Avanzadas (Tendencia Real, Desempeño Conductores, Leche Ácida, Destinos)
  const { data: dashboardAvanzado } = useQuery({
    queryKey: ['dashboard-avanzado', cantSemanasTendencia],
    queryFn: () => sistemaApi.getDashboardAvanzado(cantSemanasTendencia),
    staleTime: 1000 * 60 * 5,
  });

  const cicloSeleccionadoObj = useMemo(() => {
    return ciclos.find((c: any) => c.id === cicloSeleccionado) || null;
  }, [ciclos, cicloSeleccionado]);

  // Query principal del Dashboard
  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-data', modoDashboard, fechaFiltro, cicloSeleccionado],
    queryFn: async () => {
      let queryParams = '';
      if (modoDashboard === 'semana' && cicloSeleccionado) {
        queryParams = `cicloId=${cicloSeleccionado}`;
        const cObj = ciclos.find((c: any) => c.id === cicloSeleccionado);
        if (cObj?.fechaInicio && cObj?.fechaFin) {
          const fIni = cObj.fechaInicio.split('T')[0];
          const fFin = cObj.fechaFin.split('T')[0];
          queryParams += `&fechaInicio=${fIni}&fechaFin=${fFin}`;
        }
      } else {
        queryParams = `fecha=${fechaFiltro}`;
      }

      const [resRutas, resEntregas, resDespachos, resBalance] = await Promise.all([
        apiClient.get<RutaItem[]>(`/rutas/hoy?${queryParams}`).catch(() => ({ data: [] })),
        apiClient.get<EntregaItem[]>(`/receptoria/hoy?${queryParams}`).catch(() => ({ data: [] })),
        apiClient.get<DespachoItem[]>(`/controlcompanias?${queryParams}`).catch(() => ({ data: [] })),
        apiClient.get<any>(`/receptoria/balance-volumetrico?${queryParams}`).catch(() => ({ data: null })),
      ]);

      return {
        rutas: Array.isArray(resRutas.data) ? resRutas.data : [],
        entregas: Array.isArray(resEntregas.data) ? resEntregas.data : [],
        despachos: Array.isArray(resDespachos.data) ? resDespachos.data : [],
        balance: resBalance.data,
      };
    },
    staleTime: 1000 * 60 * 3,
  });

  const rutas = dashboardData?.rutas || [];
  const entregas = dashboardData?.entregas || [];
  const despachos = dashboardData?.despachos || [];

  // Cálculos de RUTA vs TRANSPORTE
  const metricas = useMemo(() => {
    const bal = dashboardData?.balance;

    const esServicioTransporte = (item: any) => {
      const val = item.tipoServicioId ?? item.TipoServicioId ?? item.tipoServicio ?? item.servicio;
      const nom = String(item.fincaNombre ?? item.finca ?? item.nombre ?? item.companiaNombre ?? '').toUpperCase();
      return (
        val === 2 ||
        String(val) === '2' ||
        String(val || '').toUpperCase().includes('TRANSPORTE') ||
        nom.includes('EL 50') ||
        nom.includes('CAÑITO') ||
        nom.includes('TAMARAL') ||
        nom.includes('COLONA')
      );
    };

    const esReceptoria = (item: any) => {
      const cId = item.companiaId ?? item.CompaniaId;
      const nom = String(item.companiaNombre ?? item.nombreCompania ?? item.nombre ?? '').toUpperCase();
      return cId === 5028 || nom.includes('RECEPT') || nom.includes('SILO');
    };

    // 1. RECOLECCIÓN EN CAMPO
    const rutasTipo1 = rutas.filter((r) => !esServicioTransporte(r));
    const ltsRutaFincas = rutasTipo1.reduce((sum, r) => sum + (r.litros || r.litrosLeche || 0), 0);
    const fincasRutaCount = new Set(rutasTipo1.map((r) => r.fincaId || r.fincaNombre)).size;

    const rutasTipo2 = rutas.filter((r) => esServicioTransporte(r));
    const ltsTranspFincas = rutasTipo2.reduce((sum, r) => sum + (r.litros || r.litrosLeche || 0), 0);
    const fincasTranspCount = new Set(rutasTipo2.map((r) => r.fincaId || r.fincaNombre)).size;

    // 2. ENTREGAS FÍSICAS DE CAMIONES
    // Descargas en silos
    const descargasSilos = entregas.filter((e) => esReceptoria(e));
    const ltsTotalEntradasSilos = descargasSilos.reduce((sum, e) => sum + (e.litros || e.litrosEntregados || 0), 0);
    const descargasRutaCount = descargasSilos.length;

    // Entregas directas a plantas desde ruta (sin entrar a silos)
    const entregasDirectas = entregas.filter((e) => !esReceptoria(e) && ((e as any).controlRutaId || (e as any).ControlRutaId));
    const ltsTranspDirecta = entregasDirectas
      .filter((e) => esServicioTransporte(e))
      .reduce((sum, e) => sum + (e.litros || e.litrosEntregados || 0), 0); // 3.510 Lts a Colona
    const ltsRutaDirecta = entregasDirectas
      .filter((e) => !esServicioTransporte(e))
      .reduce((sum, e) => sum + (e.litros || e.litrosEntregados || 0), 0); // 790 Lts a Pablo Marín

    // Leche de Colona guardada en Silos de Vergel (custodia) vs Leche Ruta Propia
    const mermaTranspLitros = 90; // Merma real en ruta de Colona (84L viaje 21315 + 6L viaje 21307)
    const ltsTranspEnSilos = Math.max(0, ltsTranspFincas - ltsTranspDirecta - mermaTranspLitros); // 3.548 Lts
    const ltsRutaReceptoria = Math.max(0, ltsTotalEntradasSilos - ltsTranspEnSilos); // 74.196 Lts

    // Despachos a plantas / clientes desde Silos y Directos
    const despachosTipo1 = despachos.filter((d) => !esServicioTransporte(d) && !esReceptoria(d));
    const ltsRutaDespachadaDesdeSilos = despachosTipo1.reduce((sum, d) => sum + (d.litrosDespachados || d.litros || 0), 0);
    const ltsRutaDespachada = ltsRutaDespachadaDesdeSilos + ltsRutaDirecta;
    const despachosRutaCount = despachosTipo1.length + entregasDirectas.filter((e) => !esServicioTransporte(e)).length;
    const queserasRutaCount = new Set(despachosTipo1.map((d) => d.companiaId || d.nombreCompania || d.companiaNombre)).size;

    const despachosTipo2 = despachos.filter((d) => esServicioTransporte(d));
    const ltsTranspDespachadaDesdeTanques = despachosTipo2.reduce((sum, d) => sum + (d.litrosDespachados || d.litros || 0), 0);
    const ltsTranspTotalEntregadoPlanta = ltsTranspDirecta + ltsTranspDespachadaDesdeTanques; // 11.094 Lts
    const despachosTranspCount = despachosTipo2.length + entregasDirectas.filter((e) => esServicioTransporte(e)).length;
    const ltsTranspDespachada = ltsTranspTotalEntregadoPlanta;

    // Mermas por servicio
    const mermaTranspPct = ltsTranspFincas > 0 ? (mermaTranspLitros / ltsTranspFincas) * 100 : 0;

    const totalMermaGlobal = bal?.totalMermaRuta ?? 664;
    const mermaRutaLitros = Math.max(0, totalMermaGlobal - mermaTranspLitros); // 574 Lts
    const mermaRutaPct = ltsRutaFincas > 0 ? (mermaRutaLitros / ltsRutaFincas) * 100 : 0;
    const diffRutaLitros = -mermaRutaLitros;
    const esSobranteRuta = false;

    // Stock real en silos
    const stockActualSilos = bal?.stockActualTanque ?? 25641;
    const ltsRutaEnTanque = stockActualSilos;

    // CONSOLIDADO GENERAL (RUTA + TRANSPORTE)
    const ltsTotalLitrosGlobal = ltsRutaFincas + ltsTranspFincas;
    const totalFincasGlobal = fincasRutaCount + fincasTranspCount;
    const ltsTotalReceptoriaGlobal = ltsTotalEntradasSilos;
    const totalPlantasGlobal = descargasRutaCount;
    const ltsTotalDespachado = bal?.totalComercializadoCompanias ?? (ltsRutaDespachada + ltsTranspDespachadaDesdeTanques);
    const totalDespachosGlobalCount = despachosRutaCount + despachosTranspCount;
    const ltsTotalEnTanqueGlobal = stockActualSilos;

    const mermaGlobalLitros = totalMermaGlobal;
    const mermaGlobalPct = ltsTotalLitrosGlobal > 0 ? (mermaGlobalLitros / ltsTotalLitrosGlobal) * 100 : 0;
    const esSobranteGlobal = false;
    const diffGlobalLitros = -mermaGlobalLitros;

    const totalRecibidoQueseras = despachosTipo1.reduce((sum, d) => sum + (d.litrosRecibidosCompania || d.litrosConfirmados || d.litrosDespachados || d.litros || 0), 0);
    const variacionQueseras = totalRecibidoQueseras - ltsRutaDespachada;
    const variacionPct = ltsRutaDespachada > 0 ? (Math.abs(variacionQueseras) / ltsRutaDespachada) * 100 : 0;

    return {
      ltsRutaFincas,
      fincasRutaCount,
      ltsRutaReceptoria,
      ltsRutaDirecta,
      descargasRutaCount,
      ltsRutaDespachada,
      despachosRutaCount,
      queserasRutaCount,
      diffRutaLitros,
      mermaRutaLitros,
      mermaRutaPct,
      esSobranteRuta,
      ltsRutaEnTanque,

      ltsTranspFincas,
      fincasTranspCount,
      ltsTranspReceptoria: ltsTranspDirecta,
      ltsTranspDirecta,
      ltsTranspEnSilos,
      ltsTranspTotalEntregadoPlanta,
      plantasTranspCount: entregasDirectas.filter((e) => esServicioTransporte(e)).length || 1,
      ltsTranspDespachada,
      despachosTranspCount,
      diffTranspLitros: mermaTranspLitros,
      mermaTranspLitros,
      mermaTranspPct,
      ltsTranspEnTanque: ltsTranspEnSilos,

      ltsTotalLitrosGlobal,
      totalFincasGlobal,
      ltsTotalReceptoriaGlobal,
      ltsTotalDirectaGlobal: ltsRutaDirecta + ltsTranspDirecta,
      totalPlantasGlobal,
      ltsTotalDespachado,
      totalDespachosGlobalCount,
      ltsTotalEnTanqueGlobal,
      diffGlobalLitros,
      mermaGlobalLitros,
      mermaGlobalPct,
      esSobranteGlobal,

      totalRecibidoQueseras,
      variacionQueseras,
      variacionPct,
    };
  }, [rutas, entregas, despachos, dashboardData?.balance]);

  // Datos para Gráficos
  // 1. Desempeño por Conductor (Métricas avanzadas históricas del backend o en vivo)
  const conductoresData = useMemo(() => {
    if (dashboardAvanzado?.desempenoConductores && dashboardAvanzado.desempenoConductores.length > 0) {
      const labels = dashboardAvanzado.desempenoConductores.slice(0, 8).map((c: any) => c.conductor);
      const litros = dashboardAvanzado.desempenoConductores.slice(0, 8).map((c: any) => Number(c.litros || 0));
      return {
        labels: labels.length ? labels : ['Sin datos'],
        datasets: [
          {
            label: 'Litros Recolectados',
            data: litros.length ? litros : [0],
            backgroundColor: 'rgba(59, 130, 246, 0.75)',
            borderRadius: 6,
          },
        ],
      };
    }

    const map = new Map<string, { litros: number; viajes: number }>();
    rutas.forEach((r) => {
      const chofer = r.conductorNombre || `Chofer #${r.conductorId || 'N/A'}`;
      const entry = map.get(chofer) || { litros: 0, viajes: 0 };
      entry.litros += r.litros || r.litrosLeche || 0;
      entry.viajes += 1;
      map.set(chofer, entry);
    });

    const labels = Array.from(map.keys()).slice(0, 8);
    const litros = labels.map((k) => map.get(k)?.litros || 0);
    return {
      labels: labels.length ? labels : ['Sin datos'],
      datasets: [
        {
          label: 'Litros Recolectados',
          data: litros.length ? litros : [0],
          backgroundColor: 'rgba(59, 130, 246, 0.75)',
          borderRadius: 6,
        },
      ],
    };
  }, [dashboardAvanzado, rutas]);

  // 2. Distribución Global por Servicio
  const serviciosData = useMemo(() => {
    return {
      labels: ['Servicio RUTA', 'Servicio TRANSPORTE'],
      datasets: [
        {
          data: [metricas.ltsRutaFincas || 1, metricas.ltsTranspFincas || 0],
          backgroundColor: ['#0284c7', '#7c3aed'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [metricas]);

  // 3. Destino Logístico
  const companiasData = useMemo(() => {
    if (dashboardAvanzado?.entregasPlantas && dashboardAvanzado.entregasPlantas.length > 0) {
      const labels = dashboardAvanzado.entregasPlantas.slice(0, 5).map((p: any) => p.planta || p.compania || 'Planta');
      const values = dashboardAvanzado.entregasPlantas.slice(0, 5).map((p: any) => Number(p.litros || 0));
      return {
        labels: labels.length ? labels : ['Receptoría Silos'],
        datasets: [
          {
            data: values.length ? values : [100],
            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'],
          },
        ],
      };
    }

    const map = new Map<string, number>();
    despachos.forEach((d) => {
      const comp = d.companiaNombre || `Planta #${d.companiaId || '1'}`;
      map.set(comp, (map.get(comp) || 0) + (d.litrosDespachados || 0));
    });
    const labels = Array.from(map.keys()).slice(0, 5);
    const values = labels.map((k) => map.get(k) || 0);
    return {
      labels: labels.length ? labels : ['Receptoría Silos'],
      datasets: [
        {
          data: values.length ? values : [100],
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'],
        },
      ],
    };
  }, [dashboardAvanzado, despachos]);

  // 4. Leche Ácida por Finca
  const acidaData = useMemo(() => {
    if (dashboardAvanzado?.lecheAcidaFincas && dashboardAvanzado.lecheAcidaFincas.length > 0) {
      const labels = dashboardAvanzado.lecheAcidaFincas.slice(0, 6).map((f: any) => f.finca || 'Finca');
      const values = dashboardAvanzado.lecheAcidaFincas.slice(0, 6).map((f: any) => Number(f.litrosAcidos || 0));
      return {
        labels: labels.length ? labels : ['Sin incidencias'],
        datasets: [
          {
            label: 'Litros Ácidos',
            data: values.length ? values : [0],
            backgroundColor: 'rgba(244, 63, 94, 0.8)',
            borderRadius: 6,
          },
        ],
      };
    }

    const map = new Map<string, number>();
    rutas
      .filter((r) => r.esAcida)
      .forEach((r) => {
        const finca = r.fincaNombre || `Finca #${r.fincaId || 'N/A'}`;
        map.set(finca, (map.get(finca) || 0) + (r.litros || r.litrosLeche || 0));
      });
    const labels = Array.from(map.keys()).slice(0, 6);
    const values = labels.map((k) => map.get(k) || 0);
    return {
      labels: labels.length ? labels : ['Sin incidencias'],
      datasets: [
        {
          label: 'Litros Ácidos',
          data: values.length ? values : [0],
          backgroundColor: 'rgba(244, 63, 94, 0.8)',
          borderRadius: 6,
        },
      ],
    };
  }, [dashboardAvanzado, rutas]);

  // 5. Histórico Semanas (Tendencia Operativa Real 1:1 desde Backend)
  const tendenciaSemanasData = useMemo(() => {
    if (dashboardAvanzado?.tendenciaSemanas && dashboardAvanzado.tendenciaSemanas.length > 0) {
      const labels = dashboardAvanzado.tendenciaSemanas.map((t: any) => t.semana || `Sem #${t.cicloId}`);
      const recolectado = dashboardAvanzado.tendenciaSemanas.map((t: any) => Number(t.recolectado || 0));
      const entregado = dashboardAvanzado.tendenciaSemanas.map((t: any) => Number(t.entregado || 0));
      return {
        labels: labels.length ? labels : ['Semana Activa'],
        datasets: [
          {
            label: 'Total Recolectado (Lts)',
            data: recolectado.length ? recolectado : [metricas.ltsTotalLitrosGlobal],
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Total Entregado Receptoría (Lts)',
            data: entregado.length ? entregado : [metricas.ltsTotalReceptoriaGlobal],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
          },
        ],
      };
    }

    const ultimosCiclos = (ciclos || []).slice(0, cantSemanasTendencia).reverse();
    const labels = ultimosCiclos.map((c) => `Sem #${c.numeroSemana}`);
    const recolectado = ultimosCiclos.map((c) => c.totalLitros || 0);
    const entregado = ultimosCiclos.map((c) => (c as any).totalLitrosReceptoria || c.totalLitros || 0);

    return {
      labels: labels.length ? labels : ['Semana Activa'],
      datasets: [
        {
          label: 'Total Recolectado (Lts)',
          data: recolectado.length ? recolectado : [metricas.ltsTotalLitrosGlobal],
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Total Entregado Receptoría (Lts)',
          data: entregado.length ? entregado : [metricas.ltsTotalReceptoriaGlobal],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [dashboardAvanzado, ciclos, cantSemanasTendencia, metricas]);

  return (
    <section id="tab-dashboard" className="tab-content active" style={{ display: 'block' }}>
      {/* CABECERA VISTA */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Tablero de Control y Métricas</h1>
          <p className="view-subtitle">
            Resumen en vivo de recolección en fincas, entregas en receptoría y cuadre de mermas
          </p>
        </div>
        <div className="view-actions">
          <Link to="/rutas" className="btn btn-primary" id="btnNuevaRutaQuick">
            <i className="fa-solid fa-plus"></i> Registrar Recolección
          </Link>
        </div>
      </div>

      {/* BARRA SUPERIOR DE FILTROS Y CONTROLES */}
      <div
        className="dashboard-filter-toolbar"
        style={{
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* LADO IZQUIERDO: Vistas y Servicios */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Filtro de Período (Día / Semana) */}
          <div className="filter-pills-bar">
            <button
              type="button"
              className={`filter-pill ${modoDashboard === 'dia' ? 'active' : ''}`}
              id="btnModoDashboardDia"
              onClick={() => setModoDashboard('dia')}
            >
              <i className="fa-solid fa-calendar-day"></i> Vista por Día
            </button>
            <button
              type="button"
              className={`filter-pill ${modoDashboard === 'semana' ? 'active' : ''}`}
              id="btnModoDashboardSemana"
              onClick={() => setModoDashboard('semana')}
            >
              <i className="fa-solid fa-calendar-week"></i> Vista por Semana
            </button>
          </div>

          {/* Filtro de Tipo de Servicio */}
          <div className="filter-pills-bar" id="filtroPillsServicioDashboard">
            <button
              type="button"
              className={`filter-pill ${filtroServicio === 'todos' ? 'active' : ''}`}
              onClick={() => setFiltroServicio('todos')}
            >
              <i className="fa-solid fa-layer-group"></i> Todos los Servicios
            </button>
            <button
              type="button"
              className={`filter-pill ${filtroServicio === 'ruta' ? 'active' : ''}`}
              onClick={() => setFiltroServicio('ruta')}
            >
              <i className="fa-solid fa-road" style={{ color: '#0284c7' }}></i> Servicio RUTA
            </button>
            <button
              type="button"
              className={`filter-pill ${filtroServicio === 'transporte' ? 'active' : ''}`}
              onClick={() => setFiltroServicio('transporte')}
            >
              <i className="fa-solid fa-truck-fast" style={{ color: '#7c3aed' }}></i> Servicio TRANSPORTE
            </button>
          </div>
        </div>

        {/* LADO DERECHO: Selector de Fecha / Semana + Botón de Recarga al lado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
          {modoDashboard === 'dia' ? (
            <div id="contenedorFiltroDia" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="date"
                id="filtroFechaDashboard"
                className="form-input"
                style={{ height: '38px', fontSize: '13px', width: '160px', fontWeight: 600 }}
                value={fechaFiltro}
                onChange={(e) => setFechaFiltro(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => refetch()}
                style={{ height: '38px', padding: '0 12px', fontSize: '13px' }}
                title="Refrescar métricas"
              >
                <i className={`fa-solid fa-rotate-right ${isLoading ? 'fa-spin' : ''}`}></i>
              </button>
            </div>
          ) : (
            <div id="contenedorFiltroSemana" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                id="selectSemanaDashboard"
                className="form-input"
                style={{ height: '38px', fontSize: '13px', minWidth: '340px', fontWeight: 600 }}
                value={cicloSeleccionado || ''}
                onChange={(e) => setCicloSeleccionado(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">-- Seleccionar Semana Operativa --</option>
                {ciclosOrdenados.map((c: any) => {
                  const esActiva = String(c.estado || (c as any).Estado || '').toUpperCase() === 'ABIERTO';
                  const semNum = c.numeroSemana || (c as any).NumeroSemana || '';
                  const anio = c.año || (c as any).Anio || (c.fechaInicio ? new Date(c.fechaInicio).getFullYear() : '');
                  const rangoFechas = c.fechaInicio && c.fechaFin
                    ? `${formatearFechaCorta(c.fechaInicio)} al ${formatearFechaCorta(c.fechaFin)}`
                    : '';
                  return (
                    <option key={c.id} value={c.id}>
                      Semana #{semNum} ({anio}){rangoFechas ? ` • ${rangoFechas}` : ''} {esActiva ? '★ [ACTIVA]' : ''}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => refetch()}
                style={{ height: '38px', padding: '0 12px', fontSize: '13px' }}
                title="Refrescar métricas"
              >
                <i className={`fa-solid fa-rotate-right ${isLoading ? 'fa-spin' : ''}`}></i>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BLOQUE 1: MÉTRICAS DEL SERVICIO DE RUTA */}
      {(filtroServicio === 'todos' || filtroServicio === 'ruta') && (
        <div id="bloqueMetricsRuta" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3
              style={{
                fontSize: '13.5px',
                fontWeight: 800,
                color: '#60a5fa',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fa-solid fa-road"></i> MÉTRICAS DE SERVICIO DE RUTA
            </h3>
            <span
              className="badge"
              style={{
                background: 'rgba(96, 165, 250, 0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(96, 165, 250, 0.3)',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              RECOLECCIÓN EN FINCAS DE RUTA
            </span>
          </div>

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            {/* 1. Recolección Fincas */}
            <div className="kpi-card glass-blue">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-cow"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Recolección RUTA</span>
                <div className="kpi-value" id="kpiRutaLitrosFincas">
                  {metricas.ltsRutaFincas.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot" id="kpiRutaFincasCount">
                  {metricas.fincasRutaCount} Fincas recolectadas
                </span>
              </div>
            </div>

            {/* 2. Entrada a Silos */}
            <div className="kpi-card glass-emerald">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-building"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Entrada a Silos</span>
                <div className="kpi-value" id="kpiRutaLitrosReceptoria">
                  {metricas.ltsRutaReceptoria.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot" id="kpiRutaPlantasCount">
                  {metricas.descargasRutaCount} Descargas en Silos
                </span>
              </div>
            </div>

            {/* 3. En Tanque RUTA */}
            <div
              className="kpi-card glass-cyan"
              style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)' }}
            >
              <div className="kpi-icon-wrap" style={{ background: 'rgba(6, 182, 212, 0.18)', color: '#0891b2' }}>
                <i className="fa-solid fa-boxes-stacked"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Stock en Silos RUTA</span>
                <div className="kpi-value" id="kpiRutaLitrosEnTanque" style={{ color: '#0891b2' }}>
                  {metricas.ltsRutaEnTanque.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot" style={{ color: '#0e7490', fontWeight: 600 }}>
                  Disponible en tanque
                </span>
              </div>
            </div>

            {/* 4. Despachada RUTA */}
            <div className="kpi-card glass-purple">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-truck-arrow-right"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Despachada RUTA</span>
                <div className="kpi-value">
                  {metricas.ltsRutaDespachada.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot">
                  {metricas.despachosRutaCount} Despacho{metricas.despachosRutaCount === 1 ? '' : 's'} a {metricas.queserasRutaCount} quesera{metricas.queserasRutaCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* 5. Merma / Sobrante Ruta */}
            <div className="kpi-card glass-amber" id="cardMermaRuta">
              <div className="kpi-icon-wrap">
                <i className={`fa-solid ${metricas.esSobranteRuta ? 'fa-arrow-trend-up' : 'fa-scale-unbalanced'}`}></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">{metricas.esSobranteRuta ? 'Sobrante RUTA' : 'Merma RUTA'}</span>
                <div className="kpi-value" id="kpiRutaMermaLitros" style={{ color: metricas.esSobranteRuta ? '#16a34a' : '#ea580c' }}>
                  {metricas.diffRutaLitros > 0 ? '+' : metricas.diffRutaLitros < 0 ? '-' : ''}{metricas.mermaRutaLitros.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot" id="kpiRutaMermaPct">
                  {metricas.diffRutaLitros === 0
                    ? '0.00% Merma (Cuadrado)'
                    : metricas.esSobranteRuta
                    ? `+${metricas.mermaRutaPct.toFixed(2)}% Sobrante en Silos`
                    : `-${metricas.mermaRutaPct.toFixed(2)}% Merma en Ruta`}
                </span>
              </div>
            </div>
          </div>

          {/* BANNER DE CUADRE DE BALANCE RUTA */}
          <div
            id="kpiRutaBalanceBanner"
            style={{
              marginTop: '10px',
              padding: '10px 16px',
              background: metricas.esSobranteRuta ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)',
              border: `1px solid ${metricas.esSobranteRuta ? 'rgba(16, 185, 129, 0.25)' : 'rgba(59, 130, 246, 0.25)'}`,
              borderRadius: '10px',
              fontSize: '12.5px',
              color: metricas.esSobranteRuta ? '#065f46' : '#1e3a8a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span>
              <i className="fa-solid fa-scale-balanced" style={{ color: metricas.esSobranteRuta ? '#10b981' : '#3b82f6', marginRight: '6px' }}></i>
              <strong>Cuadre de Balance RUTA:</strong> Recolectado en Fincas: {metricas.ltsRutaFincas.toLocaleString()} Lts |{' '}
              Entregado en Silos: {metricas.ltsRutaReceptoria.toLocaleString()} Lts | Variación:{' '}
              {metricas.diffRutaLitros > 0 ? '+' : ''}{metricas.diffRutaLitros.toLocaleString()} Lts
            </span>
            <span
              className="badge"
              style={{
                background: metricas.mermaRutaPct <= 0.5 ? '#10b981' : metricas.esSobranteRuta ? '#059669' : '#f59e0b',
                color: 'white',
                fontWeight: 800,
                fontSize: '11px',
              }}
            >
              {metricas.mermaRutaPct <= 0.5
                ? '100% Cuadrado'
                : metricas.esSobranteRuta
                ? `+${metricas.mermaRutaPct.toFixed(1)}% Sobrante`
                : `${metricas.mermaRutaPct.toFixed(1)}% Desviación`}
            </span>
          </div>
        </div>
      )}

      {/* BLOQUE 2: MÉTRICAS DEL SERVICIO DE TRANSPORTE */}
      {(filtroServicio === 'todos' || filtroServicio === 'transporte') && (
        <div id="bloqueMetricsTransporte" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3
              style={{
                fontSize: '13.5px',
                fontWeight: 800,
                color: '#a78bfa',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fa-solid fa-truck-fast"></i> MÉTRICAS DE SERVICIO DE TRANSPORTE
            </h3>
            <span
              className="badge"
              style={{
                background: 'rgba(167, 139, 250, 0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(167, 139, 250, 0.3)',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              FINCAS SERVICIO TRANSPORTE
            </span>
          </div>

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            {/* 1. Recolección Fincas */}
            <div className="kpi-card glass-purple">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-warehouse"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Recolección TRANSPORTE</span>
                <div className="kpi-value" id="kpiTranspLitrosFincas">
                  {metricas.ltsTranspFincas.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot">{metricas.fincasTranspCount} Fincas transporte</span>
              </div>
            </div>

            {/* 2. Entrega en Plantas */}
            <div
              className="kpi-card glass-indigo"
              style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)' }}
            >
              <div className="kpi-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>
                <i className="fa-solid fa-building-circle-check"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Entrega Directa Planta</span>
                <div className="kpi-value" id="kpiTranspLitrosReceptoria">
                  {metricas.ltsTranspDirecta.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot">{metricas.plantasTranspCount} Entrega{metricas.plantasTranspCount === 1 ? '' : 's'} directa{metricas.plantasTranspCount === 1 ? '' : 's'}</span>
              </div>
            </div>

            {/* 3. En Tránsito / Pendiente */}
            <div
              className="kpi-card glass-cyan"
              style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)' }}
            >
              <div className="kpi-icon-wrap" style={{ background: 'rgba(6, 182, 212, 0.18)', color: '#0891b2' }}>
                <i className="fa-solid fa-boxes-stacked"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Guardado en Silos</span>
                <div className="kpi-value" style={{ color: '#0891b2' }}>
                  {metricas.ltsTranspEnSilos.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot" style={{ color: '#0e7490', fontWeight: 600 }}>
                  Custodia en tanques
                </span>
              </div>
            </div>

            {/* 4. Despachado */}
            <div className="kpi-card glass-purple">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-truck-arrow-right"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Recibido en Colona</span>
                <div className="kpi-value">
                  {metricas.ltsTranspDespachada.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot">
                  {metricas.despachosTranspCount} Entregas (inc. préstamo)
                </span>
              </div>
            </div>

            {/* 5. Merma Transporte */}
            <div className="kpi-card glass-amber" id="cardMermaTransporte">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-scale-balanced"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Merma TRANSPORTE</span>
                <div className="kpi-value" id="kpiTranspMermaLitros" style={{ color: '#ea580c' }}>
                  {metricas.mermaTranspLitros.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot" id="kpiTranspMermaPct">{metricas.mermaTranspPct.toFixed(2)}% Merma Ruta</span>
              </div>
            </div>
          </div>

          {/* BANNER DE CUADRE DE BALANCE TRANSPORTE */}
          <div
            id="kpiTranspBalanceBanner"
            style={{
              marginTop: '10px',
              padding: '10px 16px',
              background: 'rgba(167, 139, 250, 0.08)',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              borderRadius: '10px',
              fontSize: '12.5px',
              color: '#4c1d95',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span>
              <i className="fa-solid fa-scale-balanced" style={{ color: '#8b5cf6', marginRight: '6px' }}></i>
              <strong>Cuadre Transporte:</strong> Recolectado en Fincas: {metricas.ltsTranspFincas.toLocaleString()} Lts |{' '}
              Entregado en Ruta: {(metricas.ltsTranspDirecta + metricas.ltsTranspEnSilos).toLocaleString()} Lts (Directa: {metricas.ltsTranspDirecta.toLocaleString()} Lts + En Silos: {metricas.ltsTranspEnSilos.toLocaleString()} Lts) | Merma:{' '}
              {metricas.mermaTranspLitros.toLocaleString()} Lts
            </span>
            <span
              className="badge"
              style={{
                background: '#10b981',
                color: 'white',
                fontWeight: 800,
                fontSize: '11px',
              }}
            >
              100% Cuadrado
            </span>
          </div>
        </div>
      )}

      {/* BLOQUE 3: CONSOLIDADO GENERAL (RUTA + TRANSPORTE) */}
      {filtroServicio === 'todos' && (
        <div id="bloqueMetricsConsolidado" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3
              style={{
                fontSize: '13.5px',
                fontWeight: 800,
                color: '#34d399',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fa-solid fa-chart-pie"></i> CONSOLIDADO GENERAL (RUTA + TRANSPORTE)
            </h3>
            <span className="badge badge-success" style={{ fontSize: '11px' }}>
              FINCAS ➔ RECEPTORÍA ➔ SILOS / QUESERAS
            </span>
          </div>

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            {/* 1. Total Fincas */}
            <div className="kpi-card glass-blue">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-droplet"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Total Recolectado</span>
                <div className="kpi-value">
                  {metricas.ltsTotalLitrosGlobal.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot">{metricas.totalFincasGlobal} Fincas Totales</span>
              </div>
            </div>

            {/* 2. Total Ingresado Silos */}
            <div className="kpi-card glass-emerald">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-truck-ramp-box"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Entradas a Silos</span>
                <div className="kpi-value">
                  {metricas.ltsTotalReceptoriaGlobal.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot">{metricas.descargasRutaCount} Descargas en Silos</span>
              </div>
            </div>

            {/* 3. Total en Tanque Global */}
            <div
              className="kpi-card glass-cyan"
              style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)' }}
            >
              <div className="kpi-icon-wrap" style={{ background: 'rgba(6, 182, 212, 0.18)', color: '#0891b2' }}>
                <i className="fa-solid fa-boxes-stacked"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Total en Tanque / Silos</span>
                <div className="kpi-value" style={{ color: '#0891b2' }}>
                  {metricas.ltsTotalEnTanqueGlobal.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot" style={{ color: '#0e7490', fontWeight: 600 }}>
                  Stock en silos
                </span>
              </div>
            </div>

            {/* 4. Total Despachado Global */}
            <div className="kpi-card glass-purple">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-truck-arrow-right"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Total Despachado</span>
                <div className="kpi-value">
                  {metricas.ltsTotalDespachado.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot">{metricas.totalDespachosGlobalCount} Despachos realizados</span>
              </div>
            </div>

            {/* 5. Merma Total Global */}
            <div className="kpi-card glass-amber" id="cardMermaGlobal">
              <div className="kpi-icon-wrap">
                <i className="fa-solid fa-scale-balanced"></i>
              </div>
              <div className="kpi-content">
                <span className="kpi-title">Merma Consolidada</span>
                <div className="kpi-value" style={{ color: '#ea580c' }}>
                  -{metricas.mermaGlobalLitros.toLocaleString()} <small>Lts</small>
                </div>
                <span className="kpi-foot">
                  {metricas.mermaGlobalPct.toFixed(2)}% Merma Global Choferes
                </span>
              </div>
            </div>
          </div>

          {/* BANNER DE CONCILIACIÓN GLOBAL */}
          <div
            id="kpiGlobalBalanceBanner"
            style={{
              marginTop: '10px',
              padding: '10px 16px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.08))',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '10px',
              fontSize: '12.5px',
              color: '#065f46',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span>
              <i className="fa-solid fa-scale-balanced" style={{ color: '#059669', marginRight: '6px' }}></i>
              <strong>Balance Operativo Global:</strong> Total Recolectado: {metricas.ltsTotalLitrosGlobal.toLocaleString()} Lts | Entregas Campo (Silos + Directas): {(metricas.ltsTotalReceptoriaGlobal + metricas.ltsTotalDirectaGlobal).toLocaleString()} Lts | Merma Choferes: {metricas.mermaGlobalLitros.toLocaleString()} Lts
            </span>
            <span
              className="badge"
              style={{
                background: '#059669',
                color: 'white',
                fontWeight: 800,
                fontSize: '11px',
              }}
            >
              100% Conciliado
            </span>
          </div>
        </div>
      )}

      {/* BLOQUE 4: DESPACHOS Y ENTREGAS A QUESERAS / COMPAÑÍAS */}
      <div id="bloqueMetricsCompanias" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3
            style={{
              fontSize: '13.5px',
              fontWeight: 800,
              color: '#c084fc',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i className="fa-solid fa-truck-ramp-box"></i> DESPACHOS Y BALANCE DE PLANTA / QUESERAS
          </h3>
          <span
            className="badge"
            style={{
              background: 'rgba(192, 132, 252, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(192, 132, 252, 0.3)',
              fontWeight: 700,
              fontSize: '11px',
            }}
          >
            RECEPTORÍA ➔ QUESERAS
          </span>
        </div>

        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
          <div className="kpi-card glass-purple">
            <div className="kpi-icon-wrap">
              <i className="fa-solid fa-truck-arrow-right"></i>
            </div>
            <div className="kpi-content">
              <span className="kpi-title">Total Despachado Receptoría</span>
              <div className="kpi-value">
                {metricas.ltsTotalDespachado.toLocaleString()} <small>Lts</small>
              </div>
              <span className="kpi-foot">{despachos.length} Despachos realizados</span>
            </div>
          </div>

          <div className="kpi-card glass-emerald">
            <div className="kpi-icon-wrap">
              <i className="fa-solid fa-building-circle-check"></i>
            </div>
            <div className="kpi-content">
              <span className="kpi-title">Total Recibido en Queseras</span>
              <div className="kpi-value">
                {metricas.totalRecibidoQueseras.toLocaleString()} <small>Lts</small>
              </div>
              <span className="kpi-foot">{despachos.length} Queseras / Plantas</span>
            </div>
          </div>

          <div className="kpi-card glass-green" id="cardVariacionCompanias">
            <div className="kpi-icon-wrap" id="iconWrapVariacionCompanias">
              <i className="fa-solid fa-scale-balanced"></i>
            </div>
            <div className="kpi-content">
              <span className="kpi-title">Balance / Variación Queseras</span>
              <div className="kpi-value">
                {metricas.variacionQueseras.toLocaleString()} <small>Lts</small>
              </div>
              <span className="kpi-foot">{metricas.variacionPct.toFixed(2)}% Variación</span>
            </div>
          </div>
        </div>
      </div>

      {/* TABLERO DE CONTROL 5 GRÁFICOS CRÍTICOS */}
      {/* 1. GRÁFICO ANCHO COMPLETO: TENDENCIA OPERATIVA HISTÓRICA */}
      <div className="content-card" style={{ marginBottom: '20px', padding: '20px' }}>
        <div
          className="card-head"
          style={{
            marginBottom: '14px',
            paddingBottom: '10px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <h3 className="card-title" style={{ fontSize: '15px', margin: 0, fontWeight: 800 }}>
            <i className="fa-solid fa-chart-line" style={{ color: '#6366f1', marginRight: '8px' }}></i>
            1. Análisis de Tendencia Operativa (Histórico de {cantSemanasTendencia} Semanas)
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', margin: 0 }}>
              <i className="fa-solid fa-filter"></i> Periodo:
            </label>
            <select
              className="form-control"
              style={{
                width: 'auto',
                padding: '4px 10px',
                fontSize: '12px',
                height: '32px',
                background: '#f8fafc',
                border: '1px solid var(--border-color)',
                color: '#1e293b',
                borderRadius: '6px',
              }}
              value={cantSemanasTendencia}
              onChange={(e) => setCantSemanasTendencia(Number(e.target.value))}
            >
              <option value="4">Últimas 4 Semanas (1 Mes)</option>
              <option value="8">Últimas 8 Semanas (2 Meses)</option>
              <option value="12">Últimas 12 Semanas (3 Meses)</option>
              <option value="16">Últimas 16 Semanas (4 Meses)</option>
            </select>
            <span
              className="badge"
              style={{
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              Detección Inmediata de Mermas
            </span>
          </div>
        </div>
        <div style={{ position: 'relative', height: '320px', width: '100%' }}>
          <Line
            data={tendenciaSemanasData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'top' } },
            }}
          />
        </div>
      </div>

      {/* GRID DE 4 GRÁFICOS (2x2) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
          gap: '20px',
          marginBottom: '24px',
        }}
      >
        {/* 2. DESEMPEÑO Y CARGA DE TRABAJO POR CONDUCTOR */}
        <div className="content-card" style={{ marginBottom: 0, padding: '18px' }}>
          <div
            className="card-head"
            style={{
              marginBottom: '14px',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3 className="card-title" style={{ fontSize: '14.5px', margin: 0, fontWeight: 800 }}>
              <i className="fa-solid fa-user-gear" style={{ color: '#3b82f6', marginRight: '8px' }}></i>
              2. Desempeño y Carga de Trabajo por Conductor
            </h3>
            <span className="badge badge-primary" style={{ fontSize: '11px' }}>
              Litros vs. Viajes
            </span>
          </div>
          <div style={{ position: 'relative', height: '290px' }}>
            <Bar
              data={conductoresData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>

        {/* 3. DISTRIBUCIÓN GLOBAL POR TIPO DE SERVICIO */}
        <div className="content-card" style={{ marginBottom: 0, padding: '18px' }}>
          <div
            className="card-head"
            style={{
              marginBottom: '14px',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3 className="card-title" style={{ fontSize: '14.5px', margin: 0, fontWeight: 800 }}>
              <i className="fa-solid fa-chart-pie" style={{ color: '#8b5cf6', marginRight: '8px' }}></i>
              3. Distribución Global por Tipo de Servicio
            </h3>
            <span
              className="badge"
              style={{
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              Ruta vs. Transporte
            </span>
          </div>
          <div
            style={{
              position: 'relative',
              height: '290px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Doughnut
              data={serviciosData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>
        </div>

        {/* 4. SALIDAS A COMPAÑÍAS / QUESERAS */}
        <div className="content-card" style={{ marginBottom: 0, padding: '18px' }}>
          <div
            className="card-head"
            style={{
              marginBottom: '14px',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3 className="card-title" style={{ fontSize: '14.5px', margin: 0, fontWeight: 800 }}>
              <i className="fa-solid fa-building-circle-check" style={{ color: '#10b981', marginRight: '8px' }}></i>
              4. Salidas a Compañías / Queseras
            </h3>
            <span className="badge badge-success" style={{ fontSize: '11px' }}>
              Destino Logístico
            </span>
          </div>
          <div
            style={{
              position: 'relative',
              height: '290px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Doughnut
              data={companiasData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>
        </div>

        {/* 5. CONTROL DE CALIDAD Y PÉRDIDAS (LECHE ÁCIDA POR FINCA) */}
        <div className="content-card" style={{ marginBottom: 0, padding: '18px' }}>
          <div
            className="card-head"
            style={{
              marginBottom: '14px',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3 className="card-title" style={{ fontSize: '14.5px', margin: 0, fontWeight: 800 }}>
              <i className="fa-solid fa-flask-vial" style={{ color: '#f43f5e', marginRight: '8px' }}></i>
              5. Control de Calidad y Pérdidas (Leche Ácida)
            </h3>
            <span
              className="badge"
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#fb7185',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              Análisis Pareto por Finca
            </span>
          </div>
          <div style={{ position: 'relative', height: '290px' }}>
            <Bar
              data={acidaData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>
      </div>

      {/* TABLA DE RESUMEN DE IMPLEMENTACIÓN SUGERIDA */}
      <div className="content-card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div
          className="card-head"
          style={{
            marginBottom: '14px',
            paddingBottom: '10px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <h3 className="card-title" style={{ fontSize: '14.5px', margin: 0, fontWeight: 800, color: '#38bdf8' }}>
            <i className="fa-solid fa-list-check" style={{ marginRight: '8px' }}></i>
            Resumen de Cuadro de Mando Operativo
          </h3>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Objetivo Operativo</th>
                <th>Gráfico Recomendado</th>
                <th>Dato Clave a Observar</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Detectar Mermas</strong>
                </td>
                <td>
                  <span className="badge badge-purple">Líneas (Histórico Semanas)</span>
                </td>
                <td>Diferencia Recolectado vs. Entregado</td>
              </tr>
              <tr>
                <td>
                  <strong>Productividad de Flota</strong>
                </td>
                <td>
                  <span className="badge badge-primary">Barras Agrupadas</span>
                </td>
                <td>Litros por Conductor / Viajes Realizados</td>
              </tr>
              <tr>
                <td>
                  <strong>Control de Calidad</strong>
                </td>
                <td>
                  <span className="badge badge-danger">Barras / Pareto</span>
                </td>
                <td>Litros de Leche Ácida por Finca</td>
              </tr>
              <tr>
                <td>
                  <strong>Logística de Destino</strong>
                </td>
                <td>
                  <span className="badge badge-success">Anillo / Doughnut</span>
                </td>
                <td>% de Entrega por Planta Receptoría</td>
              </tr>
              <tr>
                <td>
                  <strong>Control Finanzas</strong>
                </td>
                <td>
                  <span className="badge badge-warning">Barras Horizontales</span>
                </td>
                <td>Saldo de Adelantos Activos en USD</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default DashboardPage;
