import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import apiClient from '@/api/client';
import { operacionesApi } from '@/api/operaciones.api';
import { catalogosApi } from '@/api/catalogos.api';
import { sistemaApi } from '@/api/sistema.api';
import { finanzasApi } from '@/api/finanzas.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { CamionSelect, ChoferSelect, FincaSelect, CompaniaSelect } from '@/components/selectors';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';
import Swal from 'sweetalert2';
import { confirmDialog } from '@/lib/sweetalert';
import * as XLSX from 'xlsx';
import { useAuthStore } from '@/stores/authStore';
import type { ControlRutaDto, FincaDto, CamionDto, CompaniaDto, DespachoCompaniaDto, PlanificacionRutaChoferDto } from '@/types';
import { PlanificacionRutasChoferesPage } from './PlanificacionRutasChoferesPage';

interface RutaDetalleFinca {
  id: number;
  fecha: string;
  fincaId: number;
  fincaNombre?: string;
  propietarioNombre?: string;
  propietario?: string;
  litros: number;
  tipoLeche: string;
  esAcida?: boolean;
  horaRecoleccion?: string;
  controlRutaId?: number;
  ticketCodigo?: string;
  conductorNombre?: string;
  conductorId?: number;
  observacion?: string;
  createdAt?: string;
  CreatedAt?: string;
  esDiferido?: boolean;
  litrosOriginales?: number;
  fotoComprobante?: string;
  FotoComprobante?: string;
  foto?: string;
  puedeModificar?: boolean;
  cicloId?: number;
  cicloLiquidacionId?: number;
}

export const RecoleccionRutasPage: React.FC = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasBufala = useAuthStore((state) => state.hasTenantModule('MOD_LECHE_BUFALA'));
  const rol = user?.rol?.toUpperCase() || '';
  const esAdminOSup = ['ADMIN', 'ADMINISTRADOR', 'SUPERVISOR', 'GERENTE', 'SUPERADMIN', 'SUPER_ADMIN'].includes(rol) || rol.includes('ADMIN');
  const esChofer = rol === 'CHOFER';
  const isSuperAdmin = ['SUPERADMIN', 'SUPER_ADMIN'].includes(rol);

  // Fecha local real (evita saltos al día siguiente por UTC en horario nocturno)
  const hoyStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  // 3 Vistas Principales (Unificación Planificación + Recolección):
  // 1) 'planificacion': Planificación Diaria de Flota (Promedio 15 Días, asignación y generación de tickets)
  // 2) 'viajes': Control de Rutas & Camiones en Ruta / Tickets
  // 3) 'fincas': Detalle por Fincas (Historial / Buscador)
  const [searchParams] = useSearchParams();

  const [modoVista, setModoVista] = useState<'planificacion' | 'viajes' | 'fincas'>(() => {
    const qVista = new URLSearchParams(window.location.search).get('vista');
    if (qVista === 'viajes' || qVista === 'fincas' || qVista === 'planificacion') return qVista;
    return 'viajes'; // Iniciar en viajes para ver tickets de inmediato o alternar a planificacion
  });
  const [fechaFiltro, setFechaFiltro] = useState<string>(() => {
    const qFecha = new URLSearchParams(window.location.search).get('fecha');
    return qFecha || hoyStr;
  });

  // Sub-filtros en la vista de Rutas & Camiones
  const [filtroOrigenTicket, setFiltroOrigenTicket] = useState<'todos' | 'RUTA' | 'RECEPTORIA' | 'SALIDAS'>('todos');
  const [filtroEstadoTicket, setFiltroEstadoTicket] = useState<'activos' | 'todos'>('activos');
  const [busquedaTexto, setBusquedaTexto] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('ticket') || '';
  });

  // Escuchar cambios reactivos en searchParams (por ejemplo si el usuario hace clic en una notificación)
  useEffect(() => {
    const pFecha = searchParams.get('fecha');
    const pTicket = searchParams.get('ticket');

    if (pFecha) {
      setFechaFiltro(pFecha);
    }
    if (pTicket) {
      setBusquedaTexto(pTicket);
      setModoVista('viajes');
      setFiltroEstadoTicket('todos'); // Para asegurar que se muestre el ticket esté activo o finalizado
    }
  }, [searchParams]);

  // Filtros desplegables para Vista 2: Detalle por Fincas (Historial / Buscador)
  const [filtroDetalleChoferId, setFiltroDetalleChoferId] = useState<number | null>(null);
  const [filtroDetalleFincaId, setFiltroDetalleFincaId] = useState<number | null>(null);

  // Control de acordeón de paradas / fincas en tarjetas de viajes
  const [fincasExpandidas, setFincasExpandidas] = useState<Record<number, boolean>>({});

  // Ticket seleccionado actualmente
  const [viajeActivo, setViajeActivo] = useState<ControlRutaDto | null>(null);

  // Cache reactivo de fincas/paradas por ticket para garantizar sincronización 100% en vivo
  const [fincasTicketsMap, setFincasTicketsMap] = useState<Record<number, any[]>>({});
  const [loadingFincasMap, setLoadingFincasMap] = useState<Record<number, boolean>>({});

  const cargarFincasTicket = async (ticketId: number, silencioso = false) => {
    if (!ticketId) return [];
    try {
      if (!silencioso) setLoadingFincasMap((prev) => ({ ...prev, [ticketId]: true }));
      const paradas = await operacionesApi.getFincasViaje(ticketId);
      setFincasTicketsMap((prev) => ({ ...prev, [ticketId]: paradas || [] }));
      return paradas || [];
    } catch (err) {
      console.error(`Error cargando paradas para ticket #${ticketId}:`, err);
      return [];
    } finally {
      if (!silencioso) setLoadingFincasMap((prev) => ({ ...prev, [ticketId]: false }));
    }
  };

  // Modal Timelapse & Recorrido en Ruta
  const [modalTimelapse, setModalTimelapse] = useState(false);
  const [viajeTimelapse, setViajeTimelapse] = useState<ControlRutaDto | null>(null);

  // Estado para rastrear momento de detección de paradas móviles y reloj en vivo
  const [paradasDetectadasEnSesion, setParadasDetectadasEnSesion] = useState<Record<number, number>>({});
  const [nowTick, setNowTick] = useState(Date.now());
  const [ticketsTitilando, setTicketsTitilando] = useState<Record<number, number>>({});
  const prevTicketsDataRef = useRef<Record<number, { count: number; litros: number }>>({});
  const paradasVistasRef = useRef<Set<number>>(new Set());
  const esPrimeraCargaParadasRef = useRef<boolean>(true);

  // Reloj permanente cada segundo para animaciones y cuenta regresiva de titilar en toda la vista
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Helper para verificar si proviene de la App Móvil (estricto)
  const esOrigenMovil = (item: any): boolean => {
    if (!item) return false;
    const obs = String(item.observacion || item.Observacion || '').toUpperCase();
    return obs.includes('[ORIGEN_MOVIL]') || obs.includes('APP MÓVIL') || obs.includes('APP MOVIL');
  };

  // Helper para verificar si una parada debe estar titilando (20 segundos, estrictamente menos de un minuto)
  const estaTitilando = (p: any): boolean => {
    if (!esOrigenMovil(p)) return false; // NUNCA titila si fue registrada desde la web
    const refTime = paradasDetectadasEnSesion[p.id];
    if (!refTime || refTime <= 0) return false;
    const diff = nowTick - refTime;
    return diff >= 0 && diff < 20000;
  };

  // Polling ultra-reactivo en vivo cada 2.5s cuando el modal Timelapse está abierto (sin recargar la página)
  useEffect(() => {
    if (!modalTimelapse || !viajeTimelapse?.id) return;
    const est = String(viajeTimelapse.estado || '').trim().toUpperCase();
    if (est === 'FINALIZADO' || est === 'CERRADO' || (viajeTimelapse.procesoActualId || 1) >= 4) return;

    // Reloj cada segundo para animaciones y cuenta regresiva del titilar
    const timerTick = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    // Sondeo de servidor cada 2.5 segundos sin recargar página
    const timerPoll = setInterval(async () => {
      try {
        await cargarFincasTicket(viajeTimelapse.id, true);
        refetchViajes();
      } catch (err) {
        console.error('Error sondeo en vivo timelapse:', err);
      }
    }, 2500);

    return () => {
      clearInterval(timerTick);
      clearInterval(timerPoll);
    };
  }, [modalTimelapse, viajeTimelapse?.id]);

  // Rastrear nuevas paradas que ingresan y calcular si les corresponde titilar (25 seg)
  useEffect(() => {
    if (!modalTimelapse || !viajeTimelapse?.id) return;
    const paradas = fincasTicketsMap[viajeTimelapse.id] || [];
    if (paradas.length === 0) return;

    const ahora = Date.now();
    let huboNuevos = false;
    const nuevoMap = { ...paradasDetectadasEnSesion };

    for (const p of paradas) {
      if (!p.id) continue;
      if (nuevoMap[p.id] === undefined) {
        if (esOrigenMovil(p)) {
          const serverCreated = p.createdAt || (p as any).CreatedAt;
          const createdAtMs = serverCreated ? new Date(serverCreated).getTime() : ahora;
          const antiguedadMs = Math.abs(ahora - createdAtMs);

          // Si fue creado en los últimos 20 segundos
          if (antiguedadMs < 20000) {
            nuevoMap[p.id] = ahora;
            huboNuevos = true;
          } else {
            // Ya tiene más de 20 segundos de antigüedad; no debe titilar
            nuevoMap[p.id] = 0;
            huboNuevos = true;
          }
        } else {
          // Parada registrada desde la web o sin marca móvil; nunca titila
          nuevoMap[p.id] = 0;
          huboNuevos = true;
        }
      }
    }

    if (huboNuevos) {
      setParadasDetectadasEnSesion(nuevoMap);
    }
  }, [modalTimelapse, viajeTimelapse?.id, fincasTicketsMap]);

  // Modales Operativos
  const [modalIniciarViaje, setModalIniciarViaje] = useState(false);
  const [modalRegistroFinca, setModalRegistroFinca] = useState(false);
  const [modalAsignarRutas, setModalAsignarRutas] = useState(false);
  const [ticketParaRutas, setTicketParaRutas] = useState<any | null>(null);
  const [rutasSeleccionadasTicket, setRutasSeleccionadasTicket] = useState<number[]>([]);
  const [modalEditarRecoleccion, setModalEditarRecoleccion] = useState(false);
  const [modalEnviarReceptoria, setModalEnviarReceptoria] = useState(false);
  const [modalEnviarCompania, setModalEnviarCompania] = useState(false);
  const [modalTraspaso, setModalTraspaso] = useState(false);
  const [modalCerrarViaje, setModalCerrarViaje] = useState(false);

  // Formulario Iniciar Viaje (con Selección Múltiple de Rutas, Personalización de Fincas y Validación de Capacidad)
  const [formIniciar, setFormIniciar] = useState({
    fecha: fechaFiltro || hoyStr,
    camionId: 0,
    choferId: user?.id && rol === 'CHOFER' ? user.id : 0,
    rutaLogisticaId: 0,
    rutasLogisticasIds: [] as number[],
    toleranciaPorcentaje: 15,
    odometroInicialKm: '' as any,
    observaciones: '',
  });

  // Fincas seleccionadas específicamente para el viaje a iniciar (permite modificar la logística antes de arrancar)
  const [fincasSeleccionadasIniciar, setFincasSeleccionadasIniciar] = useState<number[]>([]);
  const [busquedaFincaIniciar, setBusquedaFincaIniciar] = useState('');
  const [mostrarTodasLasFincasIniciar, setMostrarTodasLasFincasIniciar] = useState(false);

  const abrirModalIniciarViaje = () => {
    setFormIniciar((prev) => ({
      ...prev,
      fecha: fechaFiltro || hoyStr,
      choferId: user?.id && rol === 'CHOFER' ? user.id : prev.choferId,
    }));
    setFincasSeleccionadasIniciar([]);
    setBusquedaFincaIniciar('');
    setMostrarTodasLasFincasIniciar(false);
    setModalIniciarViaje(true);
  };

  // Formulario Modal Registrar Recolección en Finca (para tickets abiertos)
  const [formFinca, setFormFinca] = useState({
    fincaId: 0,
    litros: '' as any,
    tipoLeche: 'VACA',
    esAcida: false,
    esDiferido: false,
    fecha: '',
    observacion: '',
    fotoComprobante: '',
  });
  const [fotoReciboModal, setFotoReciboModal] = useState<string | null>(null);
  const fileInputComprobanteRef = useRef<HTMLInputElement | null>(null);

  // Formulario Editar Recolección
  const [formEditar, setFormEditar] = useState({
    id: 0,
    fincaId: 0,
    litros: 0,
    tipoLeche: 'VACA',
    esAcida: false,
    esDiferido: false,
    fecha: '',
    observacion: '',
    fotoComprobante: '',
  });

  // Formulario Enviar Receptoría (1:1 V2_3_11_26)
  const [formReceptoria, setFormReceptoria] = useState({
    observacion: '',
  });

  // Formulario Enviar Compañía Directo (Multi-Destino 1:1 V2_3_11_26 modalEntregaDirecta)
  interface FilaEntregaDirecta {
    companiaId: number;
    litros: number | string;
    tipoLeche: string;
    origenServicio?: 'RUTA' | 'TRANSPORTE' | 'ACIDA';
    origenFincasCount?: number;
  }
  const [filasEntregaDirecta, setFilasEntregaDirecta] = useState<FilaEntregaDirecta[]>([
    { companiaId: 0, litros: '', tipoLeche: 'VACA' },
  ]);
  const [obsEntregaDirecta, setObsEntregaDirecta] = useState('');

  // Formulario Traspaso (1:1 V2_3_11_26 modalTraspasoLeche)
  const [modoTraspaso, setModoTraspaso] = useState<'EXISTENTE' | 'NUEVO'>('EXISTENTE');
  const [formTraspaso, setFormTraspaso] = useState({
    ticketDestinoId: 0,
    choferDestinoId: 0,
    litrosTraspaso: 0 as number | string,
    observacion: '',
  });
  const [traspasoChoferDestinoId, setTraspasoChoferDestinoId] = useState<number>(0);
  const [traspasoFechaDestino, setTraspasoFechaDestino] = useState<string>(hoyStr);

  // Formulario Cerrar Viaje
  const [formCerrar, setFormCerrar] = useState({
    odometroFinalKm: '' as any,
    observaciones: '',
  });

  // =========================================================================
  // REACT QUERIES
  // =========================================================================
  const { data: viajes = [], refetch: refetchViajes } = useQuery<ControlRutaDto[]>({
    queryKey: ['rutas-viajes-hoy', fechaFiltro],
    queryFn: () => operacionesApi.getControles(fechaFiltro),
    refetchInterval: 3500,
  });

  // Planificaciones de Rutas-choferes sincronizadas
  const { data: planificaciones = [], refetch: refetchPlanificaciones } = useQuery<PlanificacionRutaChoferDto[]>({
    queryKey: ['planificaciones-choferes', fechaFiltro],
    queryFn: () => operacionesApi.getPlanificacionesChoferes(fechaFiltro),
    refetchInterval: 5000,
  });

  // Modal Modificar Fincas de la Ruta en Caliente (Regla de Blindaje)
  const [modalModificarFincasTicket, setModalModificarFincasTicket] = useState(false);
  const [ticketParaModificarFincas, setTicketParaModificarFincas] = useState<ControlRutaDto | null>(null);
  const [fincasSeleccionadasTicket, setFincasSeleccionadasTicket] = useState<number[]>([]);
  const [fincasBloqueadasTicket, setFincasBloqueadasTicket] = useState<number[]>([]);
  const [busquedaFincaModalTicket, setBusquedaFincaModalTicket] = useState('');

  const abrirModalModificarFincasTicket = (ticket: ControlRutaDto) => {
    setTicketParaModificarFincas(ticket);
    const paradas = fincasTicketsMap[ticket.id] || [];
    // Fincas que ya tienen leche recolectada (> 0 L) quedan blindadas
    const bloqueadas = paradas
      .filter((p: any) => Number(p.litros || p.Litros || 0) > 0)
      .map((p: any) => Number(p.fincaId || p.FincaId));
    const todasEnTicket = paradas.map((p: any) => Number(p.fincaId || p.FincaId));
    setFincasBloqueadasTicket(bloqueadas);
    setFincasSeleccionadasTicket(Array.from(new Set(todasEnTicket)));
    setBusquedaFincaModalTicket('');
    setModalModificarFincasTicket(true);
  };

  const modificarFincasTicketMutation = useMutation({
    mutationFn: ({ ticketId, fincaIds }: { ticketId: number; fincaIds: number[] }) =>
      operacionesApi.modificarFincasTicket(ticketId, fincaIds),
    onSuccess: (res) => {
      toast.success(res.message || 'Fincas de la ruta actualizadas exitosamente');
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['planificaciones-choferes'] });
      if (ticketParaModificarFincas?.id) {
        cargarFincasTicket(ticketParaModificarFincas.id);
      }
      setModalModificarFincasTicket(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Error al modificar las fincas de la ruta');
    },
  });

  // Precargar y actualizar paradas reales para todos los viajes visibles (detecta nuevas fincas al instante)
  useEffect(() => {
    if (viajes && viajes.length > 0) {
      viajes.forEach((v) => {
        if (v.id) {
          cargarFincasTicket(v.id, true);
        }
      });
    }
  }, [viajes]);

  // Rastrear actividad reciente en tickets para hacerlos TITILAR (durante 20 segundos, estrictamente menos de un minuto)
  useEffect(() => {
    if (!viajes || viajes.length === 0) return;
    const ahora = Date.now();

    // 1. En la primera carga de la página, registrar todas las paradas existentes para que NO titilen por defecto
    if (esPrimeraCargaParadasRef.current) {
      let algunaCargada = false;
      viajes.forEach((v) => {
        const paradas = fincasTicketsMap[v.id] || [];
        if (paradas.length > 0) algunaCargada = true;
        paradas.forEach((p: any) => {
          if (p.id) paradasVistasRef.current.add(p.id);
        });
        prevTicketsDataRef.current[v.id] = {
          count: paradas.length,
          litros: v.totalLitrosFinca || paradas.reduce((acc: number, p: any) => acc + Number(p.litros || p.Litros || 0), 0),
        };
      });
      if (algunaCargada) {
        esPrimeraCargaParadasRef.current = false;
      }
      return;
    }

    // 2. En encuestas posteriores (en vivo): detectar ÚNICAMENTE paradas nuevas agregadas en tiempo real
    let huboCambios = false;
    const nuevosTitilando = { ...ticketsTitilando };

    viajes.forEach((v) => {
      const est = (v.estado || '').toUpperCase();
      const estP = (v.estadoProceso || '').toUpperCase();
      const esFin =
        est === 'FINALIZADO' ||
        est === 'CERRADO' ||
        est === 'CUADRADO' ||
        est === 'ENTREGADO' ||
        est === 'AUDITADO' ||
        estP === 'FINALIZADO' ||
        estP === 'CERRADO' ||
        v.procesoActualId === 3 ||
        v.procesoActualId === 4;

      const fechaTicketStr = (v.fecha || '').split('T')[0];
      const esDeHoy = Boolean(fechaTicketStr && fechaTicketStr === hoyStr);

      // Tickets finalizados o de fechas anteriores NUNCA titilan
      if (esFin || !esDeHoy) {
        if (nuevosTitilando[v.id]) {
          delete nuevosTitilando[v.id];
          huboCambios = true;
        }
        return;
      }

      const paradas = fincasTicketsMap[v.id] || [];
      const litrosActuales = v.totalLitrosFinca || paradas.reduce((acc: number, p: any) => acc + Number(p.litros || p.Litros || 0), 0);
      const paradasCount = paradas.length;

      // Buscar si hay alguna parada nueva que haya sido agregada en los últimos 45 segundos reales
      let tieneParadaNuevaEnVivo = false;
      paradas.forEach((p: any) => {
        const timeStamp = p.createdAt || (p as any).CreatedAt;
        const fechaParadaMs = timeStamp ? new Date(timeStamp).getTime() : 0;
        const esCreadaReciente = fechaParadaMs > 0 && (ahora - fechaParadaMs) < 45000;

        if (p.id && !paradasVistasRef.current.has(p.id)) {
          paradasVistasRef.current.add(p.id);
          if (esCreadaReciente) {
            tieneParadaNuevaEnVivo = true;
          }
        }
      });

      if (tieneParadaNuevaEnVivo) {
        // Titila durante 20 segundos estrictos (menos de un minuto)
        nuevosTitilando[v.id] = ahora + 20000;
        huboCambios = true;
      }

      prevTicketsDataRef.current[v.id] = { count: paradasCount, litros: litrosActuales };
    });

    if (huboCambios) {
      setTicketsTitilando(nuevosTitilando);
    }
  }, [viajes, fincasTicketsMap]);

  const { data: despachos = [], refetch: refetchDespachos } = useQuery<DespachoCompaniaDto[]>({
    queryKey: ['rutas-despachos-hoy', fechaFiltro],
    queryFn: () => operacionesApi.getDespachosCompanias(fechaFiltro),
    refetchInterval: 8000,
  });

  const { data: recolecciones = [], isLoading: loadingRecolecciones, refetch: refetchRecolecciones } = useQuery<RutaDetalleFinca[]>({
    queryKey: ['rutas-fincas-hoy', fechaFiltro],
    queryFn: async () => {
      const res = await apiClient.get<RutaDetalleFinca[]>(`/rutas/hoy?fecha=${fechaFiltro}`).catch(() => ({ data: [] }));
      return Array.isArray(res.data) ? res.data : [];
    },
    refetchInterval: 8000,
  });

  const { data: camiones = [] } = useQuery<CamionDto[]>({
    queryKey: ['camiones'],
    queryFn: () => catalogosApi.getCamiones(true),
  });

  const { data: fincas = [] } = useQuery<FincaDto[]>({
    queryKey: ['fincas'],
    queryFn: () => catalogosApi.getFincas(true),
  });

  const { data: companias = [] } = useQuery<CompaniaDto[]>({
    queryKey: ['companias'],
    queryFn: () => catalogosApi.getCompanias(true),
  });

  const { data: conductores = [] } = useQuery<any[]>({
    queryKey: ['conductores'],
    queryFn: () => catalogosApi.getChoferes(),
  });

  const { data: rutasLogistica = [] } = useQuery<any[]>({
    queryKey: ['rutas-logistica'],
    queryFn: () => operacionesApi.getRutasLogistica(),
  });

  const { data: ciclos = [] } = useQuery<any[]>({
    queryKey: ['ciclos-semanales'],
    queryFn: () => finanzasApi.getCiclos(),
  });

  const { data: cicloActivo = null } = useQuery<any>({
    queryKey: ['ciclo-activo'],
    queryFn: () => finanzasApi.getCicloActivo(),
  });

  // Semana operativa de la fecha seleccionada
  const cicloFechaFiltro = useMemo(() => {
    if (!Array.isArray(ciclos) || ciclos.length === 0 || !fechaFiltro) return null;
    return ciclos.find((c: any) => {
      const fIni = String(c.fechaInicio).split('T')[0];
      const fFin = String(c.fechaFin).split('T')[0];
      return fechaFiltro >= fIni && fechaFiltro <= fFin;
    }) || null;
  }, [ciclos, fechaFiltro]);

  const esSemanaOperativa = useMemo(() => {
    if (!cicloFechaFiltro) return true;
    return String(cicloFechaFiltro.estado || '').toUpperCase() === 'ABIERTO';
  }, [cicloFechaFiltro]);

  // Consulta histórica de fincas para cálculo del promedio semanal en vivo
  const fecha90DiasAtrasStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  }, []);

  const { data: reporteFincasPromedios = [] } = useQuery({
    queryKey: ['reporte-fincas-promedios-rutas', fecha90DiasAtrasStr, hoyStr],
    queryFn: () => sistemaApi.getReporteFincas(fecha90DiasAtrasStr, hoyStr),
    staleTime: 1000 * 60 * 15,
  });

  const mapaPromediosFincas = useMemo(() => {
    const map = new Map<number, number>();
    reporteFincasPromedios.forEach((rf: any) => {
      const detalle = Array.isArray(rf.detalle) && rf.detalle.length > 0 ? rf.detalle.slice(-15) : [];
      const cant = detalle.length > 0 ? detalle.length : 1;
      const total = detalle.length > 0
        ? detalle.reduce((acc: number, item: any) => acc + Number(item.litros || 0), 0)
        : Number(rf.totalLitros || 0);
      const prom = total > 0 ? Math.round(total / cant) : 0;
      if (prom > 0) map.set(Number(rf.id), prom);
    });
    return map;
  }, [reporteFincasPromedios]);

  const getPromedioFinca = (fincaId: number, f?: any): number => {
    if (mapaPromediosFincas.has(fincaId)) return mapaPromediosFincas.get(fincaId)!;
    return Number(f?.promedioLitrosDiarios || f?.litrosPromedio || 0) || 190;
  };

  // =========================================================================
  // MUTATIONS
  // =========================================================================
  const iniciarMutation = useMutation({
    mutationFn: async (dto: typeof formIniciar) => {
      const payload: any = {
        fecha: dto.fecha,
        camionId: dto.camionId,
        choferId: dto.choferId,
        rutaLogisticaId: dto.rutasLogisticasIds.length > 0 ? dto.rutasLogisticasIds[0] : (dto.rutaLogisticaId || undefined),
        rutasLogisticasIds: dto.rutasLogisticasIds,
        fincaIds: fincasSeleccionadasIniciar.length > 0 ? fincasSeleccionadasIniciar : undefined,
        odometroInicialKm: dto.odometroInicialKm ? Number(dto.odometroInicialKm) : undefined,
        observacion: dto.observaciones,
      };
      const res = await operacionesApi.iniciarViaje(payload);
      if (res?.id && fincasSeleccionadasIniciar.length > 0) {
        try {
          await operacionesApi.modificarFincasTicket(res.id, fincasSeleccionadasIniciar);
        } catch (e) {
          console.warn('Sincronización complementaria de fincas:', e);
        }
      }
      return res;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Viaje iniciado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      setModalIniciarViaje(false);
      setFincasSeleccionadasIniciar([]);
      setFormIniciar({
        fecha: fechaFiltro || hoyStr,
        camionId: 0,
        choferId: user?.id && rol === 'CHOFER' ? user.id : 0,
        rutaLogisticaId: 0,
        rutasLogisticasIds: [],
        toleranciaPorcentaje: 15,
        odometroInicialKm: '',
        observaciones: '',
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al iniciar viaje');
    },
  });

  const comprimirImagenRecibo = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxWidth = 1200;
          const maxHeight = 1200;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFotoComprobanteChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await comprimirImagenRecibo(file);
      setFormFinca((prev) => ({ ...prev, fotoComprobante: base64 }));
      toast.success('Foto del comprobante/recibo adjuntada correctamente');
    } catch (err) {
      toast.error('No se pudo procesar la foto');
    }
    e.target.value = '';
  };

  const guardarRecoleccionModalMutation = useMutation({
    mutationFn: async (dto: typeof formFinca) => {
      if (!viajeActivo) throw new Error('No hay ticket activo seleccionado');
      const payload: any = {
        controlRutaId: viajeActivo.id,
        fincaId: dto.fincaId,
        litros: Number(dto.litros),
        tipoLeche: dto.tipoLeche,
        esAcida: dto.esAcida,
        esDiferido: Boolean(dto.esDiferido),
        fecha: dto.fecha || (viajeActivo.fecha ? viajeActivo.fecha.split('T')[0] : undefined),
        observacion: dto.observacion,
        fotoComprobante: dto.fotoComprobante || undefined,
      };
      return operacionesApi.agregarFincaViaje(viajeActivo.id, payload);
    },
    onSuccess: async (data) => {
      toast.success(data.message || 'Finca agregada al viaje exitosamente');
      if (viajeActivo?.id) {
        await cargarFincasTicket(viajeActivo.id);
        queryClient.invalidateQueries({ queryKey: ['fincas-ticket', viajeActivo.id] });
      }
      if (viajeTimelapse?.id && viajeTimelapse.id !== viajeActivo?.id) {
        await cargarFincasTicket(viajeTimelapse.id);
        queryClient.invalidateQueries({ queryKey: ['fincas-ticket', viajeTimelapse.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      setModalRegistroFinca(false);
      setFormFinca({ fincaId: 0, litros: '', tipoLeche: 'VACA', esAcida: false, esDiferido: false, fecha: '', observacion: '', fotoComprobante: '' });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al registrar recolección');
    },
  });

  const abrirModalAsignarRutas = (ticket: any) => {
    setTicketParaRutas(ticket);
    const parsedRutas = (() => {
      const obs = ticket.observacion || '';
      const match = obs.match(/\[RUTAS:([^\]]+)\]/);
      if (match) {
        return match[1].split(',').map((id: string) => Number(id.trim())).filter((x: number) => x > 0);
      }
      return ticket.rutaLogisticaId ? [Number(ticket.rutaLogisticaId)] : [];
    })();
    setRutasSeleccionadasTicket(parsedRutas);
    setModalAsignarRutas(true);
  };

  const asignarRutasMutation = useMutation({
    mutationFn: async ({ ticketId, rutasIds }: { ticketId: number; rutasIds: number[] }) => {
      return operacionesApi.asignarRutasLogisticas(ticketId, {
        rutaLogisticaId: rutasIds.length > 0 ? rutasIds[0] : 0,
        rutasLogisticasIds: rutasIds,
      });
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Rutas logísticas actualizadas en el ticket');
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      setModalAsignarRutas(false);
      setTicketParaRutas(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al asignar rutas logísticas al ticket');
    },
  });

  // =========================================================================
  // CARGA MASIVA Y ESCANEO POR FOTO / IA (EXCLUSIVO SUPERADMIN)
  // =========================================================================
  const [modalRutasMasivo, setModalRutasMasivo] = useState(false);
  const [masivoFecha, setMasivoFecha] = useState(hoyStr);
  const [masivoConductorId, setMasivoConductorId] = useState<number>(0);
  const [masivoControlRutaId, setMasivoControlRutaId] = useState<number | null>(null);
  const [masivoFilas, setMasivoFilas] = useState<Array<{
    idTemp: string;
    fincaId: number;
    litros: number | '';
    tipoLeche: string;
    esAcida: boolean;
    observacion: string;
  }>>([]);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrMensaje, setOcrMensaje] = useState<string | null>(null);

  // Estados de Entrega Directa y Recepción para Choferes sin Teléfono (Hoja Física)
  const [masivoRegistrarEntrega, setMasivoRegistrarEntrega] = useState(false);
  const [masivoCompaniaId, setMasivoCompaniaId] = useState<number>(0);
  const [masivoLitrosRecibidos, setMasivoLitrosRecibidos] = useState<number | ''>('');
  const [masivoComprobantePesaje, setMasivoComprobantePesaje] = useState<string>('');
  const [masivoFinalizarInmediato, setMasivoFinalizarInmediato] = useState(false);

  const videoWebcamRef = useRef<HTMLVideoElement | null>(null);
  const canvasWebcamRef = useRef<HTMLCanvasElement | null>(null);
  const streamWebcamRef = useRef<MediaStream | null>(null);
  const fileInputMasivoRef = useRef<HTMLInputElement | null>(null);
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const abrirModalRutasMasivo = (ticket?: any) => {
    const tkt = ticket || null;
    setMasivoControlRutaId(tkt ? tkt.id : null);
    setMasivoFecha(tkt?.fecha ? tkt.fecha.split('T')[0] : (fechaFiltro || hoyStr));
    setMasivoConductorId(tkt ? (tkt.usuarioId || tkt.conductorId || 0) : 0);
    setOcrMensaje(null);
    setIsOcrLoading(false);
    setCamaraActiva(false);

    // Identificar compañía receptora por defecto
    const compDefault = companias.find((c) => {
      const nom = (c.nombre || '').toUpperCase();
      return nom.includes('RECEPTORIA') || nom.includes('RECEPTORÍA');
    }) || companias[0];
    setMasivoCompaniaId(compDefault ? compDefault.id : 0);
    setMasivoRegistrarEntrega(false);
    setMasivoLitrosRecibidos('');
    setMasivoComprobantePesaje('');
    setMasivoFinalizarInmediato(false);

    setMasivoFilas([
      { idTemp: Math.random().toString(), fincaId: 0, litros: '', tipoLeche: 'VACA', esAcida: false, observacion: '' },
    ]);
    setModalRutasMasivo(true);
  };

  const agregarFilaMasiva = () => {
    setMasivoFilas((prev) => [
      ...prev,
      { idTemp: Math.random().toString(), fincaId: 0, litros: '', tipoLeche: 'VACA', esAcida: false, observacion: '' },
    ]);
  };

  const removerFilaMasiva = (index: number) => {
    setMasivoFilas((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [{ idTemp: Math.random().toString(), fincaId: 0, litros: '', tipoLeche: 'VACA', esAcida: false, observacion: '' }];
    });
  };

  const actualizarFilaMasiva = (index: number, campo: string, valor: any) => {
    setMasivoFilas((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [campo]: valor };
      return copy;
    });
  };

  const iniciarCamara = async () => {
    setCamaraActiva(true);
    setOcrMensaje(null);
    try {
      if (streamWebcamRef.current) {
        streamWebcamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamWebcamRef.current = stream;
      if (videoWebcamRef.current) {
        videoWebcamRef.current.srcObject = stream;
        await videoWebcamRef.current.play();
      }
    } catch (err: any) {
      toast.error('No se pudo acceder a la cámara: ' + (err.message || 'Verifique permisos'));
      detenerCamara();
    }
  };

  const detenerCamara = () => {
    if (streamWebcamRef.current) {
      streamWebcamRef.current.getTracks().forEach((t) => t.stop());
      streamWebcamRef.current = null;
    }
    if (videoWebcamRef.current) {
      videoWebcamRef.current.srcObject = null;
    }
    setCamaraActiva(false);
  };

  const cambiarCamara = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    try {
      if (streamWebcamRef.current) {
        streamWebcamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamWebcamRef.current = stream;
      if (videoWebcamRef.current) {
        videoWebcamRef.current.srcObject = stream;
        await videoWebcamRef.current.play();
      }
    } catch (err: any) {
      toast.error('No se pudo cambiar de cámara');
    }
  };

  const capturarFoto = () => {
    const video = videoWebcamRef.current;
    if (!video || !canvasWebcamRef.current) return;
    const canvas = canvasWebcamRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.92);
      detenerCamara();
      procesarImagenOcr(base64);
    }
  };

  const handleSubirArchivoFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = evt.target?.result as string;
      if (base64) {
        procesarImagenOcr(base64);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const procesarImagenOcr = async (base64: string) => {
    setIsOcrLoading(true);
    setOcrMensaje(null);
    try {
      const resp = await operacionesApi.procesarOcrImagen(base64);
      const items = resp.items || [];
      if (items.length > 0) {
        const nuevasFilas = items.map((it: any) => {
          let fincaId = it.fincaId || 0;
          const fincaNombreDetectado = it.fincaNombreDetectado || '';
          if (!fincaId && fincaNombreDetectado) {
            const fMatch = fincas.find(
              (f) =>
                f.nombre.toLowerCase().includes(fincaNombreDetectado.toLowerCase()) ||
                fincaNombreDetectado.toLowerCase().includes(f.nombre.toLowerCase())
            );
            if (fMatch) fincaId = fMatch.id;
          }
          const isAcida = Boolean(it.esAcida) || (it.observacion && String(it.observacion).toLowerCase().includes('acid'));
          const tipoLeche = (it.tipoLeche || (fincas.find((f) => f.id === fincaId)?.tipoLeche || 'VACA')).toUpperCase();

          return {
            idTemp: Math.random().toString(),
            fincaId,
            litros: (Number(it.litros) || '') as number | '',
            tipoLeche: tipoLeche.includes('BUFAL') ? 'BUFALA' : 'VACA',
            esAcida: isAcida,
            observacion: it.observacion || '',
          };
        });
        setMasivoFilas(nuevasFilas);
        setOcrMensaje(`Se extrajeron ${items.length} registros con IA. Verifica y edita cualquier dato en la tabla antes de guardar.`);
        toast.success(`Se extrajeron ${items.length} registros de la foto con IA`);
      } else {
        toast.warning('No se detectaron registros legibles en la imagen. Puedes ingresarlos manualmente.');
      }
    } catch (err: any) {
      toast.error('Error al procesar la imagen con IA: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsOcrLoading(false);
    }
  };

  const guardarMasivoMutation = useMutation({
    mutationFn: async () => {
      const filasValidas = masivoFilas.filter((f) => f.fincaId > 0 || (f.litros !== '' && Number(f.litros) > 0));
      if (filasValidas.length === 0) {
        throw new Error('Debes completar al menos una finca con sus litros recolectados.');
      }
      for (let i = 0; i < filasValidas.length; i++) {
        const f = filasValidas[i];
        if (!f.fincaId || f.fincaId <= 0) {
          throw new Error(`La fila #${i + 1} no tiene una finca válida seleccionada.`);
        }
        if (!f.litros || Number(f.litros) <= 0) {
          throw new Error(`La fila #${i + 1} debe tener una cantidad válida de litros.`);
        }
      }
      const litrosEfectivosRecibidos = masivoLitrosRecibidos !== '' && Number(masivoLitrosRecibidos) > 0
        ? Number(masivoLitrosRecibidos)
        : totalLitrosMasivo;

      const payload = {
        fecha: masivoFecha,
        conductorId: masivoConductorId > 0 ? masivoConductorId : (viajeActivo?.usuarioId || user?.id || 1),
        controlRutaId: masivoControlRutaId || viajeActivo?.id || null,
        items: filasValidas.map((f) => ({
          fincaId: f.fincaId,
          litros: Number(f.litros),
          tipoLeche: f.tipoLeche,
          esAcida: f.esAcida,
          observacion: f.observacion || '',
        })),
        registrarEntrega: masivoRegistrarEntrega,
        companiaDestinoId: masivoRegistrarEntrega ? (masivoCompaniaId || (companias[0]?.id || 5028)) : null,
        litrosRecibidosPlanta: masivoRegistrarEntrega ? litrosEfectivosRecibidos : null,
        observacionEntrega: masivoComprobantePesaje || '',
        finalizarInmediato: masivoRegistrarEntrega ? masivoFinalizarInmediato : false,
      };
      return operacionesApi.guardarRutasMasivo(payload);
    },
    onSuccess: (data) => {
      Swal.fire({
        icon: 'success',
        title: masivoRegistrarEntrega ? '¡Recolección y Entrega Registrada!' : '¡Recolecciones Registradas!',
        text: data.message || 'Se procesó la carga masiva física exitosamente.',
        confirmButtonColor: '#059669',
        timer: 2800,
        showConfirmButton: false,
      });
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-despachos-hoy'] });
      setFechaFiltro(masivoFecha);
      setModoVista('viajes');
      setFiltroEstadoTicket('activos');
      setModalRutasMasivo(false);
      setMasivoFilas([]);
      detenerCamara();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Error al guardar recolección masiva');
    },
  });

  const totalLitrosMasivo = useMemo(() => {
    return masivoFilas.reduce((acc, f) => acc + (Number(f.litros) || 0), 0);
  }, [masivoFilas]);

  const limpiarTablaMasiva = () => {
    setMasivoFilas([
      { idTemp: Math.random().toString(), fincaId: 0, litros: '', tipoLeche: 'VACA', esAcida: false, observacion: '' },
      { idTemp: Math.random().toString(), fincaId: 0, litros: '', tipoLeche: 'VACA', esAcida: false, observacion: '' },
      { idTemp: Math.random().toString(), fincaId: 0, litros: '', tipoLeche: 'VACA', esAcida: false, observacion: '' },
    ]);
    setOcrMensaje(null);
  };

  // =========================================================================
  // CARGA MASIVA DE TICKETS DESDE EXCEL (SUPER ADMIN)
  // =========================================================================
  const [modalExcelMasivo, setModalExcelMasivo] = useState(false);
  const [archivoExcelNombre, setArchivoExcelNombre] = useState<string | null>(null);
  const [filasExcel, setFilasExcel] = useState<any[]>([]);
  const [validacionExcel, setValidacionExcel] = useState<any | null>(null);
  const [validandoExcel, setValidandoExcel] = useState(false);
  const [ejecutandoCargaExcel, setEjecutandoCargaExcel] = useState(false);
  const [omitirDuplicadosExcel, setOmitirDuplicadosExcel] = useState(true);
  const [filtroPreviewExcel, setFiltroPreviewExcel] = useState<'TODAS' | 'VALIDAS' | 'DUPLICADAS' | 'ERRORES'>('TODAS');
  const fileInputExcelRef = useRef<HTMLInputElement>(null);

  const parseFechaExcel = (val: any): string => {
    if (!val) return '';
    const str = String(val).trim();

    // 1. Número serial de Excel (número o string numérico: ej. 46323 o "46323")
    const num = Number(str);
    if (!isNaN(num) && num > 30000 && num < 75000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      return !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : '';
    }

    // 2. Formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // 3. Formato DD/MM/YYYY o DD-MM-YYYY o YYYY/MM/DD
    const parts = str.split(/[/.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }

    // 4. Intentar Date estándar
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
    }

    return '';
  };

  const parseCondicionesEspecialesExcel = (fincaRaw: string, obsRaw: string = '') => {
    const rawCompleto = `${fincaRaw} ${obsRaw}`.toUpperCase();

    // 1. Detección ÁCIDA
    const esAcida = /ACIDA|ÁCIDA|AGRIA|CORTADA/.test(rawCompleto);
    let precioEspecialUSD: number | undefined = undefined;
    const matchPrecio = fincaRaw.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/);
    if (matchPrecio && matchPrecio[1]) {
      const p = parseFloat(matchPrecio[1]);
      if (!isNaN(p) && p > 0 && p < 10) {
        precioEspecialUSD = p;
      }
    }

    // 2. Detección Tipo de Leche (BUFALA vs VACA)
    let tipoLeche: 'VACA' | 'BUFALA' = 'VACA';
    if (/🐃|BUFALA|BÚFALA|BUFALO|BÚFALO/.test(rawCompleto)) {
      tipoLeche = 'BUFALA';
    } else if (/🐄|VACA/.test(rawCompleto)) {
      tipoLeche = 'VACA';
    }

    // 3. Limpieza de nombre de finca para matching en catálogo
    let nombreLimpio = fincaRaw
      .replace(/[\(].*?[\)]/g, ' ')
      .replace(/🐃|🐄|BÚFALA|BUFALA|BUFALO|BÚFALO|VACA|ÁCIDA|ACIDA|AGRIA|CORTADA/gi, ' ')
      .replace(/\$\s*[0-9]+(?:\.[0-9]+)?/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { esAcida, precioEspecialUSD, tipoLeche, nombreLimpio };
  };

  const parseDecimalExcel = (val: any) => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return Math.round(val);
    let str = String(val).replace(/lts|lt|litros/gi, '').trim();
    // Si tiene separador de miles latino: ej. "1.660" o "6.000"
    if (/^\d{1,3}\.\d{3}$/.test(str)) {
      str = str.replace('.', '');
    } else if (/^\d{1,3},\d{3}$/.test(str)) {
      str = str.replace(',', '');
    } else {
      str = str.replace(',', '.');
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : Math.round(num);
  };

  const buscarFincaExcel = (valor: string) => {
    if (!valor) return null;
    const { nombreLimpio } = parseCondicionesEspecialesExcel(valor);
    const q = (nombreLimpio || valor).toLowerCase().trim();
    if (!q) return null;

    let found = fincas.find((f) => f.nombre.toLowerCase().trim() === q);
    if (found) return found;

    found = fincas.find((f) => (f.codigo && f.codigo.toLowerCase().trim() === q) || String(f.id) === q);
    if (found) return found;

    found = fincas.find((f) => f.nombre.toLowerCase().trim().includes(q) || q.includes(f.nombre.toLowerCase().trim()));
    if (found) return found;

    // Normalizado sin acentos
    const qNorm = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    found = fincas.find((f) => {
      const fNorm = f.nombre.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return fNorm === qNorm || fNorm.includes(qNorm) || qNorm.includes(fNorm);
    });

    return found || null;
  };

  const buscarConductorExcel = (valor: string) => {
    if (!valor) return null;
    const q = valor.toLowerCase().trim();
    let found = conductores.find((c) => (c.nombreCompleto || c.nombre || '').toLowerCase().trim() === q);
    if (found) return found;
    found = conductores.find((c) => (c.username || '').toLowerCase().trim() === q || String(c.id) === q);
    if (found) return found;
    found = conductores.find((c) => (c.nombreCompleto || c.nombre || '').toLowerCase().includes(q) || q.includes((c.nombreCompleto || c.nombre || '').toLowerCase()));
    return found || null;
  };

  const resolverCamionConductorExcel = (conductorId: number) => {
    if (!conductorId) return camiones[0] || null;
    const asignado = camiones.find((c) => c.usuarioId === conductorId || (c as any).choferHabitualId === conductorId);
    return asignado || camiones[0] || null;
  };

  const procesarArchivoExcel = async (file: File) => {
    setValidandoExcel(true);
    setArchivoExcelNombre(file.name);
    setValidacionExcel(null);
    setFilasExcel([]);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonRaw = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '', raw: false });

        if (jsonRaw.length === 0) {
          toast.error('El archivo Excel está vacío.');
          setValidandoExcel(false);
          return;
        }

        const normalizarClave = (str: string) =>
          str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        const filasParseadas: any[] = [];
        const filasParaBackend: any[] = [];

        jsonRaw.forEach((rowRaw, idx) => {
          const rowMap: Record<string, any> = {};
          Object.keys(rowRaw).forEach((k) => {
            rowMap[normalizarClave(k)] = rowRaw[k];
          });

          const fechaRaw = rowMap['FECHA'] || rowMap['DATE'] || rowMap['DIA'] || hoyStr;
          const fecha = parseFechaExcel(fechaRaw);

          const fincaRaw = String(rowMap['FINCA'] || rowMap['NOMBRE_FINCA'] || rowMap['PRODUCTOR'] || rowMap['GRANJA'] || '').trim();
          const obsRaw = String(rowMap['OBSERVACION'] || rowMap['OBSERVACIONES'] || rowMap['DETALLE'] || rowMap['NOTA'] || '').trim();
          const acidaRaw = String(rowMap['ACIDA'] || rowMap['ES_ACIDA'] || rowMap['LECHE_ACIDA'] || '').toUpperCase().trim();

          // Detección inteligente de condiciones especiales: Ácida, Búfala/Vaca, Precio y Nombre Limpio
          const condiciones = parseCondicionesEspecialesExcel(fincaRaw, obsRaw);
          const esAcida = condiciones.esAcida || ['SI', 'S', 'YES', 'TRUE', '1', 'VERDADERO'].includes(acidaRaw);
          const tipoLeche = condiciones.tipoLeche;
          const precioLitroUSDAplicado = condiciones.precioEspecialUSD;

          const fincaObj = buscarFincaExcel(fincaRaw);
          const fincaId = fincaObj ? fincaObj.id : 0;
          const fincaNombre = fincaObj ? fincaObj.nombre : (condiciones.nombreLimpio || fincaRaw);

          const litros = parseDecimalExcel(rowMap['LITROS'] || rowMap['LTS'] || rowMap['CANTIDAD'] || rowMap['VOLUMEN'] || 0);

          const conductorRaw = String(rowMap['CONDUCTOR'] || rowMap['CHOFER'] || rowMap['USUARIO'] || rowMap['TRANSPORTISTA'] || '').trim();
          const conductorObj = buscarConductorExcel(conductorRaw);
          const conductorId = conductorObj ? conductorObj.id : 0;
          const conductorNombre = conductorObj ? (conductorObj.nombreCompleto || conductorObj.nombre) : conductorRaw;

          const camionObj = resolverCamionConductorExcel(conductorId);
          const camionPlaca = camionObj ? camionObj.placa : 'S/P';
          const camionCapacidad = camionObj ? (camionObj.capacidadLitros || 10000) : 10000;

          const filaItem = {
            index: idx + 1,
            fecha,
            fechaRaw,
            fincaId,
            fincaNombre,
            fincaRaw,
            conductorId,
            conductorNombre,
            conductorRaw,
            litros,
            esAcida,
            tipoLeche,
            precioLitroUSDAplicado,
            observacion: obsRaw || (precioLitroUSDAplicado ? `[TARIFA: $${precioLitroUSDAplicado}]` : ''),
            camionId: camionObj?.id || null,
            camionPlaca,
            camionCapacidad,
          };

          filasParseadas.push(filaItem);
          filasParaBackend.push({
            index: idx + 1,
            fecha: fecha || null,
            fincaId,
            fincaNombre,
            conductorId,
            conductorNombre,
            litros,
            esAcida,
            tipoLeche,
            precioLitroUSDAplicado,
            observacion: filaItem.observacion,
          });
        });

        // Validar con Backend (duplicados, ciclos, camiones)
        const resVal = await operacionesApi.validarCargaMasivaExcel(filasParaBackend);
        setValidacionExcel(resVal);

        const resMap = new Map((resVal.resultados || []).map((r) => [r.index, r]));
        const filasCompletas = filasParseadas.map((f) => {
          const r = resMap.get(f.index);
          return {
            ...f,
            esValido: r ? r.esValido : (f.fincaId > 0 && f.conductorId > 0 && f.litros > 0 && Boolean(f.fecha)),
            esDuplicado: r ? r.esDuplicado : false,
            mensajeValidacion: r ? r.mensaje : (f.fincaId > 0 && f.conductorId > 0 && f.litros > 0 ? 'Válida' : 'Incompleta'),
            ticketExistenteId: r?.ticketExistenteId,
            ticketCodigo: r?.ticketCodigo,
            ticketEstado: r?.ticketEstado,
            camionPlaca: r?.camionPlaca || f.camionPlaca,
            camionId: r?.camionId || f.camionId,
            camionCapacidadLitros: r?.camionCapacidadLitros || f.camionCapacidad,
          };
        });

        setFilasExcel(filasCompletas);

        if (resVal.filasConError > 0) {
          toast.warning(`Archivo leído con ${resVal.filasConError} error(es) detectados.`);
        } else if (resVal.filasDuplicadas > 0) {
          toast.info(`Se detectaron ${resVal.filasDuplicadas} registros ya existentes en el sistema.`);
        } else {
          toast.success('¡Archivo validado exitosamente! Data 100% consistente.');
        }
      } catch (err: any) {
        console.error('Error al procesar Excel:', err);
        toast.error(err.message || 'Error al procesar archivo Excel');
      } finally {
        setValidandoExcel(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const descargarPlantillaExcel = () => {
    const finca1 = fincas[0]?.nombre || 'Huesito';
    const finca2 = fincas[1]?.nombre || 'El paujil';
    const conductorEj = conductores[0]?.nombreCompleto || 'Alfredy';

    const plantilla = [
      {
        FECHA: hoyStr,
        FINCA: finca1,
        LITROS: 250,
        CONDUCTOR: conductorEj,
        OBSERVACION: 'Ruta regular',
        ACIDA: 'NO',
      },
      {
        FECHA: hoyStr,
        FINCA: finca2,
        LITROS: 180,
        CONDUCTOR: conductorEj,
        OBSERVACION: 'Prueba de acidez conforme',
        ACIDA: 'SI',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(plantilla);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets_Recoleccion');
    XLSX.writeFile(wb, `Plantilla_Carga_Masiva_Tickets_${hoyStr}.xlsx`);
    toast.success('Plantilla Excel descargada exitosamente');
  };

  const ejecutarCargaMasivaExcel = async () => {
    if (!filasExcel.length) {
      toast.error('No hay datos para procesar.');
      return;
    }

    const filasAProcesar = filasExcel.filter((f) => {
      if (!f.esValido) return false;
      if (omitirDuplicadosExcel && f.esDuplicado) return false;
      return true;
    });

    if (!filasAProcesar.length) {
      toast.error('No hay filas válidas pendientes por registrar.');
      return;
    }

    const grupos = new Map<string, number>();
    filasAProcesar.forEach((f) => {
      const key = `${f.fecha}_${f.conductorNombre}`;
      grupos.set(key, (grupos.get(key) || 0) + 1);
    });

    const totalLitros = filasAProcesar.reduce((acc, f) => acc + (f.litros || 0), 0);

    const res = await Swal.fire({
      title: '¿Crear Tickets Nuevos?',
      html: `
        <div style="text-align: left; font-size: 13.5px; color: #cbd5e1; background: #1e293b; padding: 14px; border-radius: 12px; line-height: 1.6;">
          <p style="margin: 0 0 6px 0;">🎫 <b>Tickets a generar:</b> ${grupos.size} ticket(s) nuevo(s) (en estado <b>ABIERTO</b>)</p>
          <p style="margin: 0 0 6px 0;">🥛 <b>Paradas de recolección:</b> ${filasAProcesar.length} finca(s)</p>
          <p style="margin: 0 0 6px 0;">📊 <b>Litros totales:</b> ${totalLitros.toLocaleString()} Lts</p>
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">Los tickets se crearán en sus fechas correspondientes para tu verificación y finalización posterior.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
      confirmButtonText: '🚀 Sí, Crear Tickets Nuevos',
      cancelButtonText: 'Cancelar',
      background: '#0f172a',
      color: '#ffffff',
    });

    if (!res.isConfirmed) return;

    setEjecutandoCargaExcel(true);
    try {
      const payload = {
        filas: filasAProcesar.map((f) => ({
          fecha: f.fecha,
          fincaId: f.fincaId,
          conductorId: f.conductorId,
          camionId: f.camionId,
          litros: f.litros,
          esAcida: f.esAcida,
          tipoLeche: f.tipoLeche,
          precioLitroUSDAplicado: f.precioLitroUSDAplicado,
          observacion: f.observacion,
        })),
      };

      const result = await operacionesApi.ejecutarCargaMasivaExcel(payload.filas);

      await Swal.fire({
        icon: 'success',
        title: '¡Tickets Creados con Éxito!',
        html: `
          <div style="text-align: left; font-size: 13px; color: #cbd5e1; background: #1e293b; padding: 14px; border-radius: 12px;">
            <p>✅ <b>${result.ticketsCreadosCount} Ticket(s) Abierto(s) generado(s)</b></p>
            <p>🥛 <b>${result.paradasCreadasCount} paradas registradas</b> (${result.litrosTotales.toLocaleString()} Lts)</p>
            <ul style="margin: 8px 0 0 16px; padding: 0;">
              ${(result.tickets || [])
                .map((t: any) => `<li>Ticket #${t.ticketId || t.codigoTicket} • ${t.conductorNombre} (${t.fecha?.split('T')[0]}) - ${t.totalLitros.toLocaleString()} Lts</li>`)
                .join('')}
            </ul>
          </div>
        `,
        confirmButtonColor: '#059669',
        background: '#0f172a',
        color: '#ffffff',
      });

      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      setModalExcelMasivo(false);
      setFilasExcel([]);
      setValidacionExcel(null);
      setArchivoExcelNombre(null);
    } catch (err: any) {
      console.error('Error al ejecutar carga masiva Excel:', err);
      toast.error(err.response?.data?.message || 'Error al crear tickets masivos');
    } finally {
      setEjecutandoCargaExcel(false);
    }
  };

  const editarRecoleccionMutation = useMutation({
    mutationFn: (dto: typeof formEditar) =>
      operacionesApi.editarRecoleccion(dto.id, {
        fincaId: dto.fincaId,
        litros: Number(dto.litros),
        tipoLeche: dto.tipoLeche,
        esAcida: dto.esAcida,
        esDiferido: Boolean(dto.esDiferido),
        observacion: dto.observacion,
        fotoComprobante: dto.fotoComprobante || undefined,
      }),
    onSuccess: async (data) => {
      toast.success(data.message || 'Parada actualizada exitosamente');
      if (viajeActivo?.id) {
        await cargarFincasTicket(viajeActivo.id);
      } else {
        viajes.forEach((v) => cargarFincasTicket(v.id));
      }
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      setModalEditarRecoleccion(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar recolección');
    },
  });

  const eliminarRecoleccionMutation = useMutation({
    mutationFn: (id: number) => operacionesApi.eliminarRecoleccion(id),
    onSuccess: async (data) => {
      toast.success(data.message || 'Parada removida del viaje exitosamente');
      viajes.forEach((v) => cargarFincasTicket(v.id));
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al remover parada');
    },
  });

  const limpiarRecoleccionMutation = useMutation({
    mutationFn: (vars: { rutaId: number; controlRutaId?: number }) =>
      operacionesApi.limpiarRecoleccion(vars.rutaId, vars.controlRutaId),
    onSuccess: async (data) => {
      toast.success(data?.message || 'Información de la finca limpiada (marcada como no recogida)');
      viajes.forEach((v) => cargarFincasTicket(v.id));
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al limpiar información de la recolección');
    },
  });

  const diferirLitrosMutation = useMutation({
    mutationFn: (vars: { rutaId: number; litrosDiferir: number; cicloDestinoId?: number; motivo?: string }) =>
      operacionesApi.diferirLitros(vars.rutaId, {
        litrosDiferir: vars.litrosDiferir,
        cicloDestinoId: vars.cicloDestinoId,
        motivo: vars.motivo,
      }),
    onSuccess: (data) => {
      toast.success(data?.message || 'Litros diferidos exitosamente');
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      viajes.forEach((v) => cargarFincasTicket(v.id));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al diferir litros');
    },
  });

  const revertirDiferimientoMutation = useMutation({
    mutationFn: (rutaId: number) => operacionesApi.revertirDiferimiento(rutaId),
    onSuccess: (data) => {
      toast.success(data?.message || 'Diferimiento revertido exitosamente');
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      viajes.forEach((v) => cargarFincasTicket(v.id));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al revertir diferimiento');
    },
  });

  const verFotoComprobante = (fotoUrl: string, fincaNombre?: string, litros?: number) => {
    if (!fotoUrl) return;
    Swal.fire({
      title: `<span style="font-size: 17px; font-weight: 800; display: inline-flex; align-items: center; gap: 8px;"><i class="fa-solid fa-receipt" style="color: #3b82f6;"></i> Comprobante: ${fincaNombre || 'Finca'}</span>`,
      html: `
        <div style="text-align: center; margin-top: 8px;">
          <div style="font-size: 13px; color: #94a3b8; margin-bottom: 10px;">
            Volumen Recolectado: <strong style="color: #38bdf8; font-size: 14px;">${(litros || 0).toLocaleString('es-VE')} Lts</strong>
          </div>
          <div style="max-height: 65vh; overflow: auto; border-radius: 12px; background: #020617; padding: 6px; border: 1.5px solid #334155; box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);">
            <img src="${fotoUrl}" alt="Recibo" style="max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.4);" />
          </div>
          <div style="margin-top: 14px; display: flex; justify-content: center; gap: 10px;">
            <a href="${fotoUrl}" download="comprobante_${fincaNombre || 'finca'}.jpg" target="_blank" rel="noopener noreferrer" 
              style="background: #2563eb; color: #ffffff; padding: 8px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(37,99,235,0.4);">
              <i class="fa-solid fa-arrow-down"></i> Descargar / Abrir en Pestaña
            </a>
          </div>
        </div>
      `,
      background: '#0f172a',
      color: '#ffffff',
      showCloseButton: true,
      showConfirmButton: false,
      width: '680px',
    });
  };

  const abrirEditarDesdeHistorial = (row: RutaDetalleFinca) => {
    setFormEditar({
      id: row.id,
      fincaId: row.fincaId,
      litros: row.litros,
      tipoLeche: row.tipoLeche || 'VACA',
      esAcida: Boolean(row.esAcida),
      esDiferido: Boolean(row.esDiferido),
      fecha: row.fecha || hoyStr,
      observacion: row.observacion || '',
      fotoComprobante: row.fotoComprobante || row.FotoComprobante || row.foto || '',
    });
    setModalEditarRecoleccion(true);
  };

  const handleAbrirDiferir = async (row: RutaDetalleFinca) => {
    const rutaId = row.id;
    const fincaNombre = row.fincaNombre || `Finca #${row.fincaId}`;
    const litrosActuales = Number(row.litros || 0);
    const cicloActualId = Number(row.cicloId || cicloActivo?.id || 0);

    const semanasDisponibles = Array.isArray(ciclos) ? ciclos : [];
    const ciclosSiguientes = semanasDisponibles
      .filter((s: any) => Number(s.id) > cicloActualId)
      .sort((a: any, b: any) => Number(a.id) - Number(b.id));
    const sigCiclo = ciclosSiguientes[0] || null;
    const sigCicloId = sigCiclo ? Number(sigCiclo.id) : (cicloActualId + 1);

    const opcionesCiclosHtml = semanasDisponibles.map((s: any) => {
      const sId = Number(s.id);
      const sel = sId === sigCicloId ? 'selected' : '';
      return `<option value="${sId}" ${sel}>${s.codigo || `Semana ${sId}`}</option>`;
    }).join('');

    const sugeridoDiferir = Math.min(100, Math.max(1, litrosActuales - 1));

    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 18px; font-weight: 800; color: #ea580c; display: flex; align-items: center; justify-content: center; gap: 8px;"><i class="fa-solid fa-clock-rotate-left"></i> Diferir Litros para Siguiente Semana</span>`,
      html: `
        <div style="text-align: left; font-size: 13px; color: #cbd5e1; line-height: 1.5;">
          <div style="background: rgba(15, 23, 42, 0.95); border: 1.5px solid #334155; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="color: #94a3b8; font-size: 12px;">Finca Productora:</span>
              <strong style="color: #38bdf8; font-size: 14px;">${fincaNombre}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="color: #94a3b8; font-size: 12px;">Fecha Recolección:</span>
              <strong style="color: #f1f5f9;">${(row.fecha || '').split('T')[0]}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #94a3b8; font-size: 12px;">Litros Físicos Recolectados:</span>
              <strong style="color: #10b981; font-size: 16px;">${litrosActuales.toLocaleString('es-VE')} Lts</strong>
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <label for="swalLitrosDiferir" style="display: block; font-weight: 800; color: #f8fafc; font-size: 13px; margin-bottom: 6px;">
              Litros a pasar para la Siguiente Semana (Diferir):
            </label>
            <input id="swalLitrosDiferir" type="number" min="1" max="${litrosActuales}" value="${sugeridoDiferir}" class="swal2-input" 
              style="width: 100%; box-sizing: border-box; margin: 0; height: 44px; font-size: 16px; font-weight: 800; color: #ea580c; background: #ffffff; border: 2px solid #fdba74; border-radius: 8px; text-align: center;" />
            <small style="display: block; color: #94a3b8; font-size: 11px; margin-top: 4px;">
              * Puede diferir parte o la totalidad de los ${litrosActuales.toLocaleString('es-VE')} Lts.
            </small>
          </div>

          <!-- PREVISUALIZACIÓN EN TIEMPO REAL -->
          <div style="background: rgba(249, 115, 22, 0.1); border: 1.5px solid rgba(249, 115, 22, 0.4); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: #cbd5e1;">Se liquida esta semana (Sem. ${cicloActualId}):</span>
              <strong id="spanPrevLiquidarSemana" style="color: #10b981; font-size: 13.5px;">${(litrosActuales - sugeridoDiferir).toLocaleString('es-VE')} Lts</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: #cbd5e1;">Pasa para liquidar en semana entrante:</span>
              <strong id="spanPrevDiferirSemana" style="color: #f97316; font-size: 13.5px;">${sugeridoDiferir.toLocaleString('es-VE')} Lts</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px dashed rgba(249, 115, 22, 0.3); padding-top: 4px;">
              <span style="color: #94a3b8; font-size: 11.5px;"><i class="fa-solid fa-truck"></i> Camión y Tanque Operativo:</span>
              <strong style="color: #38bdf8; font-size: 12px;">${litrosActuales.toLocaleString('es-VE')} Lts (Físico Intacto)</strong>
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <label for="swalCicloDestino" style="display: block; font-weight: 800; color: #f8fafc; font-size: 12.5px; margin-bottom: 4px;">
              Semana Operativa Destino para Liquidación:
            </label>
            <select id="swalCicloDestino" class="swal2-select" style="width: 100%; box-sizing: border-box; margin: 0; height: 40px; font-size: 13px; font-weight: 700; background: #ffffff; color: #0f172a; border-radius: 8px;">
              ${opcionesCiclosHtml || `<option value="${sigCicloId}">Siguiente Semana (Semana ${sigCicloId})</option>`}
            </select>
          </div>

          <div>
            <label for="swalMotivoDiferir" style="display: block; font-weight: 800; color: #f8fafc; font-size: 12.5px; margin-bottom: 4px;">
              Motivo / Observación:
            </label>
            <input id="swalMotivoDiferir" type="text" value="Solicitud del productor" class="swal2-input" 
              style="width: 100%; box-sizing: border-box; margin: 0; height: 38px; font-size: 13px; font-weight: 600; color: #0f172a; background: #ffffff; border-radius: 8px;" />
          </div>
        </div>
      `,
      didOpen: () => {
        const inputLitros = document.getElementById('swalLitrosDiferir') as HTMLInputElement;
        const spanLiq = document.getElementById('spanPrevLiquidarSemana');
        const spanDif = document.getElementById('spanPrevDiferirSemana');
        if (inputLitros) {
          inputLitros.addEventListener('input', () => {
            const val = Number(inputLitros.value) || 0;
            const liq = Math.max(0, litrosActuales - val);
            if (spanLiq) spanLiq.innerText = `${liq.toLocaleString('es-VE')} Lts`;
            if (spanDif) spanDif.innerText = `${val.toLocaleString('es-VE')} Lts`;
          });
        }
      },
      background: '#0f172a',
      color: '#ffffff',
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-check"></i> Confirmar Diferimiento',
      confirmButtonColor: '#ea580c',
      cancelButtonText: 'Cancelar',
      cancelButtonColor: '#475569',
      focusConfirm: false,
      preConfirm: () => {
        const litrosInput = (document.getElementById('swalLitrosDiferir') as HTMLInputElement)?.value;
        const cicloDestinoInput = (document.getElementById('swalCicloDestino') as HTMLSelectElement)?.value;
        const motivoInput = (document.getElementById('swalMotivoDiferir') as HTMLInputElement)?.value;
        const val = Number(litrosInput);
        if (!val || val <= 0) {
          Swal.showValidationMessage('Debe ingresar una cantidad de litros mayor a cero');
          return false;
        }
        return {
          litrosDiferir: val,
          cicloDestinoId: cicloDestinoInput ? Number(cicloDestinoInput) : undefined,
          motivo: motivoInput || 'Solicitud del productor',
        };
      },
    });

    if (formValues) {
      diferirLitrosMutation.mutate({
        rutaId,
        litrosDiferir: formValues.litrosDiferir,
        cicloDestinoId: formValues.cicloDestinoId,
        motivo: formValues.motivo,
      });
    }
  };

  const handleRevertirDiferir = async (row: RutaDetalleFinca) => {
    const result = await Swal.fire({
      title: '¿Revertir Diferimiento?',
      text: `Se reintegrarán los litros a la recolección original de ${row.fincaNombre || 'la finca'}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, Revertir',
      confirmButtonColor: '#dc2626',
      cancelButtonText: 'Cancelar',
      background: '#0f172a',
      color: '#ffffff',
    });

    if (result.isConfirmed) {
      revertirDiferimientoMutation.mutate(row.id);
    }
  };

  const eliminarTicketMutation = useMutation({
    mutationFn: (ticketId: number) => operacionesApi.eliminarControl(ticketId),
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Ticket eliminado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al eliminar el ticket');
    },
  });

  const handleEliminarTicket = async (viaje: ControlRutaDto) => {
    const num = viaje.codigoTicket || viaje.id;
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar Ticket #${num}?`,
      text: 'Esta acción cancelará el viaje por completo y no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, Eliminar Ticket',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#64748b',
    });
    if (isConfirmed) {
      eliminarTicketMutation.mutate(viaje.id);
    }
  };

  const enviarReceptoriaMutation = useMutation({
    mutationFn: (ticketId: number) => operacionesApi.enviarAReceptoria(ticketId, formReceptoria.observacion),
    onSuccess: (data) => {
      Swal.fire({
        icon: 'success',
        title: '¡Despachado a Receptoría!',
        text: data?.message || 'El viaje ha sido enviado a receptoría para pesaje y control.',
        confirmButtonColor: '#d97706',
        timer: 2800,
        showConfirmButton: false,
      });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      setModalEnviarReceptoria(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al enviar a receptoría');
    },
  });

  const enviarCompaniaMutation = useMutation({
    mutationFn: (ticketId: number) => {
      const primeraFila = filasEntregaDirecta.find((f) => Number(f.companiaId) > 0 && Number(f.litros) > 0) || filasEntregaDirecta[0] || { companiaId: 0, litros: 0, tipoLeche: 'VACA' };
      return operacionesApi.enviarACompania(ticketId, {
        companiaId: Number(primeraFila.companiaId),
        litrosDespachados: Number(primeraFila.litros || 0),
        observacion: obsEntregaDirecta,
        destinos: filasEntregaDirecta.map((f) => ({
          companiaId: Number(f.companiaId),
          litros: Number(f.litros || 0),
          litrosDespachados: Number(f.litros || 0),
          tipoLeche: f.tipoLeche || 'VACA',
        })),
      });
    },
    onSuccess: (data) => {
      Swal.fire({
        icon: 'success',
        title: '¡Entrega Registrada Exitosamente!',
        text: data?.message || 'Se registraron los despachos a compañía correctamente.',
        confirmButtonColor: '#059669',
        timer: 2800,
        showConfirmButton: false,
      });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-despachos-hoy'] });
      setModalEnviarCompania(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al despachar a compañía');
    },
  });

  const traspasoMutation = useMutation({
    mutationFn: (id: number) => {
      const payload: any = {
        litrosTraspaso: Number(formTraspaso.litrosTraspaso),
        observacion: formTraspaso.observacion,
      };
      if (modoTraspaso === 'EXISTENTE') {
        payload.ticketDestinoId = Number(formTraspaso.ticketDestinoId);
      } else {
        payload.choferDestinoId = Number(traspasoChoferDestinoId);
        payload.fechaDestino = traspasoFechaDestino;
      }
      return operacionesApi.traspasarLeche(id, payload);
    },
    onSuccess: (data) => {
      Swal.fire({
        icon: 'success',
        title: '¡Traspaso Exitoso!',
        text: data?.mensaje || data?.message || 'Se traspasaron exitosamente los litros solicitados.',
        confirmButtonColor: '#0d9488',
        timer: 3500,
        showConfirmButton: true,
        confirmButtonText: 'Entendido',
      });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      setModalTraspaso(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al ejecutar traspaso');
    },
  });

  const cerrarViajeMutation = useMutation({
    mutationFn: (ticketId: number) =>
      operacionesApi.cerrarViaje(ticketId, {
        odometroFinalKm: formCerrar.odometroFinalKm ? Number(formCerrar.odometroFinalKm) : undefined,
        observaciones: formCerrar.observaciones,
      }),
    onSuccess: (data) => {
      toast.success(data.message || 'Viaje finalizado y cerrado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      setModalCerrarViaje(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al cerrar viaje');
    },
  });

  // =========================================================================
  // CÁLCULOS Y PROPIEDADES COMPUTADAS
  // =========================================================================
  const viajesFiltrados = useMemo(() => {
    let list = viajes;
    // Si el usuario es CHOFER, solo puede ver sus propios viajes
    if (esChofer && user) {
      list = list.filter(
        (v) =>
          v.choferId === user.id ||
          (v as any).conductorId === user.id ||
          ((user as any).camionId && v.camionId === (user as any).camionId) ||
          (v.choferNombre && v.choferNombre.toLowerCase().includes((user.nombreCompleto || '').toLowerCase()))
      );
    }
    // Filtrado estricto por Fecha Operativa seleccionada
    if (fechaFiltro) {
      list = list.filter((v) => (v.fecha || '').split('T')[0] === fechaFiltro);
    }
    // Si el usuario escribe una búsqueda específica (ej: número de ticket), no restringir por estado
    const tieneBusqueda = Boolean(busquedaTexto.trim());

    if (!tieneBusqueda && filtroEstadoTicket === 'activos') {
      list = list.filter((v) => {
        const est = (v.estado || '').toUpperCase();
        const estP = (v.estadoProceso || '').toUpperCase();
        return (
          est !== 'FINALIZADO' &&
          est !== 'CERRADO' &&
          est !== 'ENTREGADO' &&
          est !== 'CUADRADO' &&
          est !== 'AUDITADO' &&
          est !== 'CANCELADO' &&
          estP !== 'CERRADO' &&
          estP !== 'FINALIZADO' &&
          v.procesoActualId !== 4
        );
      });
    }
    // En 'todos' (Histórico Completo) se muestran TODOS los viajes de la fecha (abiertos y finalizados)
    return list;
  }, [viajes, filtroEstadoTicket, esChofer, user, fechaFiltro, busquedaTexto]);

  const despachosFiltrados = useMemo(() => {
    let list = despachos;
    // Si el usuario es CHOFER, solo puede ver los despachos que se le asignaron
    if (esChofer && user) {
      list = list.filter(
        (d) =>
          (d as any).choferId === user.id ||
          (d as any).conductorId === user.id ||
          ((user as any).camionId && d.camionId === (user as any).camionId) ||
          (d.choferNombre && d.choferNombre.toLowerCase().includes((user.nombreCompleto || '').toLowerCase()))
      );
    }
    // Filtrado estricto por Fecha Operativa seleccionada
    if (fechaFiltro) {
      list = list.filter((d) => (d.fecha || '').split('T')[0] === fechaFiltro);
    }
    const tieneBusqueda = Boolean(busquedaTexto.trim());
    if (!tieneBusqueda && filtroEstadoTicket === 'activos') {
      list = list.filter((d) => {
        const est = (d.estado || '').toUpperCase();
        const estP = ((d as any).estadoProceso || '').toUpperCase();
        return (
          est !== 'FINALIZADO' &&
          est !== 'CERRADO' &&
          est !== 'ENTREGADO' &&
          est !== 'CUADRADO' &&
          est !== 'AUDITADO' &&
          est !== 'CANCELADO' &&
          estP !== 'CERRADO' &&
          estP !== 'FINALIZADO'
        );
      });
    }
    // En 'todos' (Histórico Completo) se muestran todos los despachos
    return list;
  }, [despachos, filtroEstadoTicket, esChofer, user, fechaFiltro, busquedaTexto]);

  // Precargar automáticamente paradas de los viajes para que las métricas y conteos de paradas
  // se sincronicen reactivamente sin necesidad de hacer clic
  useEffect(() => {
    if (!viajes || viajes.length === 0) return;
    viajes.forEach((v) => {
      if (v.id && !fincasTicketsMap[v.id]) {
        cargarFincasTicket(v.id, true);
      }
    });
  }, [viajes]);

  const ticketsCombinados = useMemo(() => {
    const normRutas = viajesFiltrados.map((v) => ({
      ...v,
      _tipoTicket: 'RUTA' as const,
      _origenBadge: 'RUTA / FINCAS',
      _origenColor: '#0284c7',
      _origenBg: '#e0f2fe',
      _origenBorder: '#bae6fd',
      _origenIcon: 'fa-route',
      _litrosRecogidos: v.totalLitrosFinca || v.totalLitrosRecogidos || 0,
      _litrosEntregados: v.litrosEntregadosCompania || v.totalLitrosReceptoria || v.totalLitrosEntregados || 0,
      _conductor: v.choferNombre || v.nombreConductor || 'Sin asignar',
    }));

    const normDespachos = despachosFiltrados.map((d) => {
      const comp = (d.nombreCompania || d.companiaNombre || '').toUpperCase();
      const esSalida = comp !== '' && !comp.includes('RECEPTOR') && !comp.includes('PLANTA');
      const esConfirmado =
        (d.litrosRecibidosCompania != null && Number(d.litrosRecibidosCompania) > 0) ||
        (d.litrosConfirmados != null && Number(d.litrosConfirmados) > 0) ||
        (d as any).procesoActualId === 4 ||
        d.estado === 'FINALIZADO' ||
        d.estado === 'CONFIRMADO';

      return {
        id: d.id,
        codigoTicket: String(d.id),
        fecha: d.fecha,
        camionPlaca: d.camionPlaca,
        camionId: d.camionId,
        observacion: d.observaciones || d.observacion,
        estado: esConfirmado ? 'FINALIZADO' : 'RECEPCIONADO',
        _tipoTicket: (esSalida ? 'SALIDAS' : 'RECEPTORIA') as 'SALIDAS' | 'RECEPTORIA',
        _origenBadge: esSalida ? 'SALIDA' : 'RECEPTORÍA',
        _origenColor: esSalida ? '#dc2626' : '#9333ea',
        _origenBg: esSalida ? '#fef2f2' : '#f3e8ff',
        _origenBorder: esSalida ? '#fecaca' : '#e9d5ff',
        _origenIcon: esSalida ? 'fa-industry' : 'fa-building-wheat',
        _litrosRecogidos: d.litrosDespachados || 0,
        _litrosEntregados: d.litrosRecibidosCompania || d.litrosConfirmados || 0,
        _conductor: d.choferNombre || d.nombreConductor || 'Chofer Asignado',
        nombreCompania: d.nombreCompania || d.companiaNombre,
        esSalida,
        esConfirmado,
      };
    });

    let combinados: any[] = [];
    if (filtroOrigenTicket === 'RUTA') combinados = normRutas;
    else if (filtroOrigenTicket === 'RECEPTORIA') combinados = normDespachos.filter((d) => !d.esSalida);
    else if (filtroOrigenTicket === 'SALIDAS') combinados = normDespachos.filter((d) => d.esSalida);
    else combinados = [...normRutas, ...normDespachos];

    if (busquedaTexto.trim()) {
      const q = busquedaTexto.toLowerCase();
      combinados = combinados.filter(
        (t) =>
          String(t.id).includes(q) ||
          String(t.codigoTicket || '').toLowerCase().includes(q) ||
          String(t._conductor || '').toLowerCase().includes(q) ||
          String(t.camionPlaca || '').toLowerCase().includes(q) ||
          String(t.rutaLogisticaNombre || t.rutaNombre || '').toLowerCase().includes(q) ||
          String(t.nombreCompania || '').toLowerCase().includes(q)
      );
    }

    return combinados;
  }, [viajesFiltrados, despachosFiltrados, filtroOrigenTicket, busquedaTexto]);

  const contarTabs = useMemo(() => {
    const q = busquedaTexto.trim().toLowerCase();
    const coincide = (t: any) =>
      !q ||
      String(t.id).includes(q) ||
      String(t.codigoTicket || '').toLowerCase().includes(q) ||
      String(t._conductor || t.choferNombre || t.nombreConductor || '').toLowerCase().includes(q) ||
      String(t.camionPlaca || '').toLowerCase().includes(q) ||
      String(t.rutaLogisticaNombre || t.rutaNombre || '').toLowerCase().includes(q) ||
      String(t.nombreCompania || t.companiaNombre || '').toLowerCase().includes(q);

    const rutas = viajesFiltrados.filter(coincide);
    const receptoria = despachosFiltrados.filter((d: any) => {
      const comp = (d.nombreCompania || d.companiaNombre || '').toUpperCase();
      const esSalida = comp !== '' && !comp.includes('RECEPTOR') && !comp.includes('PLANTA');
      return !esSalida && coincide(d);
    });
    const salidas = despachosFiltrados.filter((d: any) => {
      const comp = (d.nombreCompania || d.companiaNombre || '').toUpperCase();
      const esSalida = comp !== '' && !comp.includes('RECEPTOR') && !comp.includes('PLANTA');
      return esSalida && coincide(d);
    });

    return {
      todos: rutas.length + receptoria.length + salidas.length,
      rutas: rutas.length,
      receptoria: receptoria.length,
      salidas: salidas.length,
    };
  }, [viajesFiltrados, despachosFiltrados, busquedaTexto]);

  // Lista filtrada para Detalle por Fincas (Filtros por Chofer y Finca)
  const recoleccionesFiltradas = useMemo(() => {
    return recolecciones.filter((r: any) => {
      // 0. Filtro estricto por Fecha Operativa seleccionada (nunca mezclar fechas diferentes)
      if (fechaFiltro) {
        const fechaItem = r.fecha ? String(r.fecha).split('T')[0] : '';
        if (fechaItem && fechaItem !== fechaFiltro) return false;
      }

      // Si el usuario es CHOFER, solo ve sus propias paradas
      if (esChofer && user) {
        const itemChoferId = Number(r.conductorId ?? r.ConductorId ?? r.usuarioId ?? r.UsuarioId ?? 0);
        const nomChoferItem = (r.conductorNombre || r.ConductorNombre || '').toLowerCase().trim();
        const miNombre = (user.nombreCompleto || '').toLowerCase().trim();
        if (itemChoferId > 0) {
          if (itemChoferId !== user.id) return false;
        } else if (nomChoferItem && miNombre) {
          if (!nomChoferItem.includes(miNombre) && !miNombre.includes(nomChoferItem)) return false;
        }
      }

      // 1. Filtro por Finca Ganadera
      if (filtroDetalleFincaId && filtroDetalleFincaId > 0) {
        const itemFincaId = Number(r.fincaId ?? r.FincaId ?? 0);
        if (itemFincaId !== filtroDetalleFincaId) return false;
      }

      // 2. Filtro por Chofer / Conductor
      if (filtroDetalleChoferId && filtroDetalleChoferId > 0) {
        const itemChoferId = Number(r.conductorId ?? r.ConductorId ?? r.usuarioId ?? r.UsuarioId ?? 0);
        if (itemChoferId > 0) {
          if (itemChoferId !== filtroDetalleChoferId) return false;
        } else {
          // Búsqueda por nombre de conductor si no viene el ID numérico en el registro
          const choferObj = conductores.find((c: any) => c.id === filtroDetalleChoferId);
          if (choferObj) {
            const nomChoferFiltro = (choferObj.nombreCompleto || choferObj.nombre || '').toLowerCase().trim();
            const nomChoferItem = (r.conductorNombre || r.ConductorNombre || '').toLowerCase().trim();
            if (!nomChoferItem || (!nomChoferItem.includes(nomChoferFiltro) && !nomChoferFiltro.includes(nomChoferItem))) {
              return false;
            }
          }
        }
      }

      return true;
    }).sort((a: any, b: any) => {
      const ltsA = Number(a.litros || a.Litros || 0);
      const ltsB = Number(b.litros || b.Litros || 0);
      const recA = ltsA > 0;
      const recB = ltsB > 0;
      if (recA && !recB) return -1;
      if (!recA && recB) return 1;
      if (recA && recB) {
        const timeA = new Date(a.createdAt || a.CreatedAt || a.fecha || 0).getTime();
        const timeB = new Date(b.createdAt || b.CreatedAt || b.fecha || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  }, [recolecciones, filtroDetalleFincaId, filtroDetalleChoferId, conductores, fechaFiltro, esChofer, user]);

  // Totales generales para Detalle por Fincas (calculados según los filtros aplicados)
  const totalesRecoleccion = useMemo(() => {
    let vaca = 0;
    let bufala = 0;
    let acida = 0;
    recoleccionesFiltradas.forEach((r) => {
      const lts = Number(r.litros || (r as any).Litros || 0);
      const tipo = (r.tipoLeche || (r as any).TipoLeche || '').toUpperCase();
      const esBuf = tipo.includes('BUFAL');
      if (esBuf) bufala += lts;
      else vaca += lts;
      if (r.esAcida || (r as any).EsAcida) acida += lts;
    });
    return { vaca, bufala, acida, total: vaca + bufala };
  }, [recoleccionesFiltradas]);

  // Totales de flota para tarjetas KPI superiores
  const kpisFlota = useMemo(() => {
    const salidasExternas = despachos.filter((d: any) => {
      const comp = (d.nombreCompania || d.companiaNombre || '').toUpperCase();
      return comp !== '' && !comp.includes('RECEPTOR') && !comp.includes('PLANTA');
    });
    const totalViajes = viajes.length + salidasExternas.length;
    const activosEnRuta = viajes.filter((v) => v.procesoActualId === 1 && v.estado !== 'FINALIZADO' && v.estado !== 'CERRADO').length;
    const totalRecogido = viajes.reduce((acc, v) => acc + Number(v.totalLitrosFinca || v.totalLitrosRecogidos || 0), 0);
    const totalDespachado = despachos.reduce((acc, d) => acc + Number(d.litrosDespachados || 0), 0);
    return { totalViajes, activosEnRuta, totalRecogido, totalDespachado };
  }, [viajes, despachos]);

  // Validación y cálculo dinámico de capacidad en Iniciar Viaje (con Fincas personalizadas y tolerancia ±15%)
  const calculoCapacidadModal = useMemo(() => {
    const rIds = formIniciar.rutasLogisticasIds;
    const camion = camiones.find((c) => c.id === formIniciar.camionId);
    const capacidad = camion?.capacidadLitros || 0;

    // Fincas activas: si hay fincas seleccionadas explícitas, usamos esas; si no y hay rutas, usamos las de las rutas
    let fincasActivas: any[] = [];
    if (fincasSeleccionadasIniciar.length > 0) {
      fincasActivas = fincas.filter((f) => fincasSeleccionadasIniciar.includes(f.id));
    } else if (rIds.length > 0) {
      fincasActivas = fincas.filter((f) => f.rutaId && rIds.includes(f.rutaId));
    }

    if (fincasActivas.length === 0 && rIds.length === 0) {
      return {
        rutasSeleccionadas: [],
        fincasDeRutas: [],
        litrosEstimados: 0,
        capacidad,
        diferencia: 0,
        porcentajeDesviacion: 0,
        porcentajeLlenado: 0,
        estado: 'MODO_LIBRE',
      };
    }

    const litrosEstimados = fincasActivas.reduce((acc, f) => acc + getPromedioFinca(f.id, f), 0);

    let diferencia = 0;
    let porcentajeDesviacion = 0;
    let porcentajeLlenado = 0;
    let estado: 'OPTIMO' | 'EXCESO' | 'BAJO' = 'OPTIMO';

    if (capacidad > 0) {
      diferencia = litrosEstimados - capacidad;
      porcentajeDesviacion = ((litrosEstimados - capacidad) / capacidad) * 100;
      porcentajeLlenado = Math.min(Math.round((litrosEstimados / capacidad) * 100), 200);
      const tol = Number(formIniciar.toleranciaPorcentaje) || 15;
      if (porcentajeDesviacion > tol) {
        estado = 'EXCESO';
      } else if (porcentajeDesviacion < -tol) {
        estado = 'BAJO';
      } else {
        estado = 'OPTIMO';
      }
    }

    return {
      rutasSeleccionadas: rutasLogistica.filter((r) => rIds.includes(r.id)),
      fincasDeRutas: fincasActivas,
      litrosEstimados,
      capacidad,
      diferencia,
      porcentajeDesviacion,
      porcentajeLlenado,
      estado,
    };
  }, [formIniciar.rutasLogisticasIds, fincasSeleccionadasIniciar, formIniciar.camionId, formIniciar.toleranciaPorcentaje, fincas, camiones, rutasLogistica, mapaPromediosFincas]);

  // Lista de fincas relevantes para el modal de Iniciar Viaje (para modificar la logística antes de iniciar)
  const fincasModalIniciarDisponibles = useMemo(() => {
    const rIds = formIniciar.rutasLogisticasIds;
    let base = fincas;
    if (!mostrarTodasLasFincasIniciar && rIds.length > 0) {
      base = fincas.filter((f) => f.rutaId && rIds.includes(f.rutaId));
    }
    if (!busquedaFincaIniciar.trim()) return base;
    const q = busquedaFincaIniciar.toLowerCase().trim();
    return base.filter((f) => {
      const nom = String(f.nombre || '').toLowerCase();
      const prod = String((f as any).productorNombre || (f as any).propietarioNombre || '').toLowerCase();
      const cod = String((f as any).codigo || f.id || '').toLowerCase();
      return nom.includes(q) || prod.includes(q) || cod.includes(q);
    });
  }, [fincas, formIniciar.rutasLogisticasIds, mostrarTodasLasFincasIniciar, busquedaFincaIniciar]);

  // TOGGLE DE ACORDEÓN EN TARJETAS
  const toggleAcordeonFincas = (ticketId: number) => {
    setFincasExpandidas((prev) => {
      const willExpand = !prev[ticketId];
      if (willExpand) {
        cargarFincasTicket(ticketId);
      }
      return {
        ...prev,
        [ticketId]: willExpand,
      };
    });
  };

  // TIMELAPSE DATA COMPUTED
  const timelapseData = useMemo(() => {
    if (!viajeTimelapse) return null;

    const estadoUpper = String(viajeTimelapse.estado || '').trim().toUpperCase();
    const codigoProcUpper = String(viajeTimelapse.codigoProceso || '').trim().toUpperCase();
    const esFinalizado =
      estadoUpper === 'FINALIZADO' ||
      estadoUpper === 'CERRADO' ||
      estadoUpper === 'ENTREGADO' ||
      estadoUpper === 'CUADRADO' ||
      codigoProcUpper === 'FINALIZADO' ||
      codigoProcUpper === 'CERRADO' ||
      (viajeTimelapse.procesoActualId || 1) >= 4;

    const parsedRutasActivas = (() => {
      const obs = viajeTimelapse.observacion || '';
      const match = obs.match(/\[RUTAS:([^\]]+)\]/);
      if (match) {
        return match[1].split(',').map((id: string) => Number(id.trim())).filter((x: number) => x > 0);
      }
      return viajeTimelapse.rutaLogisticaId ? [Number(viajeTimelapse.rutaLogisticaId)] : [];
    })();
    const tieneRuta = parsedRutasActivas.length > 0;
    const camionMatch = camiones.find((c) => c.id === viajeTimelapse.camionId || c.placa === viajeTimelapse.camionPlaca);
    const capacidadMax = camionMatch?.capacidadLitros || viajeTimelapse.capacidadCamionLitros || 10000;

    const paradasDelTicket = (Array.isArray(fincasTicketsMap[viajeTimelapse.id]) && fincasTicketsMap[viajeTimelapse.id].length > 0)
      ? fincasTicketsMap[viajeTimelapse.id]
      : recolecciones.filter((r) => r.controlRutaId != null && Number(r.controlRutaId) === Number(viajeTimelapse.id));

    // Identificar planificación asociada a este ticket
    const planCorrespondiente = planificaciones.find(
      (p) =>
        p.controlRutaId === viajeTimelapse.id ||
        (p.camionId === viajeTimelapse.camionId &&
          (p.conductorId === viajeTimelapse.usuarioId || (viajeTimelapse as any).choferId === p.conductorId))
    );

    // REGLA FUNDAMENTAL: Solo las paradas con LITROS > 0 son RECOLECTADAS (VERDE)
    const paradasRecolectadas = paradasDelTicket.filter(
      (item) => Number(item.litros || (item as any).Litros || (item as any).litrosLeche || 0) > 0
    );

    const visitadas = [...paradasRecolectadas]
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || (a as any).CreatedAt || a.fecha).getTime();
        const timeB = new Date(b.createdAt || (b as any).CreatedAt || b.fecha).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.id || 0) - (b.id || 0);
      });

    let acumulado = 0;
    const paradasConIntervalo = visitadas.map((item, idx) => {
      const litrosItem = Number(item.litros || (item as any).Litros || (item as any).litrosLeche || 0);
      acumulado += litrosItem;
      const fechaActual = new Date(item.createdAt || (item as any).CreatedAt || item.fecha);
      let minutosDesdeAnterior: number | null = null;
      if (idx > 0) {
        const fechaAnt = new Date(visitadas[idx - 1].createdAt || (visitadas[idx - 1] as any).CreatedAt || visitadas[idx - 1].fecha);
        const diffMs = fechaActual.getTime() - fechaAnt.getTime();
        minutosDesdeAnterior = Math.max(0, Math.round(diffMs / (1000 * 60)));
      }
      return {
        ...item,
        litros: litrosItem,
        acumulado,
        minutosDesdeAnterior,
        porcentajeCarga: Math.min(100, Math.round((acumulado / capacidadMax) * 100)),
      };
    });

    const idsRecolectadas = new Set(visitadas.map((v) => Number(v.fincaId || (v as any).FincaId)));

    // REGLA FUNDAMENTAL: PARADAS PENDIENTES (GRIS CON BOTÓN AGREGAR LITROS)
    // Solo deben mostrarse las fincas asignadas a ESTE ticket.
    // Las fincas que se sacaron de la planificación NO deben aparecer aquí (quedan libres para otro chofer).
    let pendientes: any[] = [];
    if (!esFinalizado) {
      if (planCorrespondiente && Array.isArray(planCorrespondiente.listaFincasIds) && planCorrespondiente.listaFincasIds.length > 0) {
        // Ticket con planificación: SOLO las fincas del plan que aún no tienen litros
        pendientes = planCorrespondiente.listaFincasIds
          .filter((fId) => !idsRecolectadas.has(fId))
          .map((fId) => {
            const fObj = fincas.find((f) => f.id === fId);
            const pEnTicket = paradasDelTicket.find((p) => Number(p.fincaId || (p as any).FincaId) === fId);
            return {
              id: fId,
              nombre: fObj?.nombre || pEnTicket?.fincaNombre || `Finca #${fId}`,
              propietario: fObj?.propietario || fObj?.propietarioNombre || pEnTicket?.propietarioNombre || 'No especificado',
              promedioLitrosDiarios: fObj?.promedioLitrosDiarios || (fObj as any)?.promedioLitros || 0,
              tipoLeche: fObj?.tipoLeche || pEnTicket?.tipoLeche || 'VACA',
            };
          });
      } else if (paradasDelTicket.length > 0) {
        // Ticket con paradas en TB_RUTAS_RECOLECCION: las que tienen litros == 0
        pendientes = paradasDelTicket
          .filter((p) => Number(p.litros || (p as any).Litros || (p as any).litrosLeche || 0) <= 0 && !idsRecolectadas.has(Number(p.fincaId || (p as any).FincaId)))
          .map((p) => {
            const fId = Number(p.fincaId || (p as any).FincaId);
            const fObj = fincas.find((f) => f.id === fId);
            return {
              id: fId,
              nombre: p.fincaNombre || fObj?.nombre || `Finca #${fId}`,
              propietario: p.propietarioNombre || fObj?.propietario || 'No especificado',
              promedioLitrosDiarios: fObj?.promedioLitrosDiarios || (fObj as any)?.promedioLitros || 0,
              tipoLeche: p.tipoLeche || fObj?.tipoLeche || 'VACA',
            };
          });
      }
    }

    const totalLitrosCalculado = paradasConIntervalo.length > 0 ? paradasConIntervalo[paradasConIntervalo.length - 1].acumulado : 0;
    const totalLitros = totalLitrosCalculado > 0 ? totalLitrosCalculado : (viajeTimelapse.totalLitrosFinca || viajeTimelapse.totalLitrosReceptoria || 0);
    const porcentajeLlenado = Math.min(100, Math.round((totalLitros / capacidadMax) * 100));

    const nombresRutas = parsedRutasActivas
      .map((id: number) => rutasLogistica.find((r) => r.id === id)?.nombre || `Ruta #${id}`)
      .join(', ');

    const estaEnReceptoria = Boolean(
      (viajeTimelapse.procesoActualId != null && viajeTimelapse.procesoActualId >= 2) ||
      (viajeTimelapse.litrosEntregadosCompania != null && Number(viajeTimelapse.litrosEntregadosCompania) > 0) ||
      (viajeTimelapse.totalLitrosReceptoria != null && Number(viajeTimelapse.totalLitrosReceptoria) > 0) ||
      viajeTimelapse.estado === 'EN_RECEPTORIA' ||
      viajeTimelapse.estado === 'RECEPCIONADO' ||
      viajeTimelapse.estado === 'CAMINO A COMPAÑIA' ||
      viajeTimelapse.estado === 'POR VERIFICACIÓN'
    );

    return {
      esFinalizado,
      estaEnReceptoria,
      tieneRuta,
      rutaNombre: nombresRutas || viajeTimelapse.rutaLogisticaNombre || (tieneRuta ? `Ruta #${viajeTimelapse.rutaLogisticaId}` : 'Modo Libre (Sin Ruta)'),
      chofer: viajeTimelapse.choferNombre || viajeTimelapse.nombreConductor || 'Sin Asignar',
      camion: camionMatch ? `${camionMatch.placa} (${camionMatch.capacidadLitros.toLocaleString()} Lts)` : viajeTimelapse.camionPlaca || 'Cisterna',
      capacidadMax,
      totalLitros,
      porcentajeLlenado,
      paradas: paradasConIntervalo,
      pendientes: esFinalizado ? [] : pendientes,
      totalParadasEstimadas: paradasConIntervalo.length + (esFinalizado ? 0 : pendientes.length),
    };
  }, [viajeTimelapse, fincasTicketsMap, recolecciones, fincas, camiones, planificaciones]);

  const abrirTimelapse = async (viaje: ControlRutaDto) => {
    setViajeTimelapse(viaje);
    setModalTimelapse(true);
    await cargarFincasTicket(viaje.id);
  };

  const handleAbrirReceptoria = (item: any) => {
    setViajeActivo(item);
    setFormReceptoria({ observacion: '' });
    setModalEnviarReceptoria(true);
  };

  const handleAbrirCompania = async (item: any) => {
    setViajeActivo(item);
    let fincasT = fincasTicketsMap[item.id] || [];
    if (!fincasT || fincasT.length === 0) {
      fincasT = await cargarFincasTicket(item.id, true);
    }
    const totalCamion = item._litrosRecogidos > 0 ? item._litrosRecogidos : fincasT.reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
    const yaAsignado = item._litrosEntregados || 0;
    const faltante = Math.max(0, totalCamion - yaAsignado);

    // Identificar compañías por defecto para Receptoría y Transporte (ej. COLONA)
    const compRecep = companias.find((c) => {
      const nom = (c.nombre || '').toUpperCase();
      return nom.includes('RECEPTORIA') || nom.includes('RECEPTORÍA');
    });

    const compTranspDefault = companias.find((c) => {
      const nom = (c.nombre || '').toUpperCase();
      const ts = Number((c as any).tipoServicioId || 1);
      return ts === 2 || nom.includes('COLONA');
    }) || companias.find((c) => {
      const nom = (c.nombre || '').toUpperCase();
      return !nom.includes('RECEPTORIA') && !nom.includes('RECEPTORÍA');
    });

    // Detectar si alguna finca del ticket tiene compañía asignada
    let compTicketTranspId: number | undefined = undefined;
    const fincaConCompTransp = fincasT.find(
      (x: any) => Number(x.tipoServicioId || x.TipoServicioId) === 2 && (x.companiaId || x.CompaniaId)
    );
    if (fincaConCompTransp) {
      compTicketTranspId = Number(fincaConCompTransp.companiaId || fincaConCompTransp.CompaniaId);
    }
    if (!compTicketTranspId && compTranspDefault) {
      compTicketTranspId = compTranspDefault.id;
    }

    // Agrupar por destino (Compañía), tipo de leche y origen (Ruta vs Transporte vs Ácida)
    const destinosAgrupados: Record<string, FilaEntregaDirecta> = {};

    if (fincasT && fincasT.length > 0) {
      fincasT.forEach((f: any) => {
        const rawTipo = (f.tipoLeche || f.TipoLeche || 'VACA').toUpperCase();
        const isBuf = rawTipo.includes('BUFAL');
        const obs = (f.observacion || f.Observacion || '').toUpperCase();
        const esAcida =
          f.esAcida === true ||
          f.EsAcida === true ||
          f.esAcida === 1 ||
          f.EsAcida === 1 ||
          String(f.esAcida).toLowerCase() === 'true' ||
          String(f.EsAcida).toLowerCase() === 'true' ||
          rawTipo.includes('ACID') ||
          rawTipo.includes('ÁCID') ||
          rawTipo.includes('MALA') ||
          obs.includes('[ACIDA]') ||
          obs.includes('[LECHE ÁCIDA]') ||
          obs.includes('[LECHE ACIDA]') ||
          obs.includes('ÁCIDA') ||
          obs.includes('ACIDA') ||
          obs.includes('MALA');

        const tipo = esAcida ? (isBuf ? 'BUFALA_ACIDA' : 'ACIDA') : (isBuf ? 'BUFALA' : 'VACA');
        const lts = Number(f.litros || f.Litros || 0);
        const tipoServ = Number(f.tipoServicioId || f.TipoServicioId || 1);
        const compFincaId = Number(f.companiaId || f.CompaniaId) || 0;

        let targetCompId: number = 0;
        let origenServ: 'RUTA' | 'TRANSPORTE' | 'ACIDA' = 'RUTA';

        if (esAcida) {
          origenServ = 'ACIDA';
          targetCompId = compRecep ? compRecep.id : (compFincaId || (companias[0]?.id || 0));
        } else if (tipoServ === 1) {
          origenServ = 'RUTA';
          targetCompId = compRecep ? compRecep.id : (compFincaId || (companias[0]?.id || 0));
        } else {
          // tipoServ === 2 (TRANSPORTE)
          origenServ = 'TRANSPORTE';
          targetCompId = compFincaId || compTicketTranspId || (companias[0]?.id || 0);
        }

        const key = `${targetCompId}_${tipo}_${origenServ}`;
        if (!destinosAgrupados[key]) {
          destinosAgrupados[key] = {
            companiaId: targetCompId,
            litros: 0,
            tipoLeche: tipo,
            origenServicio: origenServ,
            origenFincasCount: 0,
          };
        }
        destinosAgrupados[key].litros = Number(destinosAgrupados[key].litros) + lts;
        destinosAgrupados[key].origenFincasCount = (destinosAgrupados[key].origenFincasCount || 0) + 1;
      });
    }

    const filas = Object.values(destinosAgrupados).filter((d) => Number(d.litros) > 0);

    if (filas.length > 0) {
      setFilasEntregaDirecta(filas);
    } else {
      setFilasEntregaDirecta([
        {
          companiaId: item.companiaDestinoId || compRecep?.id || (companias.length > 0 ? companias[0].id : 0),
          litros: faltante > 0 ? faltante : totalCamion,
          tipoLeche: 'VACA',
          origenServicio: 'RUTA',
        },
      ]);
    }

    setObsEntregaDirecta('');
    setModalEnviarCompania(true);
  };

  const handleAbrirTraspaso = (item: any) => {
    setViajeActivo(item);
    const fincasT = fincasTicketsMap[item.id] || [];
    const totalCamion = item._litrosRecogidos > 0 ? item._litrosRecogidos : fincasT.reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
    const yaAsignado = item._litrosEntregados || 0;
    const ltsDisponibles = Math.max(0, totalCamion - yaAsignado);

    setModoTraspaso('EXISTENTE');
    setFormTraspaso({
      ticketDestinoId: 0,
      choferDestinoId: 0,
      litrosTraspaso: ltsDisponibles > 0 ? ltsDisponibles : totalCamion,
      observacion: '',
    });
    setTraspasoChoferDestinoId(0);
    setTraspasoFechaDestino(hoyStr);
    setModalTraspaso(true);
  };

  // =========================================================================
  // COLUMNAS TABLA DETALLE POR FINCAS (HISTORIAL / BUSCADOR - SOLO LECTURA)
  // =========================================================================
  const columnsRecolecciones: ColumnDef<RutaDetalleFinca>[] = [
    {
      header: 'HORA / REGISTRO',
      accessorKey: 'fecha',
      sortable: true,
      cell: (row) => {
        const timeStamp = row.createdAt || (row as any).CreatedAt;
        const horaStr = timeStamp
          ? new Date(timeStamp).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
          : row.horaRecoleccion || 'En campo';
        return (
          <div>
            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '12.5px' }}>
              {row.fecha ? new Date(row.fecha).toLocaleDateString('es-VE') : '-'}
            </span>
            <span style={{ fontSize: '11px', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 700, marginTop: '2px' }}>
              <i className="fa-regular fa-clock" style={{ fontSize: '10px' }}></i> {horaStr}
            </span>
          </div>
        );
      },
    },
    {
      header: 'TICKET / VIAJE',
      sortable: true,
      cell: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#4f46e5', fontSize: '13px' }}>
          {row.ticketCodigo || (row.controlRutaId ? `#${row.controlRutaId}` : 'Directo')}
        </span>
      ),
    },
    {
      header: 'CONDUCTOR',
      accessorKey: 'conductorNombre',
      sortable: true,
      cell: (row) => (
        <div style={{ fontSize: '12.5px', color: '#334155', fontWeight: 700 }}>
          <i className="fa-regular fa-user" style={{ color: '#64748b', marginRight: '5px' }}></i>
          {row.conductorNombre || 'Sin asignar'}
        </div>
      ),
    },
    {
      header: 'FINCA PRODUCTORA',
      accessorKey: 'fincaNombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-solid fa-cow" style={{ color: '#10b981' }}></i>
            {row.fincaNombre || `Finca #${row.fincaId}`}
          </div>
          {(row.propietarioNombre || row.propietario) && (
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>{row.propietarioNombre || row.propietario}</span>
          )}
        </div>
      ),
    },
    {
      header: 'LITROS RECOGIDOS',
      accessorKey: 'litros',
      sortable: true,
      cell: (row) => (
        <div>
          <span style={{ fontWeight: 800, color: '#2563eb', fontSize: '14px' }}>
            {(row.litros || 0).toLocaleString()} <small>Lts</small>
          </span>
          {row.esDiferido && (
            <span className="badge" style={{ display: 'block', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '10px', marginTop: '2px' }}>
              <i className="fa-solid fa-clock-rotate-left"></i> Diferido
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'TIPO DE LECHE',
      accessorKey: 'tipoLeche',
      sortable: true,
      cell: (row) => {
        const esBufala = (row.tipoLeche || '').toUpperCase().includes('BUFAL');
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span
              className="badge"
              style={{
                background: esBufala ? '#f3e8ff' : '#e0f2fe',
                color: esBufala ? '#7e22ce' : '#0369a1',
                border: `1px solid ${esBufala ? '#d8b4fe' : '#bae6fd'}`,
                fontWeight: 800,
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                width: 'fit-content',
              }}
            >
              {esBufala ? '🐃 BÚFALA' : '🥛 VACA'}
            </span>
            {row.esAcida && (
              <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 800, fontSize: '10px', width: 'fit-content' }}>
                <i className="fa-solid fa-flask" style={{ marginRight: '3px' }}></i> ÁCIDA
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: 'OBSERVACIÓN / DETALLE',
      accessorKey: 'observacion',
      cell: (row) => (
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {row.observacion || 'Sin observaciones'}
        </span>
      ),
    },
    {
      header: 'COMPROBANTE / FOTO',
      accessorKey: 'fotoComprobante',
      cell: (row) => {
        const foto = row.fotoComprobante || row.FotoComprobante || row.foto;
        if (foto && String(foto).trim().length > 5) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                onClick={() => verFotoComprobante(foto, row.fincaNombre, row.litros)}
                style={{
                  position: 'relative',
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1.5px solid #60a5fa',
                  cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
                  backgroundColor: '#0f172a',
                  flexShrink: 0,
                }}
                title="Click para ver comprobante en alta resolución"
              >
                <img
                  src={foto}
                  alt="Recibo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '11px',
                  }}
                >
                  <i className="fa-solid fa-magnifying-glass"></i>
                </div>
              </div>
              <button
                type="button"
                onClick={() => verFotoComprobante(foto, row.fincaNombre, row.litros)}
                className="btn btn-xs"
                style={{
                  background: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 800,
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <i className="fa-solid fa-eye"></i> Ver
              </button>
            </div>
          );
        }
        return (
          <span style={{ color: '#94a3b8', fontSize: '11.5px', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-regular fa-image" style={{ opacity: 0.6 }}></i> Sin foto
          </span>
        );
      },
    },
    {
      header: 'ACCIONES',
      cell: (row) => {
        const puedeEditar = esAdminOSup || row.puedeModificar !== false;
        const esDiferido = Boolean(row.esDiferido);

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            {puedeEditar && (
              <button
                type="button"
                onClick={() => abrirEditarDesdeHistorial(row)}
                className="btn btn-xs btn-outline"
                style={{
                  padding: '4px 8px',
                  fontSize: '11.5px',
                  borderColor: '#93c5fd',
                  color: '#2563eb',
                  background: '#eff6ff',
                  fontWeight: 800,
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                title="Editar litros, tipo de leche u observación"
              >
                <i className="fa-solid fa-pen-to-square"></i> Editar
              </button>
            )}

            {esDiferido ? (
              <button
                type="button"
                onClick={() => handleRevertirDiferir(row)}
                className="btn btn-xs btn-outline"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  borderColor: '#fca5a5',
                  color: '#dc2626',
                  background: '#fef2f2',
                  fontWeight: 800,
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                title="Revertir diferimiento y reintegrar a la recolección original"
              >
                <i className="fa-solid fa-rotate-left"></i> Revertir
              </button>
            ) : (
              puedeEditar && row.litros > 0 && (
                <button
                  type="button"
                  onClick={() => handleAbrirDiferir(row)}
                  className="btn btn-xs btn-outline"
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    borderColor: '#fdba74',
                    color: '#c2410c',
                    background: '#fff7ed',
                    fontWeight: 800,
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                  title="Diferir litros para la siguiente semana operativa"
                >
                  <i className="fa-solid fa-clock-rotate-left"></i> Diferir
                </button>
              )
            )}

            {esAdminOSup && row.litros > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const res = await Swal.fire({
                    title: '¿Limpiar información de recolección?',
                    html: `¿Deseas reiniciar los datos de recolección de <b>${row.fincaNombre || 'esta finca'}</b>?<br/><br/><div style="text-align: left; font-size: 13px; color: #cbd5e1; background: #1e293b; padding: 10px; border-radius: 8px;">
                      <p>✅ <b>La finca NO se eliminará</b> del ticket.</p>
                      <p>✅ Quedará marcada como <b>NO RECOGIDA (0 Litros)</b> para que el chofer pueda recolectarla.</p>
                      <p>⚠️ Se eliminarán los litros registrados (${row.litros} L), foto de comprobante y observaciones.</p>
                    </div>`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#2563eb',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: '<i class="fa-solid fa-eraser"></i> Sí, Limpiar y Dejar Pendiente',
                    cancelButtonText: 'Cancelar',
                    background: '#0f172a',
                    color: '#ffffff',
                  });
                  if (res.isConfirmed) {
                    limpiarRecoleccionMutation.mutate({ rutaId: row.id, controlRutaId: row.controlRutaId });
                  }
                }}
                className="btn btn-xs btn-outline"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  borderColor: '#93c5fd',
                  color: '#2563eb',
                  background: '#eff6ff',
                  fontWeight: 800,
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                title="Limpiar litros y fotos (Marcar como NO RECOGIDA / PENDIENTE en el ticket)"
              >
                <i className="fa-solid fa-eraser"></i> Limpiar
              </button>
            )}

            {esAdminOSup && (
              <button
                type="button"
                onClick={async () => {
                  const res = await Swal.fire({
                    title: '¿Eliminar Recolección?',
                    text: `Se eliminará el registro de ${row.litros} Lts de ${row.fincaNombre || 'la finca'}.`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#e11d48',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: 'Sí, Eliminar',
                    cancelButtonText: 'Cancelar',
                    background: '#0f172a',
                    color: '#ffffff',
                  });
                  if (res.isConfirmed) {
                    eliminarRecoleccionMutation.mutate(row.id);
                  }
                }}
                className="btn btn-xs btn-outline"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  color: '#e11d48',
                  borderColor: '#fecdd3',
                  background: '#fff1f2',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                title="Eliminar registro"
              >
                <i className="fa-solid fa-trash"></i>
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* ENCABEZADO Y KPIS SUPERIORES                                              */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', boxShadow: '0 4px 10px rgba(37,99,235,0.25)' }}>
              <i className="fa-solid fa-truck-moving" style={{ fontSize: '18px' }}></i>
            </span>
            Control de Recolección & Flota Cisterna
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            Supervisión integral de viajes, camiones en ruta, recolección por circuito y trazabilidad de leche.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isSuperAdmin && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setModalExcelMasivo(true);
                  setFilasExcel([]);
                  setValidacionExcel(null);
                  setArchivoExcelNombre(null);
                  if (fileInputExcelRef.current) fileInputExcelRef.current.value = '';
                }}
                style={{
                  fontWeight: 800,
                  fontSize: '13px',
                  padding: '9px 18px',
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
                title="Importar Excel con FECHA, FINCA, LITROS, CONDUCTOR, OBSERVACION, ACIDA para crear tickets nuevos"
              >
                <i className="fa-solid fa-file-excel"></i> Importar Excel (Tickets Masivos)
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => abrirModalRutasMasivo()}
                style={{
                  fontWeight: 700,
                  fontSize: '13px',
                  padding: '9px 18px',
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)',
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
                title="Registro masivo rápido y escaneo por IA / OCR exclusivo para SuperAdmin"
              >
                <i className="fa-solid fa-bolt"></i> Carga Masiva / Escanear Foto
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModoVista('planificacion')}
            style={{
              fontWeight: 800,
              fontSize: '13px',
              padding: '9px 18px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-calendar-check"></i> Planificar Flota (15 Días)
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={abrirModalIniciarViaje}
            style={{
              fontWeight: 700,
              fontSize: '12.5px',
              padding: '8px 14px',
              borderRadius: '9px',
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              color: '#334155',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
            title="Iniciar ticket rápido de recolección sin planificación previa"
          >
            <i className="fa-solid fa-bolt" style={{ color: '#f59e0b' }}></i> Viaje Rápido
          </button>
        </div>
      </div>

      {/* METRICAS KPI DE FLOTA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        <div className="content-card" style={{ padding: '16px 18px', borderLeft: '4px solid #2563eb', borderRadius: '12px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Viajes Operativos</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{kpisFlota.totalViajes}</span>
            <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '11px' }}>
              Fecha: {fechaFiltro}
            </span>
          </div>
        </div>

        <div className="content-card" style={{ padding: '16px 18px', borderLeft: '4px solid #10b981', borderRadius: '12px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Cisternas en Ruta</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#059669' }}>{kpisFlota.activosEnRuta}</span>
            <span className="badge" style={{ background: '#ecfdf5', color: '#047857', fontWeight: 700, fontSize: '11px' }}>
              En recolección
            </span>
          </div>
        </div>

        <div className="content-card" style={{ padding: '16px 18px', borderLeft: '4px solid #0284c7', borderRadius: '12px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Litros Recogidos Campo</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#0284c7' }}>{kpisFlota.totalRecogido.toLocaleString()} L</span>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>{recolecciones.length} paradas</span>
          </div>
        </div>

        <div className="content-card" style={{ padding: '16px 18px', borderLeft: '4px solid #9333ea', borderRadius: '12px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Litros Despachados</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#7e22ce' }}>{kpisFlota.totalDespachado.toLocaleString()} L</span>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>{despachos.length} despachos</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BARRA DE NAVEGACIÓN ENTRE VISTAS (2 PESTAÑAS: TICKETS & DETALLE FINCAS)     */}
      {/* ========================================================================= */}
      <div
        className="content-card"
        style={{
          padding: '10px 16px',
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginRight: '4px' }}>
            <i className="fa-solid fa-layer-group" style={{ color: '#4f46e5', marginRight: '4px' }}></i>
            Vista Operativa:
          </span>
          <div
            className="vista-operativa-switcher"
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              gap: '4px',
            }}
          >
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setModoVista('planificacion')}
              style={{
                minHeight: '38px',
                height: 'auto',
                padding: '6px 14px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '12px',
                fontWeight: modoVista === 'planificacion' ? 800 : 600,
                background: modoVista === 'planificacion' ? '#ffffff' : 'transparent',
                color: modoVista === 'planificacion' ? '#2563eb' : '#64748b',
                boxShadow: modoVista === 'planificacion' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <i className="fa-solid fa-calendar-check" style={{ color: modoVista === 'planificacion' ? '#2563eb' : '#64748b', flexShrink: 0 }}></i>
              <span>
                <span className="hidden sm:inline">1. </span>Planificación Flota
              </span>
              <span
                className="badge"
                style={{
                  background: modoVista === 'planificacion' ? '#eff6ff' : '#e2e8f0',
                  color: modoVista === 'planificacion' ? '#1d4ed8' : '#475569',
                  fontSize: '11px',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {planificaciones.length > 0 ? `${planificaciones.length} Cisternas` : '15 Días'}
              </span>
            </button>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setModoVista('viajes')}
              style={{
                minHeight: '38px',
                height: 'auto',
                padding: '6px 12px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '12px',
                fontWeight: modoVista === 'viajes' ? 800 : 600,
                background: modoVista === 'viajes' ? '#ffffff' : 'transparent',
                color: modoVista === 'viajes' ? '#1e293b' : '#64748b',
                boxShadow: modoVista === 'viajes' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <i className="fa-solid fa-truck-moving" style={{ color: modoVista === 'viajes' ? '#2563eb' : '#64748b', flexShrink: 0 }}></i>
              <span>
                <span className="hidden sm:inline">2. </span>Control Rutas & Camiones
              </span>
              <span
                className="badge"
                style={{
                  background: modoVista === 'viajes' ? '#eff6ff' : '#e2e8f0',
                  color: modoVista === 'viajes' ? '#1d4ed8' : '#475569',
                  fontSize: '11px',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {viajesFiltrados.length}
              </span>
            </button>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setModoVista('fincas')}
              style={{
                minHeight: '38px',
                height: 'auto',
                padding: '6px 12px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '12px',
                fontWeight: modoVista === 'fincas' ? 800 : 600,
                background: modoVista === 'fincas' ? '#ffffff' : 'transparent',
                color: modoVista === 'fincas' ? '#1e293b' : '#64748b',
                boxShadow: modoVista === 'fincas' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <i className="fa-solid fa-list-check" style={{ color: modoVista === 'fincas' ? '#2563eb' : '#64748b', flexShrink: 0 }}></i>
              <span>
                <span className="hidden sm:inline">3. </span>Detalle Fincas<span className="hidden md:inline"> (Historial)</span>
              </span>
              <span
                className="badge"
                style={{
                  background: modoVista === 'fincas' ? '#eff6ff' : '#e2e8f0',
                  color: modoVista === 'fincas' ? '#1d4ed8' : '#475569',
                  fontSize: '11px',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {filtroDetalleChoferId || filtroDetalleFincaId ? `${recoleccionesFiltradas.length}/${recoleccionesFiltradas.length}` : recoleccionesFiltradas.length}
              </span>
            </button>
          </div>
        </div>

        {/* SELECTOR DE FECHA GLOBAL Y ESTADO DE SEMANA OPERATIVA (ALINEADO A LA DERECHA) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {cicloFechaFiltro && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '8px',
                fontSize: '11.5px',
                fontWeight: 800,
                background: esSemanaOperativa ? '#ecfdf5' : '#fff1f2',
                color: esSemanaOperativa ? '#065f46' : '#9f1239',
                border: `1px solid ${esSemanaOperativa ? '#a7f3d0' : '#fecdd3'}`,
              }}
              title={`Semana del ${cicloFechaFiltro.fechaInicio?.split('T')[0]} al ${cicloFechaFiltro.fechaFin?.split('T')[0]} - Estado: ${cicloFechaFiltro.estado}`}
            >
              <i className={`fa-solid ${esSemanaOperativa ? 'fa-calendar-check text-emerald-600' : 'fa-triangle-exclamation text-rose-600'}`}></i>
              <span>{cicloFechaFiltro.codigo || `Semana #${cicloFechaFiltro.id}`}</span>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', opacity: 0.85 }}>({esSemanaOperativa ? 'Operativa' : cicloFechaFiltro.estado})</span>
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', padding: '6px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-regular fa-calendar-days" style={{ color: '#2563eb' }}></i>
              Fecha Operativa:
            </label>
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="form-input"
              style={{ height: '30px', fontSize: '13px', width: '140px', border: 'none', fontWeight: 800, color: '#0f172a', background: 'transparent' }}
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISTA 1: PLANIFICACIÓN DIARIA DE FLOTA (UNIFICACIÓN 15 DÍAS)              */}
      {/* ========================================================================= */}
      {modoVista === 'planificacion' && (
        <div style={{ marginBottom: '24px' }}>
          <PlanificacionRutasChoferesPage
            fechaInicial={fechaFiltro}
            onFechaChange={(f) => setFechaFiltro(f)}
            esIntegrado={true}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: CONTROL DE RUTAS & CAMIONES (FUSIÓN MIS TICKETS + CAMIONES RUTA) */}
      {/* ========================================================================= */}
      {modoVista === 'viajes' && (
        <div style={{ marginBottom: '24px' }}>
          {/* BARRA DE FILTROS SUPERIOR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            {/* Píldoras de Filtro por Origen: TODOS | Rutas / Fincas | Receptorías / Salidas */}
            <div style={{ display: 'flex', gap: '6px', background: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
              <button
                type="button"
                onClick={() => setFiltroOrigenTicket('todos')}
                style={{
                  border: 'none',
                  padding: '5px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: filtroOrigenTicket === 'todos' ? '#ffffff' : 'transparent',
                  color: filtroOrigenTicket === 'todos' ? '#0f172a' : '#64748b',
                  boxShadow: filtroOrigenTicket === 'todos' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Todos ({contarTabs.todos})
              </button>
              <button
                type="button"
                onClick={() => setFiltroOrigenTicket('RUTA')}
                style={{
                  border: 'none',
                  padding: '5px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: filtroOrigenTicket === 'RUTA' ? '#ffffff' : 'transparent',
                  color: filtroOrigenTicket === 'RUTA' ? '#0369a1' : '#64748b',
                  boxShadow: filtroOrigenTicket === 'RUTA' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-route" style={{ color: '#0284c7' }}></i>
                Rutas / Fincas ({contarTabs.rutas})
              </button>
              <button
                type="button"
                onClick={() => setFiltroOrigenTicket('RECEPTORIA')}
                style={{
                  border: 'none',
                  padding: '5px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: filtroOrigenTicket === 'RECEPTORIA' ? '#ffffff' : 'transparent',
                  color: filtroOrigenTicket === 'RECEPTORIA' ? '#7e22ce' : '#64748b',
                  boxShadow: filtroOrigenTicket === 'RECEPTORIA' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-building-wheat" style={{ color: '#9333ea' }}></i>
                Receptoría ({contarTabs.receptoria})
              </button>
              <button
                type="button"
                onClick={() => setFiltroOrigenTicket('SALIDAS')}
                style={{
                  border: 'none',
                  padding: '5px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: filtroOrigenTicket === 'SALIDAS' ? '#ffffff' : 'transparent',
                  color: filtroOrigenTicket === 'SALIDAS' ? '#dc2626' : '#64748b',
                  boxShadow: filtroOrigenTicket === 'SALIDAS' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-truck-arrow-right" style={{ color: '#dc2626' }}></i>
                Salidas ({contarTabs.salidas})
              </button>
            </div>

            {/* Buscador de texto y filtro Activos vs Histórico */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontSize: '12px' }}></i>
                <input
                  type="text"
                  placeholder="Buscar chofer, cisterna, ticket..."
                  value={busquedaTexto}
                  onChange={(e) => setBusquedaTexto(e.target.value)}
                  className="form-input"
                  style={{ height: '32px', paddingLeft: '28px', fontSize: '12px', borderRadius: '7px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setFiltroEstadoTicket('activos')}
                  style={{
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: filtroEstadoTicket === 'activos' ? '#ffffff' : 'transparent',
                    color: filtroEstadoTicket === 'activos' ? '#059669' : '#64748b',
                    boxShadow: filtroEstadoTicket === 'activos' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  Solo En Ruta / Activos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstadoTicket('todos')}
                  style={{
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: filtroEstadoTicket === 'todos' ? '#ffffff' : 'transparent',
                    color: filtroEstadoTicket === 'todos' ? '#1d4ed8' : '#64748b',
                    boxShadow: filtroEstadoTicket === 'todos' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  Histórico Completo
                </button>
              </div>
            </div>
          </div>

          {/* ESTILOS PARA VISTA TABULAR DE TARJETAS DE TICKETS */}
          <style>{`
            @keyframes ticketGlowFlash {
              0% {
                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.85);
                border-color: #10b981;
                background-color: #f0fdf4;
              }
              50% {
                box-shadow: 0 0 25px 8px rgba(16, 185, 129, 0.5);
                border-color: #059669;
                background-color: #dcfce7;
              }
              100% {
                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.85);
                border-color: #10b981;
                background-color: #f0fdf4;
              }
            }
            .ticket-card-titilando {
              animation: ticketGlowFlash 1.2s infinite ease-in-out !important;
              border: 2.5px solid #10b981 !important;
            }
            .ticket-table-card {
              background: #ffffff;
              border: 1.5px solid #e2e8f0;
              border-radius: 12px;
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
              transition: all 0.2s ease;
              overflow: hidden;
            }
            .ticket-table-card:hover {
              box-shadow: 0 4px 14px rgba(0, 0, 0, 0.07);
              border-color: #cbd5e1;
            }
            .ticket-table-row {
              display: grid;
              grid-template-columns: minmax(230px, 1.15fr) minmax(230px, 1.15fr) minmax(280px, 1.35fr) minmax(220px, 1fr);
              gap: 16px;
              padding: 14px 18px;
              align-items: center;
            }
            @media (max-width: 1200px) {
              .ticket-table-header {
                display: none !important;
              }
              .ticket-table-row {
                grid-template-columns: 1fr 1fr;
                gap: 16px;
              }
            }
            @media (max-width: 640px) {
              .ticket-table-row {
                grid-template-columns: 1fr;
                gap: 14px;
              }
            }
          `}</style>

          {/* GRID / TABLA DE TICKETS / CAMIONES EN RUTA */}
          {ticketsCombinados.length === 0 ? (
            <div className="content-card" style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <i className="fa-solid fa-truck-moving" style={{ fontSize: '38px', color: '#0284c7', marginBottom: '12px', display: 'block' }}></i>
              <h4 style={{ color: '#1e293b', fontSize: '16px', margin: '0 0 6px 0', fontWeight: 700 }}>
                No hay viajes o camiones registrados para esta fecha ({fechaFiltro})
              </h4>
              <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px 0' }}>
                Inicia un nuevo viaje de recolección para comenzar a registrar cargas en fincas.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={abrirModalIniciarViaje}
                style={{
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                }}
              >
                <i className="fa-solid fa-plus-circle"></i> Iniciar Nuevo Viaje / Ticket
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* ENCABEZADO TIPO TABLA PARA PANTALLAS GRANDES */}
              <div
                className="ticket-table-header"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(230px, 1.15fr) minmax(230px, 1.15fr) minmax(280px, 1.35fr) minmax(220px, 1fr)',
                  gap: '16px',
                  padding: '8px 18px',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              >
                <div><i className="fa-solid fa-ticket" style={{ marginRight: '6px', color: '#0284c7' }}></i> Ticket & Conductor</div>
                <div><i className="fa-solid fa-gas-pump" style={{ marginRight: '6px', color: '#0284c7' }}></i> Modo & Ocupación Cisterna</div>
                <div><i className="fa-solid fa-droplet" style={{ marginRight: '6px', color: '#0284c7' }}></i> Litros & Recorrido / Paradas</div>
                <div style={{ textAlign: 'center' }}><i className="fa-solid fa-sliders" style={{ marginRight: '6px', color: '#0284c7' }}></i> Acciones Operativas</div>
              </div>

              {ticketsCombinados.map((item: any) => {
                const esRuta = item._tipoTicket === 'RUTA';
                const esFinalizado =
                  item.estado === 'FINALIZADO' ||
                  item.estado === 'CERRADO' ||
                  item.estado === 'CUADRADO' ||
                  item.estado === 'ENTREGADO' ||
                  item.estado === 'AUDITADO' ||
                  item.estadoProceso === 'CERRADO' ||
                  item.estadoProceso === 'FINALIZADO' ||
                  item.procesoActualId === 4 ||
                  (!esRuta && item.esConfirmado);

                const esAbierto = !esFinalizado && (item.estado === 'ABIERTO' || item.procesoActualId === 1);
                const esMiTicket = item.usuarioId === user?.id || item.conductorId === user?.id;
                const tieneRutaLogistica = Boolean((item.rutaLogisticaId && item.rutaLogisticaId > 0) || item.rutaLogisticaNombre || item.rutaNombre);
                const planCorrespondiente = planificaciones.find(
                  (p) =>
                    p.controlRutaId === item.id ||
                    (p.camionId === item.camionId &&
                      (p.conductorId === item.conductorId || (item as any).choferId === p.conductorId))
                );

                const fincasTicketRaw = esRuta
                  ? (Array.isArray(fincasTicketsMap[item.id])
                      ? fincasTicketsMap[item.id]
                      : recolecciones.filter((r) => r.controlRutaId != null && Number(r.controlRutaId) === Number(item.id)))
                  : [];

                const fincasTicket = [...fincasTicketRaw].sort((a: any, b: any) => {
                  const ltsA = Number(a.litros ?? a.Litros ?? 0);
                  const ltsB = Number(b.litros ?? b.Litros ?? 0);
                  const recA = ltsA > 0;
                  const recB = ltsB > 0;
                  if (recA && !recB) return -1;
                  if (!recA && recB) return 1;
                  if (recA && recB) {
                    const timeA = new Date(a.createdAt || a.CreatedAt || a.fecha || 0).getTime();
                    const timeB = new Date(b.createdAt || b.CreatedAt || b.fecha || 0).getTime();
                    if (timeA !== timeB) return timeB - timeA;
                    return (Number(b.id) || 0) - (Number(a.id) || 0);
                  }
                  const nomA = a.fincaNombre || a.FincaNombre || a.finca || '';
                  const nomB = b.fincaNombre || b.FincaNombre || b.finca || '';
                  return nomA.localeCompare(nomB);
                });

                const cantParadas = fincasTicket.length > 0 ? fincasTicket.length : (item.totalFincas || 0);
                const sumFincasLts = fincasTicket.reduce((acc, f: any) => acc + Number(f.litros ?? f.Litros ?? 0), 0);
                const ltsRecolectados = fincasTicket.length > 0
                  ? sumFincasLts
                  : (esRuta && cantParadas === 0 && !esFinalizado ? 0 : (item._litrosRecogidos > 0 ? item._litrosRecogidos : sumFincasLts));
                const ltsEntregados = item._litrosEntregados || 0;
                const mermaLitros = ltsRecolectados > 0 && ltsEntregados > 0 ? (ltsRecolectados - ltsEntregados) : 0;
                const estaExpandido = Boolean(fincasExpandidas[item.id]);

                const estaEnReceptoriaOCompania = esRuta && !esFinalizado && (
                  (item.procesoActualId != null && item.procesoActualId >= 2) ||
                  ltsEntregados > 0 ||
                  (item.litrosEntregadosCompania != null && Number(item.litrosEntregadosCompania) > 0) ||
                  (item.totalLitrosReceptoria != null && Number(item.totalLitrosReceptoria) > 0) ||
                  item.estado === 'EN_RECEPTORIA' ||
                  item.estado === 'RECEPCIONADO' ||
                  item.estado === 'CAMINO A COMPAÑIA' ||
                  item.estado === 'POR VERIFICACIÓN' ||
                  item.estado === 'PENDIENTE'
                );
                const esAbiertoReal = !esFinalizado && !estaEnReceptoriaOCompania && (item.estado === 'ABIERTO' || item.procesoActualId === 1 || item.procesoActualId == null);
                const puedeEditarTicket = (esAdminOSup || esMiTicket) && esAbiertoReal;

                const camionMatch = camiones.find((c) => c.id === item.camionId || c.placa === item.camionPlaca);
                const capacidadCisterna = camionMatch?.capacidadLitros || item.capacidadCamionLitros || 10000;
                const porcentajeCisterna = Math.min(100, Math.round((ltsRecolectados / capacidadCisterna) * 100));

                const placaTexto = camionMatch
                  ? `${camionMatch.placa} - ${camionMatch.marca || 'Cisterna'}`
                  : item.camionPlaca || (item.camionId ? `Cisterna #${item.camionId}` : 'Cisterna en Turno');

                const fechaTicketItem = (item.fecha || '').split('T')[0];
                const esDeHoyItem = Boolean(fechaTicketItem && fechaTicketItem === hoyStr);
                const tiempoFinTitilar = ticketsTitilando[item.id] || 0;
                const esTicketTitilando = !esFinalizado && esDeHoyItem && tiempoFinTitilar > nowTick;

                return (
                  <div
                    key={`${item._tipoTicket}_${item.id}`}
                    className={`ticket-table-card ${esTicketTitilando ? 'ticket-card-titilando' : ''}`}
                    style={{
                      borderLeft: `5px solid ${esTicketTitilando ? '#10b981' : item._origenColor}`,
                    }}
                  >
                    {/* FILA PRINCIPAL: FORMATO COLUMNAS TIPO TABLA */}
                    <div className="ticket-table-row">
                      {/* COLUMNA 1: TICKET & CONDUCTOR (SIN FECHA Y SIN BADGE ABIERTO) */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                              <i className="fa-solid fa-ticket" style={{ color: item._origenColor, marginRight: '4px' }}></i>
                              Ticket #{item.codigoTicket || item.id}
                            </span>
                            <span
                              className="badge"
                              style={{
                                background: item._origenBg,
                                color: item._origenColor,
                                border: `1px solid ${item._origenBorder}`,
                                fontWeight: 800,
                                fontSize: '10.5px',
                                padding: '2px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              <i className={`fa-solid ${item._origenIcon}`} style={{ marginRight: '4px' }}></i>
                              {item._origenBadge}
                            </span>
                            {esTicketTitilando && (
                              <span
                                className="badge"
                                style={{
                                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  color: '#ffffff',
                                  fontWeight: 800,
                                  fontSize: '10px',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)',
                                  animation: 'pulse 0.9s infinite ease-in-out',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="fa-solid fa-bolt"></i> ¡NUEVA FINCA!
                              </span>
                            )}
                            {planCorrespondiente && (
                              <span
                                className="badge"
                                style={{
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  fontWeight: 800,
                                  fontSize: '10px',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Ruta creada y enlazada automáticamente desde la Planificación de Flota (15 Días)"
                              >
                                <i className="fa-solid fa-clipboard-check text-blue-600"></i> RUTA PLANIFICADA (15D)
                              </span>
                            )}
                          </div>
                          {puedeEditarTicket && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEliminarTicket(item);
                              }}
                              className="btn btn-xs"
                              style={{
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                padding: '2px 7px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                              title="Eliminar este ticket"
                            >
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          )}
                        </div>

                        <div>
                          <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-solid fa-user-tie" style={{ color: item._origenColor }}></i>
                            {item._conductor}
                          </span>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <i className="fa-solid fa-truck" style={{ color: '#64748b' }}></i>
                            <span>{placaTexto}</span>
                            <span style={{ color: '#94a3b8' }}>•</span>
                            <span style={{ fontWeight: 700, color: '#334155' }}>Capacidad: {capacidadCisterna.toLocaleString()} L</span>
                          </div>
                          {!esRuta && item.nombreCompania && (
                            <div style={{ fontSize: '12px', color: '#7e22ce', marginTop: '2px', fontWeight: 700 }}>
                              <i className="fa-solid fa-building-wheat" style={{ marginRight: '4px' }}></i>
                              Destino: {item.nombreCompania}
                            </div>
                          )}
                          {esRuta && !esFinalizado && !estaEnReceptoriaOCompania && esAdminOSup && (
                            <div style={{ marginTop: '7px' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirModalModificarFincasTicket(item);
                                }}
                                className="btn btn-xs"
                                style={{
                                  background: '#faf5ff',
                                  color: '#7e22ce',
                                  border: '1px solid #d8b4fe',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  padding: '3px 9px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  cursor: 'pointer',
                                }}
                                title="Modificar asignación de fincas de esta ruta en caliente (con regla de blindaje)"
                              >
                                <i className="fa-solid fa-pen-to-square"></i> Modificar Fincas de la Ruta
                              </button>
                            </div>
                          )}
                          {esRuta && !esFinalizado && estaEnReceptoriaOCompania && (
                            <div style={{ marginTop: '7px' }}>
                              <span
                                className="badge"
                                style={{
                                  background: '#fffbeb',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  fontWeight: 800,
                                  fontSize: '10px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Ticket en Receptoría: fincas bloqueadas en modo sólo lectura hasta que Receptoría devuelva el ticket"
                              >
                                <i className="fa-solid fa-lock"></i> Fincas Bloqueadas (En Receptoría)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* COLUMNA 2: MODO LIBRE / RUTA & OCUPACIÓN CISTERNA */}
                      <div>
                        {esRuta ? (
                          <>
                            <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {estaEnReceptoriaOCompania ? (
                                <span
                                  className="badge"
                                  title="Ticket en proceso de verificación en Receptoría (Modo Sólo Lectura)"
                                  style={{
                                    background: '#f8fafc',
                                    color: '#64748b',
                                    border: '1.5px solid #cbd5e1',
                                    fontWeight: 700,
                                    fontSize: '11px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '7px',
                                  }}
                                >
                                  <i className="fa-solid fa-lock" style={{ color: '#94a3b8' }}></i>
                                  {tieneRutaLogistica
                                    ? `Ruta: ${item.rutaLogisticaNombre || item.rutaNombre || `#${item.rutaLogisticaId}`}`
                                    : 'Modo Libre (Paradas Flexibles)'}
                                </span>
                              ) : tieneRutaLogistica ? (
                                <button
                                  type="button"
                                  onClick={() => abrirModalAsignarRutas(item)}
                                  className="badge"
                                  title="Haga clic para modificar o agregar más rutas logísticas a este ticket"
                                  style={{
                                    background: '#faf5ff',
                                    color: '#7e22ce',
                                    border: '1.5px solid #d8b4fe',
                                    fontWeight: 700,
                                    fontSize: '11px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '7px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <i className="fa-solid fa-route" style={{ color: '#9333ea' }}></i>
                                  Ruta: {item.rutaLogisticaNombre || item.rutaNombre || `#${item.rutaLogisticaId}`}
                                  <i className="fa-solid fa-pen-to-square" style={{ fontSize: '10px', color: '#a855f7', marginLeft: '4px' }}></i>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => abrirModalAsignarRutas(item)}
                                  className="badge"
                                  title="Haga clic para asignar una o más rutas logísticas a este ticket"
                                  style={{
                                    background: '#f8fafc',
                                    color: '#475569',
                                    border: '1.5px dashed #94a3b8',
                                    fontWeight: 700,
                                    fontSize: '11px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '7px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <i className="fa-solid fa-compass" style={{ color: '#64748b' }}></i>
                                  Modo Libre (Paradas Flexibles)
                                  <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 800, marginLeft: '4px', textDecoration: 'underline' }}>
                                    <i className="fa-solid fa-plus"></i> Asignar Rutas
                                  </span>
                                </button>
                              )}
                            </div>

                            {/* MEDIDOR Y PROGRESS BAR DE CAPACIDAD DE CISTERNA */}
                            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
                                  Ocupación Cisterna:
                                </span>
                                <strong style={{ fontSize: '12px', fontWeight: 800, color: porcentajeCisterna >= 95 ? '#dc2626' : '#0284c7' }}>
                                  {ltsRecolectados.toLocaleString()} / {capacidadCisterna.toLocaleString()} L ({porcentajeCisterna}%)
                                </strong>
                              </div>
                              <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${porcentajeCisterna}%`,
                                    height: '100%',
                                    background: porcentajeCisterna >= 100 ? '#ef4444' : porcentajeCisterna >= 80 ? '#f59e0b' : '#0284c7',
                                    borderRadius: '4px',
                                    transition: 'width 0.4s ease',
                                  }}
                                ></div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div
                            style={{
                              background: item.esSalida ? '#fef2f2' : '#faf5ff',
                              padding: '10px',
                              borderRadius: '8px',
                              border: `1px solid ${item.esSalida ? '#fecaca' : '#e9d5ff'}`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: '11px',
                                color: item.esSalida ? '#b91c1c' : '#7e22ce',
                                fontWeight: 700,
                                display: 'block',
                              }}
                            >
                              {item.esSalida ? 'Salida / Flete a Compañía' : 'Recepción en Planta'}
                            </span>
                            <strong style={{ fontSize: '13px', color: item.esSalida ? '#991b1b' : '#581c87' }}>
                              {item.nombreCompania || (item.esSalida ? 'Compañía Externa' : 'Receptoría Planta')}
                            </strong>
                          </div>
                        )}
                      </div>

                      {/* COLUMNA 3: LITROS & TIMELAPSE CON BOTÓN "+ FINCAS" */}
                      <div>
                        {/* Métricas de Litros: si aún no hay entrega a receptoría/empresa, solo muestra Litros en Camión sin el cuadro amarillo */}
                        <div style={{ display: 'grid', gridTemplateColumns: ltsEntregados > 0 ? '1fr 1fr' : '1fr', gap: '8px', marginBottom: '8px' }}>
                          <div style={{ background: '#eff6ff', padding: '6px 8px', borderRadius: '7px', border: '1px solid #bfdbfe' }}>
                            <span style={{ fontSize: '10.5px', color: '#1e40af', fontWeight: 700, display: 'block' }}>
                              {esRuta ? 'Litros en Camión:' : 'Litros Despachados:'}
                            </span>
                            <strong style={{ fontSize: '15px', color: '#1d4ed8', fontWeight: 800 }}>
                              {ltsRecolectados.toLocaleString('es-VE')} L
                            </strong>
                            {esRuta && (
                              <small style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                                {cantParadas} paradas registradas
                              </small>
                            )}
                          </div>

                          {ltsEntregados > 0 && (
                            <div
                              style={{
                                background: '#f0fdf4',
                                padding: '6px 8px',
                                borderRadius: '7px',
                                border: '1px solid #bbf7d0',
                              }}
                            >
                              <span style={{ fontSize: '10.5px', color: '#15803d', fontWeight: 700, display: 'block' }}>
                                {esRuta ? 'Litros Recibidos:' : 'Litros en Planta:'}
                              </span>
                              <strong style={{ fontSize: '15px', color: '#16a34a', fontWeight: 800 }}>
                                {ltsEntregados.toLocaleString('es-VE')} L
                              </strong>
                              <small style={{ fontSize: '10.5px', color: '#15803d', display: 'block' }}>
                                {item.nombreCompania ? `En ${item.nombreCompania}` : 'En Receptoría'}
                              </small>
                            </div>
                          )}
                        </div>

                        {/* Merma si hubo entrega */}
                        {ltsEntregados > 0 && mermaLitros > 0 && (
                          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '3px 8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>⚠️ Merma:</span>
                            <strong style={{ fontSize: '12px', fontWeight: 800, color: '#dc2626' }}>-{mermaLitros.toLocaleString()} Lts</strong>
                          </div>
                        )}

                        {/* TIMELAPSE INTEGRADO CON BOTÓN "+ FINCAS" Y TOGGLE PARADAS */}
                        {esRuta && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => abrirTimelapse(item)}
                              className="btn btn-sm"
                              style={{
                                flex: 1,
                                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                fontWeight: 800,
                                fontSize: '11px',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                              }}
                              title="Ver Timelapse & Recorrido de Paradas"
                            >
                              <i className="fa-solid fa-timeline" style={{ color: '#2563eb' }}></i>
                              <span>Timelapse ({cantParadas})</span>
                            </button>

                            {puedeEditarTicket && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViajeActivo(item);
                                  setFormFinca({ fincaId: 0, litros: '', tipoLeche: 'VACA', esAcida: false, esDiferido: false, fecha: '', observacion: '', fotoComprobante: '' });
                                  setModalRegistroFinca(true);
                                }}
                                className="btn btn-sm"
                                style={{
                                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  color: '#ffffff',
                                  border: 'none',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                                title={tieneRutaLogistica ? 'Añadir finca faltante a esta ruta' : 'Añadir parada a este ticket'}
                              >
                                <i className="fa-solid fa-plus"></i> Fincas
                              </button>
                            )}

                            {fincasTicket.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleAcordeonFincas(item.id)}
                                className="btn btn-sm"
                                style={{
                                  background: estaExpandido ? '#e2e8f0' : '#f8fafc',
                                  color: '#334155',
                                  border: '1px solid #cbd5e1',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                }}
                                title={estaExpandido ? 'Ocultar listado de paradas' : 'Ver listado detallado de paradas'}
                              >
                                <i className={`fa-solid fa-chevron-${estaExpandido ? 'up' : 'down'}`} style={{ fontSize: '10px' }}></i>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* COLUMNA 4: BOTONES COMO ACCIONES */}
                      <div>
                        <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', textAlign: 'center' }}>
                          Acciones
                        </div>
                        {esRuta && !esFinalizado ? (
                          estaEnReceptoriaOCompania ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span
                                className="badge"
                                style={{
                                  background: '#faf5ff',
                                  color: '#7e22ce',
                                  border: '1.5px solid #d8b4fe',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  padding: '6px 14px',
                                  borderRadius: '7px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: '0 1px 3px rgba(147, 51, 234, 0.12)',
                                  letterSpacing: '0.03em',
                                }}
                              >
                                <i className="fa-solid fa-building-circle-check"></i> RECEPTORÍA
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleAbrirCompania(item)}
                                className="btn btn-sm"
                                style={{
                                  background: '#faf5ff',
                                  color: '#7e22ce',
                                  border: '1px solid #e9d5ff',
                                  fontWeight: 700,
                                  fontSize: '11px',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '5px',
                                  boxShadow: '0 1px 3px rgba(126,34,206,0.1)',
                                }}
                                title="Despachar o entregar leche a Receptoría o Compañías / Queseras"
                              >
                                <i className="fa-solid fa-building"></i> Receptoría/Compañía
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAbrirTraspaso(item)}
                                className="btn btn-sm"
                                style={{
                                  background: '#f0fdfa',
                                  color: '#0f766e',
                                  border: '1px solid #99f6e4',
                                  fontWeight: 700,
                                  fontSize: '11px',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                                title="Traspasar leche a otro chofer"
                              >
                                <i className="fa-solid fa-right-left"></i> Traspaso
                              </button>
                            </div>
                          )
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {!esRuta && !item.esConfirmado && item.estado !== 'FINALIZADO' ? (
                              <span
                                className="badge"
                                style={{
                                  background: '#fef3c7',
                                  color: '#b45309',
                                  border: '1px solid #fde68a',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                <i className="fa-solid fa-clock-rotate-left"></i> RECEPCIONADO
                              </span>
                            ) : (
                              <span
                                className="badge"
                                style={{
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  border: '1px solid #a7f3d0',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                <i className="fa-solid fa-circle-check"></i> FINALIZADO
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ACORDEÓN / DESPLEGABLE DE PARADAS EXPANDIDAS */}
                    {esRuta && estaExpandido && (
                      <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '12px 18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-solid fa-list-check" style={{ color: '#2563eb' }}></i>
                            Paradas / Fincas Registradas ({fincasTicket.length})
                          </span>
                        </div>

                        <div style={{ maxHeight: '230px', overflowY: 'auto', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px' }}>
                          {fincasTicket.length === 0 ? (
                            <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '14px' }}>
                              No hay paradas registradas aún en este ticket.
                            </div>
                          ) : (
                            fincasTicket.map((f: any, idx: number) => {
                              const fId = f.id || f.Id || f.rutaId;
                              const fLitros = Number(f.litros ?? f.Litros ?? 0);
                              const fNombre = f.fincaNombre || f.FincaNombre || f.finca || `Finca #${f.fincaId || f.FincaId}`;
                              const fProp = f.propietarioNombre || f.propietario || f.Propietario || 'Productor';
                              const fTipo = (f.tipoLeche || f.TipoLeche || 'VACA').toUpperCase();
                              const esBufala = fTipo.includes('BUFAL');
                              const esAcida = Boolean(f.esAcida || f.EsAcida);

                              return (
                                <div
                                  key={fId || idx}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '7px 8px',
                                    borderBottom: idx < fincasTicket.length - 1 ? '1px solid #f1f5f9' : 'none',
                                    fontSize: '12px',
                                    borderRadius: '4px',
                                    background: idx % 2 === 0 ? '#fcfcfd' : '#ffffff',
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                                    <strong style={{ color: '#0f172a', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                      #{idx + 1} • {fNombre}
                                    </strong>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                                      {fProp} • {esBufala ? '🐃 Búfala' : '🥛 Vaca'}
                                      {esAcida ? ' • ⚠️ Ácida' : ''}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {(f.fotoComprobante || f.FotoComprobante) && (
                                      <button
                                        type="button"
                                        onClick={() => setFotoReciboModal(f.fotoComprobante || f.FotoComprobante)}
                                        className="btn btn-xs"
                                        style={{ padding: '3px 7px', background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', fontWeight: 700, borderRadius: '5px' }}
                                        title="Ver foto del recibo dejado en la finca"
                                      >
                                        <i className="fa-solid fa-receipt"></i> Recibo
                                      </button>
                                    )}
                                    {fLitros === 0 ? (
                                      <span
                                        className="badge"
                                        style={{
                                          background: '#fffbeb',
                                          color: '#b45309',
                                          border: '1px solid #fde68a',
                                          fontWeight: 800,
                                          fontSize: '11px',
                                          padding: '2px 8px',
                                          borderRadius: '6px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                        title="Parada planificada pendiente por recolectar"
                                      >
                                        ⏳ Pendiente (0 L)
                                      </span>
                                    ) : (
                                      <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontWeight: 800, color: '#16a34a', fontSize: '13px' }}>
                                          {fLitros.toLocaleString()} L
                                        </span>
                                        <span
                                          className="badge"
                                          style={{
                                            display: 'block',
                                            background: '#ecfdf5',
                                            color: '#047857',
                                            border: '1px solid #a7f3d0',
                                            fontWeight: 800,
                                            fontSize: '9.5px',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            marginTop: '1px',
                                          }}
                                        >
                                          🥛 Recolectada
                                        </span>
                                      </div>
                                    )}

                                    {/* BOTONES DE EDICIÓN Y ELIMINACIÓN CON BLINDAJE */}
                                    {puedeEditarTicket && (
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setViajeActivo(item);
                                            setFormEditar({
                                              id: fId,
                                              fincaId: f.fincaId || f.FincaId,
                                              litros: fLitros,
                                              tipoLeche: fTipo,
                                              esAcida: esAcida,
                                              esDiferido: Boolean(f.esDiferido || f.EsDiferido),
                                              fecha: f.fecha || item.fecha || '',
                                              observacion: f.observacion || f.Observacion || '',
                                              fotoComprobante: f.fotoComprobante || (f as any).FotoComprobante || '',
                                            });
                                            setModalEditarRecoleccion(true);
                                          }}
                                          className="btn btn-xs btn-outline"
                                          style={{ padding: '3px 6px', borderColor: '#bfdbfe', color: '#1d4ed8' }}
                                          title="Editar litros de esta finca"
                                        >
                                          <i className="fa-solid fa-pen-to-square"></i>
                                        </button>

                                        {fLitros > 0 ? (
                                          <>
                                            {esAdminOSup && (
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  const res = await Swal.fire({
                                                    title: '¿Limpiar información de recolección?',
                                                    html: `¿Deseas reiniciar los datos de recolección de <b>${fNombre}</b>?<br/><br/><div style="text-align: left; font-size: 13px; color: #cbd5e1; background: #1e293b; padding: 10px; border-radius: 8px;">
                                                      <p>✅ <b>La finca NO se eliminará</b> del ticket #${item.codigoTicket || item.id}.</p>
                                                      <p>✅ Quedará marcada como <b>NO RECOGIDA (0 Litros)</b> para que el chofer pueda recolectarla.</p>
                                                      <p>⚠️ Se eliminarán los litros registrados (${fLitros} L), foto de comprobante y observaciones.</p>
                                                    </div>`,
                                                    icon: 'warning',
                                                    showCancelButton: true,
                                                    confirmButtonColor: '#2563eb',
                                                    cancelButtonColor: '#64748b',
                                                    confirmButtonText: '<i class="fa-solid fa-eraser"></i> Sí, Limpiar (Dejar Pendiente)',
                                                    cancelButtonText: 'Cancelar',
                                                    background: '#0f172a',
                                                    color: '#ffffff',
                                                  });
                                                  if (res.isConfirmed) {
                                                    limpiarRecoleccionMutation.mutate({ rutaId: fId, controlRutaId: item.id });
                                                  }
                                                }}
                                                className="btn btn-xs btn-outline"
                                                style={{ padding: '3px 6px', borderColor: '#93c5fd', color: '#2563eb', background: '#eff6ff' }}
                                                title="Limpiar datos y marcar como NO RECOGIDA (0 Lts) en el ticket"
                                              >
                                                <i className="fa-solid fa-eraser"></i>
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              disabled
                                              className="btn btn-xs"
                                              style={{
                                                padding: '3px 6px',
                                                background: '#f8fafc',
                                                color: '#94a3b8',
                                                border: '1px solid #cbd5e1',
                                                cursor: 'not-allowed',
                                                opacity: 0.7,
                                              }}
                                              title="Blindaje Activo: Leche ya recolectada en cisterna (> 0 L). No se puede eliminar del ticket."
                                            >
                                              <i className="fa-solid fa-lock" style={{ color: '#10b981' }}></i>
                                            </button>
                                          </>
                                        ) : (
                                          (esAdminOSup || !tieneRutaLogistica) && (
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                if (
                                                  await confirmDialog({
                                                    title: '¿Remover Finca Pendiente?',
                                                    text: `¿Seguro que deseas remover la parada vacía de "${fNombre}" (0 L) del ticket #${item.codigoTicket || item.id}?`,
                                                    icon: 'warning',
                                                    confirmButtonText: 'Sí, remover',
                                                    danger: true,
                                                  })
                                                ) {
                                                  setViajeActivo(item);
                                                  eliminarRecoleccionMutation.mutate(fId);
                                                }
                                              }}
                                              className="btn btn-xs btn-outline"
                                              style={{ padding: '3px 6px', borderColor: '#fecaca', color: '#dc2626' }}
                                              title="Remover finca pendiente (sin leche recogida aún)"
                                            >
                                              <i className="fa-solid fa-trash-can"></i>
                                            </button>
                                          )
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: DETALLE POR FINCAS (HISTORIAL / BUSCADOR - SOLO LECTURA)          */}
      {/* ========================================================================= */}
      {modoVista === 'fincas' && (
        <div className="space-y-4">
          {/* TARJETAS RESUMEN DE LITROS Y CALIDAD */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div className="content-card" style={{ padding: '14px 16px', borderLeft: '4px solid #0284c7', borderRadius: '10px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Litros Recogidos</span>
              <strong style={{ fontSize: '20px', color: '#0284c7', display: 'block', marginTop: '4px', fontWeight: 800 }}>
                {totalesRecoleccion.total.toLocaleString()} Lts
              </strong>
            </div>

            <div className="content-card" style={{ padding: '14px 16px', borderLeft: '4px solid #16a34a', borderRadius: '10px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>🥛 Leche de Vaca</span>
              <strong style={{ fontSize: '20px', color: '#16a34a', display: 'block', marginTop: '4px', fontWeight: 800 }}>
                {totalesRecoleccion.vaca.toLocaleString()} Lts
              </strong>
            </div>

            {hasBufala && (
              <div className="content-card" style={{ padding: '14px 16px', borderLeft: '4px solid #9333ea', borderRadius: '10px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>🐃 Leche de Búfala</span>
                <strong style={{ fontSize: '20px', color: '#9333ea', display: 'block', marginTop: '4px', fontWeight: 800 }}>
                  {totalesRecoleccion.bufala.toLocaleString()} Lts
                </strong>
              </div>
            )}

            <div className="content-card" style={{ padding: '14px 16px', borderLeft: '4px solid #dc2626', borderRadius: '10px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>⚠️ Leche Ácida</span>
              <strong style={{ fontSize: '20px', color: '#dc2626', display: 'block', marginTop: '4px', fontWeight: 800 }}>
                {totalesRecoleccion.acida.toLocaleString()} Lts
              </strong>
            </div>

            <div className="content-card" style={{ padding: '14px 16px', borderLeft: '4px solid #4f46e5', borderRadius: '10px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Fincas Recolectadas</span>
              <strong style={{ fontSize: '20px', color: '#4f46e5', display: 'block', marginTop: '4px', fontWeight: 800 }}>
                {recoleccionesFiltradas.length} Fincas
              </strong>
            </div>
          </div>

          {/* TABLA HISTORIAL / BUSCADOR (SIN EDICIÓN NI ELIMINACIÓN) */}
          <div className="content-card" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-clock-rotate-left" style={{ color: '#2563eb' }}></i>
                  Historial & Buscador General de Recolecciones en Campo ({fechaFiltro})
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Auditoría de cargas por finca. La edición o remoción de paradas se realiza estrictamente dentro del ticket correspondiente mientras esté abierto.
                </p>
              </div>

              {(filtroDetalleChoferId || filtroDetalleFincaId) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '11.5px', padding: '5px 12px', fontWeight: 700, borderRadius: '8px' }}>
                    <i className="fa-solid fa-filter" style={{ marginRight: '5px' }}></i>
                    Mostrando {recoleccionesFiltradas.length} paradas filtradas
                  </span>
                </div>
              )}
            </div>

            {/* BARRA DE FILTROS DESPLEGABLES CON BÚSQUEDA INTEGRADA */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '14px',
                background: '#f8fafc',
                padding: '14px 16px',
                borderRadius: '10px',
                border: '1.5px solid #e2e8f0',
                marginBottom: '16px',
                alignItems: 'end',
              }}
            >
              {/* Filtro Chofer con Buscador */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-user-tie" style={{ color: '#0284c7' }}></i>
                  Filtrar por Chofer / Conductor:
                </label>
                <ChoferSelect
                  value={filtroDetalleChoferId || undefined}
                  onChange={(val) => setFiltroDetalleChoferId(val ? Number(val) : null)}
                  placeholder="-- Todos los Choferes --"
                  allowClear={true}
                />
              </div>

              {/* Filtro Finca con Buscador */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-cow" style={{ color: '#16a34a' }}></i>
                  Filtrar por Finca Ganadera:
                </label>
                <FincaSelect
                  value={filtroDetalleFincaId || undefined}
                  onChange={(val) => setFiltroDetalleFincaId(val ? Number(val) : null)}
                  placeholder="-- Todas las Fincas Ganaderas --"
                  allowClear={true}
                />
              </div>

              {/* Botón de limpiar filtros cuando alguno esté seleccionado */}
              {(filtroDetalleChoferId || filtroDetalleFincaId) && (
                <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroDetalleChoferId(null);
                      setFiltroDetalleFincaId(null);
                    }}
                    className="btn btn-outline"
                    style={{
                      height: '38px',
                      padding: '0 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderColor: '#fca5a5',
                      color: '#dc2626',
                      background: '#ffffff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      borderRadius: '8px',
                    }}
                    title="Restablecer filtros de chofer y finca"
                  >
                    <i className="fa-solid fa-filter-circle-xmark"></i>
                    Limpiar Filtros
                  </button>
                </div>
              )}
            </div>

            <DataTable
              data={recoleccionesFiltradas}
              columns={columnsRecolecciones}
              isLoading={loadingRecolecciones}
              searchPlaceholder="Buscar por finca, ganadero, conductor, ticket..."
              exportFileName={`recolecciones_campo_${fechaFiltro}`}
              pageSizeDefault={15}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: TIMELAPSE DE RECORRIDO (SECUENCIA Y HORAS DE PARADAS)            */}
      {/* ========================================================================= */}
      {modalTimelapse && timelapseData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div className="content-card" style={{ width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '16px', overflow: 'hidden' }}>
            {/* CABECERA TIMELAPSE */}
            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span className="badge" style={{ background: '#3b82f6', color: '#ffffff', fontWeight: 800, fontSize: '11px' }}>
                    <i className="fa-solid fa-truck"></i> {timelapseData.camion}
                  </span>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>• Chofer: <strong style={{ color: '#ffffff' }}>{timelapseData.chofer}</strong></span>
                </div>
                <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800 }}>
                  <i className="fa-solid fa-timeline" style={{ color: '#38bdf8', marginRight: '8px' }}></i>
                  Timelapse de Paradas — {timelapseData.rutaNombre}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {timelapseData.esFinalizado ? (
                  <span
                    style={{
                      background: 'rgba(100, 116, 139, 0.2)',
                      border: '1.5px solid #64748b',
                      color: '#cbd5e1',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Viaje finalizado y conciliado por Receptoría"
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }}></span>
                    FINALIZADO
                  </span>
                ) : timelapseData.estaEnReceptoria ? (
                  <span
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid #f59e0b',
                      color: '#fbbf24',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Ticket despachado hacia Receptoría: fincas en modo solo lectura"
                  >
                    <i className="fa-solid fa-lock text-[11px]"></i>
                    EN RECEPTORÍA (SOLO LECTURA)
                  </span>
                ) : (
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid #10b981',
                      color: '#34d399',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Sondeo activo: las paradas registradas en la app móvil aparecen automáticamente sin recargar la página"
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                    EN VIVO (Sin Recargar)
                  </span>
                )}
                <button type="button" onClick={() => setModalTimelapse(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer' }}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            <style>{`
              @keyframes pulseColorMovil {
                0% {
                  background-color: #ecfdf5;
                  border-color: #10b981;
                  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6), 0 4px 14px rgba(16, 185, 129, 0.2);
                }
                50% {
                  background-color: #fef3c7;
                  border-color: #f59e0b;
                  box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.35), 0 6px 18px rgba(245, 158, 11, 0.3);
                }
                100% {
                  background-color: #ecfdf5;
                  border-color: #10b981;
                  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6), 0 4px 14px rgba(16, 185, 129, 0.2);
                }
              }
              @keyframes badgePulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.05); opacity: 0.88; }
              }
            `}</style>

            {/* BARRA DE PROGRESO DE CARGA */}
            <div style={{ background: '#f8fafc', padding: '14px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Carga a Bordo / Capacidad</span>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  {timelapseData.totalLitros.toLocaleString()} / {timelapseData.capacidadMax.toLocaleString()} Lts ({timelapseData.porcentajeLlenado}%)
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Progreso del Circuito</span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                  {timelapseData.esFinalizado
                    ? `${timelapseData.paradas.length} paradas recolectadas (Finalizado)`
                    : timelapseData.tieneRuta
                      ? `${timelapseData.paradas.length} de ${timelapseData.totalParadasEstimadas} paradas`
                      : `${timelapseData.paradas.length} paradas registradas`}
                </div>
              </div>
            </div>

            {/* CUERPO CON LÍNEA DE TIEMPO */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, maxHeight: '60vh' }}>
              {timelapseData.paradas.length === 0 && timelapseData.pendientes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  <i className="fa-solid fa-clock" style={{ fontSize: '36px', opacity: 0.5, marginBottom: '10px', display: 'block' }}></i>
                  El camión aún no ha registrado paradas y no tiene rutas asignadas.
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: '32px' }}>
                  <div style={{ position: 'absolute', left: '11px', top: '12px', bottom: '12px', width: '3px', background: '#e2e8f0', borderRadius: '2px' }}></div>

                  {/* 1. PARADAS YA RECOLECTADAS (EN VERDE, RESPETANDO ORDEN CRONOLÓGICO / LLENADO DE LITROS) */}
                  {timelapseData.paradas.map((p, idx) => {
                    const timeStamp = p.createdAt || (p as any).CreatedAt;
                    const horaStr = timeStamp
                      ? new Date(timeStamp).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : p.horaRecoleccion || 'Registrado';
                    const esBufala = (p.tipoLeche || '').toUpperCase().includes('BUFAL');
                    const esMovil = esOrigenMovil(p);
                    const titilando = estaTitilando(p);
                    const tiempoRef = paradasDetectadasEnSesion[p.id] || (timeStamp ? new Date(timeStamp).getTime() : 0);
                    const segRestantes = Math.max(0, Math.ceil((25000 - (nowTick - tiempoRef)) / 1000));

                    return (
                      <div key={p.id} style={{ position: 'relative', marginBottom: '20px' }}>
                        <div
                          style={{
                            position: 'absolute',
                            left: '-32px',
                            top: '4px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: titilando ? '#f59e0b' : '#10b981',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 800,
                            boxShadow: titilando ? '0 0 0 5px rgba(245, 158, 11, 0.45)' : '0 0 0 4px #d1fae5',
                            transition: 'all 0.3s ease',
                          }}
                        >
                          {idx + 1}
                        </div>

                        <div
                          style={{
                            background: titilando ? undefined : '#ffffff',
                            border: titilando ? '2.5px solid #10b981' : '1px solid #a7f3d0',
                            borderRadius: '12px',
                            padding: '12px 16px',
                            boxShadow: titilando ? undefined : '0 2px 6px rgba(16, 185, 129, 0.08)',
                            animation: titilando ? 'pulseColorMovil 1.3s infinite ease-in-out' : undefined,
                            transition: 'all 0.4s ease',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '14.5px', color: '#0f172a' }}>
                                  #{idx + 1} • {p.fincaNombre || `Finca #${p.fincaId}`}
                                </strong>

                                <span style={{ fontSize: '10.5px', color: '#047857', background: '#d1fae5', border: '1px solid #6ee7b7', padding: '1px 7px', borderRadius: '4px', fontWeight: 800 }}>
                                  <i className="fa-solid fa-circle-check"></i> Recolectado
                                </span>

                                {/* BADGE DE ORIGEN & NOTIFICACIÓN TITILANTE */}
                                {titilando ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#059669',
                                      color: '#ffffff',
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      animation: 'badgePulse 0.9s infinite ease-in-out',
                                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.35)',
                                    }}
                                  >
                                    <i className="fa-solid fa-mobile-screen-button"></i> 📲 NUEVO DESDE APP MÓVIL ({segRestantes}s)
                                  </span>
                                ) : esMovil ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#ecfdf5',
                                      color: '#059669',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                      padding: '2px 7px',
                                      borderRadius: '6px',
                                      border: '1px solid #a7f3d0',
                                    }}
                                  >
                                    <i className="fa-solid fa-mobile-screen"></i> App Móvil
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#f1f5f9',
                                      color: '#475569',
                                      fontSize: '10.5px',
                                      fontWeight: 600,
                                      padding: '2px 7px',
                                      borderRadius: '6px',
                                    }}
                                  >
                                    <i className="fa-solid fa-desktop"></i> Web
                                  </span>
                                )}

                                {esBufala && (
                                  <span style={{ fontSize: '10.5px', color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                    🐃 Búfala
                                  </span>
                                )}
                                {p.esAcida && (
                                  <span style={{ fontSize: '10.5px', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                    ⚠️ Ácida
                                  </span>
                                )}
                                {p.fotoComprobante && (
                                  <button
                                    type="button"
                                    onClick={() => setFotoReciboModal(p.fotoComprobante)}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#eff6ff',
                                      color: '#1d4ed8',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid #bfdbfe',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <i className="fa-solid fa-receipt"></i> Recibo Finca
                                  </button>
                                )}
                              </div>

                              <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                                Productor: {p.propietarioNombre || p.propietario || 'No especificado'}
                              </span>
                              {p.observacion && (
                                <span style={{ fontSize: '11px', color: '#475569', display: 'block', marginTop: '3px', fontStyle: 'italic' }}>
                                  Nota: {p.observacion}
                                </span>
                              )}
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>
                                +{p.litros.toLocaleString()} Lts
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                                Hora: <strong style={{ color: '#0f172a' }}>{horaStr}</strong>
                              </span>
                            </div>
                          </div>

                          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
                            <span style={{ color: '#64748b' }}>
                              Acumulado en cisterna: <strong style={{ color: '#0284c7' }}>{p.acumulado.toLocaleString()} Lts</strong> ({p.porcentajeCarga}%)
                            </span>
                            {p.minutosDesdeAnterior !== null && (
                              <span style={{ color: '#059669', fontWeight: 700, background: '#ecfdf5', padding: '2px 8px', borderRadius: '6px' }}>
                                ⏱️ {p.minutosDesdeAnterior} min de trayecto
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* 2. PARADAS PENDIENTES DE LA RUTA (EN COLOR GRIS, CON BOTÓN "+ AGREGAR LITROS", SOLO SI EL TICKET SIGUE ABIERTO) */}
                  {!timelapseData.esFinalizado && timelapseData.pendientes.map((f, i) => {
                    const numParada = timelapseData.paradas.length + i + 1;
                    return (
                      <div key={f.id} style={{ position: 'relative', marginBottom: '18px' }}>
                        {/* CÍRCULO EN GRIS */}
                        <div
                          style={{
                            position: 'absolute',
                            left: '-32px',
                            top: '4px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: '#94a3b8',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 800,
                            boxShadow: '0 0 0 4px #f1f5f9',
                          }}
                        >
                          {numParada}
                        </div>

                        {/* TARJETA EN GRIS */}
                        <div
                          style={{
                            background: '#f8fafc',
                            border: '1.5px dashed #cbd5e1',
                            borderRadius: '12px',
                            padding: '12px 16px',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '14.5px', color: '#475569' }}>
                                  #{numParada} • {f.nombre}
                                </strong>

                                <span style={{ fontSize: '10.5px', color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                  ⏳ Pendiente
                                </span>

                                {f.tipoLeche && f.tipoLeche.toUpperCase().includes('BUFAL') && (
                                  <span style={{ fontSize: '10.5px', color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    🐃 Búfala
                                  </span>
                                )}

                                {/* BOTÓN AGREGAR LITROS DIRECTO EN LA FINCA (O BADGE SI ESTÁ EN RECEPTORÍA) */}
                                {timelapseData.estaEnReceptoria ? (
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: '#b45309',
                                      background: '#fef3c7',
                                      border: '1px solid #fde68a',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontWeight: 800,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <i className="fa-solid fa-lock text-[10px]"></i> Bloqueado en Receptoría
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (viajeTimelapse) {
                                        setViajeActivo(viajeTimelapse);
                                      }
                                      setFormFinca({
                                        fincaId: f.id,
                                        litros: '',
                                        tipoLeche: (f.tipoLeche as any) || 'VACA',
                                        esAcida: false,
                                        esDiferido: false,
                                        fecha: viajeTimelapse?.fecha ? viajeTimelapse.fecha.split('T')[0] : (fechaFiltro || hoyStr),
                                        observacion: '',
                                        fotoComprobante: '',
                                      });
                                      setModalRegistroFinca(true);
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '7px',
                                      padding: '4px 12px',
                                      fontSize: '11.5px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      boxShadow: '0 2px 6px rgba(16,185,129,0.3)',
                                    }}
                                  >
                                    <i className="fa-solid fa-plus-circle"></i> Agregar Litros
                                  </button>
                                )}
                              </div>

                              <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                                Productor: {f.propietario || f.propietarioNombre || 'No especificado'}
                                {f.promedioLitrosDiarios ? ` • Promedio diario: ~${f.promedioLitrosDiarios} Lts` : ''}
                              </span>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '15px', fontWeight: 700, color: '#94a3b8' }}>
                                0 Lts
                              </span>
                              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                                Sin recolectar
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setModalTimelapse(false)} className="btn btn-outline" style={{ fontWeight: 700 }}>
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: INICIAR NUEVO VIAJE (MULTISELECCIÓN, PERSONALIZACIÓN DE FINCAS Y CAPACIDAD) */}
      {/* ========================================================================= */}
      {modalIniciarViaje && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(5px)', padding: '16px' }}>
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '820px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: 0,
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              background: '#ffffff',
            }}
          >
            {/* ENCABEZADO MODAL PREMIUM */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px 24px',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                borderBottom: '1px solid #334155',
                borderRadius: '19px 19px 0 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '20px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                  }}
                >
                  <i className="fa-solid fa-truck-droplet"></i>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
                      Iniciar Nuevo Viaje de Recolección
                    </h3>
                    <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.35)' }}>
                      Logística V2
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                    Asigna cisterna, conductor y personaliza las paradas de las fincas para auditar la capacidad en vivo.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalIniciarViaje(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formIniciar.camionId || formIniciar.camionId <= 0) {
                  toast.error('Seleccione un camión / cisterna');
                  return;
                }
                if (!formIniciar.choferId || formIniciar.choferId <= 0) {
                  toast.error('Seleccione el chofer responsable');
                  return;
                }
                iniciarMutation.mutate(formIniciar);
              }}
              style={{ padding: '22px 24px' }}
            >
              {/* SECCIÓN 1: RECURSOS ASIGNADOS (FECHA, CHOFER, CAMIÓN) */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <i className="fa-solid fa-id-card-clip" style={{ color: '#2563eb', fontSize: '14px' }}></i>
                  <strong style={{ fontSize: '13px', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    1. Asignación de Recursos Principales
                  </strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '12px', color: '#334155' }}>
                      <i className="fa-regular fa-calendar" style={{ marginRight: '5px', color: '#64748b' }}></i>
                      Fecha Operativa *
                    </label>
                    <input
                      type="date"
                      value={formIniciar.fecha}
                      onChange={(e) => setFormIniciar({ ...formIniciar, fecha: e.target.value })}
                      className="form-input"
                      required
                      style={{ height: '38px', borderRadius: '8px' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '12px', color: '#334155' }}>
                      <i className="fa-solid fa-user-tie" style={{ marginRight: '5px', color: '#64748b' }}></i>
                      Chofer Responsable *
                    </label>
                    <ChoferSelect
                      value={formIniciar.choferId}
                      onChange={(id) => setFormIniciar({ ...formIniciar, choferId: id })}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '12px', color: '#334155', margin: 0 }}>
                        <i className="fa-solid fa-truck" style={{ marginRight: '5px', color: '#64748b' }}></i>
                        Camión / Cisterna *
                      </label>
                      {calculoCapacidadModal.capacidad > 0 && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '1px 6px', borderRadius: '6px' }}>
                          Cap: {calculoCapacidadModal.capacidad.toLocaleString()} L
                        </span>
                      )}
                    </div>
                    <CamionSelect
                      value={formIniciar.camionId}
                      onChange={(id) => setFormIniciar({ ...formIniciar, camionId: id })}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* SECCIÓN 2: SELECTOR DE RUTA(S) LOGÍSTICA(S) */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-route" style={{ color: '#0284c7', fontSize: '14px' }}></i>
                    <strong style={{ fontSize: '13px', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      2. Ruta(s) Logística(s) Planificada(s)
                    </strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: formIniciar.rutasLogisticasIds.length > 0 ? '#1d4ed8' : '#64748b', background: formIniciar.rutasLogisticasIds.length > 0 ? '#dbeafe' : '#e2e8f0', padding: '2px 8px', borderRadius: '9999px' }}>
                      {formIniciar.rutasLogisticasIds.length === 0 ? 'Modo Libre activo' : `${formIniciar.rutasLogisticasIds.length} ruta(s) vinculada(s)`}
                    </span>
                    {formIniciar.rutasLogisticasIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormIniciar((prev) => ({ ...prev, rutasLogisticasIds: [], rutaLogisticaId: 0 }));
                          setFincasSeleccionadasIniciar([]);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '11px',
                          color: '#dc2626',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: '2px 6px',
                        }}
                      >
                        <i className="fa-solid fa-rotate-left"></i> Limpiar
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '8px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    maxHeight: '120px',
                    overflowY: 'auto',
                  }}
                >
                  {rutasLogistica.length === 0 ? (
                    <span style={{ fontSize: '12px', color: '#94a3b8', padding: '6px' }}>No hay rutas registradas en el catálogo.</span>
                  ) : (
                    rutasLogistica.map((r: any) => {
                      const isChecked = formIniciar.rutasLogisticasIds.includes(r.id);
                      const fincasDeEsta = fincas.filter((f) => f.rutaId === r.id);
                      const ltsEstimadosEsta = fincasDeEsta.reduce((acc, f) => acc + getPromedioFinca(f.id, f), 0);

                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            const fincasDeEstaRuta = fincas.filter((f) => f.rutaId === r.id).map((f) => f.id);
                            setFormIniciar((prev) => {
                              const exists = prev.rutasLogisticasIds.includes(r.id);
                              const newIds = exists
                                ? prev.rutasLogisticasIds.filter((id) => id !== r.id)
                                : [...prev.rutasLogisticasIds, r.id];

                              // Sincronizar fincas seleccionadas en vivo
                              setFincasSeleccionadasIniciar((fPrev) => {
                                if (exists) {
                                  return fPrev.filter((fid) => !fincasDeEstaRuta.includes(fid));
                                } else {
                                  return Array.from(new Set([...fPrev, ...fincasDeEstaRuta]));
                                }
                              });

                              return {
                                ...prev,
                                rutasLogisticasIds: newIds,
                                rutaLogisticaId: newIds.length > 0 ? newIds[0] : 0,
                              };
                            });
                          }}
                          style={{
                            border: isChecked ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                            background: isChecked ? '#eff6ff' : '#f8fafc',
                            color: isChecked ? '#1d4ed8' : '#334155',
                            fontWeight: isChecked ? 800 : 600,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            transition: 'all 0.15s ease',
                            boxShadow: isChecked ? '0 2px 4px rgba(37, 99, 235, 0.15)' : 'none',
                          }}
                        >
                          <i className={`fa-${isChecked ? 'solid fa-circle-check' : 'regular fa-circle'}`} style={{ color: isChecked ? '#2563eb' : '#94a3b8' }}></i>
                          <span>{r.nombre}</span>
                          <span style={{ fontSize: '10.5px', color: isChecked ? '#1e40af' : '#64748b', background: isChecked ? '#dbeafe' : '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>
                            ~{ltsEstimadosEsta.toLocaleString()} L
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* SECCIÓN 3: 🌾 LOGÍSTICA DE FINCAS (MODIFICACIÓN Y PERSONALIZACIÓN ANTES DE INICIAR) */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #bfdbfe',
                  borderRadius: '14px',
                  padding: '16px',
                  marginBottom: '18px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-wheat-awn" style={{ color: '#059669', fontSize: '15px' }}></i>
                    <div>
                      <strong style={{ fontSize: '13.5px', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        3. Personalización de Fincas (Logística del Viaje)
                      </strong>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                        Puedes marcar o desmarcar fincas si hoy no ordeñan o si añadirás paradas extra fuera de ruta.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '3px 10px', borderRadius: '9999px', border: '1px solid #a7f3d0' }}>
                      <i className="fa-solid fa-check" style={{ marginRight: '4px' }}></i>
                      {fincasSeleccionadasIniciar.length} fincas seleccionadas
                    </span>
                  </div>
                </div>

                {/* BARRA DE HERRAMIENTAS: BUSCADOR Y ACCIONES RÁPIDAS */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }}></i>
                    <input
                      type="text"
                      placeholder="Buscar finca, productor o código..."
                      value={busquedaFincaIniciar}
                      onChange={(e) => setBusquedaFincaIniciar(e.target.value)}
                      className="form-input"
                      style={{ paddingLeft: '30px', height: '34px', fontSize: '12px', borderRadius: '8px' }}
                    />
                    {busquedaFincaIniciar && (
                      <button
                        type="button"
                        onClick={() => setBusquedaFincaIniciar('')}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const idsVisibles = fincasModalIniciarDisponibles.map((f) => f.id);
                      setFincasSeleccionadasIniciar((prev) => Array.from(new Set([...prev, ...idsVisibles])));
                    }}
                    className="btn btn-outline"
                    style={{ fontSize: '11.5px', fontWeight: 700, padding: '6px 10px', height: '34px', borderRadius: '8px', color: '#0284c7', borderColor: '#bae6fd' }}
                  >
                    <i className="fa-solid fa-check-double" style={{ marginRight: '4px' }}></i> Marcar Visibles
                  </button>

                  <button
                    type="button"
                    onClick={() => setFincasSeleccionadasIniciar([])}
                    className="btn btn-outline"
                    style={{ fontSize: '11.5px', fontWeight: 700, padding: '6px 10px', height: '34px', borderRadius: '8px', color: '#dc2626', borderColor: '#fecaca' }}
                  >
                    <i className="fa-solid fa-trash-can" style={{ marginRight: '4px' }}></i> Desmarcar Todo
                  </button>

                  <button
                    type="button"
                    onClick={() => setMostrarTodasLasFincasIniciar(!mostrarTodasLasFincasIniciar)}
                    className="btn btn-outline"
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      padding: '6px 10px',
                      height: '34px',
                      borderRadius: '8px',
                      background: mostrarTodasLasFincasIniciar ? '#eff6ff' : '#ffffff',
                      color: mostrarTodasLasFincasIniciar ? '#1d4ed8' : '#475569',
                      borderColor: mostrarTodasLasFincasIniciar ? '#93c5fd' : '#cbd5e1',
                    }}
                    title="Alternar entre ver solo las fincas de la ruta o explorar todo el catálogo del sistema"
                  >
                    <i className={`fa-solid ${mostrarTodasLasFincasIniciar ? 'fa-filter-circle-xmark' : 'fa-list-check'}`} style={{ marginRight: '4px' }}></i>
                    {mostrarTodasLasFincasIniciar ? 'Solo Fincas de Ruta' : 'Ver Todo el Catálogo'}
                  </button>
                </div>

                {/* LISTADO INTERACTIVO DE FINCAS EN GRID */}
                <div
                  style={{
                    maxHeight: '230px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '8px',
                    background: '#f8fafc',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: '8px',
                  }}
                >
                  {fincasModalIniciarDisponibles.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '24px 16px', color: '#64748b' }}>
                      <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '24px', color: '#cbd5e1', marginBottom: '8px', display: 'block' }}></i>
                      <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 600 }}>
                        {formIniciar.rutasLogisticasIds.length === 0 && !mostrarTodasLasFincasIniciar
                          ? 'Selecciona una ruta arriba o haz clic en "Ver Todo el Catálogo" para elegir fincas.'
                          : 'No se encontraron fincas con ese criterio de búsqueda.'}
                      </p>
                    </div>
                  ) : (
                    fincasModalIniciarDisponibles.map((f: any) => {
                      const isSelected = fincasSeleccionadasIniciar.includes(f.id);
                      const promLts = getPromedioFinca(f.id, f);
                      const rutaAsociada = rutasLogistica.find((r) => r.id === f.rutaId);

                      return (
                        <div
                          key={f.id}
                          onClick={() => {
                            setFincasSeleccionadasIniciar((prev) =>
                              isSelected ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                            );
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: isSelected ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                            background: isSelected ? '#f0fdf4' : '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.12s ease',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Manejado por el onClick del contenedor
                            style={{ width: '16px', height: '16px', accentColor: '#10b981', cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '12.5px', fontWeight: isSelected ? 800 : 700, color: isSelected ? '#065f46' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {f.nombre}
                              </span>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: isSelected ? '#059669' : '#0284c7', background: isSelected ? '#d1fae5' : '#e0f2fe', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                ~{promLts.toLocaleString()} L
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', fontSize: '10.5px', color: '#64748b' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {f.productorNombre || f.propietarioNombre || 'Productor S/N'}
                              </span>
                              {rutaAsociada && (
                                <span style={{ fontSize: '10px', color: '#475569', background: '#f1f5f9', padding: '0 4px', borderRadius: '3px' }}>
                                  {rutaAsociada.nombre}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* SECCIÓN 4: AUDITORÍA DE CAPACIDAD EN TIEMPO REAL (±15% CONFIGURABLE) */}
              {calculoCapacidadModal.capacidad > 0 && (
                <div
                  style={{
                    marginBottom: '18px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: calculoCapacidadModal.estado === 'EXCESO'
                      ? '1.5px solid #f59e0b'
                      : calculoCapacidadModal.estado === 'BAJO'
                      ? '1.5px solid #93c5fd'
                      : '1.5px solid #86efac',
                    background: calculoCapacidadModal.estado === 'EXCESO'
                      ? '#fffbeb'
                      : calculoCapacidadModal.estado === 'BAJO'
                      ? '#eff6ff'
                      : '#f0fdf4',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '13px', color: calculoCapacidadModal.estado === 'EXCESO' ? '#b45309' : calculoCapacidadModal.estado === 'BAJO' ? '#1e40af' : '#15803d' }}>
                        {calculoCapacidadModal.estado === 'EXCESO' ? '⚠️ Sobrecarga Estimada de Cisterna' : calculoCapacidadModal.estado === 'BAJO' ? 'ℹ️ Capacidad Subutilizada' : '✅ Capacidad Óptima del Tanque'}
                      </strong>
                      <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 7px', borderRadius: '6px', background: '#ffffff', border: '1px solid #cbd5e1' }}>
                        {calculoCapacidadModal.porcentajeLlenado}% de carga nominal
                      </span>
                    </div>

                    {/* Selector de Tolerancia */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                      <span>Tolerancia auditoría:</span>
                      {[10, 15, 20].map((tol) => (
                        <button
                          key={tol}
                          type="button"
                          onClick={() => setFormIniciar({ ...formIniciar, toleranciaPorcentaje: tol })}
                          style={{
                            border: formIniciar.toleranciaPorcentaje === tol ? '1px solid #2563eb' : '1px solid #cbd5e1',
                            background: formIniciar.toleranciaPorcentaje === tol ? '#2563eb' : '#ffffff',
                            color: formIniciar.toleranciaPorcentaje === tol ? '#ffffff' : '#64748b',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '10.5px',
                          }}
                        >
                          ±{tol}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* BARRA DE PROGRESO DE LLENADO VISUAL */}
                  <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(calculoCapacidadModal.porcentajeLlenado, 100)}%`,
                        background: calculoCapacidadModal.estado === 'EXCESO' ? '#f59e0b' : calculoCapacidadModal.estado === 'BAJO' ? '#3b82f6' : '#10b981',
                        borderRadius: '9999px',
                        transition: 'width 0.3s ease',
                      }}
                    ></div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: '#334155' }}>
                    <span>
                      Cisterna: <strong>{calculoCapacidadModal.capacidad.toLocaleString()} Lts</strong> nominales.
                    </span>
                    <span>
                      Fincas asignadas ({calculoCapacidadModal.fincasDeRutas.length}): <strong>~{calculoCapacidadModal.litrosEstimados.toLocaleString()} Lts</strong> estimados.
                    </span>
                    <span>
                      Margen: <strong>{calculoCapacidadModal.diferencia > 0 ? `+${calculoCapacidadModal.diferencia.toLocaleString()} L` : `${calculoCapacidadModal.diferencia.toLocaleString()} L`} ({calculoCapacidadModal.porcentajeDesviacion > 0 ? `+${calculoCapacidadModal.porcentajeDesviacion.toFixed(1)}%` : `${calculoCapacidadModal.porcentajeDesviacion.toFixed(1)}%`})</strong>
                    </span>
                  </div>

                  {calculoCapacidadModal.estado === 'EXCESO' && (
                    <span style={{ fontSize: '11px', color: '#b45309', display: 'block', fontWeight: 600, marginTop: '6px' }}>
                      ⚠️ El promedio estimado supera el tanque. Si hoy la producción real es menor o el clima afectó el ordeño, puedes continuar el viaje normalmente.
                    </span>
                  )}
                </div>
              )}

              {/* SECCIÓN 5: ODÓMETRO Y OBSERVACIONES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '12px', color: '#334155' }}>
                    <i className="fa-solid fa-gauge-high" style={{ marginRight: '5px', color: '#64748b' }}></i>
                    Odómetro Inicial (Km)
                  </label>
                  <input
                    type="number"
                    value={formIniciar.odometroInicialKm}
                    onChange={(e) => setFormIniciar({ ...formIniciar, odometroInicialKm: e.target.value })}
                    className="form-input"
                    placeholder="Ej: 145000"
                    style={{ height: '38px', borderRadius: '8px' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '12px', color: '#334155' }}>
                    <i className="fa-regular fa-comment-dots" style={{ marginRight: '5px', color: '#64748b' }}></i>
                    Observaciones
                  </label>
                  <input
                    type="text"
                    value={formIniciar.observaciones}
                    onChange={(e) => setFormIniciar({ ...formIniciar, observaciones: e.target.value })}
                    className="form-input"
                    placeholder="Notas de despacho, turno o instrucciones para el chofer..."
                    style={{ height: '38px', borderRadius: '8px' }}
                  />
                </div>
              </div>

              {/* FOOTER ACCIONES */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setModalIniciarViaje(false)}
                  className="btn btn-outline"
                  style={{ fontWeight: 700, padding: '10px 20px', borderRadius: '10px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={iniciarMutation.isPending}
                  className="btn btn-primary"
                  style={{
                    fontWeight: 800,
                    fontSize: '13.5px',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: iniciarMutation.isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {iniciarMutation.isPending ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Iniciando Viaje...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-circle-play"></i> Iniciar Viaje {fincasSeleccionadasIniciar.length > 0 ? `(${fincasSeleccionadasIniciar.length} fincas)` : ''}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: REGISTRAR PARADA EN FINCA (DENTRO DEL TICKET ABIERTO)            */}
      {/* ========================================================================= */}
      {modalRegistroFinca && viajeActivo && (
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
            padding: '24px 16px',
            overflowY: 'auto',
          }}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col my-auto"
            style={{ maxHeight: '92vh', position: 'relative' }}
          >
            {/* CABECERA CON GRADIENTE OSCURO PREMIUM */}
            <div
              className="p-5 flex items-center justify-between border-b border-white/10 shrink-0"
              style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0369a1 100%)' }}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl text-emerald-400 shrink-0 shadow-xs"
                  style={{
                    background: 'rgba(16, 185, 129, 0.18)',
                    border: '1.5px solid rgba(52, 211, 153, 0.35)',
                  }}
                >
                  <i className="fa-solid fa-cow"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="m-0 text-base font-extrabold text-white">
                      Agregar Finca al Ticket #{viajeActivo.codigoTicket || viajeActivo.id}
                    </h3>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 uppercase tracking-wider">
                      {viajeActivo.estado || 'ABIERTO'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-sky-200">
                    <span>
                      <i className="fa-solid fa-user-tie text-sky-300 mr-1"></i>
                      Chofer: <strong>{viajeActivo.choferNombre || viajeActivo.nombreConductor || 'Conductor'}</strong>
                    </span>
                    <span className="text-white/40">•</span>
                    <span>
                      <i className="fa-solid fa-truck-moving text-sky-300 mr-1"></i>
                      {viajeActivo.camionPlaca || 'Cisterna'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalRegistroFinca(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 text-2xl transition-colors cursor-pointer"
                title="Cerrar modal"
              >
                &times;
              </button>
            </div>

            {/* FORMULARIO */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!formFinca.fincaId || formFinca.fincaId <= 0) {
                  toast.error('Seleccione una finca ganadera');
                  return;
                }
                if (!formFinca.litros || Number(formFinca.litros) <= 0) {
                  toast.error('Ingrese una cantidad válida de litros');
                  return;
                }

                // REGLA: Si dos choferes tienen o intentan confirmar la misma finca, se requiere confirmación explícita
                const fechaTarget = (viajeActivo.fecha ? viajeActivo.fecha.split('T')[0] : (formFinca.fecha || hoyStr));
                const fincaYaConfirmada = recolecciones.find((r) =>
                  Number(r.fincaId) === Number(formFinca.fincaId) &&
                  Number(r.litros || (r as any).Litros || 0) > 0 &&
                  (r.fecha || '').split('T')[0] === fechaTarget &&
                  Number(r.controlRutaId) !== Number(viajeActivo.id)
                );

                if (fincaYaConfirmada) {
                  const nombreChoferOtro = (fincaYaConfirmada as any).choferNombre || (fincaYaConfirmada as any).conductorNombre || (fincaYaConfirmada as any).usuarioNombre || `Chofer #${(fincaYaConfirmada as any).usuarioId || ''}`;
                  const litrosOtro = Number(fincaYaConfirmada.litros || (fincaYaConfirmada as any).Litros || 0);
                  const fincaObj = fincas.find((f) => f.id === Number(formFinca.fincaId));
                  const nombreFinca = fincaObj?.nombre || fincaYaConfirmada.fincaNombre || `Finca #${formFinca.fincaId}`;

                  const result = await Swal.fire({
                    title: '⚠️ Finca ya confirmada en otra ruta',
                    html: `
                      <div style="text-align: left; font-size: 13px; line-height: 1.6;">
                        <p>La finca <strong>${nombreFinca}</strong> ya tiene recolección confirmada hoy con otro camión / chofer:</p>
                        <div style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 8px; padding: 10px 14px; margin: 12px 0;">
                          <div>👤 <strong>Chofer:</strong> ${nombreChoferOtro}</div>
                          <div>🎫 <strong>Ticket:</strong> #${fincaYaConfirmada.controlRutaId}</div>
                          <div>🥛 <strong>Litros Confirmados:</strong> ${litrosOtro.toLocaleString()} Lts</div>
                        </div>
                        <p style="color: #b91c1c; font-weight: 700; margin-bottom: 0;">
                          ¿Está seguro que desea confirmar y agregar litros a esta misma finca para este chofer?
                        </p>
                      </div>
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d97706',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: 'Sí, confirmar y agregar',
                    cancelButtonText: 'Cancelar',
                  });

                  if (!result.isConfirmed) {
                    return;
                  }
                }

                guardarRecoleccionModalMutation.mutate(formFinca);
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
                          {viajeActivo.fecha
                            ? new Date(viajeActivo.fecha).toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                            : new Date().toLocaleDateString('es-VE')}
                        </span>
                        <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Semana #{viajeActivo.cicloId || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:block text-right">
                    <span className="text-[10.5px] font-bold text-slate-500 block">Identificador</span>
                    <span className="font-mono text-xs font-black text-sky-700 bg-white px-2 py-0.5 rounded border border-sky-200 shadow-2xs">
                      TKT-#{viajeActivo.id}
                    </span>
                  </div>
                </div>

                {/* 1.1 BANNER DE RUTA LOGÍSTICA CON BOTÓN DE ASIGNAR / CAMBIAR */}
                {(() => {
                  const parsedRutasActivas = (() => {
                    const obs = viajeActivo.observacion || '';
                    const match = obs.match(/\[RUTAS:([^\]]+)\]/);
                    if (match) {
                      return match[1].split(',').map((id: string) => Number(id.trim())).filter((x: number) => x > 0);
                    }
                    return viajeActivo.rutaLogisticaId ? [Number(viajeActivo.rutaLogisticaId)] : [];
                  })();
                  const tieneRuta = parsedRutasActivas.length > 0;
                  const nombresRutas = parsedRutasActivas
                    .map((id: number) => rutasLogistica.find((r) => r.id === id)?.nombre || `Ruta #${id}`)
                    .join(', ');

                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: tieneRuta ? '#faf5ff' : '#f8fafc',
                        border: `1.5px solid ${tieneRuta ? '#d8b4fe' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <i
                          className={`fa-solid ${tieneRuta ? 'fa-route' : 'fa-compass'}`}
                          style={{ color: tieneRuta ? '#9333ea' : '#64748b', fontSize: '14px' }}
                        ></i>
                        <span>
                          <strong style={{ color: '#1e293b' }}>Ruta Logística: </strong>
                          <span style={{ color: tieneRuta ? '#7e22ce' : '#64748b', fontWeight: 700 }}>
                            {tieneRuta ? nombresRutas : 'Modo Libre (Sin Ruta Asignada)'}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setModalRegistroFinca(false);
                          abrirModalAsignarRutas(viajeActivo);
                        }}
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 800,
                          color: '#4f46e5',
                          background: '#eef2ff',
                          border: '1px solid #c7d2fe',
                          padding: '4px 10px',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <i className="fa-solid fa-map-location-dot"></i>
                        {tieneRuta ? 'Cambiar / Agregar Rutas' : '+ Asignar Rutas al Ticket'}
                      </button>
                    </div>
                  );
                })()}

                {/* 2. FINCA GANADERA */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-location-dot text-emerald-600"></i>
                      Finca Ganadera *
                    </span>
                    {formFinca.fincaId > 0 && (
                      <span className="text-[11px] text-slate-500 font-medium">
                        {fincas.find((f) => f.id === formFinca.fincaId)?.propietario
                          ? `Productor: ${fincas.find((f) => f.id === formFinca.fincaId)?.propietario}`
                          : ''}
                      </span>
                    )}
                  </label>
                  <FincaSelect
                    value={formFinca.fincaId}
                    rutaLogisticaId={viajeActivo.rutaLogisticaId}
                    rutasLogisticasIds={(() => {
                      const obs = viajeActivo.observacion || '';
                      const match = obs.match(/\[RUTAS:([^\]]+)\]/);
                      if (match) {
                        return match[1].split(',').map((id: string) => Number(id.trim())).filter((x: number) => x > 0);
                      }
                      return viajeActivo.rutaLogisticaId ? [Number(viajeActivo.rutaLogisticaId)] : [];
                    })()}
                    onChange={(id) => {
                      const fMatch = fincas.find((f) => f.id === id);
                      const esBuf = (fMatch?.tipoLeche || '').toUpperCase().includes('BUFAL');
                      setFormFinca({
                        ...formFinca,
                        fincaId: id,
                        tipoLeche: esBuf ? 'BUFALA' : (formFinca.tipoLeche || 'VACA'),
                      });
                    }}
                    required
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
                        value={formFinca.litros}
                        onChange={(e) => setFormFinca({ ...formFinca, litros: e.target.value })}
                        className="w-full h-11 pl-3 pr-12 rounded-xl border-[1.5px] border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-mono font-black text-lg text-slate-900 transition-all placeholder:text-slate-400 placeholder:font-normal"
                        placeholder="Ej: 450"
                        min="1"
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
                          onClick={() => setFormFinca({ ...formFinca, tipoLeche: 'VACA' })}
                          className={`h-full rounded-xl border-[1.5px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            formFinca.tipoLeche === 'VACA'
                              ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-2xs font-extrabold ring-1 ring-blue-500/20'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>🥛</span>
                          <span>Vaca</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormFinca({ ...formFinca, tipoLeche: 'BUFALA' })}
                          className={`h-full rounded-xl border-[1.5px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            formFinca.tipoLeche === 'BUFALA'
                              ? 'bg-purple-50 border-purple-500 text-purple-800 shadow-2xs font-extrabold ring-1 ring-purple-500/20'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>🐃</span>
                          <span>Búfala</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. OPCIONES OPERATIVAS: DIFERIDO Y CALIDAD */}
                <div className="space-y-2.5 pt-1">
                  {/* OPCIÓN DIFERIR LITROS */}
                  <div
                    onClick={() => setFormFinca({ ...formFinca, esDiferido: !formFinca.esDiferido })}
                    className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer select-none ${
                      formFinca.esDiferido
                        ? 'bg-amber-50/90 border-amber-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formFinca.esDiferido}
                        onChange={(e) => setFormFinca({ ...formFinca, esDiferido: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                            <i className="fa-solid fa-clock-rotate-left text-amber-600"></i>
                            Diferir Litros para el Siguiente Ciclo
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                              formFinca.esDiferido ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {formFinca.esDiferido ? 'Diferido Activo' : 'Liquidación Normal'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 m-0 mt-1 leading-snug">
                          Suma de inmediato al volumen de leche recolectada del camión en ruta, pero <strong>pospone el cálculo de pago</strong> para la liquidación de la próxima semana.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* OPCIÓN LECHE ÁCIDA */}
                  <div
                    onClick={() => setFormFinca({ ...formFinca, esAcida: !formFinca.esAcida })}
                    className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer select-none ${
                      formFinca.esAcida
                        ? 'bg-rose-50/90 border-rose-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formFinca.esAcida}
                        onChange={(e) => setFormFinca({ ...formFinca, esAcida: e.target.checked })}
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
                              formFinca.esAcida ? 'bg-rose-200 text-rose-900' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {formFinca.esAcida ? 'Leche Ácida' : 'Leche Dulce'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 m-0 mt-1 leading-snug">
                          Aplica tarifa especial de leche ácida y marca la parada para recepción segregada en silo o receptoría.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4.1 FOTO COMPROBANTE / RECIBO EN FINCA */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-camera text-sky-600"></i>
                      Foto del Recibo / Comprobante en Finca (Opcional)
                    </span>
                    {formFinca.fotoComprobante && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <i className="fa-solid fa-check"></i> Foto Adjunta
                      </span>
                    )}
                  </label>

                  <input
                    ref={fileInputComprobanteRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleFotoComprobanteChange}
                  />

                  {formFinca.fotoComprobante ? (
                    <div className="relative rounded-xl overflow-hidden border-[1.5px] border-sky-300 bg-slate-900 group">
                      <img
                        src={formFinca.fotoComprobante}
                        alt="Recibo en finca"
                        className="w-full h-36 object-contain block"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setFotoReciboModal(formFinca.fotoComprobante)}
                          className="px-3 py-1.5 rounded-lg bg-white/90 text-slate-800 text-xs font-bold hover:bg-white flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          <i className="fa-solid fa-eye"></i> Ver Grande
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormFinca((prev) => ({ ...prev, fotoComprobante: '' }))}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          <i className="fa-solid fa-trash-can"></i> Quitar Foto
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputComprobanteRef.current?.click()}
                      className="border-[1.5px] border-dashed border-sky-300 bg-sky-50/60 hover:bg-sky-50 hover:border-sky-400 rounded-xl p-3.5 flex items-center justify-center gap-2.5 cursor-pointer transition-colors text-sky-800"
                    >
                      <i className="fa-solid fa-camera text-base text-sky-600"></i>
                      <span className="text-xs font-bold">Tomar Foto o Adjuntar Recibo / Nota de Entrega</span>
                    </div>
                  )}
                </div>

                {/* 5. OBSERVACIONES */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="fa-regular fa-comment-dots text-slate-500"></i>
                    Observación Operativa (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formFinca.observacion}
                    onChange={(e) => setFormFinca({ ...formFinca, observacion: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border-[1.5px] border-slate-300 focus:border-sky-600 focus:ring-2 focus:ring-sky-100 text-xs text-slate-800 transition-all placeholder:text-slate-400"
                    placeholder="Ej: Muestra tomada en caneca, recolección con retraso..."
                  />
                </div>
              </div>

              {/* PIE DE ACCIONES */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalRegistroFinca(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarRecoleccionModalMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-extrabold text-white transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                >
                  {guardarRecoleccionModalMutation.isPending ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i>
                      Guardar Parada
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ASIGNAR / MODIFICAR RUTAS LOGÍSTICAS AL TICKET ABIERTO              */}
      {/* ========================================================================= */}
      {modalAsignarRutas && ticketParaRutas && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1250, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div className="content-card" style={{ width: '100%', maxWidth: '620px', maxHeight: '92vh', overflowY: 'auto', padding: '24px', borderRadius: '16px', border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', marginBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  <i className="fa-solid fa-route" style={{ color: '#9333ea', marginRight: '8px' }}></i>
                  Asignar Rutas Logísticas al Ticket #{ticketParaRutas.id || ticketParaRutas.ticketId}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Seleccione una o varias rutas planificadas para vincularlas a este viaje en curso, o desmarque para Modo Libre.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalAsignarRutas(false);
                  setTicketParaRutas(null);
                }}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* RESUMEN DEL TICKET Y CHOFER */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                  <i className="fa-solid fa-user-tie" style={{ color: '#3b82f6', marginRight: '6px' }}></i>
                  {ticketParaRutas.choferNombre || ticketParaRutas.chofer?.nombreCompleto || 'Chofer Responsable'}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                  <i className="fa-solid fa-truck" style={{ marginRight: '5px' }}></i>
                  {ticketParaRutas.camionPlaca || ticketParaRutas.camion?.placa || 'Cisterna'} • Capacidad: <strong>{(ticketParaRutas.capacidadCisterna || ticketParaRutas.camionCapacidad || 0).toLocaleString()} L</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Carga Actual en Cisterna:</span>
                <span style={{ fontSize: '14px', fontWeight: 900, color: '#2563eb' }}>
                  {(ticketParaRutas.litrosEnCamion || ticketParaRutas.totalLitros || ticketParaRutas.litrosRecogidos || 0).toLocaleString()} L
                </span>
              </div>
            </div>

            {/* SELECCIÓN MÚLTIPLE DE RUTAS */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="form-label" style={{ fontWeight: 800, margin: 0, color: '#0f172a', fontSize: '13px' }}>
                  <i className="fa-solid fa-map-location-dot" style={{ color: '#9333ea', marginRight: '6px' }}></i>
                  Rutas Logísticas Disponibles
                </label>
                <span style={{ fontSize: '11px', fontWeight: 700, color: rutasSeleccionadasTicket.length === 0 ? '#64748b' : '#9333ea' }}>
                  {rutasSeleccionadasTicket.length === 0 ? 'Modo Libre (Sin Ruta)' : `${rutasSeleccionadasTicket.length} seleccionada(s)`}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: '12px', maxHeight: '180px', overflowY: 'auto' }}>
                {rutasLogistica.length === 0 ? (
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>No hay rutas registradas en el sistema.</span>
                ) : (
                  rutasLogistica.map((r: any) => {
                    const isChecked = rutasSeleccionadasTicket.includes(r.id);
                    const fincasDeEsta = fincas.filter((f) => f.rutaId === r.id);
                    const ltsEstimadosEsta = fincasDeEsta.reduce((acc, f) => acc + getPromedioFinca(f.id, f), 0);

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setRutasSeleccionadasTicket((prev) => {
                            if (prev.includes(r.id)) {
                              return prev.filter((id) => id !== r.id);
                            } else {
                              return [...prev, r.id];
                            }
                          });
                        }}
                        style={{
                          border: isChecked ? '1.5px solid #9333ea' : '1px solid #cbd5e1',
                          background: isChecked ? '#ffffff' : '#f8fafc',
                          color: isChecked ? '#7e22ce' : '#475569',
                          fontWeight: isChecked ? 800 : 600,
                          padding: '7px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: isChecked ? '0 1px 3px rgba(147, 51, 234, 0.15)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <i className={`fa-${isChecked ? 'solid fa-check-circle' : 'regular fa-circle'}`} style={{ color: isChecked ? '#9333ea' : '#94a3b8' }}></i>
                        {r.nombre}
                        <span style={{ fontSize: '10.5px', opacity: 0.8, color: isChecked ? '#7e22ce' : '#64748b' }}>
                          (~{ltsEstimadosEsta.toLocaleString()} L • {fincasDeEsta.length} fincas)
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {rutasSeleccionadasTicket.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setRutasSeleccionadasTicket([])}
                    style={{ background: 'none', border: 'none', padding: '2px 0', fontSize: '11.5px', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <i className="fa-solid fa-xmark"></i> Desmarcar todas (Cambiar a Modo Libre)
                  </button>
                </div>
              )}
            </div>

            {/* DETALLE Y FINCAS QUE PERTENECEN A LAS RUTAS SELECCIONADAS */}
            {(() => {
              const fincasSeleccionadas = fincas.filter((f) => f.rutaId && rutasSeleccionadasTicket.includes(f.rutaId));
              const ltsTotalEstimado = fincasSeleccionadas.reduce((acc, f) => acc + getPromedioFinca(f.id, f), 0);
              const capCisterna = ticketParaRutas.capacidadCisterna || ticketParaRutas.camionCapacidad || 0;

              return (
                <div style={{ marginBottom: '18px', padding: '12px 14px', borderRadius: '12px', background: '#f1f5f9', border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                      <i className="fa-solid fa-list-check" style={{ color: '#0284c7', marginRight: '6px' }}></i>
                      Resumen del Itinerario Planificado:
                    </span>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a' }}>
                      {fincasSeleccionadas.length} Fincas • Est. {ltsTotalEstimado.toLocaleString()} L
                      {capCisterna > 0 && ` (${Math.round((ltsTotalEstimado / capCisterna) * 100)}% cisterna)`}
                    </span>
                  </div>
                  {fincasSeleccionadas.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '100px', overflowY: 'auto', marginTop: '6px' }}>
                      {fincasSeleccionadas.map((f) => (
                        <span
                          key={f.id}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            color: '#1e293b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <i className="fa-solid fa-location-dot" style={{ color: '#38bdf8', fontSize: '9px' }}></i>
                          {f.nombre}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>
                      {rutasSeleccionadasTicket.length === 0
                        ? 'Al operar en Modo Libre, el chofer o supervisor puede registrar paradas en cualquier finca sin restricciones de ruta.'
                        : 'No se encontraron fincas asignadas a las rutas seleccionadas.'}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* BOTONES DE ACCIÓN */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => {
                  setModalAsignarRutas(false);
                  setTicketParaRutas(null);
                }}
                className="btn btn-outline"
                style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 700 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={asignarRutasMutation.isPending}
                onClick={() => {
                  asignarRutasMutation.mutate({
                    ticketId: ticketParaRutas.id || ticketParaRutas.ticketId,
                    rutasIds: rutasSeleccionadasTicket,
                  });
                }}
                className="btn"
                style={{
                  background: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  padding: '8px 20px',
                  borderRadius: '9px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(147, 51, 234, 0.25)',
                }}
              >
                {asignarRutasMutation.isPending ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i> Guardando Rutas...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check"></i>
                    {rutasSeleccionadasTicket.length > 0 ? 'Guardar y Asignar al Ticket' : 'Guardar (Dejar en Modo Libre)'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CARGA MASIVA DE TICKETS DESDE EXCEL (SUPER ADMIN)                  */}
      {/* ========================================================================= */}
      {modalExcelMasivo && (() => {
        const filasFiltradas = filasExcel.filter((f) => {
          if (filtroPreviewExcel === 'VALIDAS') return f.esValido && !f.esDuplicado;
          if (filtroPreviewExcel === 'DUPLICADAS') return f.esDuplicado;
          if (filtroPreviewExcel === 'ERRORES') return !f.esValido;
          return true;
        });

        const filasAProcesar = filasExcel.filter((f) => {
          if (!f.esValido) return false;
          if (omitirDuplicadosExcel && f.esDuplicado) return false;
          return true;
        });

        // Contar grupos de tickets a generar
        const ticketsMap = new Map<string, any>();
        filasAProcesar.forEach((f) => {
          const k = `${f.fecha}_${f.conductorId}`;
          if (!ticketsMap.has(k)) {
            ticketsMap.set(k, {
              fecha: f.fecha,
              conductorNombre: f.conductorNombre,
              camionPlaca: f.camionPlaca,
              paradas: 0,
              litros: 0,
            });
          }
          const t = ticketsMap.get(k)!;
          t.paradas += 1;
          t.litros += f.litros;
        });

        const ticketsACrearList = Array.from(ticketsMap.values());
        const totalLitrosAProcesar = filasAProcesar.reduce((acc, f) => acc + (f.litros || 0), 0);
        const totalLitrosVaca = filasAProcesar.filter((f) => f.tipoLeche !== 'BUFALA').reduce((acc, f) => acc + (f.litros || 0), 0);
        const totalLitrosBufala = filasAProcesar.filter((f) => f.tipoLeche === 'BUFALA').reduce((acc, f) => acc + (f.litros || 0), 0);
        const totalLitrosAcida = filasAProcesar.filter((f) => f.esAcida).reduce((acc, f) => acc + (f.litros || 0), 0);
        const cantDuplicadas = filasExcel.filter((f) => f.esDuplicado).length;
        const cantErrores = filasExcel.filter((f) => !f.esValido).length;
        const cantValidas = filasExcel.filter((f) => f.esValido && !f.esDuplicado).length;

        // Definición de columnas para DataTable (Regla #2)
        const columnasExcel: ColumnDef<any>[] = [
          {
            header: '#',
            accessorKey: 'index',
            cell: (row) => <span className="font-bold text-slate-500">{row.index}</span>,
          },
          {
            header: 'FECHA',
            accessorKey: 'fecha',
            cell: (row) => (
              <span className="font-mono font-bold text-slate-800 text-xs">
                {row.fecha || <span className="text-rose-600 font-bold">Sin fecha</span>}
              </span>
            ),
          },
          {
            header: 'FINCA',
            accessorKey: 'fincaNombre',
            cell: (row) => (
              <div>
                <div className="font-bold text-slate-900 text-xs">{row.fincaNombre || row.fincaRaw}</div>
                {row.fincaId > 0 ? (
                  <span className="text-[10px] text-emerald-600 font-semibold">✓ Reconocida (ID: #{row.fincaId})</span>
                ) : (
                  <span className="text-[10px] text-rose-600 font-extrabold">❌ Finca No Reconocida</span>
                )}
              </div>
            ),
          },
          {
            header: 'LITROS',
            accessorKey: 'litros',
            cell: (row) => (
              <span className="font-extrabold text-blue-700 text-xs">
                {(row.litros || 0).toLocaleString()} Lts
              </span>
            ),
          },
          {
            header: 'CONDUCTOR',
            accessorKey: 'conductorNombre',
            cell: (row) => (
              <div>
                <div className="font-bold text-slate-900 text-xs">{row.conductorNombre || row.conductorRaw}</div>
                {row.conductorId > 0 ? (
                  <span className="text-[10px] text-emerald-600 font-semibold">✓ Chofer Activo</span>
                ) : (
                  <span className="text-[10px] text-rose-600 font-extrabold">❌ Chofer No Reconocido</span>
                )}
              </div>
            ),
          },
          {
            header: 'CISTERNA ASOCIADA',
            accessorKey: 'camionPlaca',
            cell: (row) => (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-[11px] border border-slate-300">
                <i className="fa-solid fa-truck-moving text-sky-600"></i>
                {row.camionPlaca || 'S/P'}
              </span>
            ),
          },
          {
            header: 'CONDICIONES',
            accessorKey: 'esAcida',
            cell: (row) => (
              <div className="flex items-center gap-1.5 flex-wrap">
                {row.tipoLeche === 'BUFALA' ? (
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-black bg-purple-100 text-purple-800 border border-purple-300 inline-flex items-center gap-1 shadow-xs">
                    🐃 BÚFALA
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-black bg-blue-100 text-blue-800 border border-blue-300 inline-flex items-center gap-1 shadow-xs">
                    🐄 VACA
                  </span>
                )}
                {row.esAcida && (
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-black bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1 shadow-xs animate-pulse">
                    🍋 ÁCIDA {row.precioLitroUSDAplicado ? `($${Number(row.precioLitroUSDAplicado).toFixed(4)})` : ''}
                  </span>
                )}
              </div>
            ),
          },
          {
            header: 'ESTADO / DIAGNÓSTICO',
            accessorKey: 'mensajeValidacion',
            cell: (row) => {
              if (!row.esValido) {
                return (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    <i className="fa-solid fa-circle-xmark"></i> {row.mensajeValidacion || 'Dato inválido'}
                  </span>
                );
              }
              if (row.esDuplicado) {
                return (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <i className="fa-solid fa-triangle-exclamation"></i> {row.mensajeValidacion || 'Ya Registrada'}
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <i className="fa-solid fa-circle-check"></i> Válida para crear
                </span>
              );
            },
          },
        ];

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(5px)',
              padding: '16px',
            }}
          >
            <div
              className="content-card"
              style={{
                maxWidth: '1150px',
                width: '98%',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                borderRadius: '20px',
                border: '1px solid #cbd5e1',
                boxShadow: '0 25px 60px rgba(15,23,42,0.4)',
                padding: 0,
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: '18px 24px',
                  background: 'linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                    }}
                  >
                    <i className="fa-solid fa-file-excel"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900 }}>
                      Carga Masiva de Tickets desde Excel (Super Admin)
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#d1fae5' }}>
                      Lectura de planillas con validación previa de inconsistencias, detección de duplicados y asociación automática de cisterna
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalExcelMasivo(false)}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '34px',
                    height: '34px',
                    color: '#ffffff',
                    fontSize: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Zona de Carga y Descarga de Plantilla */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1.5px dashed #94a3b8',
                    borderRadius: '16px',
                    padding: '18px 22px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="fa-solid fa-cloud-arrow-up text-emerald-600"></i>
                      <span>{archivoExcelNombre ? `Archivo cargado: ${archivoExcelNombre}` : 'Selecciona o arrastra el archivo Excel (.xlsx, .xls, .csv)'}</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                      Columnas requeridas: <b className="text-slate-800">FECHA</b>, <b className="text-slate-800">FINCA</b>, <b className="text-slate-800">LITROS</b>, <b className="text-slate-800">CONDUCTOR</b>, <b className="text-slate-800">OBSERVACION</b>, <b className="text-slate-800">ACIDA</b>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={descargarPlantillaExcel}
                      className="btn btn-outline"
                      style={{
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 800,
                        borderColor: '#cbd5e1',
                        color: '#047857',
                        background: '#ffffff',
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fa-solid fa-download"></i> Descargar Plantilla (.XLSX)
                    </button>

                    <label
                      className="btn btn-primary"
                      style={{
                        padding: '8px 16px',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fa-solid fa-file-excel"></i>
                      <span>{archivoExcelNombre ? 'Cambiar Archivo' : 'Subir Excel'}</span>
                      <input
                        ref={fileInputExcelRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) procesarArchivoExcel(file);
                        }}
                      />
                    </label>
                  </div>
                </div>

                {validandoExcel && (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#047857' }}>
                    <i className="fa-solid fa-spinner fa-spin text-3xl mb-3"></i>
                    <div style={{ fontWeight: 800, fontSize: '15px' }}>Analizando y auditando planilla Excel...</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Validando fincas ganaderas, conductores, ciclos operativos y verificando posibles duplicados...
                    </div>
                  </div>
                )}

                {/* Panel de Validación y Diagnóstico previo */}
                {!validandoExcel && filasExcel.length > 0 && (
                  <>
                    {/* Banner de Diagnóstico */}
                    <div
                      style={{
                        padding: '14px 18px',
                        borderRadius: '14px',
                        background: cantErrores > 0 ? '#fef2f2' : cantDuplicadas > 0 ? '#fffbeb' : '#f0fdf4',
                        border: `1.5px solid ${cantErrores > 0 ? '#fca5a5' : cantDuplicadas > 0 ? '#fde68a' : '#86efac'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i
                          className={`fa-solid ${
                            cantErrores > 0 ? 'fa-circle-xmark text-rose-600 text-xl' : cantDuplicadas > 0 ? 'fa-triangle-exclamation text-amber-600 text-xl' : 'fa-circle-check text-emerald-600 text-xl'
                          }`}
                        ></i>
                        <div>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: '13.5px',
                              color: cantErrores > 0 ? '#991b1b' : cantDuplicadas > 0 ? '#92400e' : '#166534',
                            }}
                          >
                            {validacionExcel?.mensajeGeneral || (cantErrores === 0 ? 'Data 100% validada sin inconsistencias' : 'Se encontraron errores')}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                            {cantErrores === 0
                              ? `Listo para generar ${ticketsACrearList.length} ticket(s) nuevo(s) con ${filasAProcesar.length} paradas en estado ABIERTO.`
                              : `Hay ${cantErrores} fila(s) con datos no reconocidos que no podrán procesarse.`}
                          </div>
                        </div>
                      </div>

                      {cantDuplicadas > 0 && (
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '10px',
                            border: '1px solid #fde68a',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: '#92400e',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={omitirDuplicadosExcel}
                            onChange={(e) => setOmitirDuplicadosExcel(e.target.checked)}
                          />
                          <span>Omitir automáticamente {cantDuplicadas} registros ya existentes</span>
                        </label>
                      )}
                    </div>

                    {/* Tarjetas de Resumen */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                      <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Total Filas Excel</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>{filasExcel.length}</div>
                      </div>

                      <div style={{ background: '#f0fdf4', padding: '12px 14px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>Tickets Nuevos</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#15803d', marginTop: '2px' }}>
                          {ticketsACrearList.length} <span style={{ fontSize: '11px', fontWeight: 700 }}>(Abiertos)</span>
                        </div>
                      </div>

                      <div style={{ background: '#eff6ff', padding: '12px 14px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700 }}>Litros a Cargar</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#1d4ed8', marginTop: '2px' }}>
                          {totalLitrosAProcesar.toLocaleString()} Lts
                        </div>
                      </div>

                      <div style={{ background: '#f5f3ff', padding: '12px 14px', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                        <div style={{ fontSize: '11px', color: '#6b21a8', fontWeight: 700 }}>🐃 Búfala / 🐄 Vaca</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#581c87', marginTop: '4px' }}>
                          🐃 {totalLitrosBufala.toLocaleString()} L | 🐄 {totalLitrosVaca.toLocaleString()} L
                        </div>
                      </div>

                      {totalLitrosAcida > 0 && (
                        <div style={{ background: '#fffbeb', padding: '12px 14px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                          <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 700 }}>🍋 Leche Ácida</div>
                          <div style={{ fontSize: '17px', fontWeight: 900, color: '#b45309', marginTop: '2px' }}>
                            {totalLitrosAcida.toLocaleString()} Lts
                          </div>
                        </div>
                      )}

                      <div style={{ background: cantDuplicadas > 0 ? '#fffbeb' : '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: `1px solid ${cantDuplicadas > 0 ? '#fde68a' : '#e2e8f0'}` }}>
                        <div style={{ fontSize: '11px', color: cantDuplicadas > 0 ? '#92400e' : '#64748b', fontWeight: 700 }}>Duplicados Detectados</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: cantDuplicadas > 0 ? '#b45309' : '#64748b', marginTop: '2px' }}>
                          {cantDuplicadas} {omitirDuplicadosExcel && cantDuplicadas > 0 && <span style={{ fontSize: '10px', color: '#92400e' }}>(Se omitirán)</span>}
                        </div>
                      </div>
                    </div>

                    {/* Pestañas de Filtro para la Tabla */}
                    <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setFiltroPreviewExcel('TODAS')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: filtroPreviewExcel === 'TODAS' ? '#0f172a' : '#f1f5f9',
                          color: filtroPreviewExcel === 'TODAS' ? '#ffffff' : '#475569',
                          border: 'none',
                        }}
                      >
                        Todas ({filasExcel.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroPreviewExcel('VALIDAS')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: filtroPreviewExcel === 'VALIDAS' ? '#15803d' : '#f1f5f9',
                          color: filtroPreviewExcel === 'VALIDAS' ? '#ffffff' : '#475569',
                          border: 'none',
                        }}
                      >
                        Válidas ({cantValidas})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroPreviewExcel('DUPLICADAS')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: filtroPreviewExcel === 'DUPLICADAS' ? '#b45309' : '#f1f5f9',
                          color: filtroPreviewExcel === 'DUPLICADAS' ? '#ffffff' : '#475569',
                          border: 'none',
                        }}
                      >
                        Duplicadas ({cantDuplicadas})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroPreviewExcel('ERRORES')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: filtroPreviewExcel === 'ERRORES' ? '#b91c1c' : '#f1f5f9',
                          color: filtroPreviewExcel === 'ERRORES' ? '#ffffff' : '#475569',
                          border: 'none',
                        }}
                      >
                        Con Errores ({cantErrores})
                      </button>
                    </div>

                    {/* Tabla de Preview con DataTable (Regla #2) */}
                    <div style={{ flex: 1, minHeight: '260px' }}>
                      <DataTable
                        data={filasFiltradas}
                        columns={columnasExcel}
                        exportFileName={`Prevalidacion_Excel_${hoyStr}`}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '16px 24px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  onClick={() => setModalExcelMasivo(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {filasExcel.length > 0 && (
                    <button
                      type="button"
                      disabled={ejecutandoCargaExcel || filasAProcesar.length === 0}
                      onClick={ejecutarCargaMasivaExcel}
                      style={{
                        padding: '11px 24px',
                        borderRadius: '10px',
                        border: 'none',
                        background:
                          filasAProcesar.length > 0
                            ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                            : '#94a3b8',
                        color: '#ffffff',
                        fontWeight: 900,
                        fontSize: '13px',
                        cursor: filasAProcesar.length > 0 ? 'pointer' : 'not-allowed',
                        boxShadow: filasAProcesar.length > 0 ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {ejecutandoCargaExcel ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i> Generando Tickets...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-rocket"></i>
                          <span>Crear {ticketsACrearList.length} Tickets Nuevos ({totalLitrosAProcesar.toLocaleString()} Lts)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL: CARGA MASIVA Y ESCANEO POR FOTO / IA (EXCLUSIVO SUPERADMIN)        */}
      {/* ========================================================================= */}
      {modalRutasMasivo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            className="content-card"
            style={{
              maxWidth: '1040px',
              width: '95%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              color: '#1e293b',
              borderRadius: '16px',
              border: '1px solid #cbd5e1',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(15,23,42,0.35)',
              padding: 0,
            }}
          >
            {/* CABECERA */}
            <div
              style={{
                flexShrink: 0,
                background: 'linear-gradient(135deg, #1e1b4b, #3b82f6)',
                padding: '18px 24px',
                borderBottom: '1px solid #3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.18)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  <i className="fa-solid fa-bolt" style={{ color: '#ffffff', fontSize: '22px' }}></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#ffffff', fontWeight: 800, fontSize: '18px', letterSpacing: '-0.2px' }}>
                    Registro Masivo de Recolección en Rutas
                  </h3>
                  <p style={{ margin: '3px 0 0 0', color: '#dbeafe', fontSize: '12.5px' }}>
                    Carga rápida por lista continua o lectura automática por Foto/Planilla con IA (OCR)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  detenerCamara();
                  setModalRutasMasivo(false);
                }}
                style={{
                  color: '#ffffff',
                  opacity: 0.85,
                  background: 'transparent',
                  border: 'none',
                  fontSize: '28px',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
                onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
              >
                &times;
              </button>
            </div>

            {/* CUERPO DEL MODAL */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', background: '#f8fafc' }}>
              {/* BANNER DE ASIGNACIÓN A TICKET */}
              <div
                style={{
                  background: '#eff6ff',
                  border: '1.5px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  boxShadow: '0 1px 3px rgba(37,99,235,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-ticket" style={{ color: '#2563eb', fontSize: '15px' }}></i>
                  <span style={{ fontSize: '12.5px', color: '#1e3a8a', fontWeight: 700 }}>Ticket de Viaje:</span>
                  <span
                    className="badge"
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    {masivoControlRutaId ? `Ticket #${masivoControlRutaId}` : 'Auto-Apertura'}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                  Las fincas se vincularán automáticamente al ticket correspondiente.
                </span>
              </div>

              {/* CABECERA DATOS GENERALES */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '14px',
                  background: '#ffffff',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  marginBottom: '14px',
                  border: '1.5px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      display: 'block',
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    <i className="fa-solid fa-calendar-day" style={{ color: '#2563eb', marginRight: '4px' }}></i> FECHA DE RECOLECCIÓN *
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={masivoFecha}
                    onChange={(e) => setMasivoFecha(e.target.value)}
                    style={{
                      height: '38px',
                      background: '#ffffff',
                      color: '#0f172a',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '7px',
                      fontWeight: 600,
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      display: 'block',
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    <i className="fa-solid fa-user-tie" style={{ color: '#2563eb', marginRight: '4px' }}></i> CONDUCTOR *
                  </label>
                  <ChoferSelect
                    value={masivoConductorId || undefined}
                    onChange={(val) => {
                      setMasivoConductorId(Number(val) || 0);
                      setMasivoControlRutaId(null);
                    }}
                    placeholder="-- SELECCIONAR CONDUCTOR --"
                  />
                </div>
              </div>

              {/* SECCIÓN OCR / ESCANEO DE FOTO */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1.5px dashed #93c5fd',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  marginBottom: '14px',
                  boxShadow: '0 1px 3px rgba(37,99,235,0.03)',
                }}
              >
                {!camaraActiva && !isOcrLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          background: '#eff6ff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <i className="fa-solid fa-camera" style={{ fontSize: '16px', color: '#2563eb' }}></i>
                      </div>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                          ¿Cargar por foto o planilla con IA (OCR)?
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '6px' }}>
                          Pre-llena la lista automáticamente.
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      <input
                        type="file"
                        ref={fileInputMasivoRef}
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleSubirArchivoFoto}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputMasivoRef.current?.click()}
                        style={{
                          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                          color: '#ffffff',
                          fontWeight: 700,
                          border: 'none',
                          padding: '7px 16px',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12.5px',
                          boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
                        }}
                      >
                        <i className="fa-solid fa-upload"></i> Subir Imagen
                      </button>
                      <button
                        type="button"
                        onClick={iniciarCamara}
                        style={{
                          background: 'linear-gradient(135deg, #059669, #10b981)',
                          color: '#ffffff',
                          fontWeight: 700,
                          border: 'none',
                          padding: '7px 16px',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12.5px',
                          boxShadow: '0 2px 6px rgba(16,185,129,0.2)',
                        }}
                      >
                        <i className="fa-solid fa-video"></i> Activar Cámara
                      </button>
                    </div>
                  </div>
                )}

                {camaraActiva && (
                  <div style={{ padding: '6px 0' }}>
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: '280px',
                        maxHeight: '45vh',
                        background: '#000000',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '2px solid #10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <video
                        ref={videoWebcamRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000000' }}
                      />
                      <canvas ref={canvasWebcamRef} style={{ display: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={capturarFoto}
                        style={{
                          background: '#10b981',
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '13px',
                          padding: '8px 20px',
                          borderRadius: '7px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(16,185,129,0.3)',
                        }}
                      >
                        <i className="fa-solid fa-circle-dot"></i> Capturar Foto
                      </button>
                      <button
                        type="button"
                        onClick={cambiarCamara}
                        style={{
                          background: '#3b82f6',
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '12.5px',
                          padding: '8px 16px',
                          borderRadius: '7px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className="fa-solid fa-camera-rotate"></i> Cambiar Cámara
                      </button>
                      <button
                        type="button"
                        onClick={detenerCamara}
                        style={{
                          background: '#64748b',
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '12.5px',
                          padding: '8px 16px',
                          borderRadius: '7px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className="fa-solid fa-xmark"></i> Apagar Cámara
                      </button>
                    </div>
                  </div>
                )}

                {isOcrLoading && (
                  <div style={{ padding: '16px', textAlign: 'center' }}>
                    <i className="fa-solid fa-wand-magic-sparkles fa-spin" style={{ fontSize: '28px', color: '#2563eb', marginBottom: '8px' }}></i>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e3a8a' }}>
                      Leyendo datos de la imagen con IA...
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Reconociendo nombres de fincas, litros y notas en la planilla
                    </div>
                  </div>
                )}
              </div>

              {/* ALERTA DE ÉXITO OCR */}
              {ocrMensaje && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginBottom: '12px',
                    color: '#15803d',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-circle-check" style={{ fontSize: '16px', color: '#16a34a' }}></i>
                    <span>{ocrMensaje}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOcrMensaje(null)}
                    style={{ background: 'none', border: 'none', color: '#15803d', cursor: 'pointer', fontSize: '16px' }}
                  >
                    &times;
                  </button>
                </div>
              )}

              {/* TABLA DINÁMICA DE FILAS */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-list-check" style={{ color: '#2563eb', fontSize: '15px' }}></i>
                    <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>
                      Filas de Recolección ({masivoFilas.length})
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={agregarFilaMasiva}
                    style={{
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                      border: 'none',
                      color: '#fff',
                      padding: '6px 16px',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12.5px',
                      boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
                    }}
                  >
                    <i className="fa-solid fa-plus"></i> Agregar Finca
                  </button>
                </div>

                <div
                  style={{
                    maxHeight: '440px',
                    minHeight: '220px',
                    overflowY: 'auto',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#ffffff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <table style={{ width: '100%', margin: 0, borderCollapse: 'collapse', color: '#1e293b', fontSize: '13px', tableLayout: 'fixed' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr
                        style={{
                          background: '#f1f5f9',
                          textAlign: 'left',
                          color: '#475569',
                          fontSize: '11px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          borderBottom: '2px solid #cbd5e1',
                        }}
                      >
                        <th style={{ padding: '10px 10px', width: '34%' }}>Finca / Ganadero *</th>
                        <th style={{ padding: '10px 6px', width: '17%', textAlign: 'center' }}>Tipo Leche</th>
                        <th style={{ padding: '10px 6px', width: '13%', textAlign: 'right' }}>Litros (L) *</th>
                        <th style={{ padding: '10px 4px', width: '11%', textAlign: 'center' }}>¿Ácida?</th>
                        <th style={{ padding: '10px 6px', width: '19%' }}>Comentarios / Obs.</th>
                        <th style={{ padding: '10px 4px', width: '6%', textAlign: 'center' }}>Quitar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {masivoFilas.map((fila, idx) => (
                        <tr
                          key={fila.idTemp || idx}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                          }}
                        >
                          <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                            <div className={`masivo-finca-row-${idx}`}>
                              <FincaSelect
                                value={fila.fincaId || undefined}
                                onChange={(val) => {
                                  const fId = Number(val) || 0;
                                  actualizarFilaMasiva(idx, 'fincaId', fId);
                                  const fObj = fincas.find((f) => f.id === fId);
                                  if (fObj?.tipoLeche) {
                                    actualizarFilaMasiva(
                                      idx,
                                      'tipoLeche',
                                      fObj.tipoLeche.toUpperCase().includes('BUFAL') ? 'BUFALA' : 'VACA'
                                    );
                                  }
                                }}
                                placeholder="-- Seleccionar Finca --"
                              />
                            </div>
                          </td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <select
                              className="form-select"
                              value={fila.tipoLeche}
                              onChange={(e) => actualizarFilaMasiva(idx, 'tipoLeche', e.target.value)}
                              style={{
                                width: '100%',
                                height: '36px',
                                fontSize: '12px',
                                fontWeight: 700,
                                borderRadius: '7px',
                                border: '1.5px solid #cbd5e1',
                                background: fila.tipoLeche === 'BUFALA' ? '#fdf4ff' : '#f0fdf4',
                                color: fila.tipoLeche === 'BUFALA' ? '#9333ea' : '#15803d',
                              }}
                            >
                              <option value="VACA">🥛 Vaca</option>
                              <option value="BUFALA">🐃 Búfala</option>
                            </select>
                          </td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'middle' }}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              className="form-input"
                              value={fila.litros}
                              onChange={(e) => actualizarFilaMasiva(idx, 'litros', e.target.value)}
                              placeholder="0"
                              style={{
                                width: '100%',
                                height: '36px',
                                textAlign: 'right',
                                fontWeight: 800,
                                fontSize: '13.5px',
                                borderRadius: '7px',
                                border: '1.5px solid #cbd5e1',
                                color: '#047857',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 4px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={fila.esAcida}
                              onChange={(e) => actualizarFilaMasiva(idx, 'esAcida', e.target.checked)}
                              style={{
                                width: '18px',
                                height: '18px',
                                cursor: 'pointer',
                                accentColor: '#dc2626',
                              }}
                              title="Marcar si es leche ácida o deteriorada"
                            />
                          </td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'middle' }}>
                            <input
                              type="text"
                              className="form-input"
                              value={fila.observacion}
                              onChange={(e) => actualizarFilaMasiva(idx, 'observacion', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Tab' && !e.shiftKey) {
                                  e.preventDefault();
                                  if (idx === masivoFilas.length - 1) {
                                    agregarFilaMasiva();
                                  }
                                  setTimeout(() => {
                                    const nextContainer = document.querySelector<HTMLElement>(`.masivo-finca-row-${idx + 1}`);
                                    if (nextContainer) {
                                      const focusable = nextContainer.querySelector<HTMLElement>('[tabindex="0"], button, input');
                                      if (focusable) {
                                        focusable.focus();
                                      }
                                    }
                                  }, 80);
                                }
                              }}
                              placeholder="Opcional... (Tab para nueva fila)"
                              style={{
                                width: '100%',
                                height: '36px',
                                fontSize: '12px',
                                borderRadius: '7px',
                                border: '1.5px solid #cbd5e1',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 4px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => removerFilaMasiva(idx)}
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                width: '32px',
                                height: '32px',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Eliminar fila"
                            >
                              <i className="fa-solid fa-trash-can" style={{ fontSize: '13px' }}></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RESUMEN TOTAL DE LITROS */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#ffffff',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1.5px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-calculator" style={{ color: '#2563eb', fontSize: '16px' }}></i>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Total de Litros en Lote:
                  </span>
                </div>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#059669' }}>
                  {totalLitrosMasivo.toLocaleString()} L
                </span>
              </div>

              {/* SECCIÓN: ENTREGA Y RECEPCIÓN DIRECTA (HOJA DE RUTA FÍSICA PARA CHOFERES SIN SMARTPHONE) */}
              <div
                style={{
                  background: '#ffffff',
                  border: masivoRegistrarEntrega ? '1.5px solid #10b981' : '1.5px solid #e2e8f0',
                  borderRadius: '10px',
                  marginTop: '12px',
                  padding: '12px 16px',
                  boxShadow: masivoRegistrarEntrega ? '0 4px 14px rgba(16,185,129,0.08)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: masivoRegistrarEntrega ? '12px' : '0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={masivoRegistrarEntrega}
                      onChange={(e) => setMasivoRegistrarEntrega(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: masivoRegistrarEntrega ? '#065f46' : '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa-solid fa-truck-ramp-box" style={{ color: '#10b981' }}></i>
                        Registrar también Entrega Final en Planta / Receptoría (Opcional)
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                        {masivoRegistrarEntrega
                          ? 'Se registrará la entrega directa a planta/receptoría cerrando el ciclo.'
                          : 'Recomendado: El ticket se creará activo en "Control Rutas & Camiones" con sus fincas para continuar el proceso normal de entrega y recepción.'}
                      </div>
                    </div>
                  </label>
                  {masivoRegistrarEntrega && (
                    <span
                      className="badge"
                      style={{
                        background: '#dcfce7',
                        color: '#15803d',
                        border: '1px solid #86efac',
                        fontWeight: 800,
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      <i className="fa-solid fa-circle-check"></i> FLUJO COMPLETO ACTIVO
                    </span>
                  )}
                </div>

                {masivoRegistrarEntrega && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1fr 1fr',
                      gap: '12px',
                      paddingTop: '12px',
                      borderTop: '1px dashed #cbd5e1',
                    }}
                  >
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <i className="fa-solid fa-building" style={{ color: '#10b981', marginRight: '4px' }}></i> Receptoría / Planta Destino *
                      </label>
                      <select
                        className="form-input"
                        value={masivoCompaniaId}
                        onChange={(e) => setMasivoCompaniaId(Number(e.target.value))}
                        style={{ height: '38px', borderRadius: '7px', fontWeight: 700, fontSize: '12.5px', border: '1.5px solid #cbd5e1' }}
                      >
                        {companias.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} {(c as any).rif ? `- ${(c as any).rif}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <i className="fa-solid fa-scale-balanced" style={{ color: '#10b981', marginRight: '4px' }}></i> Litros Recibidos en Planta *
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        value={masivoLitrosRecibidos !== '' ? masivoLitrosRecibidos : (totalLitrosMasivo || '')}
                        onChange={(e) => setMasivoLitrosRecibidos(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder={String(totalLitrosMasivo || 0)}
                        style={{ height: '38px', borderRadius: '7px', fontWeight: 800, fontSize: '13.5px', border: '1.5px solid #cbd5e1', color: '#047857' }}
                      />
                      <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                        Pre-llenado con los {totalLitrosMasivo.toLocaleString()} L de fincas.
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <i className="fa-solid fa-file-invoice" style={{ color: '#10b981', marginRight: '4px' }}></i> Ticket Romana / Comprobante
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={masivoComprobantePesaje}
                        onChange={(e) => setMasivoComprobantePesaje(e.target.value)}
                        placeholder="Ej: Pesaje Romana #5820..."
                        style={{ height: '38px', borderRadius: '7px', fontSize: '12px', border: '1.5px solid #cbd5e1' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PIE DEL MODAL */}
            <div
              style={{
                flexShrink: 0,
                padding: '14px 20px',
                background: '#ffffff',
                borderTop: '1.5px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={limpiarTablaMasiva}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1.5px solid #cbd5e1',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-eraser"></i> Limpiar Todo
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    detenerCamara();
                    setModalRutasMasivo(false);
                  }}
                  style={{
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1.5px solid #cbd5e1',
                    padding: '9px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => guardarMasivoMutation.mutate()}
                  disabled={guardarMasivoMutation.isPending}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '13.5px',
                    padding: '9px 24px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                  }}
                >
                  {guardarMasivoMutation.isPending ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Guardando y Procesando...
                    </>
                  ) : (
                    <>
                      <i className={`fa-solid ${masivoRegistrarEntrega ? 'fa-check-double' : 'fa-floppy-disk'}`}></i>{' '}
                      {masivoRegistrarEntrega ? 'Guardar y Procesar Entrega' : 'Guardar Todos los Registros'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: EDITAR PARADA EN FINCA (DENTRO DEL TICKET ABIERTO)               */}
      {/* ========================================================================= */}
      {modalEditarRecoleccion && (
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
            padding: '24px 16px',
            overflowY: 'auto',
          }}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col my-auto"
            style={{ maxHeight: '92vh', position: 'relative' }}
          >
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
                  <h3 className="m-0 text-base font-extrabold text-white">
                    Editar Parada de Finca
                  </h3>
                  <p className="m-0 text-xs text-blue-200 mt-0.5">
                    Modificación de litros y condiciones operativas en ticket abierto
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalEditarRecoleccion(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 text-2xl transition-colors cursor-pointer"
                title="Cerrar modal"
              >
                &times;
              </button>
            </div>

            {/* FORMULARIO EDITAR */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formEditar.litros || Number(formEditar.litros) <= 0) {
                  toast.error('Ingrese una cantidad válida de litros');
                  return;
                }
                editarRecoleccionMutation.mutate(formEditar);
              }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-5 md:p-6 overflow-y-auto space-y-4 flex-1">
                {/* 1. LITROS RECOLECTADOS & TIPO DE LECHE */}
                <div className={`grid ${hasBufala ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3.5`}>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <i className="fa-solid fa-faucet-drip text-blue-600"></i>
                      Litros Recolectados *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={formEditar.litros || ''}
                        onChange={(e) => setFormEditar({ ...formEditar, litros: Number(e.target.value) })}
                        className="w-full h-11 pl-3 pr-12 rounded-xl border-[1.5px] border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-mono font-black text-lg text-slate-900 transition-all"
                        min="1"
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
                          onClick={() => setFormEditar({ ...formEditar, tipoLeche: 'VACA' })}
                          className={`h-full rounded-xl border-[1.5px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            formEditar.tipoLeche === 'VACA'
                              ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>🥛</span>
                          <span>Vaca</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormEditar({ ...formEditar, tipoLeche: 'BUFALA' })}
                          className={`h-full rounded-xl border-[1.5px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            formEditar.tipoLeche === 'BUFALA'
                              ? 'bg-purple-50 border-purple-500 text-purple-800 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>🐃</span>
                          <span>Búfala</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. OPCIONES DIFERIDO Y ÁCIDA */}
                <div className="space-y-2.5 pt-1">
                  {/* DIFERIDO */}
                  <div
                    onClick={() => setFormEditar({ ...formEditar, esDiferido: !formEditar.esDiferido })}
                    className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer select-none ${
                      formEditar.esDiferido
                        ? 'bg-amber-50/90 border-amber-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formEditar.esDiferido}
                        onChange={(e) => setFormEditar({ ...formEditar, esDiferido: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                            <i className="fa-solid fa-clock-rotate-left text-amber-600"></i>
                            Diferir Litros para el Siguiente Ciclo
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                              formEditar.esDiferido ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {formEditar.esDiferido ? 'Diferido Activo' : 'Liquidación Normal'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 m-0 mt-1 leading-snug">
                          Suma al volumen del camión, pero se liquida y paga en la semana operativa siguiente.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ÁCIDA */}
                  <div
                    onClick={() => setFormEditar({ ...formEditar, esAcida: !formEditar.esAcida })}
                    className={`p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer select-none ${
                      formEditar.esAcida
                        ? 'bg-rose-50/90 border-rose-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formEditar.esAcida}
                        onChange={(e) => setFormEditar({ ...formEditar, esAcida: e.target.checked })}
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
                              formEditar.esAcida ? 'bg-rose-200 text-rose-900' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {formEditar.esAcida ? 'Leche Ácida' : 'Leche Dulce'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 m-0 mt-1 leading-snug">
                          Aplica tarifa especial de leche ácida.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. OBSERVACIÓN / MOTIVO */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="fa-regular fa-comment-dots text-slate-500"></i>
                    Observación o Justificación del Ajuste
                  </label>
                  <input
                    type="text"
                    value={formEditar.observacion}
                    onChange={(e) => setFormEditar({ ...formEditar, observacion: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border-[1.5px] border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs text-slate-800 transition-all placeholder:text-slate-400"
                    placeholder="Motivo del ajuste de litros..."
                  />
                </div>

                {/* 4. FOTO DEL RECIBO / COMPROBANTE EN FINCA (OPCIONAL) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="fa-solid fa-camera text-sky-600"></i>
                    Foto del Recibo / Comprobante en Finca (Opcional)
                  </label>
                  <div className="border border-dashed border-sky-300 rounded-xl p-3 bg-sky-50/50 flex flex-col items-center justify-center gap-2">
                    {formEditar.fotoComprobante ? (
                      <div className="flex items-center gap-3 w-full">
                        <img
                          src={formEditar.fotoComprobante}
                          alt="Recibo"
                          className="w-14 h-14 object-cover rounded-lg border border-slate-300 shadow-2xs"
                        />
                        <div className="flex-1 text-xs text-slate-600 truncate">
                          <span className="font-bold text-slate-800 block">Recibo Adjunto</span>
                          <span className="text-[11px] text-emerald-700">✓ Listo para guardar</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormEditar({ ...formEditar, fotoComprobante: '' })}
                          className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200 cursor-pointer"
                        >
                          Quitar Foto
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex items-center gap-2 text-xs font-bold text-sky-700 hover:text-sky-800 py-1.5">
                        <i className="fa-solid fa-cloud-arrow-up text-sm"></i>
                        <span>Tomar o Adjuntar Foto del Recibo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setFormEditar({ ...formEditar, fotoComprobante: reader.result as string });
                              };
                              reader.readAsDataURL(file);
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* PIE */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center gap-2.5 shrink-0">
                <div>
                  {esAdminOSup && formEditar.id > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await Swal.fire({
                          title: '¿Limpiar información de recolección?',
                          html: `¿Deseas reiniciar los datos de recolección de esta finca?<br/><br/><div style="text-align: left; font-size: 13px; color: #cbd5e1; background: #1e293b; padding: 10px; border-radius: 8px;">
                            <p>✅ <b>La finca NO se eliminará</b> del ticket.</p>
                            <p>✅ Quedará marcada como <b>NO RECOGIDA (0 Litros)</b> para que el chofer pueda recolectarla mañana.</p>
                            <p>⚠️ Se eliminarán los litros registrados (${formEditar.litros} L), foto de comprobante y observaciones.</p>
                          </div>`,
                          icon: 'warning',
                          showCancelButton: true,
                          confirmButtonColor: '#2563eb',
                          cancelButtonColor: '#64748b',
                          confirmButtonText: '<i class="fa-solid fa-eraser"></i> Sí, Limpiar y Dejar Pendiente',
                          cancelButtonText: 'Cancelar',
                          background: '#0f172a',
                          color: '#ffffff',
                        });
                        if (res.isConfirmed) {
                          limpiarRecoleccionMutation.mutate({
                            rutaId: formEditar.id,
                            controlRutaId: viajeActivo?.id,
                          });
                          setModalEditarRecoleccion(false);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Limpiar datos y marcar como NO RECOGIDA (0 Lts) en el ticket"
                    >
                      <i className="fa-solid fa-eraser"></i>
                      Limpiar Recolección (0 L)
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalEditarRecoleccion(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editarRecoleccionMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-extrabold text-white transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)' }}
                >
                  {editarRecoleccionMutation.isPending ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i>
                      Guardar Ajuste
                    </>
                  )}
                </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL 5: ENVIAR A RECEPTORÍA (1:1 V2_3_11_26 modalEnviarReceptoria)       */}
      {/* ========================================================================= */}
      {modalEnviarReceptoria && viajeActivo && (() => {
        const fincasT = fincasTicketsMap[viajeActivo.id] || [];
        const totalLts = ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosRecogidos || 0) > 0 ? ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosRecogidos) : fincasT.reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
        const cantFincas = fincasT.length > 0 ? fincasT.length : ((viajeActivo as any).cantidadParadas || 0);

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', padding: '16px' }}>
            <div className="content-card" style={{ width: '100%', maxWidth: '480px', borderRadius: '16px', overflow: 'hidden', padding: 0, border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
              {/* Header con gradiente ámbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    <i className="fa-solid fa-truck-fast"></i>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Enviar Viaje a Receptoría</h2>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>Despachar camión con las fincas recolectadas</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalEnviarReceptoria(false)}
                  style={{ background: 'none', border: 'none', fontSize: '24px', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}
                >
                  &times;
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviarReceptoriaMutation.mutate(viajeActivo.id);
                }}
              >
                <div style={{ padding: '20px', background: '#ffffff' }}>
                  {/* Tarjeta oscura de resumen */}
                  <div style={{ background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: '#94a3b8' }}>Ticket:</span>
                      <strong style={{ color: '#60a5fa' }}>#{viajeActivo.codigoTicket || viajeActivo.id} ({viajeActivo.choferNombre || viajeActivo.nombreConductor})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: '#94a3b8' }}>Total Litros en Tanque:</span>
                      <strong style={{ color: '#34d399', fontSize: '16px', fontWeight: 800 }}>{totalLts.toLocaleString()} Lts</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94a3b8' }}>Fincas Recolectadas:</span>
                      <strong style={{ color: '#cbd5e1' }}>{cantFincas}</strong>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block', fontWeight: 600 }}>
                      Nota de Despacho (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formReceptoria.observacion}
                      onChange={(e) => setFormReceptoria({ ...formReceptoria, observacion: e.target.value })}
                      className="form-input"
                      placeholder="Ej: Camión precintado, temperatura 4°C..."
                      style={{ height: '40px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <button type="button" onClick={() => setModalEnviarReceptoria(false)} className="btn btn-outline" style={{ height: '40px', padding: '0 18px', fontWeight: 700 }}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={enviarReceptoriaMutation.isPending}
                    className="btn btn-warning"
                    style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', border: 'none', fontWeight: 700, padding: '0 20px', height: '40px', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(217,119,6,0.25)' }}
                  >
                    <i className="fa-solid fa-paper-plane"></i> {enviarReceptoriaMutation.isPending ? 'Enviando...' : 'Confirmar y Enviar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 6: DESPACHAR A COMPAÑÍA / PLANTA (1:1 V2_3_11_26 modalEntregaDirecta) */}
      {/* ========================================================================= */}
      {modalEnviarCompania && viajeActivo && (() => {
        const fincasT = fincasTicketsMap[viajeActivo.id] || [];
        const totalCamion = ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosRecogidos || 0) > 0 ? ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosRecogidos) : fincasT.reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
        const yaAsignado = (viajeActivo as any)._litrosEntregados || viajeActivo.totalLitrosEntregados || 0;
        const faltante = Math.max(0, totalCamion - yaAsignado);
        const sumaFilas = filasEntregaDirecta.reduce((acc, f) => acc + (Number(f.litros) || 0), 0);
        const diferencia = (faltante > 0 ? faltante : totalCamion) - sumaFilas;

        const unificarLitros = () => {
          setFilasEntregaDirecta([
            {
              companiaId: filasEntregaDirecta[0]?.companiaId || (companias[0]?.id || 0),
              litros: faltante > 0 ? faltante : totalCamion,
              tipoLeche: 'VACA',
            },
          ]);
        };

        const agregarFila = () => {
          setFilasEntregaDirecta([
            ...filasEntregaDirecta,
            { companiaId: companias[0]?.id || 0, litros: '', tipoLeche: 'VACA' },
          ]);
        };

        const removerFila = (index: number) => {
          if (filasEntregaDirecta.length > 1) {
            setFilasEntregaDirecta(filasEntregaDirecta.filter((_, i) => i !== index));
          }
        };

        const actualizarFila = (index: number, campo: keyof FilaEntregaDirecta, valor: any) => {
          const nuevas = [...filasEntregaDirecta];
          nuevas[index] = { ...nuevas[index], [campo]: valor };
          setFilasEntregaDirecta(nuevas);
        };

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', padding: '16px' }}>
            <div className="content-card" style={{ maxWidth: '740px', width: '95%', background: '#ffffff', color: '#0f172a', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', padding: 0 }}>
              {/* Header gradiente verde esmeralda */}
              <div style={{ background: 'linear-gradient(135deg, #065f46, #059669, #10b981)', color: '#ffffff', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.2)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                    <i className="fa-solid fa-building-circle-check"></i>
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
                      Entrega Directa a Compañías / Receptoría
                    </h2>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#d1fae5', fontWeight: 500 }}>
                      Despacho directo o distribuido a una o varias queseras y receptoría
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalEnviarCompania(false)}
                  style={{ color: '#ffffff', background: 'rgba(255,255,255,0.15)', border: 'none', width: '32px', height: '32px', borderRadius: '8px', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  &times;
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (filasEntregaDirecta.length === 0) {
                    toast.error('Agregue al menos un destino');
                    return;
                  }
                  for (let i = 0; i < filasEntregaDirecta.length; i++) {
                    const fila = filasEntregaDirecta[i];
                    if (!fila.companiaId || Number(fila.companiaId) <= 0) {
                      toast.error(`Seleccione la compañía en el renglón #${i + 1}`);
                      return;
                    }
                    if (!fila.litros || Number(fila.litros) <= 0) {
                      toast.error(`Ingrese litros válidos en el renglón #${i + 1}`);
                      return;
                    }
                  }
                  enviarCompaniaMutation.mutate(viajeActivo.id);
                }}
              >
                <div style={{ padding: '22px', background: '#f8fafc' }}>
                  {/* Subtexto del ticket */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                    <span style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>
                      <i className="fa-solid fa-ticket" style={{ color: '#059669', marginRight: '6px' }}></i>
                      Ticket #{viajeActivo.codigoTicket || viajeActivo.id} — Conductor: {viajeActivo.choferNombre || viajeActivo.nombreConductor} ({viajeActivo.camionPlaca || 'Cisterna'})
                    </span>
                  </div>

                  {/* 3 Tarjetas de Métricas del Ticket */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', borderBottomWidth: '3px', borderRadius: '10px', padding: '10px 12px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>
                        Total en Camión
                      </span>
                      <strong style={{ display: 'block', fontSize: '18px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                        {totalCamion.toLocaleString()} Lts
                      </strong>
                    </div>

                    <div style={{ background: '#fdf4ff', border: '1.5px solid #f0abfc', borderBottomWidth: '3px', borderRadius: '10px', padding: '10px 12px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#86198f', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>
                        Ya Asignado
                      </span>
                      <strong style={{ display: 'block', fontSize: '18px', fontWeight: 800, color: '#9333ea', marginTop: '2px' }}>
                        {yaAsignado.toLocaleString()} Lts
                      </strong>
                    </div>

                    <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderBottomWidth: '3px', borderRadius: '10px', padding: '10px 12px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>
                        Falta Asignar
                      </span>
                      <strong style={{ display: 'block', fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                        {faltante.toLocaleString()} Lts
                      </strong>
                    </div>
                  </div>

                  {/* SECCIÓN MULTI-COMPAÑÍAS */}
                  <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fa-solid fa-building" style={{ color: '#059669' }}></i> Destinos y Litros a Entregar
                      </label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={unificarLitros}
                          style={{ fontSize: '12px', padding: '6px 14px', border: '1.5px solid #c084fc', color: '#6b21a8', background: '#faf5ff', fontWeight: 700, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s ease' }}
                          title="Unificar todos los litros en un solo destino"
                        >
                          <i className="fa-solid fa-arrows-to-circle" style={{ color: '#9333ea' }}></i> Unificar Litros
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={agregarFila}
                          style={{ fontSize: '12px', padding: '6px 14px', border: '1.5px solid #a7f3d0', color: '#065f46', background: '#ecfdf5', fontWeight: 700, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s ease' }}
                        >
                          <i className="fa-solid fa-plus-circle" style={{ color: '#059669' }}></i> + Añadir Destino / Compañía
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 140px 130px 38px', gap: '10px', padding: '0 12px 6px 12px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                      <span>Destino / Quesera / Receptoría</span>
                      <span>Tipo de Leche</span>
                      <span style={{ textAlign: 'right', paddingRight: '14px' }}>Litros</span>
                      <span></span>
                    </div>

                    {/* Filas dinámicas */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {filasEntregaDirecta.map((fila, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.8fr 140px 130px 38px', gap: '10px', alignItems: 'flex-end' }}>
                          <div>
                            {fila.origenServicio && (
                              <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {fila.origenServicio === 'TRANSPORTE' && (
                                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#7e22ce', background: '#faf5ff', border: '1px solid #d8b4fe', padding: '1px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <i className="fa-solid fa-truck"></i> SERVICIO TRANSPORTE {fila.origenFincasCount ? `(${fila.origenFincasCount} finca${fila.origenFincasCount > 1 ? 's' : ''})` : ''}
                                  </span>
                                )}
                                {fila.origenServicio === 'ACIDA' && (
                                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <i className="fa-solid fa-flask"></i> LECHE ÁCIDA SEPARADA
                                  </span>
                                )}
                                {fila.origenServicio === 'RUTA' && (
                                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <i className="fa-solid fa-road"></i> SERVICIO RUTA {fila.origenFincasCount ? `(${fila.origenFincasCount} finca${fila.origenFincasCount > 1 ? 's' : ''})` : ''}
                                  </span>
                                )}
                              </div>
                            )}
                            <CompaniaSelect
                              value={fila.companiaId}
                              onChange={(val) => actualizarFila(idx, 'companiaId', val)}
                              placeholder="-- Seleccionar Compañía --"
                            />
                          </div>
                          <div>
                            <select
                              value={fila.tipoLeche}
                              onChange={(e) => actualizarFila(idx, 'tipoLeche', e.target.value)}
                              className="form-input"
                              style={{ height: '40px', fontSize: '12.5px', fontWeight: 700 }}
                            >
                              <option value="VACA">🥛 Vaca</option>
                              {hasBufala && <option value="BUFALA">🐃 Búfala</option>}
                              <option value="ACIDA">🍋 Ácida</option>
                              {hasBufala && <option value="BUFALA_ACIDA">🍋🐃 Búfala Ácida</option>}
                            </select>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="number"
                              value={fila.litros}
                              onChange={(e) => actualizarFila(idx, 'litros', e.target.value === '' ? '' : Number(e.target.value))}
                              className="form-input"
                              placeholder="0"
                              min="1"
                              step="1"
                              required
                              style={{ height: '40px', fontSize: '14px', fontWeight: 800, textAlign: 'right', paddingRight: '36px', color: '#059669' }}
                            />
                            <span style={{ position: 'absolute', right: '10px', top: '10px', fontSize: '12px', fontWeight: 700, color: '#64748b', pointerEvents: 'none' }}>
                              Lts
                            </span>
                          </div>
                          <div>
                            {filasEntregaDirecta.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removerFila(idx)}
                                style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                title="Eliminar este destino"
                              >
                                <i className="fa-solid fa-trash-can"></i>
                              </button>
                            ) : (
                              <div style={{ width: '36px', height: '36px' }}></div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Balance Volumétrico Live */}
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      marginBottom: '16px',
                      textAlign: 'center',
                      background: diferencia === 0 ? '#f0fdf4' : diferencia > 0 ? '#eff6ff' : '#fef2f2',
                      border: `1.5px solid ${diferencia === 0 ? '#86efac' : diferencia > 0 ? '#93c5fd' : '#fca5a5'}`,
                    }}
                  >
                    <div style={{ fontSize: '16px', fontWeight: 800, color: diferencia === 0 ? '#15803d' : diferencia > 0 ? '#1d4ed8' : '#b91c1c' }}>
                      {diferencia === 0
                        ? '✅ Total Distribuido con Precisión Exacta'
                        : diferencia > 0
                        ? `ℹ️ Faltan ${diferencia.toLocaleString()} Lts por asignar del tanque`
                        : `⚠️ Exceso de ${Math.abs(diferencia).toLocaleString()} Lts sobre el volumen disponible`}
                    </div>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b' }}>
                      Suma actual a despachar: {sumaFilas.toLocaleString()} Lts de {faltante > 0 ? faltante.toLocaleString() : totalCamion.toLocaleString()} Lts disponibles
                    </span>
                  </div>

                  {/* Observaciones */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '5px', display: 'block' }}>
                      <i className="fa-solid fa-comment-dots" style={{ color: '#64748b', marginRight: '4px' }}></i>
                      Observación / Ticket de Pesaje Planta (Opcional)
                    </label>
                    <input
                      type="text"
                      value={obsEntregaDirecta}
                      onChange={(e) => setObsEntregaDirecta(e.target.value)}
                      className="form-input"
                      placeholder="Ej: Ticket #5829, recibido por Ing. Romero..."
                      style={{ height: '42px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', background: '#ffffff', color: '#0f172a', width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 22px', background: '#ffffff', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 16px 16px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setModalEnviarCompania(false)}
                    style={{ height: '40px', padding: '0 18px', borderRadius: '8px', fontWeight: 600, borderColor: '#cbd5e1', color: '#475569' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={enviarCompaniaMutation.isPending}
                    className="btn btn-success"
                    style={{ background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none', fontWeight: 700, padding: '0 22px', height: '40px', borderRadius: '8px', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', cursor: 'pointer' }}
                  >
                    <i className="fa-solid fa-check-circle"></i> {enviarCompaniaMutation.isPending ? 'Registrando...' : 'Registrar Entrega'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 7: TRASPASO DE LECHE A OTRO CHOFER (1:1 V2_3_11_26 modalTraspasoLeche) */}
      {/* ========================================================================= */}
      {modalTraspaso && viajeActivo && (() => {
        const fincasT = fincasTicketsMap[viajeActivo.id] || [];
        const totalCamion = ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosRecogidos || 0) > 0 ? ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosRecogidos) : fincasT.reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
        const yaAsignado = (viajeActivo as any)._litrosEntregados || viajeActivo.totalLitrosEntregados || 0;
        const ltsDisponibles = Math.max(0, totalCamion - yaAsignado);
        const ticketsDestino = viajes.filter((v) => v.id !== viajeActivo.id && v.estado !== 'FINALIZADO');

        const previewDestinoNombre = (() => {
          if (modoTraspaso === 'EXISTENTE') {
            const dest = ticketsDestino.find((t) => t.id === Number(formTraspaso.ticketDestinoId));
            return dest ? `Ticket #${dest.codigoTicket || dest.id} - ${dest.choferNombre || dest.nombreConductor}` : 'Seleccionar Ticket Destino';
          } else {
            const ch = conductores.find((c: any) => c.id === Number(traspasoChoferDestinoId));
            return ch ? (ch.nombreCompleto || ch.nombre) : 'Seleccionar Conductor';
          }
        })();

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', padding: '16px' }}>
            <div className="content-card" style={{ maxWidth: '540px', width: '95%', borderRadius: '16px', border: '1.5px solid #0d948840', boxShadow: '0 20px 45px rgba(13, 148, 136, 0.2)', overflow: 'hidden', padding: 0, background: '#ffffff' }}>
              {/* Header gradiente teal */}
              <div style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)', borderBottom: '1px solid #99f6e4', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: '#0d9488', color: '#ffffff', width: '42px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', boxShadow: '0 4px 10px rgba(13, 148, 136, 0.3)' }}>
                    <i className="fa-solid fa-right-left"></i>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#115e59', margin: 0 }}>Traspaso de Leche a Otro Chofer</h2>
                    <p style={{ fontSize: '12px', color: '#0f766e', margin: '2px 0 0 0' }}>Transferir carga recolectada a otro conductor / viaje</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalTraspaso(false)}
                  style={{ color: '#0f766e', fontSize: '24px', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                >
                  &times;
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (modoTraspaso === 'EXISTENTE') {
                    if (!formTraspaso.ticketDestinoId || Number(formTraspaso.ticketDestinoId) <= 0) {
                      toast.error('Seleccione un viaje / cisterna destino');
                      return;
                    }
                  } else {
                    if (!traspasoChoferDestinoId || Number(traspasoChoferDestinoId) <= 0) {
                      toast.error('Seleccione el conductor de destino');
                      return;
                    }
                  }
                  if (!formTraspaso.litrosTraspaso || Number(formTraspaso.litrosTraspaso) <= 0) {
                    toast.error('Ingrese litros válidos a transferir');
                    return;
                  }
                  traspasoMutation.mutate(viajeActivo.id);
                }}
              >
                <div style={{ padding: '20px', background: '#ffffff' }}>
                  {/* RESUMEN DEL TICKET ORIGEN */}
                  <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Ticket Origen:</span>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                        #{viajeActivo.codigoTicket || viajeActivo.id} - {viajeActivo.choferNombre || viajeActivo.nombreConductor}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Volumen Disponible:</span>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#0d9488', marginTop: '2px' }}>
                        {(ltsDisponibles > 0 ? ltsDisponibles : totalCamion).toLocaleString()} Lts
                      </div>
                    </div>
                  </div>

                  {/* SELECTOR DE MODO: EXISTENTE VS NUEVO */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      <i className="fa-solid fa-layer-group" style={{ color: '#0d9488', marginRight: '4px' }}></i> Modo de Asignación del Ticket Destino:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setModoTraspaso('EXISTENTE')}
                        className="btn"
                        style={{
                          height: '36px',
                          fontSize: '12px',
                          fontWeight: 800,
                          borderRadius: '8px',
                          background: modoTraspaso === 'EXISTENTE' ? '#0d9488' : 'transparent',
                          color: modoTraspaso === 'EXISTENTE' ? '#ffffff' : '#475569',
                          border: 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        <i className="fa-solid fa-ticket"></i> Ticket Ya Creado
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoTraspaso('NUEVO')}
                        className="btn"
                        style={{
                          height: '36px',
                          fontSize: '12px',
                          fontWeight: 800,
                          borderRadius: '8px',
                          background: modoTraspaso === 'NUEVO' ? '#0d9488' : 'transparent',
                          color: modoTraspaso === 'NUEVO' ? '#ffffff' : '#475569',
                          border: 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        <i className="fa-solid fa-plus-circle"></i> Crear Ticket Automático
                      </button>
                    </div>
                  </div>

                  {/* SECCIÓN MODO 1: TICKET YA CREADO */}
                  {modoTraspaso === 'EXISTENTE' ? (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                        <i className="fa-solid fa-ticket-simple" style={{ color: '#0d9488' }}></i> Seleccionar Ticket de Destino *
                      </label>
                      <select
                        value={formTraspaso.ticketDestinoId}
                        onChange={(e) => setFormTraspaso({ ...formTraspaso, ticketDestinoId: Number(e.target.value) })}
                        className="form-input"
                        style={{ height: '42px', fontSize: '13px', fontWeight: 700, color: '#0f172a', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
                        required
                      >
                        <option value="0">-- Seleccione Cisterna / Viaje Destino --</option>
                        {ticketsDestino.map((t) => (
                          <option key={t.id} value={t.id}>
                            Ticket #{t.codigoTicket || t.id} — {t.choferNombre || t.nombreConductor} ({t.camionPlaca || 'Cisterna'})
                          </option>
                        ))}
                      </select>
                      <small style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                        Selecciona el viaje abierto del chofer receptor que recibirá los litros.
                      </small>
                    </div>
                  ) : (
                    /* SECCIÓN MODO 2: CREAR NUEVO TICKET AUTOMÁTICAMENTE */
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                            <i className="fa-solid fa-user-check" style={{ color: '#0d9488' }}></i> Chofer de Destino *
                          </label>
                          <ChoferSelect
                            value={traspasoChoferDestinoId}
                            onChange={(val) => setTraspasoChoferDestinoId(val)}
                            placeholder="-- Seleccionar Conductor --"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                            <i className="fa-solid fa-calendar-day" style={{ color: '#0d9488' }}></i> Fecha del Ticket
                          </label>
                          <input
                            type="date"
                            value={traspasoFechaDestino}
                            onChange={(e) => setTraspasoFechaDestino(e.target.value)}
                            className="form-input"
                            style={{ height: '42px', fontSize: '13px', fontWeight: 700, borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
                          />
                        </div>
                      </div>
                      <small style={{ fontSize: '11px', color: '#0d9488', fontWeight: 600, marginTop: '6px', display: 'block' }}>
                        ✨ Se creará automáticamente un nuevo ticket en estado ABIERTO para el chofer seleccionado.
                      </small>
                    </div>
                  )}

                  {/* VOLUMEN A TRASPASAR */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', margin: 0 }}>
                        <i className="fa-solid fa-faucet-drip" style={{ color: '#0d9488' }}></i> Litros a Traspasar *
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormTraspaso({ ...formTraspaso, litrosTraspaso: ltsDisponibles > 0 ? ltsDisponibles : totalCamion })}
                        style={{ fontSize: '11px', fontWeight: 800, color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4', padding: '2px 8px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        Traspasar Todo el Tanque
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        value={formTraspaso.litrosTraspaso}
                        onChange={(e) => setFormTraspaso({ ...formTraspaso, litrosTraspaso: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="form-input"
                        min="1"
                        step="1"
                        required
                        style={{ height: '44px', fontSize: '17px', fontWeight: 800, color: '#0d9488', background: '#f0fdfa', border: '2px solid #5eead4', paddingRight: '48px' }}
                      />
                      <span style={{ position: 'absolute', right: '14px', top: '12px', fontSize: '13px', fontWeight: 800, color: '#0d9488', pointerEvents: 'none' }}>
                        Lts
                      </span>
                    </div>
                  </div>

                  {/* OBSERVACIÓN */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                      <i className="fa-solid fa-comment-dots" style={{ color: '#64748b' }}></i> Nota / Motivo del Traspaso (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formTraspaso.observacion}
                      onChange={(e) => setFormTraspaso({ ...formTraspaso, observacion: e.target.value })}
                      className="form-input"
                      placeholder="Ej: Traspaso de leche para completar viaje de despacho..."
                      style={{ height: '40px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
                    />
                  </div>

                  {/* DIAGRAMA VISUAL DE TRAZABILIDAD DEL TRASPASO */}
                  <div style={{ background: '#f0fdfa', border: '1.5px dashed #5eead4', borderRadius: '12px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', marginBottom: '6px' }}>
                      <i className="fa-solid fa-route"></i> Flujo del Traspaso Logístico:
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
                      <div style={{ flex: 1, background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccfbf1', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '10.5px', color: '#64748b' }}>ORIGEN</span>
                        <strong style={{ color: '#0f172a', fontSize: '12px' }}>
                          {viajeActivo.choferNombre || viajeActivo.nombreConductor}
                        </strong>
                      </div>
                      <div style={{ color: '#0d9488', fontSize: '16px', fontWeight: 900 }}>
                        <i className="fa-solid fa-arrow-right-long"></i>
                      </div>
                      <div style={{ flex: 1, background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccfbf1', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '10.5px', color: '#64748b' }}>DESTINO</span>
                        <strong style={{ color: '#0d9488', fontSize: '12px' }}>
                          {previewDestinoNombre}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 16px 16px' }}>
                  <button type="button" onClick={() => setModalTraspaso(false)} className="btn btn-outline" style={{ height: '40px', padding: '0 18px', fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={traspasoMutation.isPending}
                    className="btn btn-primary"
                    style={{ background: 'linear-gradient(135deg, #0d9488, #059669)', border: 'none', fontWeight: 800, padding: '0 22px', height: '42px', color: '#fff', borderRadius: '8px', boxShadow: '0 4px 14px rgba(13,148,136,0.3)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <i className="fa-solid fa-right-left"></i> {traspasoMutation.isPending ? 'Traspasando...' : 'Confirmar Traspaso'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 8: FINALIZAR Y CERRAR VIAJE                                         */}
      {/* ========================================================================= */}
      {modalCerrarViaje && viajeActivo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div className="content-card" style={{ width: '100%', maxWidth: '440px', padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 16px 0', color: '#0f172a' }}>
              <i className="fa-solid fa-lock" style={{ color: '#059669', marginRight: '8px' }}></i>
              Finalizar y Cerrar Ticket #{viajeActivo.codigoTicket || viajeActivo.id}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                cerrarViajeMutation.mutate(viajeActivo.id);
              }}
            >
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label">Odómetro Final (Km)</label>
                <input
                  type="number"
                  value={formCerrar.odometroFinalKm}
                  onChange={(e) => setFormCerrar({ ...formCerrar, odometroFinalKm: e.target.value })}
                  className="form-input"
                  placeholder="Ej: 145320"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Observaciones Finales</label>
                <input
                  type="text"
                  value={formCerrar.observaciones}
                  onChange={(e) => setFormCerrar({ ...formCerrar, observaciones: e.target.value })}
                  className="form-input"
                  placeholder="Conclusiones del viaje..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setModalCerrarViaje(false)} className="btn btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={cerrarViajeMutation.isPending} className="btn btn-primary" style={{ fontWeight: 800, background: '#059669' }}>
                  {cerrarViajeMutation.isPending ? 'Cerrando...' : 'Confirmar Cierre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MODIFICAR FINCAS DE LA RUTA EN CALIENTE (REGLA DE BLINDAJE)        */}
      {/* ========================================================================= */}
      {modalModificarFincasTicket && ticketParaModificarFincas && (() => {
        const paradasActuales = fincasTicketsMap[ticketParaModificarFincas.id] || [];

        const fincasFiltradasModal = fincas.filter((f) => {
          if (!busquedaFincaModalTicket.trim()) return true;
          const q = busquedaFincaModalTicket.toLowerCase();
          return (
            (f.nombre && f.nombre.toLowerCase().includes(q)) ||
            (f.codigo && f.codigo.toLowerCase().includes(q)) ||
            (f.propietarioNombre && f.propietarioNombre.toLowerCase().includes(q))
          );
        });

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(5px)',
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '620px',
                background: '#ffffff',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 25px 60px -15px rgba(0,0,0,0.35)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh',
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: '18px 22px',
                  background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        background: 'rgba(56, 189, 248, 0.2)',
                        color: '#38bdf8',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                      }}
                    >
                      Ticket #{ticketParaModificarFincas.codigoTicket || ticketParaModificarFincas.id}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {ticketParaModificarFincas.camionPlaca} • {ticketParaModificarFincas.choferNombre || ticketParaModificarFincas.nombreConductor}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '4px 0 0 0', color: '#ffffff' }}>
                    Modificar Fincas de la Ruta (En Caliente)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalModificarFincasTicket(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '22px', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>

              {/* Banner Informativo de Blindaje */}
              <div
                style={{
                  padding: '12px 20px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '12px',
                }}
              >
                <i className="fa-solid fa-shield-halved text-emerald-600 text-lg"></i>
                <div style={{ color: '#334155' }}>
                  <strong>Regla de Blindaje activa:</strong> Fincas vacías (0 L) se pueden agregar o remover libremente. Fincas con leche ya cargada (&gt; 0 L) están protegidas y no se pueden retirar.
                </div>
              </div>

              {/* Buscador */}
              <div style={{ padding: '14px 20px 8px 20px' }}>
                <div style={{ position: 'relative' }}>
                  <i
                    className="fa-solid fa-magnifying-glass"
                    style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8', fontSize: '13px' }}
                  ></i>
                  <input
                    type="text"
                    value={busquedaFincaModalTicket}
                    onChange={(e) => setBusquedaFincaModalTicket(e.target.value)}
                    placeholder="Buscar finca por nombre, código o productor..."
                    className="form-input"
                    style={{ paddingLeft: '34px', height: '38px', borderRadius: '10px', fontSize: '13px', width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11.5px', color: '#64748b' }}>
                  <span>
                    Seleccionadas: <strong style={{ color: '#0f172a' }}>{fincasSeleccionadasTicket.length}</strong> fincas
                  </span>
                  <span>
                    Blindadas: <strong style={{ color: '#059669' }}>{fincasBloqueadasTicket.length}</strong> con leche
                  </span>
                </div>
              </div>

              {/* Lista de Fincas para Selección */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px', maxHeight: '45vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {fincasFiltradasModal.map((f) => {
                    const estaBloqueada = fincasBloqueadasTicket.includes(f.id);
                    const estaSeleccionada = fincasSeleccionadasTicket.includes(f.id);

                    const toggleFinca = () => {
                      if (estaBloqueada) {
                        toast.warning(`La finca "${f.nombre}" ya tiene leche cargada en el camión y no puede ser removida.`);
                        return;
                      }
                      setFincasSeleccionadasTicket((prev) =>
                        estaSeleccionada ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                      );
                    };

                    return (
                      <div
                        key={f.id}
                        onClick={toggleFinca}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          border: estaBloqueada
                            ? '1.5px solid #a7f3d0'
                            : estaSeleccionada
                            ? '1.5px solid #93c5fd'
                            : '1px solid #e2e8f0',
                          background: estaBloqueada
                            ? '#f0fdf4'
                            : estaSeleccionada
                            ? '#eff6ff'
                            : '#ffffff',
                          cursor: estaBloqueada ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            checked={estaSeleccionada}
                            disabled={estaBloqueada}
                            onChange={() => {}}
                            style={{ width: '16px', height: '16px', cursor: estaBloqueada ? 'not-allowed' : 'pointer' }}
                          />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                              {f.nombre} {f.codigo ? `(${f.codigo})` : ''}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {f.propietarioNombre || 'Sin productor asignado'}
                            </div>
                          </div>
                        </div>

                        <div>
                          {estaBloqueada ? (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #86efac',
                                fontSize: '10.5px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <i className="fa-solid fa-lock"></i> Blindada (&gt;0 L)
                            </span>
                          ) : estaSeleccionada ? (
                            <span
                              style={{
                                background: '#dbeafe',
                                color: '#1d4ed8',
                                fontSize: '10.5px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                              }}
                            >
                              ✓ En Ruta
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '14px 20px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setModalModificarFincasTicket(false)}
                  className="btn btn-outline"
                  style={{ borderRadius: '10px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 700 }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={modificarFincasTicketMutation.isPending}
                  onClick={() => {
                    modificarFincasTicketMutation.mutate({
                      ticketId: ticketParaModificarFincas.id,
                      fincaIds: fincasSeleccionadasTicket,
                    });
                  }}
                  className="btn btn-primary"
                  style={{
                    borderRadius: '10px',
                    padding: '8px 20px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {modificarFincasTicketMutation.isPending ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Guardando...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i> Aplicar Cambios a la Ruta
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL VISUALIZADOR DE RECIBO DE FINCA */}
      {fotoReciboModal && (
        <div
          onClick={() => setFotoReciboModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(5px)',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: '#ffffff',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                background: '#0f172a',
                color: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800 }}>
                <i className="fa-solid fa-receipt" style={{ color: '#38bdf8' }}></i>
                <span>Comprobante / Recibo de Finca</span>
              </div>
              <button
                type="button"
                onClick={() => setFotoReciboModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div style={{ padding: '12px', background: '#020617', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'auto', maxHeight: 'calc(90vh - 60px)' }}>
              <img
                src={fotoReciboModal}
                alt="Comprobante de finca"
                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
