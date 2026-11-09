import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  ClipboardCheck,
  PlusCircle,
  FileSpreadsheet,
  Printer,
  RotateCw,
  Ticket as TicketIcon,
  Warehouse,
  TrendingDown,
  Truck,
  CheckCircle2,
  Calendar,
  User,
  FilterX,
  ChevronDown,
  ChevronUp,
  Pencil,
  Clock,
  ArrowRightLeft,
  RotateCcw,
  Trash2,
  X,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { operacionesApi } from '@/api/operaciones.api';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { CamionSelect, ChoferSelect } from '@/components/selectors';
import { useAuth } from '@/hooks/useAuth';
import type { ControlRutaDto, CamionDto, RutaLogisticaDto, FincaDto, CompaniaDto } from '@/types';

export const ViajesTicketsPage: React.FC = () => {
  const { user, isAdmin, hasTenantModule } = useAuth();
  const hasBufala = hasTenantModule('MOD_LECHE_BUFALA');
  const queryClient = useQueryClient();

  // Filtros de fecha (por defecto últimos 30 días como en V2_3_11_26)
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [filtroChoferId, setFiltroChoferId] = useState<string>('');
  const [filtroOrigen, setFiltroOrigen] = useState<string>('');
  const [filtroProceso, setFiltroProceso] = useState<string>('');

  // Filas expandidas (Set de row keys)
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(new Set());

  // Modales
  const [modalIniciar, setModalIniciar] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [ticketParaEditar, setTicketParaEditar] = useState<any | null>(null);

  // Modal Trazabilidad
  const [modalTrazabilidad, setModalTrazabilidad] = useState(false);
  const [ticketTrazabilidad, setTicketTrazabilidad] = useState<any | null>(null);
  const [tabTrazabilidad, setTabTrazabilidad] = useState<'fincas' | 'despacho' | 'entregas' | 'timeline' | 'logs'>('fincas');

  // Modal Traspaso
  const [modalTraspaso, setModalTraspaso] = useState(false);
  const [ticketParaTraspaso, setTicketParaTraspaso] = useState<any | null>(null);
  const [formTraspaso, setFormTraspaso] = useState({
    choferDestinoId: 0,
    litrosTraspaso: 0,
    observacion: '',
  });

  // Modal Agregar Finca Auditada
  const [modalAgregarFincaAuditada, setModalAgregarFincaAuditada] = useState(false);
  const [formFincaAuditada, setFormFincaAuditada] = useState({
    fincaId: 0,
    litros: 0,
    esAcida: false,
    esDiferido: false,
    tipoLeche: 'VACA',
    observacion: '',
    motivo: '',
  });

  // Modal Editar Finca Auditada
  const [modalEditarFincaAuditada, setModalEditarFincaAuditada] = useState(false);
  const [fincaParaEditar, setFincaParaEditar] = useState<any | null>(null);
  const [formEditarFinca, setFormEditarFinca] = useState({
    fincaId: 0,
    litros: 0,
    esAcida: false,
    esDiferido: false,
    tipoLeche: 'VACA',
    observacion: '',
    motivo: '',
  });

  // Modal Editar Entrega Auditada
  const [modalEditarEntregaAuditada, setModalEditarEntregaAuditada] = useState(false);
  const [entregaParaEditar, setEntregaParaEditar] = useState<any | null>(null);
  const [formEditarEntrega, setFormEditarEntrega] = useState({
    companiaId: 0,
    litros: 0,
    observacion: '',
    motivo: '',
  });

  // Modal Bitácora Global de Auditoría (Superadmin / Admin)
  const [modalAuditoriaGlobal, setModalAuditoriaGlobal] = useState(false);
  const [filtroAuditEntidad, setFiltroAuditEntidad] = useState('');
  const [filtroAuditBusqueda, setFiltroAuditBusqueda] = useState('');
  const [filtroAuditDesde, setFiltroAuditDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [filtroAuditHasta, setFiltroAuditHasta] = useState(() => new Date().toISOString().split('T')[0]);

  const { data: logsAuditoriaGlobal = [], isLoading: isLoadingAudit, refetch: refetchAudit } = useQuery({
    queryKey: ['logs-auditoria-global', filtroAuditDesde, filtroAuditHasta, filtroAuditEntidad, filtroAuditBusqueda],
    queryFn: () => operacionesApi.getLogsAuditoriaGlobal({
      fechaDesde: filtroAuditDesde ? `${filtroAuditDesde}T00:00:00` : undefined,
      fechaHasta: filtroAuditHasta ? `${filtroAuditHasta}T23:59:59` : undefined,
      tipoEntidad: filtroAuditEntidad || undefined,
      busqueda: filtroAuditBusqueda || undefined,
      limite: 300,
    }),
    enabled: modalAuditoriaGlobal,
  });

  const columnasAuditoriaGlobal: ColumnDef<any>[] = useMemo(() => [
    {
      header: 'Fecha / Hora',
      accessorKey: 'fecha',
      cell: (row) => {
        const f = row.fecha;
        return (
          <div className="text-xs">
            <div className="font-semibold text-slate-800">
              {f ? new Date(f).toLocaleDateString('es-VE') : '-'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {f ? new Date(f).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Ticket / Entidad',
      accessorKey: 'controlRutaId',
      cell: (row) => (
        <div>
          <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs">
            Ticket #{row.controlRutaId}
          </span>
          <div className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">
            {row.tipoEntidad} {row.entidadId ? `(ID ${row.entidadId})` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Acción',
      accessorKey: 'tipoAccion',
      cell: (row) => {
        const accion = row.tipoAccion || '';
        let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
        if (accion.includes('RECARGAR') || accion.includes('DESPACHAR')) {
          badgeColor = 'bg-purple-100 text-purple-800 border-purple-300';
        } else if (accion.includes('EDITAR') || accion.includes('MODIFICAR')) {
          badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
        } else if (accion.includes('ELIMINAR') || accion.includes('LIMPIAR')) {
          badgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
        } else if (accion.includes('REVERTIR')) {
          badgeColor = 'bg-orange-100 text-orange-800 border-orange-300';
        } else if (accion.includes('CREAR')) {
          badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
        }
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${badgeColor}`}>
            {accion}
          </span>
        );
      },
    },
    {
      header: 'Valores Anteriores',
      accessorKey: 'valoresAnteriores',
      cell: (row) => (
        <span className="text-[11px] font-mono text-slate-600 max-w-[200px] truncate block" title={row.valoresAnteriores}>
          {row.valoresAnteriores || '—'}
        </span>
      ),
    },
    {
      header: 'Valores Nuevos',
      accessorKey: 'valoresNuevos',
      cell: (row) => (
        <span className="text-[11px] font-mono font-semibold text-emerald-700 max-w-[240px] truncate block" title={row.valoresNuevos}>
          {row.valoresNuevos || '—'}
        </span>
      ),
    },
    {
      header: 'Motivo / Detalle',
      accessorKey: 'motivo',
      cell: (row) => (
        <span className="text-xs text-slate-700 font-medium max-w-[260px] truncate block" title={row.motivo}>
          {row.motivo || '—'}
        </span>
      ),
    },
    {
      header: 'Usuario Responsable',
      accessorKey: 'nombreUsuario',
      cell: (row) => (
        <div className="text-xs">
          <div className="font-bold text-slate-800">{row.nombreUsuario || `Usuario #${row.usuarioId}`}</div>
          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
            {row.rolUsuario || 'USUARIO'}
          </span>
        </div>
      ),
    },
  ], []);

  // Formulario iniciar nuevo viaje
  const [formIniciar, setFormIniciar] = useState({
    fecha: new Date().toISOString().split('T')[0],
    camionId: 0,
    choferId: 0,
    rutaLogisticaId: 0,
    rutasLogisticasIds: [] as number[],
    odometroInicialKm: 0,
    observaciones: '',
  });

  // Queries
  const {
    data: viajesRutas = [],
    isLoading: isLoadingRutas,
    refetch: refetchRutas,
  } = useQuery<ControlRutaDto[]>({
    queryKey: ['control-rutas', fechaDesde, fechaHasta],
    queryFn: () => operacionesApi.getControles(undefined, undefined, undefined, fechaDesde, fechaHasta),
    refetchInterval: 10000,
  });

  const {
    data: despachosComp = [],
    isLoading: isLoadingComp,
    refetch: refetchComp,
  } = useQuery<any[]>({
    queryKey: ['control-companias', fechaDesde, fechaHasta],
    queryFn: () => operacionesApi.getDespachosCompanias(undefined, undefined, fechaDesde, fechaHasta),
    refetchInterval: 10000,
  });

  const { data: camiones = [] } = useQuery<CamionDto[]>({
    queryKey: ['camiones'],
    queryFn: () => catalogosApi.getCamiones(true),
  });

  const { data: choferes = [] } = useQuery<any[]>({
    queryKey: ['conductores'],
    queryFn: () => catalogosApi.getChoferes(),
  });

  const { data: rutasLogistica = [] } = useQuery<RutaLogisticaDto[]>({
    queryKey: ['rutas-logistica'],
    queryFn: () => operacionesApi.getRutasLogistica(),
  });

  const { data: fincas = [] } = useQuery<FincaDto[]>({
    queryKey: ['fincas'],
    queryFn: () => catalogosApi.getFincas(true),
  });

  const { data: companias = [] } = useQuery<CompaniaDto[]>({
    queryKey: ['companias'],
    queryFn: () => catalogosApi.getCompanias(true),
  });

  // Query fincas y entregas para el modal de trazabilidad o fila expandida
  const ticketTrazabilidadId = ticketTrazabilidad?.id;
  const esRutaTrazabilidad = ticketTrazabilidad?._origen === 'RUTA';

  const { data: fincasTrazabilidad = [], refetch: refetchFincasTraz } = useQuery({
    queryKey: ['fincas-ticket', ticketTrazabilidadId],
    queryFn: () => (ticketTrazabilidadId && esRutaTrazabilidad ? operacionesApi.getFincasViaje(ticketTrazabilidadId) : []),
    enabled: !!ticketTrazabilidadId && esRutaTrazabilidad,
  });

  const { data: entregasTrazabilidad = [], refetch: refetchEntregasTraz } = useQuery({
    queryKey: ['entregas-ticket', ticketTrazabilidadId],
    queryFn: () => (ticketTrazabilidadId && esRutaTrazabilidad ? operacionesApi.getEntregasViaje(ticketTrazabilidadId) : []),
    enabled: !!ticketTrazabilidadId && esRutaTrazabilidad,
  });

  const { data: historialTrazabilidad = [], refetch: refetchHistorialTraz } = useQuery({
    queryKey: ['historial-ticket', ticketTrazabilidadId],
    queryFn: () => (ticketTrazabilidadId && esRutaTrazabilidad ? operacionesApi.getHistorialViaje(ticketTrazabilidadId) : []),
    enabled: !!ticketTrazabilidadId && esRutaTrazabilidad,
  });

  const { data: logsTrazabilidad = [], refetch: refetchLogsTraz } = useQuery({
    queryKey: ['logs-ticket', ticketTrazabilidadId],
    queryFn: () => (ticketTrazabilidadId && esRutaTrazabilidad ? operacionesApi.getLogsModificacionesViaje(ticketTrazabilidadId) : []),
    enabled: !!ticketTrazabilidadId && esRutaTrazabilidad,
  });

  const recargarTrazabilidad = () => {
    refetchFincasTraz();
    refetchEntregasTraz();
    refetchHistorialTraz();
    refetchLogsTraz();
    queryClient.invalidateQueries({ queryKey: ['control-rutas'] });
    queryClient.invalidateQueries({ queryKey: ['control-companias'] });
  };

  // KPIs de la cabecera del modal de trazabilidad (1:1 con V2_3_11_26)
  const metricasModalTrazabilidad = useMemo(() => {
    if (!ticketTrazabilidad) return null;
    const totalFinca = ticketTrazabilidad.totalLitrosFinca != null ? Number(ticketTrazabilidad.totalLitrosFinca) : 0;
    const totalRecep = ticketTrazabilidad.litrosRecibidosReceptoria != null ? Number(ticketTrazabilidad.litrosRecibidosReceptoria) : (ticketTrazabilidad.totalLitrosReceptoria != null ? Number(ticketTrazabilidad.totalLitrosReceptoria) : null);
    const recargaExtra = ticketTrazabilidad.litrosCargadosAdicional != null ? Number(ticketTrazabilidad.litrosCargadosAdicional) : 0;
    const totalSaliendo = (totalRecep != null ? totalRecep : totalFinca) + recargaExtra;

    const sumaEntregasPlantas = entregasTrazabilidad && entregasTrazabilidad.length > 0
      ? entregasTrazabilidad.reduce((acc: number, e: any) => acc + Number(e.litros || e.Litros || e.litrosEntregados || 0), 0)
      : null;
    const totalPlanta = sumaEntregasPlantas != null ? sumaEntregasPlantas : (ticketTrazabilidad.litrosEntregadosCompania != null ? Number(ticketTrazabilidad.litrosEntregadosCompania) : null);

    const yaFinalizo = ticketTrazabilidad.estado === 'FINALIZADO' || totalPlanta != null || (totalRecep != null && recargaExtra === 0 && (ticketTrazabilidad.tipoDestino || '').toUpperCase().includes('RECEPTORIA'));

    let mermaReal: number | null = null;
    let mermaEsCero = false;
    let mermaEsPerdida = false;
    let textoMerma = '';
    if (yaFinalizo && totalPlanta != null) {
      mermaReal = totalSaliendo - totalPlanta;
      mermaEsCero = Math.abs(mermaReal) < 0.01;
      mermaEsPerdida = mermaReal > 0;
      textoMerma = mermaEsCero ? '0 L' : (mermaEsPerdida ? `-${mermaReal.toLocaleString('es-VE')} L` : `+${Math.abs(mermaReal).toLocaleString('es-VE')} L`);
    }

    return {
      totalFinca,
      totalRecep,
      recargaExtra,
      totalPlanta,
      totalSaliendo,
      yaFinalizo,
      mermaReal,
      mermaEsCero,
      mermaEsPerdida,
      textoMerma,
      totalEnCamino: totalSaliendo,
    };
  }, [ticketTrazabilidad, entregasTrazabilidad]);

  // Normalización de datos 1:1 con app.js de V2_3_11_26
  const dataConsolidada = useMemo(() => {
    // Normalizar Rutas
    const listRutas = (viajesRutas || []).map((r) => {
      const pId = Number(r.procesoActualId || (r.estadoProceso === 'CERRADO' || r.estado === 'FINALIZADO' ? 4 : 1));
      const ltsFinca = Number(r.totalLitrosFinca ?? r.totalLitrosRecogidos ?? 0);
      const ltsRec = Number(r.totalLitrosReceptoria ?? (r as any).litrosRecibidosReceptoria ?? r.litrosEntregadosCompania ?? ltsFinca);
      const dif = Number(r.diferenciaLitros ?? (r as any).diferenciaReceptoria ?? (ltsRec - ltsFinca));
      const pct = ltsFinca > 0 ? (Math.abs(dif) / ltsFinca) * 100 : 0;

      return {
        ...r,
        _rowKey: `RUTA_${r.id}`,
        _origen: 'RUTA',
        _tipoLabel: 'RUTA',
        _tipoColor: '#0284c7',
        _tipoBg: '#e0f2fe',
        procesoActualId: pId,
        totalLitrosFinca: ltsFinca,
        totalLitrosReceptoria: ltsRec,
        diferenciaLitros: dif,
        mermaTotalLitros: dif,
        porcentajeMerma: pct,
        nombreConductor: r.nombreConductor || r.choferNombre || 'Conductor',
        nombreCompaniaDestino: (r as any).nombreCompaniaDestino || (r as any).companiaNombre || (r as any).tipoDestino || 'Receptoría',
        totalFincas: (r as any).totalFincas || (r as any).fincasCount || 0,
      };
    });

    // Normalizar Salidas a Compañía / Receptoría
    const listComp = (despachosComp || []).map((c) => {
      const esSubTicket = c.controlRutaId != null && Number(c.controlRutaId) > 0;
      const parentId = esSubTicket ? Number(c.controlRutaId) : null;
      const stUpper = (c.estado || '').toUpperCase();
      const pId = stUpper === 'FINALIZADO' ? 4 : stUpper === 'CAMINO A COMPAÑIA' || stUpper === 'EN VIA' ? 3 : 1;
      const ltsDesp = Number(c.litrosDespachados || 0);
      const ltsRec = c.litrosRecibidosCompania != null ? Number(c.litrosRecibidosCompania) : ltsDesp;
      const dif = c.diferenciaLitros != null ? Number(c.diferenciaLitros) : ltsDesp - ltsRec;
      const pct = c.porcentajeMerma != null ? Number(c.porcentajeMerma) : ltsDesp > 0 ? (Math.abs(dif) / ltsDesp) * 100 : 0;
      const origen = esSubTicket ? 'SUB_DESPACHO' : 'RECEPTORIA';

      return {
        ...c,
        _rowKey: `${origen}_${c.id}`,
        _origen: origen,
        _esSubTicket: esSubTicket,
        _parentTicketId: parentId,
        _tipoLabel: esSubTicket ? `SUB-TICKET #${c.id}` : 'PLANTA',
        _tipoColor: esSubTicket ? '#7e22ce' : '#9333ea',
        _tipoBg: esSubTicket ? '#f3e8ff' : '#faf5ff',
        procesoActualId: pId,
        totalLitrosFinca: ltsDesp,
        totalLitrosReceptoria: ltsRec,
        diferenciaLitros: dif,
        diferenciaReceptoria: dif,
        mermaTotalLitros: dif,
        porcentajeMerma: pct,
        nombreConductor: c.nombreUsuario || c.nombreConductor || 'Chofer',
        nombreCompaniaDestino: c.nombreCompania || 'Planta / Quesera',
        totalFincas: 0,
      };
    });

    let data = [...listRutas, ...listComp];

    // Filtros
    if (filtroOrigen) {
      if (filtroOrigen === 'RECEPTORIA') {
        data = data.filter((v) => v._origen === 'RECEPTORIA');
      } else if (filtroOrigen === 'RUTA') {
        data = data.filter((v) => v._origen === 'RUTA');
      }
    }

    if (filtroChoferId) {
      data = data.filter((v) => {
        const matchId = String(v.usuarioId || v.conductorId || '') === String(filtroChoferId);
        const matchNombre = (v.nombreConductor || '').toLowerCase().includes(String(filtroChoferId).toLowerCase());
        return matchId || matchNombre;
      });
    }

    if (filtroProceso) {
      data = data.filter((v) => Number(v.procesoActualId) === Number(filtroProceso));
    }

    return data;
  }, [viajesRutas, despachosComp, filtroOrigen, filtroChoferId, filtroProceso]);

  // Lista para la tabla principal (oculta sub-tickets que van como subfilas)
  const ticketsTablaPrincipal = useMemo(() => {
    return dataConsolidada.filter((v) => !v._esSubTicket);
  }, [dataConsolidada]);

  // Cálculos de KPIs 1:1 con app.js (L27930 - L28120)
  const kpis = useMemo(() => {
    const total = dataConsolidada.length;
    let abiertos = 0;
    let receptoria = 0;
    let entregados = 0;
    let finalizados = 0;

    let countRutas = 0;
    let ltsFincasRutas = 0;
    let ltsRecibidosRutas = 0;

    let countComp = 0;
    let ltsDespachadosComp = 0;
    let ltsRecibidosComp = 0;

    const idsRutasEnAllData = new Set(dataConsolidada.filter((v) => !v._esSubTicket).map((v) => Number(v.id)));

    dataConsolidada.forEach((v) => {
      const p = v.procesoActualId || 1;
      if (p === 1) abiertos++;
      else if (p === 2) receptoria++;
      else if (p === 3) entregados++;
      else if (p === 4) finalizados++;

      if (v._esSubTicket && v._parentTicketId && idsRutasEnAllData.has(Number(v._parentTicketId))) {
        return;
      }

      if (v._origen === 'RECEPTORIA') {
        countComp++;
        const desp = Number(v.litrosDespachados || v.totalLitrosFinca || 0);
        const rec = Number(v.litrosRecibidosCompania || v.totalLitrosReceptoria || desp);
        ltsDespachadosComp += desp;
        ltsRecibidosComp += rec;
      } else {
        countRutas++;
        const finca = Number(v.totalLitrosFinca || 0);
        const rec = Number(v.totalLitrosReceptoria || finca);
        ltsFincasRutas += finca;
        ltsRecibidosRutas += rec;
      }
    });

    let displayLtsOrigen = ltsFincasRutas;
    let displayLtsDestino = ltsRecibidosRutas;
    let displayDif = ltsRecibidosRutas - ltsFincasRutas;
    let subTotViajes = `${countRutas} Rutas · ${countComp} Despachos`;

    if (filtroOrigen === 'RECEPTORIA') {
      displayLtsOrigen = ltsDespachadosComp;
      displayLtsDestino = ltsRecibidosComp;
      displayDif = ltsRecibidosComp - ltsDespachadosComp;
      subTotViajes = `${countComp} Despachos en período`;
    } else if (filtroOrigen === 'RUTA') {
      displayLtsOrigen = ltsFincasRutas;
      displayLtsDestino = ltsRecibidosRutas;
      displayDif = ltsRecibidosRutas - ltsFincasRutas;
      subTotViajes = `${countRutas} Rutas en período`;
    }

    const absDif = Math.abs(displayDif);
    const pct = displayLtsOrigen > 0 ? ((absDif / displayLtsOrigen) * 100).toFixed(2) : '0.00';
    const efectividad = total > 0 ? ((finalizados / total) * 100).toFixed(1) : '100';

    // Días de período
    const d1 = new Date(fechaDesde);
    const d2 = new Date(fechaHasta);
    const diasPeriodo = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    return {
      total,
      diasPeriodo,
      subTotViajes,
      displayLtsOrigen,
      displayLtsDestino,
      displayDif,
      absDif,
      pct,
      abiertos,
      receptoria,
      entregados,
      enProceso: abiertos + receptoria + entregados,
      finalizados,
      efectividad,
    };
  }, [dataConsolidada, filtroOrigen, fechaDesde, fechaHasta]);

  // Rangos rápidos de fecha
  const setRangoFechas = (tipo: 7 | 30 | 'mes' | '2026') => {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    setFechaHasta(hoyStr);

    if (tipo === 7) {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFechaDesde(d.toISOString().split('T')[0]);
    } else if (tipo === 30) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setFechaDesde(d.toISOString().split('T')[0]);
    } else if (tipo === 'mes') {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      setFechaDesde(d.toISOString().split('T')[0]);
    } else if (tipo === '2026') {
      setFechaDesde('2026-01-01');
      setFechaHasta('2026-12-31');
    }
  };

  const limpiarFiltros = () => {
    setFiltroChoferId('');
    setFiltroOrigen('');
    setFiltroProceso('');
    setRangoFechas(30);
  };

  const toggleExpand = (rowKey: string) => {
    setExpandedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  // Mutación Iniciar Viaje
  const iniciarMutation = useMutation({
    mutationFn: (dto: typeof formIniciar) => operacionesApi.iniciarViaje(dto),
    onSuccess: (res) => {
      Swal.fire({
        icon: 'success',
        title: '¡Viaje Iniciado!',
        text: res.message || 'Viaje iniciado con éxito en el sistema.',
        confirmButtonColor: '#4f46e5',
      });
      queryClient.invalidateQueries({ queryKey: ['control-rutas'] });
      setModalIniciar(false);
      setFormIniciar({
        fecha: new Date().toISOString().split('T')[0],
        camionId: 0,
        choferId: 0,
        rutaLogisticaId: 0,
        rutasLogisticasIds: [],
        odometroInicialKm: 0,
        observaciones: '',
      });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Error al iniciar viaje');
    },
  });

  // Mutación Finalizar Viaje (Admin)
  const handleFinalizarAdmin = async (ticket: any) => {
    const { value: observacion, isConfirmed } = await Swal.fire({
      title: '¿Finalizar y Auditar Viaje?',
      text: `Se cerrará el ticket #${ticket.id} y se registrará el cuadre volumétrico definitivo.`,
      input: 'text',
      inputPlaceholder: 'Nota contable de cierre (opcional)...',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Finalizar Viaje',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#475569',
    });

    if (!isConfirmed) return;

    try {
      await operacionesApi.finalizarViajeAdmin(ticket.id, observacion);
      Swal.fire({
        icon: 'success',
        title: '¡Viaje Finalizado!',
        text: `El ticket #${ticket.id} ha sido auditado y cerrado contablemente.`,
        timer: 2000,
        showConfirmButton: false,
      });
      queryClient.invalidateQueries({ queryKey: ['control-rutas'] });
      queryClient.invalidateQueries({ queryKey: ['control-companias'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al finalizar viaje');
    }
  };

  // Mutación Revertir Proceso (Admin)
  const handleRevertirAdmin = async (ticket: any) => {
    const { value: formValues, isConfirmed } = await Swal.fire({
      title: `Revertir Proceso — Ticket #${ticket.id}`,
      html: `
        <div style="text-align: left; font-size: 13px; color: #334155;">
          <p style="margin-bottom: 12px; color: #64748b;">
            Al revertir el proceso se reabrirá el viaje y se permitirá agregar fincas faltantes, ajustar litros o modificar entregas.
          </p>
          <div style="margin-bottom: 14px;">
            <label style="font-weight: 700; color: #0f172a; display: block; margin-bottom: 5px;">Etapa Destino:</label>
            <select id="swalSelectProcesoDestino" class="swal2-input" style="width: 100%; margin: 0; font-size: 13px; height: 40px; border-radius: 8px;">
              <option value="1">1. En Ruta / Recolección (Permite agregar fincas y corregir litros)</option>
              <option value="2">2. Llegada a Receptoría (Descarga y pesaje en silos)</option>
              <option value="3">3. Despacho / Entrega a Compañía</option>
            </select>
          </div>
          <div>
            <label style="font-weight: 700; color: #b91c1c; display: block; margin-bottom: 5px;">Motivo o Justificación * (Obligatorio para auditoría):</label>
            <textarea id="swalTextareaMotivoReversion" class="swal2-textarea" placeholder="Ej: no se agrego una finca y falto litros..." style="width: 100%; margin: 0; height: 75px; font-size: 13px; border-radius: 8px;"></textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Revertir Proceso',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#f59e0b',
      preConfirm: () => {
        const procesoDestinoId = parseInt((document.getElementById('swalSelectProcesoDestino') as HTMLSelectElement).value, 10);
        const motivo = (document.getElementById('swalTextareaMotivoReversion') as HTMLTextAreaElement).value.trim();
        if (!motivo) {
          Swal.showValidationMessage('¡El motivo de la reversión es obligatorio para el registro de auditoría!');
          return false;
        }
        return { procesoDestinoId, motivo };
      },
    });

    if (!isConfirmed || !formValues) return;

    try {
      await operacionesApi.revertirProcesoViaje(ticket.id, formValues);
      Swal.fire({
        icon: 'success',
        title: '¡Proceso Revertido!',
        text: `El ticket #${ticket.id} ha sido revertido exitosamente. Ahora puedes agregar fincas faltantes o corregir información.`,
        timer: 2500,
        showConfirmButton: true,
      });
      queryClient.invalidateQueries({ queryKey: ['control-rutas'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al revertir proceso');
    }
  };

  // Mutación Eliminar Ticket (Admin)
  const handleEliminarAdmin = async (ticket: any) => {
    const esRuta = ticket._origen === 'RUTA';
    const desc = esRuta ? `Ticket de Ruta #${ticket.id}` : `Ticket de Salida a Quesera #${ticket.id}`;

    const res = await Swal.fire({
      icon: 'warning',
      title: `¿Eliminar ${desc}?`,
      html: `<p style="color: #64748b; font-size: 13.5px;">Esta acción como <strong>ADMINISTRADOR</strong> eliminará permanentemente el ticket y sus registros vinculados.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, Eliminar Definitivamente',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
    });

    if (!res.isConfirmed) return;

    try {
      if (esRuta) {
        await operacionesApi.eliminarControl(ticket.id);
      } else {
        await operacionesApi.eliminarDespachoCompania(ticket.id);
      }
      toast.success(`${desc} eliminado correctamente.`);
      queryClient.invalidateQueries({ queryKey: ['control-rutas'] });
      queryClient.invalidateQueries({ queryKey: ['control-companias'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al eliminar ticket');
    }
  };

  // Imprimir Bitácora
  const handleImprimirBitacora = () => {
    window.print();
  };

  // Imprimir Comprobante Individual
  const handleImprimirComprobante = (ticket: any) => {
    const printWindow = window.open('', '_blank', 'width=800,height=750');
    if (!printWindow) return;

    const fechaStr = (ticket.fecha || '').split('T')[0];
    const ltsFinca = Number(ticket.totalLitrosFinca || ticket.litrosDespachados || 0);
    const ltsRec = Number(ticket.totalLitrosReceptoria || ticket.litrosRecibidosReceptoria || ticket.litrosRecibidosCompania || ltsFinca);
    const dif = Number(ticket.diferenciaLitros || 0);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Comprobante de Viaje #${ticket.id}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 25px; color: #1e293b; font-size: 12px; }
          .ticket-box { border: 2px solid #334155; border-radius: 8px; padding: 20px; max-width: 650px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 14px; margin-bottom: 14px; }
          .title { font-size: 20px; font-weight: bold; color: #1e1b4b; margin: 0; }
          .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px; font-size: 12px; }
          .metric-box { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-top: 14px; }
        </style>
      </head>
      <body>
        <div class="ticket-box">
          <div class="header">
            <h2 class="title">COMPROBANTE DE CONTROL LOGÍSTICO DE VIAJE</h2>
            <div style="font-size: 14px; font-weight: bold; color: #4338ca; margin-top: 4px;">TICKET #${ticket.id} (${ticket._origen || 'RUTA'})</div>
            <div style="color: #64748b; font-size: 11px;">Rutas de Leche &bull; Sistema Transporte V2</div>
          </div>
          <div class="grid-info">
            <div><strong>Fecha:</strong> ${fechaStr}</div>
            <div><strong>Semana:</strong> S${ticket.cicloId || '-'}</div>
            <div><strong>Conductor:</strong> ${ticket.nombreConductor || '-'}</div>
            <div><strong>Destino:</strong> ${ticket.nombreCompaniaDestino || 'Receptoría'}</div>
            <div><strong>Fincas:</strong> ${ticket.totalFincas || 0}</div>
            <div><strong>Estado:</strong> ${ticket.estado || 'FINALIZADO'}</div>
          </div>
          <div class="metric-box">
            <div>
              <div style="font-size: 11px; color: #64748b;">VOLUMEN ORIGEN</div>
              <div style="font-size: 16px; font-weight: bold; color: #0284c7;">${ltsFinca.toLocaleString('es-VE')} L</div>
            </div>
            <div>
              <div style="font-size: 11px; color: #64748b;">VOLUMEN RECIBIDO</div>
              <div style="font-size: 16px; font-weight: bold; color: #0f172a;">${ltsRec.toLocaleString('es-VE')} L</div>
            </div>
            <div>
              <div style="font-size: 11px; color: #64748b;">DIFERENCIA / MERMA</div>
              <div style="font-size: 16px; font-weight: bold; color: ${dif > 0 ? '#dc2626' : '#15803d'};">
                ${dif > 0 ? `-${dif.toLocaleString('es-VE')}` : `+${Math.abs(dif).toLocaleString('es-VE')}`} L
              </div>
            </div>
          </div>
          ${ticket.observacion ? `<div style="margin-top: 14px; font-size: 11.5px; color: #64748b;"><strong>Observaciones:</strong> ${ticket.observacion}</div>` : ''}
          <div style="margin-top: 45px; display: flex; justify-content: space-between; text-align: center; font-size: 11px;">
            <div style="border-top: 1px solid #333; width: 180px; padding-top: 4px;">Firma Conductor</div>
            <div style="border-top: 1px solid #333; width: 180px; padding-top: 4px;">Firma Receptor / Auditor</div>
          </div>
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Abrir modal de edición
  const handleAbrirEditar = (ticket: any) => {
    setTicketParaEditar({
      ...ticket,
      fechaEdit: (ticket.fecha || '').split('T')[0],
      choferEditId: ticket.usuarioId || ticket.conductorId || 0,
      estadoEdit: ticket.estado || 'ABIERTO',
      litrosRecibidosEdit: ticket.litrosRecibidosReceptoria != null ? ticket.litrosRecibidosReceptoria : (ticket.totalLitrosReceptoria || ticket.totalLitrosFinca || 0),
      observacionEdit: ticket.observacion || '',
    });
    setModalEditar(true);
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketParaEditar) return;

    try {
      const payload: any = {
        fecha: ticketParaEditar.fechaEdit,
        usuarioId: Number(ticketParaEditar.choferEditId),
        estado: ticketParaEditar.estadoEdit,
        procesoActualId: ticketParaEditar.estadoEdit === 'ABIERTO' ? 1 : ticketParaEditar.estadoEdit === 'FINALIZADO' ? 4 : 2,
        observacion: ticketParaEditar.observacionEdit,
        litrosRecibidosReceptoria: Number(ticketParaEditar.litrosRecibidosEdit),
        totalLitrosReceptoria: Number(ticketParaEditar.litrosRecibidosEdit),
      };

      if (ticketParaEditar._origen === 'RUTA') {
        await operacionesApi.editarControl(ticketParaEditar.id, payload);
      } else {
        await operacionesApi.actualizarDespachoCompania(ticketParaEditar.id, payload);
      }

      toast.success(`Ticket #${ticketParaEditar.id} actualizado exitosamente`);
      setModalEditar(false);
      queryClient.invalidateQueries({ queryKey: ['control-rutas'] });
      queryClient.invalidateQueries({ queryKey: ['control-companias'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al actualizar ticket');
    }
  };

  // Abrir modal de trazabilidad
  const handleAbrirTrazabilidad = (ticket: any) => {
    setTicketTrazabilidad(ticket);
    setTabTrazabilidad(ticket._origen === 'RUTA' ? 'fincas' : 'despacho');
    setModalTrazabilidad(true);
  };

  // Abrir modal editar finca
  const handleAbrirEditarFinca = (finca: any) => {
    setFincaParaEditar(finca);
    setFormEditarFinca({
      fincaId: finca.fincaId || finca.FincaId || 0,
      litros: Number(finca.litros || finca.Litros || 0),
      esAcida: Boolean(finca.esAcida),
      esDiferido: Boolean(finca.esDiferido || finca.EsDiferido),
      tipoLeche: (finca.tipoLeche || finca.TipoLeche || 'VACA').toUpperCase(),
      observacion: finca.observacion || '',
      motivo: '',
    });
    setModalEditarFincaAuditada(true);
  };

  // Guardar edición de finca auditada
  const handleGuardarEditarFinca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTrazabilidad || !fincaParaEditar) return;
    if (!formEditarFinca.motivo.trim()) {
      toast.error('El motivo o justificación del cambio es obligatorio');
      return;
    }
    try {
      await operacionesApi.editarFincaViajeAuditado(
        ticketTrazabilidad.id,
        fincaParaEditar.id || fincaParaEditar.Id,
        formEditarFinca
      );
      toast.success('Finca modificada exitosamente con registro en bitácora.');
      setModalEditarFincaAuditada(false);
      recargarTrazabilidad();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al modificar finca');
    }
  };

  // Abrir modal editar entrega
  const handleAbrirEditarEntrega = (entrega: any) => {
    setEntregaParaEditar(entrega);
    setFormEditarEntrega({
      companiaId: entrega.companiaId || entrega.CompaniaId || 0,
      litros: Math.abs(Number(entrega.litros || entrega.Litros || 0)),
      observacion: entrega.observacion || '',
      motivo: '',
    });
    setModalEditarEntregaAuditada(true);
  };

  // Guardar edición de entrega auditada
  const handleGuardarEditarEntrega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTrazabilidad || !entregaParaEditar) return;
    if (!formEditarEntrega.motivo.trim()) {
      toast.error('El motivo o justificación del cambio es obligatorio');
      return;
    }
    try {
      await operacionesApi.editarEntregaViajeAuditado(
        ticketTrazabilidad.id,
        entregaParaEditar.id || entregaParaEditar.Id,
        formEditarEntrega
      );
      toast.success('Entrega modificada exitosamente con registro en bitácora.');
      setModalEditarEntregaAuditada(false);
      recargarTrazabilidad();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al modificar entrega');
    }
  };

  // Eliminar finca auditada
  const handleEliminarFinca = async (rutaId: number, fincaNombre: string) => {
    if (!ticketTrazabilidad) return;
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: '¿Eliminar Finca del Viaje?',
      text: `Se desvinculará la recolección de "${fincaNombre || 'la finca'}" del ticket #${ticketTrazabilidad.id}. Indique la justificación obligatoria:`,
      input: 'textarea',
      inputPlaceholder: 'Motivo o justificación de eliminación...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, Eliminar de Viaje',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return '¡El motivo de la eliminación es obligatorio!';
        }
      },
    });

    if (!isConfirmed || !motivo) return;

    try {
      await operacionesApi.eliminarFincaViajeAuditado(ticketTrazabilidad.id, rutaId, motivo.trim());
      Swal.fire({
        icon: 'success',
        title: 'Finca Eliminada del Viaje',
        text: 'La recolección ha sido desvinculada y registrada en la bitácora.',
        timer: 2000,
        showConfirmButton: false,
      });
      recargarTrazabilidad();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al eliminar finca del viaje');
    }
  };

  // Revertir proceso de viaje
  const handleRevertirProceso = async () => {
    if (!ticketTrazabilidad) return;
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: '¿Revertir Proceso del Viaje?',
      text: `Se regresará el ticket #${ticketTrazabilidad.id} a la etapa anterior para corrección de datos. Indique el motivo obligatorio:`,
      input: 'textarea',
      inputPlaceholder: 'Motivo de reversión contable/operativa...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, Revertir Etapa',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      inputValidator: (v) => (!v || !v.trim() ? 'El motivo es obligatorio' : undefined),
    });

    if (!isConfirmed || !motivo) return;

    try {
      const targetProcesoId = Math.max(1, (ticketTrazabilidad.procesoActualId || 2) - 1);
      await operacionesApi.revertirProcesoViaje(ticketTrazabilidad.id, {
        procesoDestinoId: targetProcesoId,
        motivo: motivo.trim(),
      });
      toast.success('Proceso del viaje revertido exitosamente.');
      setModalTrazabilidad(false);
      queryClient.invalidateQueries({ queryKey: ['control-rutas'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al revertir proceso');
    }
  };

  // Finalizar viaje auditado
  const handleFinalizarViaje = async () => {
    if (!ticketTrazabilidad) return;
    const { value: observacion, isConfirmed } = await Swal.fire({
      title: '¿Finalizar y Auditar Viaje?',
      text: `Se cerrará el ticket #${ticketTrazabilidad.id} y se registrará el cuadre definitivo.`,
      input: 'text',
      inputPlaceholder: 'Nota contable de cierre (opcional)...',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Finalizar Viaje',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
    });

    if (!isConfirmed) return;

    try {
      await operacionesApi.finalizarViajeAdmin(ticketTrazabilidad.id, observacion || undefined);
      toast.success('Viaje finalizado y auditado exitosamente.');
      setModalTrazabilidad(false);
      queryClient.invalidateQueries({ queryKey: ['control-rutas'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al finalizar viaje');
    }
  };

  // Columnas de la DataTable 1:1 con la bitácora de V2_3_11_26
  const columns: ColumnDef<any>[] = [
    {
      header: '',
      width: '38px',
      cell: (row) => {
        const isExp = expandedRowKeys.has(row._rowKey);
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(row._rowKey);
            }}
            className="w-6 h-6 rounded flex items-center justify-center border border-slate-300 text-slate-500 hover:bg-slate-100"
            title={isExp ? 'Ocultar desglose' : 'Ver desglose'}
          >
            {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        );
      },
    },
    {
      header: 'TICKET #',
      accessorKey: 'id',
      sortable: true,
      cell: (row) => {
        const esRuta = row._origen === 'RUTA';
        return (
          <div className="flex items-center gap-1.5 font-mono font-bold text-xs">
            <span style={{ color: esRuta ? '#4338ca' : '#9333ea' }}>#{row.id}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-extrabold"
              style={{
                backgroundColor: row._tipoBg,
                color: row._tipoColor,
              }}
            >
              {row._tipoLabel}
            </span>
          </div>
        );
      },
    },
    {
      header: 'FECHA',
      accessorKey: 'fecha',
      sortable: true,
      cell: (row) => (
        <span className="text-xs text-slate-700 font-medium">
          {(row.fecha || '').split('T')[0]}
        </span>
      ),
    },
    {
      header: 'SEMANA',
      accessorKey: 'cicloId',
      sortable: true,
      className: 'text-center',
      cell: (row) => (
        <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold px-2 py-0.5 rounded">
          S{row.cicloId || '-'}
        </span>
      ),
    },
    {
      header: 'CONDUCTOR',
      accessorKey: 'nombreConductor',
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
            {(row.nombreConductor || 'C').charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-bold text-slate-800">{row.nombreConductor || '-'}</span>
        </div>
      ),
    },
    {
      header: 'FINCAS',
      accessorKey: 'totalFincas',
      sortable: true,
      className: 'text-center',
      cell: (row) => (
        <span className="inline-block bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold px-2 py-0.5 rounded">
          {row.totalFincas || 0}
        </span>
      ),
    },
    {
      header: 'LTS FINCA',
      accessorKey: 'totalLitrosFinca',
      sortable: true,
      className: 'text-right',
      cell: (row) => (
        <span className="font-mono font-bold text-xs text-blue-700">
          {(row.totalLitrosFinca || 0).toLocaleString()} L
        </span>
      ),
    },
    {
      header: 'DESTINO',
      accessorKey: 'nombreCompaniaDestino',
      sortable: true,
      cell: (row) => (
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded border inline-block"
          style={{
            backgroundColor: row._origen === 'RECEPTORIA' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(2, 132, 199, 0.1)',
            color: row._origen === 'RECEPTORIA' ? '#7e22ce' : '#0284c7',
            borderColor: row._origen === 'RECEPTORIA' ? 'rgba(147, 51, 234, 0.3)' : 'rgba(2, 132, 199, 0.3)',
          }}
        >
          {row.nombreCompaniaDestino || 'Receptoría'}
        </span>
      ),
    },
    {
      header: 'LTS REC.',
      accessorKey: 'totalLitrosReceptoria',
      sortable: true,
      className: 'text-right',
      cell: (row) => (
        <span className="font-mono font-semibold text-xs text-slate-700">
          {(row.totalLitrosReceptoria || 0).toLocaleString()} L
        </span>
      ),
    },
    {
      header: 'DIFERENCIA',
      accessorKey: 'diferenciaLitros',
      sortable: true,
      className: 'text-right',
      cell: (row) => {
        const dif = Number(row.diferenciaLitros || 0);
        return (
          <span
            className={`font-mono font-bold text-xs ${
              dif < 0 ? 'text-red-600' : dif > 0 ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {dif !== 0 ? (dif > 0 ? `+${dif.toLocaleString()}` : dif.toLocaleString()) : '0 L'}
          </span>
        );
      },
    },
    {
      header: '% MERMA',
      accessorKey: 'porcentajeMerma',
      sortable: true,
      className: 'text-center',
      cell: (row) => {
        const pct = Number(row.porcentajeMerma || 0);
        const esPerdida = Number(row.diferenciaLitros || 0) < 0;
        return (
          <span
            className={`text-[10.5px] font-bold px-2 py-0.5 rounded border ${
              esPerdida && pct > 1.0
                ? 'bg-red-50 text-red-700 border-red-200'
                : esPerdida
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {esPerdida ? `-${pct.toFixed(2)}%` : `+${pct.toFixed(2)}%`}
          </span>
        );
      },
    },
    {
      header: 'MERMA TOTAL',
      accessorKey: 'mermaTotalLitros',
      sortable: true,
      className: 'text-right',
      cell: (row) => {
        const merma = Number(row.mermaTotalLitros || row.diferenciaLitros || 0);
        return (
          <span
            className={`font-mono font-extrabold text-xs ${
              merma < 0 ? 'text-red-600' : merma > 0 ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {merma < 0 ? `${merma.toLocaleString()} L` : merma > 0 ? `+${merma.toLocaleString()} L` : '0 L'}
          </span>
        );
      },
    },
    {
      header: 'ESTADO',
      accessorKey: 'procesoActualId',
      sortable: true,
      className: 'text-center',
      cell: (row) => {
        const pId = row.procesoActualId || 1;
        if (pId === 1) {
          return (
            <span className="badge bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px] px-2 py-0.5 rounded-full">
              1: En Ruta
            </span>
          );
        } else if (pId === 2) {
          return (
            <span className="badge bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[11px] px-2 py-0.5 rounded-full">
              2: Recibido
            </span>
          );
        } else if (pId === 3) {
          return (
            <span className="badge bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[11px] px-2 py-0.5 rounded-full">
              3: En Quesera
            </span>
          );
        }
        return (
          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px] px-2 py-0.5 rounded-full">
            4: Finalizado
          </span>
        );
      },
    },
    {
      header: 'ACCIONES',
      className: 'text-center',
      cell: (row) => {
        const esAdmin = isAdmin || (user?.rol || '').toUpperCase().includes('ADMIN');
        const pId = row.procesoActualId || 1;
        const esRuta = row._origen === 'RUTA';

        return (
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => handleAbrirEditar(row)}
              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded border border-amber-200 transition-colors"
              title={`Editar Ticket #${row.id}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleAbrirTrazabilidad(row)}
              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200 transition-colors"
              title="Ver Trazabilidad y Auditoría"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleImprimirComprobante(row)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition-colors"
              title="Imprimir Comprobante de Viaje"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>

            {esAdmin && pId !== 4 && esRuta && (
              <button
                type="button"
                onClick={() => handleFinalizarAdmin(row)}
                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-200 transition-colors"
                title="Finalizar y Auditar Viaje"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            )}

            {esAdmin && esRuta && (
              <button
                type="button"
                onClick={() => handleRevertirAdmin(row)}
                className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded border border-indigo-200 transition-colors"
                title="Revertir / Reabrir Proceso de Viaje"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {esAdmin && (
              <button
                type="button"
                onClick={() => handleEliminarAdmin(row)}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
                title="Eliminar Ticket"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  // Sub-fila expandida con fincas y sub-despachos asociados
  const renderSubRow = (row: any) => {
    const subDespachos = dataConsolidada.filter((x) => x._esSubTicket && Number(x._parentTicketId) === Number(row.id));

    return (
      <div className="p-4 bg-slate-50 border-y border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-cow text-blue-600 text-sm"></i>
            <span className="text-xs font-bold text-slate-800">
              Desglose de Fincas y Trazabilidad — Ticket #{row.id}
            </span>
            <span className="text-xs text-gray-500">
              (Fecha: {(row.fecha || '').split('T')[0]} | Conductor: {row.nombreConductor})
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleAbrirTrazabilidad(row)}
            className="btn btn-sm text-xs font-bold h-7 px-2.5 bg-white border border-slate-300 text-indigo-600 rounded hover:bg-indigo-50"
          >
            Ver Historial Completo
          </button>
        </div>

        {row.observacion && (
          <div className="p-2.5 bg-white border-l-4 border-indigo-600 rounded text-xs text-slate-600">
            <strong>Observaciones:</strong> {row.observacion}
          </div>
        )}

        {/* Sub-despachos asociados si existen */}
        {subDespachos.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-dashed border-slate-300">
            <span className="text-xs font-bold text-purple-800 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-purple-600" />
              Sub-Despachos a Queseras ({subDespachos.length}):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {subDespachos.map((st) => (
                <div
                  key={st.id}
                  className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold text-purple-900 block">Sub #{st.id} — {st.nombreCompaniaDestino}</span>
                    <span className="text-gray-500 text-[11px]">
                      Despacho: {Number(st.totalLitrosFinca).toLocaleString()} L &rarr; Recibido: {Number(st.totalLitrosReceptoria).toLocaleString()} L
                    </span>
                  </div>
                  <span className="font-mono font-bold text-purple-700">
                    {st.diferenciaLitros} L
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Footer con sumatorias de la vista
  const renderFooter = (filtered: any[]) => {
    let sumFincas = 0;
    let sumLtsFinca = 0;
    let sumLtsRec = 0;
    let sumDif = 0;
    let sumMerma = 0;

    filtered.forEach((v) => {
      sumFincas += v.totalFincas || 0;
      sumLtsFinca += v.totalLitrosFinca || 0;
      sumLtsRec += v.totalLitrosReceptoria || 0;
      sumDif += v.diferenciaLitros || 0;
      sumMerma += v.mermaTotalLitros || 0;
    });

    const pctMerma = sumLtsFinca > 0 ? ((Math.abs(sumMerma) / sumLtsFinca) * 100).toFixed(2) : '0.00';

    return (
      <tr>
        <td colSpan={5} className="text-right uppercase tracking-wider text-xs p-3">
          Totales del Período Filtrado ({filtered.length} viajes):
        </td>
        <td className="text-center p-3">{sumFincas.toLocaleString()}</td>
        <td className="text-right p-3 text-blue-700 font-mono">{sumLtsFinca.toLocaleString()} L</td>
        <td className="text-center p-3">-</td>
        <td className="text-right p-3 text-slate-800 font-mono">{sumLtsRec.toLocaleString()} L</td>
        <td className={`text-right p-3 font-mono ${sumDif < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {sumDif < 0 ? `${sumDif.toLocaleString()} L` : `+${sumDif.toLocaleString()} L`}
        </td>
        <td className="text-center p-3 text-xs">{pctMerma}%</td>
        <td className={`text-right p-3 font-mono ${sumMerma < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {sumMerma < 0 ? `${sumMerma.toLocaleString()} L` : `+${sumMerma.toLocaleString()} L`}
        </td>
        <td colSpan={2} className="text-center p-3 text-emerald-700 font-bold">
          Auditado
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. VIEW HEADER 1:1 CON V2_3_11_26 */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-indigo-600" />
              Control Logístico de Viajes y Tickets
            </h1>
            <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
              Sistema V2
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Monitoreo en tiempo real del ciclo de vida de recolección, recepción, destino y liquidación volumétrica
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(isAdmin || (user?.rol || '').toUpperCase().includes('ADMIN')) && (
            <button
              type="button"
              onClick={() => setModalAuditoriaGlobal(true)}
              className="btn btn-outline text-xs font-bold h-9 px-3.5 flex items-center gap-1.5 border border-purple-300 rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 shadow-xs"
              title="Ver bitácora global de auditoría de todas las modificaciones y creaciones del sistema"
            >
              <ShieldAlert className="w-4 h-4 text-purple-600" /> Auditoría Global
            </button>
          )}

          <button
            type="button"
            onClick={handleImprimirBitacora}
            className="btn btn-outline text-xs font-bold h-9 px-3 flex items-center gap-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4 text-indigo-600" /> Imprimir
          </button>

          <button
            type="button"
            onClick={() => setModalIniciar(true)}
            className="btn text-xs font-bold h-9 px-4 flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-lg shadow-sm"
          >
            <PlusCircle className="w-4 h-4" /> Iniciar Nuevo Viaje
          </button>

          <button
            type="button"
            onClick={() => {
              refetchRutas();
              refetchComp();
            }}
            className="btn btn-outline text-xs font-bold h-9 px-3 flex items-center gap-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoadingRutas || isLoadingComp ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {/* 2. TARJETAS KPI REDISEÑADAS CON GLASSMORPHISM (6 TARJETAS EXACTAS DE V2_3_11_26) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* TOTAL VIAJES */}
        <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-blue-900 uppercase">TOTAL VIAJES</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <TicketIcon className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-slate-900">{kpis.total}</h3>
          <span className="text-[11px] font-semibold text-blue-600 mt-1 block">
            {kpis.diasPeriodo} días en período
          </span>
        </div>

        {/* VOLUMEN FINCAS */}
        <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/50 border border-emerald-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-emerald-900 uppercase">VOLUMEN FINCAS</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <i className="fa-solid fa-cow text-sm"></i>
            </div>
          </div>
          <h3 className="text-2xl font-black text-emerald-700">{kpis.displayLtsOrigen.toLocaleString()} L</h3>
          <span className="text-[11px] font-semibold text-emerald-600 mt-1 block">
            Recolectado en ruta
          </span>
        </div>

        {/* VOLUMEN RECIBIDO */}
        <div className="bg-gradient-to-br from-cyan-50/70 to-sky-50/50 border border-cyan-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-cyan-900 uppercase">VOLUMEN RECIBIDO</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center">
              <Warehouse className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-cyan-700">{kpis.displayLtsDestino.toLocaleString()} L</h3>
          <span className="text-[11px] font-semibold text-cyan-600 mt-1 block">
            En Receptoría / Planta
          </span>
        </div>

        {/* MERMA GLOBAL */}
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-amber-900 uppercase">MERMA GLOBAL</span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-amber-600">
            {kpis.displayDif < 0 ? `-${kpis.absDif.toLocaleString()} L` : `+${kpis.absDif.toLocaleString()} L`}
          </h3>
          <span className="text-[11px] font-bold text-amber-600 mt-1 block">
            {kpis.pct}% del volumen
          </span>
        </div>

        {/* EN PROCESO */}
        <div className="bg-gradient-to-br from-amber-50/70 to-yellow-50/50 border border-amber-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-amber-900 uppercase">EN PROCESO</span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-amber-600">{kpis.enProceso}</h3>
          <span className="text-[10px] font-semibold text-amber-700 mt-1 block">
            {kpis.abiertos} Ruta | {kpis.receptoria} Rec. | {kpis.entregados} Dest.
          </span>
        </div>

        {/* FINALIZADOS */}
        <div className="bg-gradient-to-br from-emerald-50/70 to-green-50/50 border border-emerald-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-emerald-900 uppercase">FINALIZADOS</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-emerald-600">{kpis.finalizados}</h3>
          <span className="text-[11px] font-semibold text-emerald-600 mt-1 block">
            {kpis.efectividad}% completados
          </span>
        </div>
      </div>

      {/* 3. CONTENEDOR DATATABLE PROFESIONAL */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* HEADER BANNER */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-indigo-300 text-lg">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold tracking-wide uppercase">
                Bitácora General de Viajes y Trazabilidad
              </h3>
              <p className="text-xs text-slate-300">
                Historial consolidado con búsqueda, ordenamiento y paginación en tiempo real
              </p>
            </div>
          </div>

          <span className="bg-slate-800/80 border border-white/20 px-3 py-1 rounded-lg text-xs font-semibold">
            Total Registros: <strong className="text-cyan-400 font-mono">{ticketsTablaPrincipal.length}</strong>
          </span>
        </div>

        {/* BARRA DE FILTROS RÁPIDOS Y RANGO DE FECHAS */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="font-bold text-slate-500 uppercase mr-1">Período rápido:</span>
              <button
                type="button"
                onClick={() => setRangoFechas(7)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-50"
              >
                Últimos 7 días
              </button>
              <button
                type="button"
                onClick={() => setRangoFechas(30)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-50"
              >
                Últimos 30 días
              </button>
              <button
                type="button"
                onClick={() => setRangoFechas('mes')}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-50"
              >
                Este Mes
              </button>
              <button
                type="button"
                onClick={() => setRangoFechas('2026')}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-50"
              >
                Todo 2026
              </button>
            </div>

            <button
              type="button"
              onClick={limpiarFiltros}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 bg-white border border-slate-300 px-2.5 py-1 rounded"
            >
              <FilterX className="w-3.5 h-3.5" /> Limpiar Filtros
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-600 uppercase mb-1">Fecha Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="form-input w-full h-9 rounded-lg border border-slate-300 px-2 font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 uppercase mb-1">Fecha Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="form-input w-full h-9 rounded-lg border border-slate-300 px-2 font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 uppercase mb-1">Conductor</label>
              <SearchableSelect
                options={[
                  { value: '', label: 'TODOS LOS CONDUCTORES' },
                  ...choferes.map((c: any) => ({
                    value: String(c.id || c.usuarioId),
                    label: c.nombreCompleto || c.nombre || `Chofer #${c.id}`,
                  })),
                ]}
                value={filtroChoferId}
                onChange={(val) => setFiltroChoferId(String(val || ''))}
                placeholder="TODOS LOS CONDUCTORES"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 uppercase mb-1">Origen / Módulo</label>
              <select
                value={filtroOrigen}
                onChange={(e) => setFiltroOrigen(e.target.value)}
                className="form-select w-full h-9 rounded-lg border border-slate-300 px-2 font-bold text-slate-800 bg-white"
              >
                <option value="">-- Todos los Orígenes --</option>
                <option value="RUTA">🚚 Rutas / Recolecciones</option>
                <option value="RECEPTORIA">🏢 Receptorías / Despachos Salidas</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-600 uppercase mb-1">Estado / Proceso</label>
              <select
                value={filtroProceso}
                onChange={(e) => setFiltroProceso(e.target.value)}
                className="form-select w-full h-9 rounded-lg border border-slate-300 px-2 font-bold text-slate-800 bg-white"
              >
                <option value="">-- Todos los Estados --</option>
                <option value="1">1: Abierto (Chofer en ruta)</option>
                <option value="2">2: Recibido (En Receptoría)</option>
                <option value="3">3: Entregado (En Quesera / Camino)</option>
                <option value="4">4: Finalizado (Auditado)</option>
              </select>
            </div>
          </div>
        </div>

        {/* TABLA PRINCIPAL MEDIANTE <DataTable /> REGLA 2 */}
        <DataTable
          data={ticketsTablaPrincipal}
          columns={columns}
          isLoading={isLoadingRutas || isLoadingComp}
          searchPlaceholder="Buscar ticket, conductor, destino..."
          exportFileName={`Bitacora_Control_Viajes_${fechaDesde}_al_${fechaHasta}`}
          pageSizeDefault={25}
          isRowExpanded={(row) => expandedRowKeys.has(row._rowKey)}
          renderSubRow={renderSubRow}
          footerContent={renderFooter}
        />
      </div>

      {/* 4. MODAL INICIAR NUEVO VIAJE DIRECTO */}
      {modalIniciar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                Iniciar Nuevo Viaje / Ticket
              </h3>
              <button
                type="button"
                onClick={() => setModalIniciar(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formIniciar.camionId || !formIniciar.choferId) {
                  toast.error('Debe seleccionar camión y conductor');
                  return;
                }
                iniciarMutation.mutate({
                  ...formIniciar,
                  rutaLogisticaId: formIniciar.rutasLogisticasIds[0] || formIniciar.rutaLogisticaId || 0,
                });
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">Fecha de Operación *</label>
                <input
                  type="date"
                  value={formIniciar.fecha}
                  onChange={(e) => setFormIniciar({ ...formIniciar, fecha: e.target.value })}
                  className="form-input w-full h-9 rounded-lg border border-slate-300 px-2 font-bold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Unidad Cisterna *</label>
                <CamionSelect
                  value={formIniciar.camionId || undefined}
                  onChange={(val, camion) => {
                    const num = Number(val || 0);
                    setFormIniciar((prev) => ({
                      ...prev,
                      camionId: num,
                      choferId: camion?.usuarioId || prev.choferId,
                    }));
                  }}
                  placeholder="-- Seleccionar Unidad Cisterna --"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Conductor Asignado *</label>
                <ChoferSelect
                  value={formIniciar.choferId || undefined}
                  onChange={(val) => setFormIniciar((prev) => ({ ...prev, choferId: Number(val || 0) }))}
                  placeholder="-- Seleccionar Chofer --"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Rutas Logísticas (Múltiple Selección)
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 space-y-1.5">
                  {rutasLogistica.map((r) => {
                    const isChecked = formIniciar.rutasLogisticasIds.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer text-xs ${
                          isChecked ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormIniciar((p) => ({
                                  ...p,
                                  rutasLogisticasIds: [...p.rutasLogisticasIds, r.id],
                                }));
                              } else {
                                setFormIniciar((p) => ({
                                  ...p,
                                  rutasLogisticasIds: p.rutasLogisticasIds.filter((id) => id !== r.id),
                                }));
                              }
                            }}
                            className="rounded text-indigo-600"
                          />
                          <span className="font-bold text-slate-800">{r.nombre}</span>
                        </div>
                        <span className="text-gray-500 text-[11px]">
                          {r.totalFincas || 0} fincas &bull; ~{((r.totalFincas || 0) * 300).toLocaleString()} L
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Odómetro Inicial (Km)</label>
                <input
                  type="number"
                  value={formIniciar.odometroInicialKm || ''}
                  onChange={(e) => setFormIniciar({ ...formIniciar, odometroInicialKm: Number(e.target.value) })}
                  placeholder="Ej: 145000"
                  className="form-input w-full h-9 rounded-lg border border-slate-300 px-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observaciones</label>
                <input
                  type="text"
                  value={formIniciar.observaciones}
                  onChange={(e) => setFormIniciar({ ...formIniciar, observaciones: e.target.value })}
                  placeholder="Instrucciones del viaje..."
                  className="form-input w-full h-9 rounded-lg border border-slate-300 px-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalIniciar(false)}
                  className="btn btn-outline h-9 px-4 rounded-lg text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={iniciarMutation.isPending}
                  className="btn h-9 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg"
                >
                  {iniciarMutation.isPending ? 'Iniciando...' : 'Iniciar Viaje'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL EDITAR TICKET POR ADMIN 1:1 CON V2_3_11_26 */}
      {modalEditar && ticketParaEditar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            padding: '20px 16px',
            overflowY: 'auto',
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-xl p-6 space-y-4 my-auto"
            style={{ position: 'relative', maxHeight: '92vh', overflowY: 'auto' }}
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284c7',
                    fontSize: '15px',
                  }}
                >
                  <i className="fa-solid fa-pen-to-square"></i>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 m-0">
                  Editar Ticket de {ticketParaEditar._origen === 'SALIDAS' ? 'Salida' : 'Ruta'} #{ticketParaEditar.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalEditar(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl transition-colors cursor-pointer"
                title="Cerrar ventana"
              >
                &times;
              </button>
            </div>

            {/* Cabecera Informativa 1:1 con V2_3_11_26 */}
            <div
              style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '1.5px solid #bae6fd',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#0284c7',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  flexShrink: 0,
                  boxShadow: '0 4px 10px rgba(2, 132, 199, 0.3)',
                }}
              >
                <i className={`fa-solid ${ticketParaEditar._origen === 'SALIDAS' ? 'fa-truck-fast' : 'fa-route'}`}></i>
              </div>
              <div style={{ fontSize: '12.5px', color: '#0369a1', lineHeight: '1.4', fontWeight: 500 }}>
                Edición de parámetros del <strong>Ticket #{ticketParaEditar.id} ({ticketParaEditar._origen || 'RUTA'})</strong>.<br />
                Litros Recolectados en Fincas / Origen: <strong style={{ fontSize: '14px', color: '#0284c7' }}>{Number(ticketParaEditar.totalLitrosFinca || 0).toLocaleString()} Lts</strong>.
              </div>
            </div>

            <form onSubmit={handleGuardarEdicion} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-xs">
                    <i className="fa-solid fa-calendar-day text-sky-600 mr-1.5"></i> FECHA *
                  </label>
                  <input
                    type="date"
                    value={ticketParaEditar.fechaEdit}
                    onChange={(e) => setTicketParaEditar({ ...ticketParaEditar, fechaEdit: e.target.value })}
                    className="form-input w-full h-10 rounded-lg border border-slate-300 px-3 font-semibold text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-xs">
                    <i className="fa-solid fa-signal text-sky-600 mr-1.5"></i> ESTADO *
                  </label>
                  <select
                    value={ticketParaEditar.estadoEdit}
                    onChange={(e) => setTicketParaEditar({ ...ticketParaEditar, estadoEdit: e.target.value })}
                    className="form-select w-full h-10 rounded-lg border border-slate-300 px-3 font-bold bg-white text-sm text-slate-800"
                  >
                    <option value="ABIERTO">1: EN RUTA (ABIERTO)</option>
                    <option value="RECEPCIONADO">2: RECEPCIONADO</option>
                    <option value="CAMINO A COMPAÑIA">3: EN QUESERA / ENTREGADO</option>
                    <option value="FINALIZADO">4: FINALIZADO</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 text-xs">
                  <i className="fa-solid fa-user-gear text-sky-600 mr-1.5"></i> CONDUCTOR RESPONSABLE *
                </label>
                <ChoferSelect
                  value={ticketParaEditar.choferEditId || undefined}
                  onChange={(val) => setTicketParaEditar({ ...ticketParaEditar, choferEditId: Number(val || 0) })}
                  placeholder="-- Buscar conductor asignado... --"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-xs">
                    <i className="fa-solid fa-cow text-sky-600 mr-1.5"></i> LITROS EN FINCAS / ORIGEN
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`${Number(ticketParaEditar.totalLitrosFinca || 0).toLocaleString()} Lts`}
                    className="form-input w-full h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 font-bold text-slate-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-xs">
                    <i className="fa-solid fa-warehouse text-sky-600 mr-1.5"></i> RECIBIDO EN RECEPTORÍA
                  </label>
                  <input
                    type="number"
                    value={ticketParaEditar.litrosRecibidosEdit || ''}
                    onChange={(e) => setTicketParaEditar({ ...ticketParaEditar, litrosRecibidosEdit: Number(e.target.value) })}
                    placeholder="Sin pesaje aún"
                    className="form-input w-full h-10 rounded-lg border border-slate-300 px-3 font-extrabold text-slate-900 text-sm"
                  />
                </div>
              </div>

              {/* Box de Variación / Merma en tiempo real 1:1 */}
              {(() => {
                const ltsFincas = Number(ticketParaEditar.totalLitrosFinca || 0);
                const ltsRecep = Number(ticketParaEditar.litrosRecibidosEdit || 0);
                const dif = ltsRecep > 0 ? (ltsRecep - ltsFincas) : 0;
                const difPct = ltsFincas > 0 && ltsRecep > 0 ? ((dif / ltsFincas) * 100) : 0;
                const esExacto = ltsRecep > 0 && Math.abs(dif) < 0.01;
                const esMerma = dif < 0;

                return (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1.5px solid ${ltsRecep <= 0 ? '#cbd5e1' : esExacto ? '#a7f3d0' : esMerma ? '#fca5a5' : '#fed7aa'}`,
                      background: ltsRecep <= 0 ? '#f8fafc' : esExacto ? '#ecfdf5' : esMerma ? '#fef2f2' : '#fffbeb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                      Diferencia Ruta vs Receptoría
                    </div>
                    <div
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 800,
                        color: ltsRecep <= 0 ? '#64748b' : esExacto ? '#059669' : esMerma ? '#dc2626' : '#d97706',
                      }}
                    >
                      {ltsRecep > 0 ? `${dif > 0 ? '+' : ''}${dif.toLocaleString()} Lts (${difPct.toFixed(2)}%)` : '0 Lts (0.00%)'}
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block font-bold text-slate-700 mb-1 text-xs">
                  <i className="fa-solid fa-comment-dots text-sky-600 mr-1.5"></i> OBSERVACIÓN
                </label>
                <input
                  type="text"
                  value={ticketParaEditar.observacionEdit}
                  onChange={(e) => setTicketParaEditar({ ...ticketParaEditar, observacionEdit: e.target.value })}
                  placeholder="Nota u observación del ticket..."
                  className="form-input w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalEditar(false)}
                  className="btn btn-outline h-10 px-5 rounded-lg text-slate-600 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0 20px',
                    height: '40px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className="fa-solid fa-floppy-disk"></i> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL TRAZABILIDAD COMPLETA 1:1 CON V2_3_11_26 */}
      {modalTrazabilidad && ticketTrazabilidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div
            className="w-full max-w-4xl bg-white rounded-[18px] border-[1.5px] border-slate-300 shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* CABECERA MODAL MODERNA 1:1 */}
            <div
              className="px-6 py-4 flex items-center justify-between border-b border-white/10 shrink-0"
              style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{
                    background: 'rgba(56, 189, 248, 0.18)',
                    border: '1.5px solid rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    boxShadow: '0 0 16px rgba(56, 189, 248, 0.2)',
                  }}
                >
                  <i className={`fa-solid ${ticketTrazabilidad._origen === 'RUTA' ? 'fa-route' : 'fa-warehouse'}`}></i>
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="m-0 text-lg font-extrabold text-white tracking-tight">
                      Trazabilidad del Viaje #{ticketTrazabilidad.id}
                    </h2>
                    <span
                      className="text-[10.5px] px-2.5 py-0.5 font-extrabold rounded-full tracking-wide"
                      style={{
                        background: 'rgba(56, 189, 248, 0.18)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                      }}
                    >
                      {ticketTrazabilidad._origen === 'RUTA' ? 'RUTA DE RECOLECCIÓN' : 'DESPACHO A RECEPTORÍA'}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-xs text-slate-400 font-medium flex items-center gap-2">
                    <span>
                      <i className="fa-solid fa-user-tie text-sky-400 mr-1"></i>
                      Chofer: <strong className="text-white">{ticketTrazabilidad.nombreConductor || 'No asignado'}</strong>
                    </span>
                    <span>&bull;</span>
                    <span>
                      <i className="fa-solid fa-calendar-day mr-1"></i>
                      Fecha: <strong>{(ticketTrazabilidad.fecha || '').split('T')[0]}</strong>
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalTrazabilidad(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '20px',
                }}
              >
                &times;
              </button>
            </div>

            {/* CUERPO DEL MODAL */}
            <div className="p-5 md:p-6 overflow-y-auto space-y-4 bg-slate-50 flex-1">
              {/* RESUMEN DE MÉTRICAS DEL VIAJE (5 KPIS DE ALTO IMPACTO 1:1) */}
              {metricasModalTrazabilidad && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* KPI 1: LTS FINCAS */}
                  <div className="bg-white border-[1.5px] border-sky-200 rounded-xl p-3 text-center shadow-xs relative overflow-hidden flex flex-col justify-center gap-1">
                    <div className="absolute top-0 left-0 right-0 h-[3.5px] bg-gradient-to-r from-sky-600 to-sky-400"></div>
                    <div className="text-[10px] font-extrabold text-sky-600 uppercase tracking-wider flex items-center justify-center gap-1">
                      <span className="w-5 h-5 rounded flex items-center justify-center bg-sky-50 text-sky-600 text-[10px]">
                        <i className="fa-solid fa-cow"></i>
                      </span>
                      LTS FINCAS
                    </div>
                    <div className="text-lg font-black text-slate-900 tracking-tight">
                      {metricasModalTrazabilidad.totalFinca.toLocaleString('es-VE')}{' '}
                      <span className="text-[11px] font-bold text-slate-500">L</span>
                    </div>
                  </div>

                  {/* KPI 2: LTS RECEPTORÍA */}
                  <div className="bg-white border-[1.5px] border-amber-200 rounded-xl p-3 text-center shadow-xs relative overflow-hidden flex flex-col justify-center gap-1">
                    <div className="absolute top-0 left-0 right-0 h-[3.5px] bg-gradient-to-r from-amber-600 to-amber-400"></div>
                    <div className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider flex items-center justify-center gap-1">
                      <span className="w-5 h-5 rounded flex items-center justify-center bg-amber-50 text-amber-600 text-[10px]">
                        <i className="fa-solid fa-warehouse"></i>
                      </span>
                      LTS RECEPTORÍA
                    </div>
                    <div className="text-lg font-black text-slate-900 tracking-tight">
                      {metricasModalTrazabilidad.totalRecep != null
                        ? `${metricasModalTrazabilidad.totalRecep.toLocaleString('es-VE')} `
                        : '- '}
                      {metricasModalTrazabilidad.totalRecep != null && (
                        <span className="text-[11px] font-bold text-slate-500">L</span>
                      )}
                    </div>
                  </div>

                  {/* KPI 3: RECARGA EXTRA */}
                  <div className="bg-white border-[1.5px] border-yellow-200 rounded-xl p-3 text-center shadow-xs relative overflow-hidden flex flex-col justify-center gap-1">
                    <div className="absolute top-0 left-0 right-0 h-[3.5px] bg-gradient-to-r from-yellow-600 to-yellow-400"></div>
                    <div className="text-[10px] font-extrabold text-yellow-600 uppercase tracking-wider flex items-center justify-center gap-1">
                      <span className="w-5 h-5 rounded flex items-center justify-center bg-yellow-50 text-yellow-600 text-[10px]">
                        <i className="fa-solid fa-gas-pump"></i>
                      </span>
                      RECARGA EXTRA
                    </div>
                    <div className="text-lg font-black text-slate-900 tracking-tight">
                      {metricasModalTrazabilidad.recargaExtra > 0
                        ? `+${metricasModalTrazabilidad.recargaExtra.toLocaleString('es-VE')} `
                        : '0 L'}
                      {metricasModalTrazabilidad.recargaExtra > 0 && (
                        <span className="text-[11px] font-bold text-slate-500">L</span>
                      )}
                    </div>
                  </div>

                  {/* KPI 4: LTS PLANTA */}
                  <div className="bg-white border-[1.5px] border-purple-200 rounded-xl p-3 text-center shadow-xs relative overflow-hidden flex flex-col justify-center gap-1">
                    <div className="absolute top-0 left-0 right-0 h-[3.5px] bg-gradient-to-r from-purple-700 to-purple-400"></div>
                    <div className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider flex items-center justify-center gap-1">
                      <span className="w-5 h-5 rounded flex items-center justify-center bg-purple-50 text-purple-700 text-[10px]">
                        <i className="fa-solid fa-industry"></i>
                      </span>
                      LTS PLANTA
                    </div>
                    <div className="text-lg font-black text-slate-900 tracking-tight">
                      {metricasModalTrazabilidad.totalPlanta != null
                        ? `${metricasModalTrazabilidad.totalPlanta.toLocaleString('es-VE')} `
                        : '- '}
                      {metricasModalTrazabilidad.totalPlanta != null && (
                        <span className="text-[11px] font-bold text-slate-500">L</span>
                      )}
                    </div>
                  </div>

                  {/* KPI 5: MERMA FINAL o EN CAMINO */}
                  {metricasModalTrazabilidad.yaFinalizo && metricasModalTrazabilidad.totalPlanta != null ? (
                    <div
                      className={`bg-white border-[1.5px] rounded-xl p-3 text-center shadow-xs relative overflow-hidden flex flex-col justify-center gap-1 ${
                        metricasModalTrazabilidad.mermaEsCero
                          ? 'border-emerald-200'
                          : metricasModalTrazabilidad.mermaEsPerdida
                          ? 'border-rose-200'
                          : 'border-sky-200'
                      }`}
                    >
                      <div
                        className={`absolute top-0 left-0 right-0 h-[3.5px] ${
                          metricasModalTrazabilidad.mermaEsCero
                            ? 'bg-emerald-500'
                            : metricasModalTrazabilidad.mermaEsPerdida
                            ? 'bg-rose-500'
                            : 'bg-sky-500'
                        }`}
                      ></div>
                      <div
                        className={`text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1 ${
                          metricasModalTrazabilidad.mermaEsCero
                            ? 'text-emerald-700'
                            : metricasModalTrazabilidad.mermaEsPerdida
                            ? 'text-rose-700'
                            : 'text-sky-700'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${
                            metricasModalTrazabilidad.mermaEsCero
                              ? 'bg-emerald-50 text-emerald-600'
                              : metricasModalTrazabilidad.mermaEsPerdida
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-sky-50 text-sky-600'
                          }`}
                        >
                          <i
                            className={`fa-solid ${
                              metricasModalTrazabilidad.mermaEsCero
                                ? 'fa-circle-check'
                                : metricasModalTrazabilidad.mermaEsPerdida
                                ? 'fa-triangle-exclamation'
                                : 'fa-circle-plus'
                            }`}
                          ></i>
                        </span>
                        MERMA FINAL
                      </div>
                      <div
                        className={`text-lg font-black tracking-tight ${
                          metricasModalTrazabilidad.mermaEsCero
                            ? 'text-emerald-800'
                            : metricasModalTrazabilidad.mermaEsPerdida
                            ? 'text-rose-700'
                            : 'text-sky-800'
                        }`}
                      >
                        {metricasModalTrazabilidad.textoMerma}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border-[1.5px] border-green-200 rounded-xl p-3 text-center shadow-xs relative overflow-hidden flex flex-col justify-center gap-1">
                      <div className="absolute top-0 left-0 right-0 h-[3.5px] bg-gradient-to-r from-green-600 to-green-400"></div>
                      <div className="text-[10px] font-extrabold text-green-700 uppercase tracking-wider flex items-center justify-center gap-1">
                        <span className="w-5 h-5 rounded flex items-center justify-center bg-green-50 text-green-600 text-[10px]">
                          <i className="fa-solid fa-truck-fast"></i>
                        </span>
                        EN CAMINO
                      </div>
                      <div className="text-lg font-black text-green-900 tracking-tight">
                        {metricasModalTrazabilidad.totalEnCamino.toLocaleString('es-VE')}{' '}
                        <span className="text-[11px] font-bold text-slate-500">L</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TABS INTERNAS ESTILO SEGMENTED PILLS 1:1 */}
              <div
                className="flex items-center gap-1.5 p-1 rounded-xl overflow-x-auto"
                style={{ background: '#e2e8f0' }}
              >
                {ticketTrazabilidad._origen === 'RUTA' && (
                  <button
                    type="button"
                    onClick={() => setTabTrazabilidad('fincas')}
                    className={`px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                      tabTrazabilidad === 'fincas'
                        ? 'bg-white text-sky-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <i className="fa-solid fa-cow text-sky-600"></i>
                    Fincas Recolectadas ({fincasTrazabilidad.length})
                  </button>
                )}
                {ticketTrazabilidad._origen === 'RECEPTORIA' && (
                  <button
                    type="button"
                    onClick={() => setTabTrazabilidad('despacho')}
                    className={`px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                      tabTrazabilidad === 'despacho'
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <i className="fa-solid fa-file-invoice text-purple-600"></i>
                    Detalle del Despacho
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTabTrazabilidad('entregas')}
                  className={`px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                    tabTrazabilidad === 'entregas'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <i className="fa-solid fa-truck-ramp-box text-amber-600"></i>
                  Entregas / Descargas ({entregasTrazabilidad.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTabTrazabilidad('timeline')}
                  className={`px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                    tabTrazabilidad === 'timeline'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <i className="fa-solid fa-clock-rotate-left text-indigo-600"></i>
                  Línea de Tiempo ({historialTrazabilidad.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTabTrazabilidad('logs')}
                  className={`px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                    tabTrazabilidad === 'logs'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <i className="fa-solid fa-shield-halved text-emerald-600"></i>
                  Bitácora ({logsTrazabilidad.length})
                </button>
              </div>

              {/* CONTENIDO TAB 1: FINCAS RECOLECTADAS (TABLA 1:1) */}
              {tabTrazabilidad === 'fincas' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                      <i className="fa-solid fa-list-check text-sky-600"></i>
                      Recolecciones de leche asociadas a este viaje:
                    </span>
                    <button
                      type="button"
                      onClick={() => setModalAgregarFincaAuditada(true)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
                      style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                    >
                      <i className="fa-solid fa-plus"></i>
                      Agregar Finca
                    </button>
                  </div>

                  <div className="bg-white border-[1.5px] border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-[340px] overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b-[1.5px] border-slate-200 text-[11px] font-extrabold uppercase tracking-wider">
                          <th className="py-2.5 px-3.5 text-left w-[32%]">FINCA Y TIPO</th>
                          <th className="py-2.5 px-3.5 text-left w-[22%]">PROPIETARIO</th>
                          <th className="py-2.5 px-3.5 text-right w-[18%]">LITROS</th>
                          <th className="py-2.5 px-3.5 text-center w-[16%]">CALIDAD</th>
                          <th className="py-2.5 px-3.5 text-center w-[12%]">ACCIONES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {fincasTrazabilidad.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-slate-400">
                              No hay fincas registradas para este viaje.
                            </td>
                          </tr>
                        ) : (
                          fincasTrazabilidad.map((f: any, idx: number) => {
                            const esDualF = Boolean(f.tieneDosTiposLeche || f.TieneDosTiposLeche);
                            const esBufala = f.tipoLeche === 'BUFALA' || f.TipoLeche === 'BUFALA';

                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2.5 px-3.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <strong className="text-slate-900 text-[13px] font-extrabold">
                                      {f.fincaNombre || f.finca || f.nombre || 'Finca'}
                                    </strong>
                                    {hasBufala && esDualF && (
                                      <span
                                        className={`text-[9.5px] font-extrabold px-1.5 py-0.5 rounded border ${
                                          esBufala
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-blue-50 text-blue-700 border-blue-200'
                                        }`}
                                      >
                                        {esBufala ? '🐃 BÚFALA' : '🐄 VACA'}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3.5 text-slate-600 font-medium">
                                  {f.propietario || f.propietarioNombre || '-'}
                                </td>
                                <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                                  <span className="font-black text-sky-700 text-sm">
                                    {Number(f.litros || f.Litros || f.litrosLeche || 0).toLocaleString('es-VE')}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-500 ml-1">Lts</span>
                                </td>
                                <td className="py-2.5 px-3.5 text-center">
                                  {f.esAcida ? (
                                    <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                                      ÁCIDA
                                    </span>
                                  ) : (
                                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                                      DULCE
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3.5 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleAbrirEditarFinca(f)}
                                      title="Modificar finca (auditado)"
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 transition-colors cursor-pointer"
                                    >
                                      <i className="fa-solid fa-pen-to-square text-xs"></i>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleEliminarFinca(
                                          f.id || f.Id || f.rutaId,
                                          f.fincaNombre || f.finca || 'Finca'
                                        )
                                      }
                                      title="Eliminar finca de este viaje"
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                                    >
                                      <i className="fa-solid fa-trash-can text-xs"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CONTENIDO TAB 2: ENTREGAS / DESCARGAS (TABLA 1:1) */}
              {tabTrazabilidad === 'entregas' && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <i className="fa-solid fa-truck-arrow-right text-amber-600"></i>
                    Descargas y movimientos de leche registrados:
                  </span>

                  <div className="bg-white border-[1.5px] border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-[340px] overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b-[1.5px] border-slate-200 text-[11px] font-extrabold uppercase tracking-wider">
                          <th className="py-2.5 px-3.5 text-left w-[28%]">DESTINO / ENTIDAD</th>
                          <th className="py-2.5 px-3.5 text-left w-[20%]">ENCARGADO / CHOFER</th>
                          <th className="py-2.5 px-3.5 text-right w-[16%]">LITROS</th>
                          <th className="py-2.5 px-3.5 text-left w-[26%]">OBSERVACIÓN</th>
                          <th className="py-2.5 px-3.5 text-center w-[10%]">ACCIONES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {entregasTrazabilidad.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-slate-400">
                              No hay entregas registradas para este viaje.
                            </td>
                          </tr>
                        ) : (
                          entregasTrazabilidad.map((e: any, idx: number) => {
                            const litrosNum = Number(e.litros || e.Litros || e.litrosEntregados || 0);

                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2.5 px-3.5">
                                  <div className="flex flex-col gap-1 items-start">
                                    <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[9.5px] font-extrabold px-1.5 py-0.5 rounded">
                                      <i className="fa-solid fa-industry mr-1"></i>
                                      Entrega Validada
                                    </span>
                                    <strong className="text-slate-900 text-[13px] font-extrabold">
                                      {e.companiaNombre || e.compania || `Compañía #${e.companiaId || ''}`}
                                    </strong>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3.5 text-slate-600 font-medium">
                                  {e.encargado || e.conductorNombre || '-'}
                                </td>
                                <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                                  <span className="font-black text-amber-700 text-sm">
                                    +{Math.abs(litrosNum).toLocaleString('es-VE')}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-500 ml-1">Lts</span>
                                </td>
                                <td className="py-2.5 px-3.5 text-slate-600">
                                  {e.observacion || e.observaciones || '-'}
                                </td>
                                <td className="py-2.5 px-3.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleAbrirEditarEntrega(e)}
                                    title="Modificar entrega (auditado)"
                                    className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                                  >
                                    <i className="fa-solid fa-pen-to-square text-xs"></i>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CONTENIDO TAB 3: TIMELINE (1:1) */}
              {tabTrazabilidad === 'timeline' && (
                <div className="space-y-3 py-2">
                  {historialTrazabilidad.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      Sin historial de transiciones registrado.
                    </p>
                  ) : (
                    historialTrazabilidad.map((h: any, idx: number) => {
                      const fechaFmt = h.fechaCambio || h.fecha
                        ? new Date(h.fechaCambio || h.fecha).toLocaleString('es-VE', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '-';

                      return (
                        <div key={idx} className="flex gap-3 text-xs items-start">
                          <div
                            className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-xs"
                            style={{ background: h.colorProceso || '#0284c7' }}
                          >
                            <i className={h.iconoProceso || 'fa-solid fa-circle text-[9px]'}></i>
                          </div>
                          <div className="flex-1 bg-white p-3 rounded-xl border-[1.5px] border-slate-200 shadow-2xs">
                            <div className="flex justify-between items-center font-extrabold text-slate-900">
                              <span style={{ color: h.colorProceso || '#0f172a' }}>
                                {h.nombreProceso || h.proceso || h.codigoProceso || 'Etapa del proceso'}
                              </span>
                              <span className="text-slate-400 font-semibold text-[11px]">{fechaFmt}</span>
                            </div>
                            <div className="text-slate-600 text-xs mt-1">
                              <i className="fa-solid fa-user-check text-sky-600 mr-1"></i>
                              Operado por: <strong>{h.nombreUsuario || h.usuario || 'Sistema'}</strong>
                            </div>
                            {h.observacion && (
                              <div className="mt-2 bg-slate-50 border-l-[3.5px] border-sky-600 p-2 rounded text-slate-700 text-xs font-medium">
                                {h.observacion}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* CONTENIDO TAB 4: BITÁCORA DE AUDITORÍA (TABLA 1:1) */}
              {tabTrazabilidad === 'logs' && (
                <div className="space-y-3">
                  <div className="bg-white border-[1.5px] border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-[340px] overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b-[1.5px] border-slate-200 text-[11px] font-extrabold uppercase tracking-wider">
                          <th className="py-2.5 px-3.5 text-left w-[16%]">FECHA / HORA</th>
                          <th className="py-2.5 px-3.5 text-left w-[16%]">USUARIO</th>
                          <th className="py-2.5 px-3.5 text-left w-[18%]">ACCIÓN</th>
                          <th className="py-2.5 px-3.5 text-left w-[15%]">VALOR ANTERIOR</th>
                          <th className="py-2.5 px-3.5 text-left w-[15%]">VALOR NUEVO</th>
                          <th className="py-2.5 px-3.5 text-left w-[20%]">MOTIVO / AUDITORÍA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logsTrazabilidad.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-slate-400">
                              Sin modificaciones registradas en este ticket.
                            </td>
                          </tr>
                        ) : (
                          logsTrazabilidad.map((l: any, idx: number) => {
                            const fechaRaw = l.fecha || l.fechaModificacion || l.Fecha || l.createdAt;
                            const fechaFmt = fechaRaw
                              ? new Date(fechaRaw).toLocaleString('es-VE', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })
                              : '-';
                            const tipoAcc = String(l.tipoAccion || l.accion || l.TipoAccion || '');
                            const tipoEnt = String(l.tipoEntidad || l.entidad || l.TipoEntidad || '');

                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2 px-3.5 text-slate-500 font-medium whitespace-nowrap text-[11px]">
                                  {fechaFmt}
                                </td>
                                <td className="py-2 px-3.5 font-bold text-sky-700">
                                  {l.nombreUsuario || l.usuarioNombre || l.NombreUsuario || 'Admin'}
                                </td>
                                <td className="py-2 px-3.5">
                                  <span
                                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                      tipoAcc.toUpperCase().includes('ELIMINAR')
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-sky-50 text-sky-700 border border-sky-200'
                                    }`}
                                  >
                                    {tipoEnt ? `${tipoEnt}: ` : ''}
                                    {tipoAcc}
                                  </span>
                                </td>
                                <td className="py-2 px-3.5 font-mono text-[11px] text-slate-500 break-words max-w-[130px]">
                                  {l.valoresAnteriores || l.valorAnterior || '-'}
                                </td>
                                <td className="py-2 px-3.5 font-mono text-[11px] text-sky-700 break-words max-w-[130px]">
                                  {l.valoresNuevos || l.valorNuevo || '-'}
                                </td>
                                <td className="py-2 px-3.5 text-amber-700 font-semibold text-xs">
                                  {l.motivo || l.Motivo || l.detalles || '-'}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* PIE DEL MODAL (FOOTER 1:1 CON BOTONES DE REVERSIÓN Y FINALIZACIÓN) */}
            <div className="px-6 py-3.5 bg-white border-t-[1.5px] border-slate-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                {(ticketTrazabilidad.procesoActualId > 1 ||
                  ticketTrazabilidad.estado === 'FINALIZADO' ||
                  ticketTrazabilidad.procesoActualId === 4) && (
                  <button
                    type="button"
                    onClick={handleRevertirProceso}
                    className="px-4 py-2 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 border-[1.5px] border-amber-400 hover:bg-amber-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Revertir etapa para corregir fincas o entregas"
                  >
                    <i className="fa-solid fa-rotate-left"></i>
                    Revertir Proceso
                  </button>
                )}

                {ticketTrazabilidad.procesoActualId !== 4 &&
                  ticketTrazabilidad.estado !== 'FINALIZADO' && (
                    <button
                      type="button"
                      onClick={handleFinalizarViaje}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
                      style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
                    >
                      <i className="fa-solid fa-check-to-slot"></i>
                      Finalizar y Auditar Viaje
                    </button>
                  )}
              </div>

              <button
                type="button"
                onClick={() => setModalTrazabilidad(false)}
                className="px-5 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border-[1.5px] border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL AGREGAR FINCA AUDITADA (REDISEÑADO CON FECHA ASOCIADA Y DIFERIDO) */}
      {modalAgregarFincaAuditada && ticketTrazabilidad && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col my-auto" style={{ maxHeight: '92vh' }}>
            {/* CABECERA */}
            <div
              className="p-5 flex items-center justify-between border-b border-white/10 shrink-0"
              style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0369a1 100%)' }}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl text-sky-400 shrink-0 shadow-xs"
                  style={{
                    background: 'rgba(56, 189, 248, 0.2)',
                    border: '1.5px solid rgba(56, 189, 248, 0.4)',
                  }}
                >
                  <i className="fa-solid fa-cow"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="m-0 text-base font-extrabold text-white">
                      Agregar Finca al Ticket #{ticketTrazabilidad.id}
                    </h3>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 uppercase tracking-wider">
                      {ticketTrazabilidad.estado || 'ABIERTO'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-sky-200">
                    <span>
                      <i className="fa-solid fa-user-tie text-sky-300 mr-1"></i>
                      Chofer: <strong>{ticketTrazabilidad.nombreConductor || 'Conductor'}</strong>
                    </span>
                    {ticketTrazabilidad.camionPlaca && (
                      <>
                        <span className="text-white/40">•</span>
                        <span>
                          <i className="fa-solid fa-truck-moving text-sky-300 mr-1"></i>
                          {ticketTrazabilidad.camionPlaca}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAgregarFincaAuditada(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 text-2xl transition-colors cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* FORMULARIO */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!formFincaAuditada.fincaId || formFincaAuditada.litros <= 0) {
                  toast.error('Selecciona la finca e indica los litros recolectados');
                  return;
                }

                const { value: motivo, isConfirmed } = await Swal.fire({
                  title: 'Motivo de Inclusión de Finca',
                  text: 'Indique la justificación para registrar esta finca en el ticket:',
                  input: 'textarea',
                  inputValue: 'Inclusión de recolección en ruta operativa',
                  icon: 'question',
                  showCancelButton: true,
                  confirmButtonText: 'Registrar y Guardar',
                  cancelButtonText: 'Cancelar',
                  confirmButtonColor: '#0284c7',
                  inputValidator: (v) => (!v?.trim() ? '¡El motivo de la inclusión es obligatorio!' : undefined),
                });

                if (!isConfirmed || !motivo) return;

                try {
                  await operacionesApi.agregarFincaViaje(ticketTrazabilidad.id, {
                    fincaId: formFincaAuditada.fincaId,
                    litros: formFincaAuditada.litros,
                    esAcida: formFincaAuditada.esAcida,
                    esDiferido: formFincaAuditada.esDiferido,
                    tipoLeche: formFincaAuditada.tipoLeche,
                    observacion: formFincaAuditada.observacion || motivo,
                    fecha: ticketTrazabilidad.fecha,
                  });
                  toast.success('Finca agregada con éxito al ticket.');
                  setModalAgregarFincaAuditada(false);
                  recargarTrazabilidad();
                } catch (err: any) {
                  toast.error(err?.response?.data?.message || 'Error al agregar finca');
                }
              }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-5 md:p-6 overflow-y-auto space-y-4 flex-1">
                {/* 1. BANNER ELEGANTE DE FECHA OPERATIVA Y ASOCIACIÓN AL TICKET */}
                <div className="bg-gradient-to-r from-sky-50 to-indigo-50 border-[1.5px] border-sky-200 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center text-lg shadow-xs shrink-0">
                      <i className="fa-regular fa-calendar-days"></i>
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span>Fecha de Carga / Recolección</span>
                        <span className="text-[10px] bg-sky-200/80 text-sky-900 px-1.5 py-0.2 rounded font-bold">Asociada al Ticket</span>
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 mt-0.5 flex items-center gap-2">
                        <span>
                          {ticketTrazabilidad.fecha
                            ? new Date(ticketTrazabilidad.fecha).toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                            : new Date().toLocaleDateString('es-VE')}
                        </span>
                        <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Semana #{ticketTrazabilidad.cicloId || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:block text-right">
                    <span className="text-[10.5px] font-bold text-slate-500 block">Identificador</span>
                    <span className="font-mono text-xs font-black text-sky-700 bg-white px-2 py-0.5 rounded border border-sky-200 shadow-2xs">
                      TKT-#{ticketTrazabilidad.id}
                    </span>
                  </div>
                </div>

                {/* 2. FINCA GANADERA */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-location-dot text-emerald-600"></i>
                      Finca Ganadera *
                    </span>
                    {formFincaAuditada.fincaId > 0 && (
                      <span className="text-[11px] text-slate-500 font-medium">
                        {fincas.find((f) => f.id === formFincaAuditada.fincaId)?.propietario
                          ? `Productor: ${fincas.find((f) => f.id === formFincaAuditada.fincaId)?.propietario}`
                          : ''}
                      </span>
                    )}
                  </label>
                  <SearchableSelect
                    options={[...fincas]
                      .sort((a, b) => {
                        const rId = ticketTrazabilidad?.rutaLogisticaId;
                        if (rId && rId > 0) {
                          const aEn = a.rutaId === rId;
                          const bEn = b.rutaId === rId;
                          if (aEn && !bEn) return -1;
                          if (!aEn && bEn) return 1;
                        }
                        return a.nombre.localeCompare(b.nombre);
                      })
                      .map((f) => {
                        const esDeRuta = ticketTrazabilidad?.rutaLogisticaId && f.rutaId === ticketTrazabilidad.rutaLogisticaId;
                        return {
                          value: f.id,
                          label: `${f.nombre} (${f.propietarioNombre || f.propietario || 'Productor'})`,
                          subLabel: f.rutaNombre ? `Ruta: ${f.rutaNombre}` : undefined,
                          badge: esDeRuta ? '⭐ En esta ruta' : undefined,
                        };
                      })}
                    value={formFincaAuditada.fincaId}
                    onChange={(val) => {
                      const id = Number(val);
                      const fMatch = fincas.find((f) => f.id === id);
                      const esBuf = (fMatch?.tipoLeche || '').toUpperCase().includes('BUFAL');
                      setFormFincaAuditada({
                        ...formFincaAuditada,
                        fincaId: id,
                        tipoLeche: esBuf ? 'BUFALA' : (formFincaAuditada.tipoLeche || 'VACA'),
                      });
                    }}
                    placeholder="-- SELECCIONAR FINCA GANADERA --"
                  />
                </div>

                {/* 3. LITROS RECOLECTADOS & TIPO DE LECHE */}
                <div className={`grid ${hasBufala ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3.5`}>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <i className="fa-solid fa-faucet-drip text-blue-600"></i>
                      Litros Recolectados *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={formFincaAuditada.litros || ''}
                        onChange={(e) => setFormFincaAuditada({ ...formFincaAuditada, litros: Number(e.target.value) })}
                        placeholder="Ej: 450"
                        className="w-full h-11 pl-3 pr-12 rounded-xl border-[1.5px] border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-mono font-black text-lg text-slate-900 transition-all placeholder:text-slate-400 placeholder:font-normal"
                        required
                        autoFocus
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">
                        LTS
                      </div>
                    </div>
                  </div>

                  {hasBufala && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <i className="fa-solid fa-cow text-sky-600"></i>
                        Tipo de Leche *
                      </label>
                      <div className="grid grid-cols-2 gap-2 h-11">
                        <button
                          type="button"
                          onClick={() => setFormFincaAuditada({ ...formFincaAuditada, tipoLeche: 'VACA' })}
                          className={`h-full rounded-xl border-[1.5px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            formFincaAuditada.tipoLeche === 'VACA'
                              ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-2xs font-extrabold ring-1 ring-blue-500/20'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <i className="fa-solid fa-cow text-sm"></i>
                          Vaca
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormFincaAuditada({ ...formFincaAuditada, tipoLeche: 'BUFALA' })}
                          className={`h-full rounded-xl border-[1.5px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            formFincaAuditada.tipoLeche === 'BUFALA'
                              ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-2xs font-extrabold ring-1 ring-emerald-500/20'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-sm">🐃</span>
                          Búfala
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. OPCIÓN DIFERIR LITROS & LECHE ÁCIDA */}
                <div className="space-y-2.5 pt-1">
                  {/* CARD DIFERIR LITROS */}
                  <div
                    onClick={() => setFormFincaAuditada({ ...formFincaAuditada, esDiferido: !formFincaAuditada.esDiferido })}
                    className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer select-none ${
                      formFincaAuditada.esDiferido
                        ? 'bg-purple-50/90 border-purple-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formFincaAuditada.esDiferido}
                        onChange={(e) => setFormFincaAuditada({ ...formFincaAuditada, esDiferido: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-purple-950 flex items-center gap-1.5">
                            <i className="fa-solid fa-calendar-plus text-purple-600"></i>
                            Diferir Litros para el Siguiente Ciclo
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                              formFincaAuditada.esDiferido ? 'bg-purple-200 text-purple-900' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {formFincaAuditada.esDiferido ? 'Pago en Ciclo Siguiente' : 'Ciclo Actual'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 m-0 mt-1 leading-snug">
                          Los litros recolectados se contabilizarán en la siguiente semana operativa sin afectar la liquidación corriente de la finca.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CARD LECHE ÁCIDA */}
                  <div
                    onClick={() => setFormFincaAuditada({ ...formFincaAuditada, esAcida: !formFincaAuditada.esAcida })}
                    className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer select-none ${
                      formFincaAuditada.esAcida
                        ? 'bg-rose-50/90 border-rose-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formFincaAuditada.esAcida}
                        onChange={(e) => setFormFincaAuditada({ ...formFincaAuditada, esAcida: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                            <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                            ¿Es Leche Ácida / Deteriorada?
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                              formFincaAuditada.esAcida ? 'bg-rose-200 text-rose-900' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {formFincaAuditada.esAcida ? 'Leche Ácida' : 'Leche Dulce'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 m-0 mt-1 leading-snug">
                          Aplica tarifa especial de leche ácida y marca la parada para recepción segregada en silo o receptoría.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. OBSERVACIONES */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="fa-regular fa-comment-dots text-slate-500"></i>
                    Observación Operativa (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formFincaAuditada.observacion}
                    onChange={(e) => setFormFincaAuditada({ ...formFincaAuditada, observacion: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border-[1.5px] border-slate-300 focus:border-sky-600 focus:ring-2 focus:ring-sky-100 text-xs text-slate-800 transition-all placeholder:text-slate-400"
                    placeholder="Ej: Muestra tomada en caneca, recolección con retraso..."
                  />
                </div>
              </div>

              {/* PIE DE ACCIONES */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalAgregarFincaAuditada(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-extrabold text-white transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                >
                  <i className="fa-solid fa-plus"></i>
                  Agregar al Viaje
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL EDITAR FINCA AUDITADA (REDISEÑADO CON FECHA ASOCIADA Y DIFERIDO) */}
      {modalEditarFincaAuditada && ticketTrazabilidad && fincaParaEditar && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col my-auto" style={{ maxHeight: '92vh' }}>
            {/* CABECERA */}
            <div
              className="p-5 flex items-center justify-between border-b border-white/10 shrink-0"
              style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #2563eb 100%)' }}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl text-blue-400 shrink-0 shadow-xs"
                  style={{
                    background: 'rgba(37, 99, 235, 0.2)',
                    border: '1.5px solid rgba(96, 165, 250, 0.4)',
                  }}
                >
                  <i className="fa-solid fa-pen-to-square"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="m-0 text-base font-extrabold text-white">
                      Modificar Finca en Ticket #{ticketTrazabilidad.id}
                    </h3>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 uppercase tracking-wider">
                      Auditado
                    </span>
                  </div>
                  <p className="m-0 mt-0.5 text-xs text-sky-200 font-medium">
                    Ajuste de recolección con registro obligatorio en bitácora
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalEditarFincaAuditada(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 text-2xl transition-colors cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGuardarEditarFinca} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 md:p-6 overflow-y-auto space-y-4 flex-1">
                {/* 1. BANNER DE FECHA OPERATIVA */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-[1.5px] border-blue-200 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg shadow-xs shrink-0">
                      <i className="fa-regular fa-calendar-days"></i>
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span>Fecha del Ticket / Carga</span>
                        <span className="text-[10px] bg-blue-200/80 text-blue-900 px-1.5 py-0.2 rounded font-bold">Asociada al Ticket</span>
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 mt-0.5 flex items-center gap-2">
                        <span>
                          {ticketTrazabilidad.fecha
                            ? new Date(ticketTrazabilidad.fecha).toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                            : new Date().toLocaleDateString('es-VE')}
                        </span>
                        <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Semana #{ticketTrazabilidad.cicloId || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:block text-right">
                    <span className="text-[10.5px] font-bold text-slate-500 block">Identificador</span>
                    <span className="font-mono text-xs font-black text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                      TKT-#{ticketTrazabilidad.id}
                    </span>
                  </div>
                </div>

                {/* 2. FINCA GANADERA */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-location-dot text-emerald-600"></i>
                      Finca Ganadera *
                    </span>
                    {formEditarFinca.fincaId > 0 && (
                      <span className="text-[11px] text-slate-500 font-medium">
                        {fincas.find((f) => f.id === formEditarFinca.fincaId)?.propietario
                          ? `Productor: ${fincas.find((f) => f.id === formEditarFinca.fincaId)?.propietario}`
                          : ''}
                      </span>
                    )}
                  </label>
                  <SearchableSelect
                    options={[...fincas]
                      .sort((a, b) => {
                        const rId = ticketTrazabilidad?.rutaLogisticaId;
                        if (rId && rId > 0) {
                          const aEn = a.rutaId === rId;
                          const bEn = b.rutaId === rId;
                          if (aEn && !bEn) return -1;
                          if (!aEn && bEn) return 1;
                        }
                        return a.nombre.localeCompare(b.nombre);
                      })
                      .map((f) => {
                        const esDeRuta = ticketTrazabilidad?.rutaLogisticaId && f.rutaId === ticketTrazabilidad.rutaLogisticaId;
                        return {
                          value: f.id,
                          label: `${f.nombre} (${f.propietarioNombre || f.propietario || 'Productor'})`,
                          subLabel: f.rutaNombre ? `Ruta: ${f.rutaNombre}` : undefined,
                          badge: esDeRuta ? '⭐ En esta ruta' : undefined,
                        };
                      })}
                    value={formEditarFinca.fincaId}
                    onChange={(val) => {
                      const id = Number(val);
                      const fMatch = fincas.find((f) => f.id === id);
                      const esBuf = (fMatch?.tipoLeche || '').toUpperCase().includes('BUFAL');
                      setFormEditarFinca({
                        ...formEditarFinca,
                        fincaId: id,
                        tipoLeche: esBuf ? 'BUFALA' : (formEditarFinca.tipoLeche || 'VACA'),
                      });
                    }}
                    placeholder="-- BUSCAR FINCA --"
                  />
                </div>

                {/* 3. LITROS RECOLECTADOS & TIPO DE LECHE */}
                <div className={`grid ${hasBufala ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3.5`}>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <i className="fa-solid fa-faucet-drip text-blue-600"></i>
                      Litros Recolectados *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={formEditarFinca.litros || ''}
                        onChange={(e) => setFormEditarFinca({ ...formEditarFinca, litros: Number(e.target.value) })}
                        className="w-full h-11 pl-3 pr-12 rounded-xl border-[1.5px] border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-mono font-black text-lg text-slate-900 transition-all"
                        required
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">
                        LTS
                      </div>
                    </div>
                  </div>

                  {hasBufala && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <i className="fa-solid fa-cow text-sky-600"></i>
                        Tipo de Leche *
                      </label>
                      <div className="grid grid-cols-2 gap-2 h-11">
                        <button
                          type="button"
                          onClick={() => setFormEditarFinca({ ...formEditarFinca, tipoLeche: 'VACA' })}
                          className={`h-full rounded-xl border-[1.5px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            formEditarFinca.tipoLeche === 'VACA'
                              ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-2xs font-extrabold ring-1 ring-blue-500/20'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <i className="fa-solid fa-cow text-sm"></i>
                          Vaca
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormEditarFinca({ ...formEditarFinca, tipoLeche: 'BUFALA' })}
                          className={`h-full rounded-xl border-[1.5px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            formEditarFinca.tipoLeche === 'BUFALA'
                              ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-2xs font-extrabold ring-1 ring-emerald-500/20'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-sm">🐃</span>
                          Búfala
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. OPCIÓN DIFERIR LITROS & LECHE ÁCIDA */}
                <div className="space-y-2.5 pt-1">
                  {/* CARD DIFERIR LITROS */}
                  <div
                    onClick={() => setFormEditarFinca({ ...formEditarFinca, esDiferido: !formEditarFinca.esDiferido })}
                    className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer select-none ${
                      formEditarFinca.esDiferido
                        ? 'bg-purple-50/90 border-purple-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formEditarFinca.esDiferido}
                        onChange={(e) => setFormEditarFinca({ ...formEditarFinca, esDiferido: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-purple-950 flex items-center gap-1.5">
                            <i className="fa-solid fa-calendar-plus text-purple-600"></i>
                            Diferir Litros para el Siguiente Ciclo
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                              formEditarFinca.esDiferido ? 'bg-purple-200 text-purple-900' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {formEditarFinca.esDiferido ? 'Pago en Ciclo Siguiente' : 'Ciclo Actual'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 m-0 mt-1 leading-snug">
                          Los litros recolectados se contabilizarán en la siguiente semana operativa sin afectar la liquidación corriente de la finca.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CARD LECHE ÁCIDA */}
                  <div
                    onClick={() => setFormEditarFinca({ ...formEditarFinca, esAcida: !formEditarFinca.esAcida })}
                    className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer select-none ${
                      formEditarFinca.esAcida
                        ? 'bg-rose-50/90 border-rose-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formEditarFinca.esAcida}
                        onChange={(e) => setFormEditarFinca({ ...formEditarFinca, esAcida: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                            <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                            ¿Es Leche Ácida / Deteriorada?
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                              formEditarFinca.esAcida ? 'bg-rose-200 text-rose-900' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {formEditarFinca.esAcida ? 'Leche Ácida' : 'Leche Dulce'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 m-0 mt-1 leading-snug">
                          Aplica tarifa especial de leche ácida y segrega la carga en receptoría.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. OBSERVACIONES */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="fa-regular fa-comment-dots text-slate-500"></i>
                    Observación (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formEditarFinca.observacion}
                    onChange={(e) => setFormEditarFinca({ ...formEditarFinca, observacion: e.target.value })}
                    placeholder="Nota operativa de la modificación..."
                    className="w-full h-10 px-3 rounded-xl border-[1.5px] border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs text-slate-800 transition-all"
                  />
                </div>

                {/* 6. MOTIVO OBLIGATORIO DE MODIFICACIÓN */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <i className="fa-solid fa-shield-halved text-amber-600"></i>
                    Motivo de la Modificación (Obligatorio para Bitácora de Auditoría) *
                  </label>
                  <textarea
                    rows={2}
                    value={formEditarFinca.motivo}
                    onChange={(e) => setFormEditarFinca({ ...formEditarFinca, motivo: e.target.value })}
                    placeholder="Explique detalladamente la razón contable/operativa del ajuste..."
                    className="w-full p-2.5 rounded-xl border-[1.5px] border-amber-300 bg-amber-50/40 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400"
                    required
                  />
                </div>
              </div>

              {/* PIE DE ACCIONES */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalEditarFincaAuditada(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-extrabold text-white transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                >
                  <i className="fa-solid fa-check"></i>
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 9. MODAL EDITAR ENTREGA AUDITADA (1:1 V2_3_11_26) */}
      {modalEditarEntregaAuditada && ticketTrazabilidad && entregaParaEditar && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-300 shadow-2xl overflow-hidden">
            <div
              className="px-5 py-4 flex items-center justify-between border-b border-white/10"
              style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg text-amber-400 shrink-0"
                  style={{
                    background: 'rgba(217, 119, 6, 0.2)',
                    border: '1.5px solid rgba(217, 119, 6, 0.4)',
                  }}
                >
                  <i className="fa-solid fa-pen-to-square"></i>
                </div>
                <div>
                  <h3 className="m-0 text-base font-extrabold text-white">Modificar Entrega en Planta</h3>
                  <p className="m-0 text-xs text-slate-400 font-medium">
                    Ajuste de descarga con registro obligatorio en bitácora
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalEditarEntregaAuditada(false)}
                className="text-slate-300 hover:text-white text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGuardarEditarEntrega} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Compañía / Planta Destino *</label>
                <SearchableSelect
                  options={companias.map((c) => ({
                    value: c.id,
                    label: `${c.nombre} (${c.encargado || 'Planta'})`,
                  }))}
                  value={formEditarEntrega.companiaId}
                  onChange={(val) => setFormEditarEntrega({ ...formEditarEntrega, companiaId: Number(val) })}
                  placeholder="-- BUSCAR COMPAÑÍA --"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Litros Entregados / Descargados *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={formEditarEntrega.litros || ''}
                  onChange={(e) => setFormEditarEntrega({ ...formEditarEntrega, litros: Number(e.target.value) })}
                  className="form-input w-full h-10 rounded-lg border border-slate-300 px-3 font-extrabold text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observación</label>
                <input
                  type="text"
                  value={formEditarEntrega.observacion}
                  onChange={(e) => setFormEditarEntrega({ ...formEditarEntrega, observacion: e.target.value })}
                  placeholder="Detalles de la entrega / ticket..."
                  className="form-input w-full h-10 rounded-lg border border-slate-300 px-3"
                />
              </div>

              <div>
                <label className="block font-bold text-amber-800 mb-1">
                  Motivo de la Modificación (Obligatorio para Auditoría) *
                </label>
                <textarea
                  rows={2}
                  value={formEditarEntrega.motivo}
                  onChange={(e) => setFormEditarEntrega({ ...formEditarEntrega, motivo: e.target.value })}
                  placeholder="Explique detalladamente la razón contable/operativa del ajuste..."
                  className="form-textarea w-full rounded-lg border border-amber-300 bg-amber-50/50 p-2 text-xs font-medium"
                  required
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalEditarEntregaAuditada(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 border border-slate-300 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-bold text-white shadow-xs"
                  style={{ background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' }}
                >
                  <i className="fa-solid fa-check mr-1"></i> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BITÁCORA GLOBAL DE AUDITORÍA (SUPERADMIN / ADMIN) */}
      {modalAuditoriaGlobal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-4 px-6 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-purple-300" />
                  Bitácora Global de Auditoría (Superadmin)
                </h3>
                <p className="text-xs text-purple-200 mt-0.5">
                  Registro inmutable de todas las creaciones, ediciones, limpiezas y reversiones operativas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalAuditoriaGlobal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filtros Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Desde:</span>
                <input
                  type="date"
                  value={filtroAuditDesde}
                  onChange={(e) => setFiltroAuditDesde(e.target.value)}
                  className="form-input text-xs h-8 rounded border-slate-300 px-2"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Hasta:</span>
                <input
                  type="date"
                  value={filtroAuditHasta}
                  onChange={(e) => setFiltroAuditHasta(e.target.value)}
                  className="form-input text-xs h-8 rounded border-slate-300 px-2"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Entidad:</span>
                <select
                  value={filtroAuditEntidad}
                  onChange={(e) => setFiltroAuditEntidad(e.target.value)}
                  className="form-select text-xs h-8 rounded border-slate-300 px-2 font-medium"
                >
                  <option value="">TODAS LAS ENTIDADES</option>
                  <option value="RECEPTORIA">RECEPTORÍA</option>
                  <option value="FINCA">FINCA / PARADA</option>
                  <option value="ENTREGA_PLANTA">ENTREGA A PLANTA</option>
                  <option value="CONTROL_COMPANIA">CONTROL COMPAÑÍA</option>
                  <option value="CONTROL_RUTA">TICKET / VIAJE</option>
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Buscar por motivo, acción o ticket..."
                  value={filtroAuditBusqueda}
                  onChange={(e) => setFiltroAuditBusqueda(e.target.value)}
                  className="form-input text-xs h-8 w-full rounded border-slate-300 px-3"
                />
              </div>

              <button
                type="button"
                onClick={() => refetchAudit()}
                className="btn btn-outline text-xs font-bold h-8 px-3 flex items-center gap-1 border border-purple-300 rounded text-purple-700 bg-white hover:bg-purple-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} /> Recargar
              </button>
            </div>

            {/* Content DataTable */}
            <div className="p-4 overflow-y-auto flex-1">
              <DataTable
                data={logsAuditoriaGlobal}
                columns={columnasAuditoriaGlobal}
                isLoading={isLoadingAudit}
                searchPlaceholder="Filtrar registros de auditoría..."
                exportFileName={`Auditoria_Global_${filtroAuditDesde}_al_${filtroAuditHasta}`}
                pageSizeDefault={20}
              />
            </div>

            {/* Footer */}
            <div className="p-3 px-6 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600">
              <span className="font-semibold">
                Mostrando {logsAuditoriaGlobal.length} registros auditados guardados en base de datos
              </span>
              <button
                type="button"
                onClick={() => setModalAuditoriaGlobal(false)}
                className="px-4 py-1.5 bg-slate-700 text-white rounded font-bold hover:bg-slate-800 transition-colors"
              >
                Cerrar Bitácora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViajesTicketsPage;
