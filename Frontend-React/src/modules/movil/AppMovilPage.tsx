import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { AUTH_TOKEN_KEY } from '@/api/client';
import { authApi } from '@/api/auth.api';
import { catalogosApi } from '@/api/catalogos.api';
import { operacionesApi } from '@/api/operaciones.api';
import { sistemaApi } from '@/api/sistema.api';
import { mantenimientoApi } from '@/api/mantenimiento.api';
import { combustibleApi } from '@/api/combustible.api';
import { notificacionesApi, type NotificacionMovil } from '@/api/notificaciones.api';
import { useAuthStore } from '@/stores/authStore';
import type {
  FincaDto,
  DespachoCompaniaDto,
  ControlRutaDto,
  CamionDto,
  MantenimientoCamionDto,
  PlanificacionRutaChoferDto,
  RutaLogisticaDto,
  ChoferDto,
  FincaPromedioDto,
  GuardarPlanificacionRutaChoferDto,
  CompaniaDto,
  CombustibleHistorialDto,
} from '@/types';

interface DispositivoMovilData {
  token: string;
  empresaCodigo: string;
  empresaNombre: string;
  id: number;
  username: string;
  nombreCompleto: string;
  rol: string;
  camionId?: number;
  placaCamion?: string;
  capacidadTanqueLitros: number;
  permisos: string[];
  modulosHabilitados: string[];
}

interface CargaOffline {
  localId: string;
  fecha: string;
  hora: string;
  fincaId: number;
  fincaNombre: string;
  litros: number;
  tipoLeche: string;
  esAcida: boolean;
  esDiferido: boolean;
  temperatura?: number;
  observacion?: string;
  fotoRecibo?: string;
  synced: boolean;
  syncedAt?: string;
  serverTicketId?: number;
}

type TabMovil =
  | 'principal'
  | 'recoleccion'
  | 'entregas'
  | 'incidentes'
  | 'combustible'
  | 'reportes'
  | 'perfil'
  | 'admin_envivo'
  | 'admin_logistica'
  | 'taller_flota'
  | 'taller_mantenimiento'
  | 'receptoria_entrada'
  | 'receptoria_salidas'
  | 'receptoria_reporte';

export type ModoMovil = 'CHOFER' | 'ADMIN' | 'TALLER' | 'RECEPTORIA';

const REPORTES_CHOFER = [
  { value: 'DIARIOS', label: '1. DIARIOS (Recolección Diaria)', icon: 'fa-calendar-days' },
  { value: 'RECEPTORIAS', label: '2. RECEPTORÍAS (Entregas y Mermas)', icon: 'fa-warehouse' },
  { value: 'FINCAS', label: '3. FINCAS (Detalle por Productor)', icon: 'fa-cow' },
  { value: 'CHOFERES', label: '4. CHOFERES (Resumen Operativo)', icon: 'fa-user-tie' },
  { value: 'RELACION_CHOFER', label: '7. RELACIÓN CHOFER (Liquidación de Viajes)', icon: 'fa-truck-arrow-right' },
  { value: 'MANTENIMIENTO', label: '8. MANTENIMIENTO & TALLER (Flota e Incidentes)', icon: 'fa-wrench' },
];

export const APP_VERSION = 'v2.10.0';

export const AppMovilPage: React.FC = () => {
  // Navegación de Pestañas Móviles
  const [tabActiva, setTabActiva] = useState<TabMovil>('principal');

  // Estado de Red (Online / Offline)
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Tenant / Base de Datos Guardada en este Dispositivo
  const [tenantDomain, setTenantDomain] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('movil_tenant_domain');
      if (saved) return saved;
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (host.includes('campoverde')) return 'lacteos-campoverde.vercel.app';
      if (host.includes('vergel')) return 'transporte-vergel-carrillo.vercel.app';
      return host || 'transporte-vergel-carrillo.vercel.app';
    } catch {
      return 'transporte-vergel-carrillo.vercel.app';
    }
  });

  const [empresaGuardada, setEmpresaGuardada] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('movil_tenant_empresa');
      if (saved) return saved;
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (host.includes('campoverde')) return 'Lácteos Campo Verde';
      if (host.includes('vergel')) return 'Transporte Vergel & Carrillo';
      return '';
    } catch {
      return '';
    }
  });

  // Modo de Login (cuando !dispositivo): 'credenciales' (Usuario y Contraseña) o 'codigo' (6 dígitos)
  const [modoLogin, setModoLogin] = useState<'credenciales' | 'codigo'>('credenciales');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [iniciandoLogin, setIniciandoLogin] = useState(false);

  // Notificaciones Push y Alertas
  const [notificaciones, setNotificaciones] = useState<NotificacionMovil[]>([]);
  const [modalNotificaciones, setModalNotificaciones] = useState(false);
  const ultimasIdsNotificadas = useRef<Set<number>>(new Set());

  // Estado del Dispositivo Vinculado
  const [dispositivo, setDispositivo] = useState<DispositivoMovilData | null>(() => {
    try {
      const saved = localStorage.getItem('movil_device_info');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Fincas en Caché Local
  const [fincas, setFincas] = useState<FincaDto[]>(() => {
    try {
      const saved = localStorage.getItem('movil_fincas_cache');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Cargas Locales del Día (Outbox)
  const [cargas, setCargas] = useState<CargaOffline[]>(() => {
    try {
      const saved = localStorage.getItem('movil_cargas_local');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Despachos / Entregas Asignadas
  const [entregas, setEntregas] = useState<DespachoCompaniaDto[]>([]);
  const [cargandoEntregas, setCargandoEntregas] = useState(false);

  // Viaje / Ticket Activo Asignado al Chofer (creado por Supervisor/Admin o por el chofer)
  const [viajeActivo, setViajeActivo] = useState<ControlRutaDto | null>(() => {
    try {
      const saved = localStorage.getItem('movil_viaje_activo');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [paradasViajeActivo, setParadasViajeActivo] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('movil_paradas_activo');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [cargandoViaje, setCargandoViaje] = useState(false);

  // Despacho Activo a Planta / Receptoría (TB_CONTROL_COMPANIAS, ej. #20566 hacia COLONA)
  const [despachoActivo, setDespachoActivo] = useState<DespachoCompaniaDto | null>(() => {
    try {
      const saved = localStorage.getItem('movil_despacho_activo');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [cargandoDespacho, setCargandoDespacho] = useState(false);

  // Persistir despacho activo en LocalStorage
  useEffect(() => {
    if (despachoActivo) {
      localStorage.setItem('movil_despacho_activo', JSON.stringify(despachoActivo));
    } else {
      localStorage.removeItem('movil_despacho_activo');
    }
  }, [despachoActivo]);

  // Lista de Choferes disponibles para supervisión / simulación y logística
  const [choferesLista, setChoferesLista] = useState<ChoferDto[]>([]);

  // Chofer seleccionado para supervisar/auditar (cuando el usuario es Administrador/SuperAdmin)
  const [choferSimuladoId, setChoferSimuladoId] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('movil_chofer_simulado_id');
      return saved ? Number(saved) : 13; // 13 = Julio Atencio
    } catch {
      return 13;
    }
  });

  // Persistir viaje activo y paradas en LocalStorage
  useEffect(() => {
    if (viajeActivo) {
      localStorage.setItem('movil_viaje_activo', JSON.stringify(viajeActivo));
    } else {
      localStorage.removeItem('movil_viaje_activo');
    }
  }, [viajeActivo]);

  useEffect(() => {
    if (paradasViajeActivo && paradasViajeActivo.length > 0) {
      localStorage.setItem('movil_paradas_activo', JSON.stringify(paradasViajeActivo));
    } else {
      localStorage.removeItem('movil_paradas_activo');
    }
  }, [paradasViajeActivo]);

  // Usuario autenticado en la plataforma web global
  const authUser = useAuthStore((s) => s.user);
  const authToken = useAuthStore((s) => s.token);
  const authEmpresa = authUser?.empresaNombre;

  // Auto-vincular terminal si el usuario ya está autenticado en la sesión web
  useEffect(() => {
    if (!dispositivo && authUser && authToken) {
      const disp: DispositivoMovilData = {
        token: authToken,
        empresaCodigo: 'EMPRESA',
        empresaNombre: authEmpresa || empresaGuardada || 'Transporte de Leche',
        id: authUser.id,
        username: authUser.username,
        nombreCompleto: authUser.nombreCompleto || authUser.username,
        rol: (authUser.rol || 'SUPERADMIN').toUpperCase(),
        permisos: authUser.permisos || [],
        modulosHabilitados: [],
        capacidadTanqueLitros: 6000,
      };
      setDispositivo(disp);
      localStorage.setItem('movil_device_info', JSON.stringify(disp));
    }
  }, [dispositivo, authUser, authToken, authEmpresa]);

  // Fecha de hoy por defecto
  const hoyStr = new Date().toISOString().split('T')[0];

  // Detección Estricta de Rol y Modo Adaptativo (CHOFER | ADMIN | TALLER | RECEPTORIA)
  // El rol del dispositivo vinculado manda de forma prioritaria; si no existe dispositivo, se usa el de authUser.
  const rolEfectivo = (dispositivo ? dispositivo.rol : authUser?.rol || '').trim().toUpperCase();
  const esAdminReal =
    rolEfectivo === 'SUPERADMIN' ||
    rolEfectivo === 'ADMINISTRADOR' ||
    rolEfectivo === 'ADMIN' ||
    rolEfectivo === 'SUPERVISOR' ||
    rolEfectivo.includes('ADMIN');
  const esTallerReal = !esAdminReal && (rolEfectivo === 'TALLER' || rolEfectivo.includes('MECANICO'));
  const esReceptoriaReal = !esAdminReal && (rolEfectivo === 'RECEPTORIA' || rolEfectivo === 'RECEPTOR' || rolEfectivo.includes('RECEPT'));
  const esChoferReal = !esAdminReal && !esTallerReal && !esReceptoriaReal;

  const [modoActivo, setModoActivo] = useState<ModoMovil>(() => {
    if (esAdminReal) {
      try {
        const saved = localStorage.getItem('movil_modo_activo') as ModoMovil;
        if (saved && ['CHOFER', 'ADMIN', 'TALLER', 'RECEPTORIA'].includes(saved)) return saved;
      } catch {}
      return 'ADMIN';
    }
    if (esTallerReal) return 'TALLER';
    if (esReceptoriaReal) return 'RECEPTORIA';
    return 'CHOFER';
  });

  // Asegurar que si el rol activo no es admin, jamás quede atrapado en vistas administrativas
  useEffect(() => {
    if (!esAdminReal) {
      localStorage.removeItem('movil_modo_activo');
      if (esTallerReal) {
        setModoActivo('TALLER');
        setTabActiva('taller_flota');
      } else if (esReceptoriaReal) {
        setModoActivo('RECEPTORIA');
        setTabActiva('receptoria_entrada');
      } else {
        setModoActivo('CHOFER');
        setTabActiva('principal');
      }
    }
  }, [rolEfectivo, esAdminReal, esTallerReal, esReceptoriaReal]);

  const cambiarModo = (nuevoModo: ModoMovil) => {
    if (!esAdminReal && nuevoModo !== 'CHOFER' && nuevoModo !== (esTallerReal ? 'TALLER' : esReceptoriaReal ? 'RECEPTORIA' : 'CHOFER')) {
      return;
    }
    setModoActivo(nuevoModo);
    localStorage.setItem('movil_modo_activo', nuevoModo);
    if (nuevoModo === 'ADMIN') setTabActiva('admin_envivo');
    else if (nuevoModo === 'TALLER') setTabActiva('taller_flota');
    else if (nuevoModo === 'RECEPTORIA') setTabActiva('receptoria_entrada');
    else setTabActiva('principal');
  };

  // Chofer efectivo: si es Admin, usa el chofer seleccionado para auditar/supervisar; si no, usa el propio dispositivo
  const choferEfectivoId = esAdminReal ? (choferSimuladoId || 13) : (dispositivo?.id || 13);
  const choferEfectivoNombre = useMemo(() => {
    if (!esAdminReal && dispositivo?.nombreCompleto) return dispositivo.nombreCompleto;
    const encontrado = choferesLista.find((c) => c.id === choferSimuladoId || (c as any).usuarioId === choferSimuladoId);
    return encontrado?.nombreCompleto || 'Julio Atencio';
  }, [esAdminReal, choferSimuladoId, choferesLista, dispositivo]);

  // Estados para Módulo Chofer -> Incidentes
  const [misIncidentes, setMisIncidentes] = useState<MantenimientoCamionDto[]>([]);
  const [cargandoIncidentes, setCargandoIncidentes] = useState(false);
  const [formIncidente, setFormIncidente] = useState({
    titulo: '',
    descripcion: '',
    urgencia: 'MEDIA',
    odometroKm: '',
  });

  // Estados para Módulo Taller
  const [camionesTaller, setCamionesTaller] = useState<CamionDto[]>([]);
  const [cargandoCamionesTaller, setCargandoCamionesTaller] = useState(false);
  const [incidentesTaller, setIncidentesTaller] = useState<MantenimientoCamionDto[]>([]);
  const [cargandoIncidentesTaller, setCargandoIncidentesTaller] = useState(false);

  // Estados para Módulo Administrador
  const [viajesEnVivo, setViajesEnVivo] = useState<ControlRutaDto[]>([]);
  const [cargandoViajesEnVivo, setCargandoViajesEnVivo] = useState(false);

  // Estados para Módulo Administrador - Logística Móvil
  const [fechaLogistica, setFechaLogistica] = useState(hoyStr);
  const [subTabLogistica, setSubTabLogistica] = useState<'asignaciones' | 'circuitos'>('asignaciones');
  const [planificaciones, setPlanificaciones] = useState<PlanificacionRutaChoferDto[]>([]);
  const [cargandoPlanificaciones, setCargandoPlanificaciones] = useState(false);
  const [rutasLogisticas, setRutasLogisticas] = useState<RutaLogisticaDto[]>([]);
  const [camionesLista, setCamionesLista] = useState<CamionDto[]>([]);
  const [fincasPromedio, setFincasPromedio] = useState<FincaPromedioDto[]>([]);

  // Modales de Logística Móvil
  const [modalPlanificar, setModalPlanificar] = useState<{
    open: boolean;
    esEdicion: boolean;
    id?: number;
    camionId: number;
    conductorId: number;
    rutaLogisticaId?: number;
    fincasIds: number[];
    observacion: string;
  } | null>(null);
  const [busquedaFincaPlanificar, setBusquedaFincaPlanificar] = useState('');

  const [modalAgregarFincaRapida, setModalAgregarFincaRapida] = useState<{
    open: boolean;
    plan: PlanificacionRutaChoferDto;
    fincaId: number;
  } | null>(null);

  const [modalCircuito, setModalCircuito] = useState<{
    open: boolean;
    esEdicion: boolean;
    id?: number;
    nombre: string;
    codigo: string;
    color: string;
    descripcion: string;
  } | null>(null);

  const [modalAsignarFincasCircuito, setModalAsignarFincasCircuito] = useState<{
    open: boolean;
    rutaId: number;
    rutaNombre: string;
    fincasIds: number[];
  } | null>(null);
  const [busquedaFincasCircuito, setBusquedaFincasCircuito] = useState('');

  // Estados UI auxiliares para Taller y Admin
  const [busquedaFlota, setBusquedaFlota] = useState('');
  const [filtroIncidenteTaller, setFiltroIncidenteTaller] = useState<string>('TODOS');
  const [modalReparacion, setModalReparacion] = useState<{ open: boolean; incidenteId: number; titulo: string } | null>(null);
  const [formReparacion, setFormReparacion] = useState({ solucion: '', costo: '' });

  // ===================================================================
  // Estados para Módulo Chofer -> Combustible
  // ===================================================================
  const [formCombustible, setFormCombustible] = useState({
    litros: '' as number | string,
    origen: 'BOMBA' as 'BOMBA' | 'MATERA',
    odometroKm: '' as number | string,
    fotoComprobante: '',
    observaciones: '',
    tipoCombustible: 'GASOIL',
  });
  const [guardandoCombustible, setGuardandoCombustible] = useState(false);
  const [historialCombustible, setHistorialCombustible] = useState<CombustibleHistorialDto[]>([]);
  const [cargandoCombustible, setCargandoCombustible] = useState(false);

  // ===================================================================
  // Estados para Módulo Receptoría Móvil
  // ===================================================================
  const [ticketsReceptoria, setTicketsReceptoria] = useState<ControlRutaDto[]>([]);
  const [despachosSalidaReceptoria, setDespachosSalidaReceptoria] = useState<DespachoCompaniaDto[]>([]);
  const [cargandoReceptoria, setCargandoReceptoria] = useState(false);
  const [fechaReceptoria, setFechaReceptoria] = useState(hoyStr);
  const [companiasReceptoria, setCompaniasReceptoria] = useState<CompaniaDto[]>([]);
  const [busquedaReceptoria, setBusquedaReceptoria] = useState('');

  // Modales de Receptoría
  const [modalVerificarLitros, setModalVerificarLitros] = useState<{
    open: boolean;
    ticket: ControlRutaDto | null;
    litrosRecibidos: number | string;
    observacion: string;
  } | null>(null);

  const [modalDevolverTicket, setModalDevolverTicket] = useState<{
    open: boolean;
    ticketId: number;
    motivo: string;
  } | null>(null);

  const [modalNuevoDespachoSalida, setModalNuevoDespachoSalida] = useState<{
    open: boolean;
    fecha: string;
    camionId: number;
    conductorId: number;
    litrosDespachados: number | string;
    companiaId: number;
    tipoLeche: string;
    numeroGuiaSADA: string;
    observacion: string;
  } | null>(null);

  // Estado para la pantalla de Vinculación
  const [codigoInput, setCodigoInput] = useState('');
  const [vinculando, setVinculando] = useState(false);

  // Estado para el modal de Registro de Carga
  const [modalRegistro, setModalRegistro] = useState(false);
  const [formCarga, setFormCarga] = useState({
    fecha: hoyStr,
    fincaId: 0,
    litros: '',
    tipoLeche: 'VACA',
    esAcida: false,
    esDiferido: false,
    temperatura: '',
    observacion: '',
    fotoRecibo: '',
  });
  const [busquedaFinca, setBusquedaFinca] = useState('');
  const [fotoReciboVerModal, setFotoReciboVerModal] = useState<string | null>(null);
  const inputFotoReciboRef = useRef<HTMLInputElement | null>(null);

  const comprimirImagenMovil = (file: File): Promise<string> => {
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

  const handleSubirFotoReciboMovil = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await comprimirImagenMovil(file);
      setFormCarga((prev) => ({ ...prev, fotoRecibo: base64 }));
      toast.success('Foto del comprobante/recibo adjuntada');
    } catch (err) {
      toast.error('No se pudo procesar la foto');
    }
    e.target.value = '';
  };

  // Estado de Sincronización
  const [sincronizando, setSincronizando] = useState(false);

  // Estado de Instalación PWA (Descarga en el Teléfono)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [esInstalada, setEsInstalada] = useState<boolean>(() => {
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  });
  const [mostrarGuiaIos, setMostrarGuiaIos] = useState(false);

  // Estado de Reportes Móvil
  const [tipoReporte, setTipoReporte] = useState<string>('DIARIOS');
  const [repFechaInicio, setRepFechaInicio] = useState<string>(hoyStr);
  const [repFechaFin, setRepFechaFin] = useState<string>(hoyStr);
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [datosReporte, setDatosReporte] = useState<any>(null);

  // Estado de Perfil
  const [perfilForm, setPerfilForm] = useState({
    nombreCompleto: dispositivo?.nombreCompleto || '',
    telefono: '',
    telefonoPagoMovil: '',
    cedula: '',
    passwordActual: '',
    nuevoPassword: '',
    confirmarPassword: '',
  });
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  // Detectar cambios de conectividad
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('🟢 Conexión a Internet restablecida');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('🟠 Modo Sin Conexión (Offline). Puedes seguir registrando cargas normalmente.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Persistir configuración de tenant de empresa en LocalStorage
  useEffect(() => {
    if (tenantDomain) {
      localStorage.setItem('movil_tenant_domain', tenantDomain);
    }
    if (empresaGuardada) {
      localStorage.setItem('movil_tenant_empresa', empresaGuardada);
    }
  }, [tenantDomain, empresaGuardada]);

  // Consultar notificaciones en tiempo real cada 12s cuando está autenticado y online
  useEffect(() => {
    if (!dispositivo || !isOnline) return;

    // Solicitar permiso de notificaciones push nativas si el navegador lo permite
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch {}
    }

    const pollingNotificaciones = async () => {
      try {
        const data = await notificacionesApi.getMisNotificaciones(30);
        if (Array.isArray(data)) {
          // Detectar nuevas notificaciones no leídas para emitir vibración / aviso toast
          const nuevas = data.filter(
            (n) => !n.leido && !ultimasIdsNotificadas.current.has(n.id)
          );

          if (nuevas.length > 0) {
            nuevas.forEach((n) => ultimasIdsNotificadas.current.add(n.id));

            // Vibración háptica en móvil
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([200, 100, 200]);
              } catch {}
            }

            // Alerta Sonner en pantalla
            const nReciente = nuevas[0];
            toast.info(`🔔 ${nReciente.titulo}`, {
              description: nReciente.mensaje,
              duration: 7000,
              action: {
                label: 'Ver Alerta',
                onClick: () => setModalNotificaciones(true),
              },
            });

            // Notificación nativa PWA si está permitido
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(nReciente.titulo, {
                  body: nReciente.mensaje,
                  icon: '/favicon.ico',
                });
              } catch {}
            }
          }

          setNotificaciones(data);
        }
      } catch (err) {
        console.warn('Error al consultar notificaciones móvil:', err);
      }
    };

    pollingNotificaciones();
    const interval = setInterval(pollingNotificaciones, 12000);
    return () => clearInterval(interval);
  }, [dispositivo, isOnline]);

  // Guardar cargas en LocalStorage cada vez que cambian
  useEffect(() => {
    localStorage.setItem('movil_cargas_local', JSON.stringify(cargas));
  }, [cargas]);

  // Auto-sincronización automática cuando se recupera o detecta conexión a internet
  useEffect(() => {
    if (isOnline && dispositivo) {
      const pendientes = cargas.filter((c) => !c.synced);
      if (pendientes.length > 0 && !sincronizando) {
        toast.info(`📶 Señal disponible: enviando automáticamente ${pendientes.length} carga(s) a la central...`);
        sincronizarCargas(cargas);
      }
    }
  }, [isOnline]);

  // Cargar catálogo de choferes para selector de administración si está online
  useEffect(() => {
    if (isOnline) {
      catalogosApi.getChoferes().then((ch) => {
        if (Array.isArray(ch) && ch.length > 0) setChoferesLista(ch);
      }).catch(() => {});
    }
  }, [isOnline]);

  // Si estamos en línea y hay conexión, refrescar fincas, entregas, perfil, viaje activo y despacho activo
  useEffect(() => {
    if (isOnline) {
      cargarFincasServidor();
      cargarEntregasChofer();
      cargarPerfilServidor();
      cargarViajeActivo();
      cargarDespachoActivo();
    }
  }, [choferEfectivoId, isOnline]);

  const cargarFincasServidor = async () => {
    try {
      const list = await catalogosApi.getFincas();
      if (Array.isArray(list) && list.length > 0) {
        setFincas(list);
        localStorage.setItem('movil_fincas_cache', JSON.stringify(list));
      }
    } catch {
      console.warn('Usando catálogo local de fincas offline.');
    }
  };

  const cargarViajeActivo = async (idTarget?: number) => {
    const idBusqueda = idTarget || choferEfectivoId;
    if (!idBusqueda) return;
    setCargandoViaje(true);
    try {
      // 1. Obtener viaje activo asignado al chofer en TB_CONTROL_RUTAS
      const v = await operacionesApi.getViajeActivo(idBusqueda);
      const est = String(v?.estado || '').trim().toUpperCase();
      const esCerrado = est === 'FINALIZADO' || est === 'CERRADO' || est === 'ENTREGADO' || est === 'CUADRADO' || (v?.procesoActualId || 1) >= 4;

      if (v && v.id && !esCerrado) {
        setViajeActivo(v);
        // Si el ticket trae cisterna o placa específica, actualizar localmente
        if (v.camionId || v.camionPlaca) {
          setDispositivo((prev) => {
            if (!prev) return null;
            if (
              prev.camionId === v.camionId &&
              prev.placaCamion === (v.camionPlaca || prev.placaCamion) &&
              prev.capacidadTanqueLitros === (v.capacidadCamionLitros || prev.capacidadTanqueLitros)
            ) {
              return prev;
            }
            const updated = {
              ...prev,
              camionId: v.camionId || prev.camionId,
              placaCamion: v.camionPlaca || prev.placaCamion,
              capacidadTanqueLitros: v.capacidadCamionLitros || prev.capacidadTanqueLitros || 6000,
            };
            localStorage.setItem('movil_device_info', JSON.stringify(updated));
            return updated;
          });
        }
        // 2. Cargar paradas ya registradas en este ticket en el servidor
        const paradas = await operacionesApi.getFincasViaje(v.id);
        setParadasViajeActivo(Array.isArray(paradas) ? paradas : []);
      } else {
        setViajeActivo(null);
        setParadasViajeActivo([]);
      }
    } catch (err) {
      console.warn('No se pudo sincronizar el viaje activo con el servidor:', err);
    } finally {
      setCargandoViaje(false);
    }
  };

  const cargarDespachoActivo = async (idTarget?: number) => {
    const idBusqueda = idTarget || choferEfectivoId;
    if (!idBusqueda) return;
    setCargandoDespacho(true);
    try {
      // 1. Consultar ticket activo de despacho en TB_CONTROL_COMPANIAS
      let t = await operacionesApi.getTicketActivoDespachoChofer(idBusqueda);
      if (!t || !t.id) {
        // Fallback: buscar en la lista general de despachos por usuario o nombre
        const all = await operacionesApi.getDespachosCompanias(undefined, undefined, undefined, undefined, idBusqueda);
        const enVia = (all || []).find((d: any) => {
          const uId = Number(d.usuarioId || d.choferId || d.conductorId);
          const est = String(d.estado || '').toUpperCase();
          const nombreD = (d.nombreConductor || d.choferNombre || '').toLowerCase();
          const nombreTarget = (choferEfectivoNombre || dispositivo?.nombreCompleto || '').toLowerCase();
          return (uId === idBusqueda || (nombreTarget && nombreD.length > 2 && nombreD.includes(nombreTarget))) &&
            (est === 'EN VIA' || est === 'EN_TRANSITO' || est === 'PENDIENTE');
        });
        if (enVia) t = enVia;
      }
      setDespachoActivo(t && t.id ? t : null);
    } catch (err) {
      console.warn('No se pudo sincronizar el despacho activo con el servidor:', err);
    } finally {
      setCargandoDespacho(false);
    }
  };

  const cargarEntregasChofer = async (idTarget?: number) => {
    const idBusqueda = idTarget || choferEfectivoId;
    if (!idBusqueda) return;
    setCargandoEntregas(true);
    try {
      const allDespachos = await operacionesApi.getDespachosCompanias(undefined, undefined, undefined, undefined, idBusqueda);
      const misDespachos = (allDespachos || []).filter((d: any) => {
        const uId = Number(d.usuarioId || d.choferId || d.conductorId);
        const nombreD = (d.nombreConductor || d.choferNombre || '').toLowerCase();
        const nombreTarget = (choferEfectivoNombre || dispositivo?.nombreCompleto || '').toLowerCase();
        const coincideId = uId === idBusqueda;
        const coincideNombre = nombreTarget && nombreD.length > 2 && nombreD.includes(nombreTarget);
        const coincideCamion = Boolean(dispositivo?.camionId && d.camionId === dispositivo.camionId);
        return coincideId || coincideNombre || coincideCamion;
      });
      setEntregas(misDespachos);
    } catch (err) {
      console.warn('No se pudieron obtener entregas del servidor:', err);
    } finally {
      setCargandoEntregas(false);
    }
  };

  const cargarPerfilServidor = async () => {
    try {
      const p = await authApi.getPerfil();
      if (p) {
        setPerfilForm((prev) => ({
          ...prev,
          nombreCompleto: p.nombreCompleto || prev.nombreCompleto,
          telefono: p.telefono || '',
          telefonoPagoMovil: p.telefonoPagoMovil || '',
          cedula: p.cedula || '',
        }));
      }
    } catch {}
  };

  // Funciones Módulo Chofer: Incidentes / Averías
  const cargarMisIncidentesChofer = async () => {
    if (!dispositivo?.camionId && !dispositivo?.id) return;
    setCargandoIncidentes(true);
    try {
      const list = await mantenimientoApi.getIncidentes(dispositivo.camionId || undefined);
      setMisIncidentes(Array.isArray(list) ? list : []);
    } catch {
      console.warn('No se pudieron cargar incidentes del chofer.');
    } finally {
      setCargandoIncidentes(false);
    }
  };

  const handleEnviarIncidenteChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispositivo?.camionId) {
      toast.error('No tienes un camión asignado para reportar la avería.');
      return;
    }
    if (!formIncidente.titulo.trim()) {
      toast.error('Por favor indica qué se debe reparar.');
      return;
    }

    try {
      const res = await mantenimientoApi.reportarIncidente({
        camionId: dispositivo.camionId,
        titulo: formIncidente.titulo.trim(),
        descripcion: formIncidente.descripcion.trim(),
        urgencia: formIncidente.urgencia,
        odometroKm: formIncidente.odometroKm ? Number(formIncidente.odometroKm) : undefined,
      });
      toast.success(res.message || 'Avería enviada al Taller correctamente.');
      setFormIncidente({ titulo: '', descripcion: '', urgencia: 'MEDIA', odometroKm: '' });
      cargarMisIncidentesChofer();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al enviar reporte al taller.');
    }
  };

  // Funciones Módulo Taller
  const cargarDatosTaller = async () => {
    setCargandoCamionesTaller(true);
    setCargandoIncidentesTaller(true);
    try {
      const [cams, incs] = await Promise.all([
        catalogosApi.getCamiones(false),
        mantenimientoApi.getIncidentes(),
      ]);
      setCamionesTaller(Array.isArray(cams) ? cams : []);
      setIncidentesTaller(Array.isArray(incs) ? incs : []);
    } catch {
      console.warn('Error al cargar datos del taller.');
    } finally {
      setCargandoCamionesTaller(false);
      setCargandoIncidentesTaller(false);
    }
  };

  const handleCambiarEstadoCamionTaller = async (camionId: number, nuevoEstado: string) => {
    try {
      await catalogosApi.actualizarEstadoCamion(camionId, nuevoEstado);
      toast.success(`Camión actualizado a estado: ${nuevoEstado}`);
      cargarDatosTaller();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al cambiar estado del camión.');
    }
  };

  const handleAtenderIncidenteTaller = async (incidenteId: number, nuevoEstado: string, solucion?: string, costo?: number) => {
    try {
      const res = await mantenimientoApi.actualizarEstadoIncidente(incidenteId, {
        estado: nuevoEstado,
        solucionAplicada: solucion,
        costoTotalUSD: costo,
      });
      toast.success(res.message || 'Estado de incidente actualizado');
      cargarDatosTaller();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al actualizar incidente.');
    }
  };

  // Funciones Módulo Administrador Móvil
  const cargarDatosAdminEnVivo = async () => {
    setCargandoViajesEnVivo(true);
    try {
      const viajes = await operacionesApi.getControles(hoyStr);
      setViajesEnVivo(Array.isArray(viajes) ? viajes : []);
    } catch {
      console.warn('Error al cargar viajes en vivo para admin.');
    } finally {
      setCargandoViajesEnVivo(false);
    }
  };

  // Carga de datos para Logística Móvil
  const cargarDatosLogisticaAdmin = async (fechaParam?: string) => {
    const f = fechaParam || fechaLogistica || hoyStr;
    setCargandoPlanificaciones(true);
    try {
      const [plans, rutas, chofs, cams, proms] = await Promise.all([
        operacionesApi.getPlanificacionesChoferes(f),
        operacionesApi.getRutasLogistica(),
        catalogosApi.getChoferes(),
        catalogosApi.getCamiones(false),
        operacionesApi.getFincasPromedios15Dias(),
      ]);
      setPlanificaciones(Array.isArray(plans) ? plans : []);
      setRutasLogisticas(Array.isArray(rutas) ? rutas : []);
      setChoferesLista(Array.isArray(chofs) ? chofs : []);
      setCamionesLista(Array.isArray(cams) ? cams : []);
      setFincasPromedio(Array.isArray(proms) ? proms : []);
    } catch (err) {
      console.warn('Error al cargar datos de logística móvil:', err);
    } finally {
      setCargandoPlanificaciones(false);
    }
  };

  const cambiarFechaLogistica = (deltaDias: number) => {
    const d = new Date(fechaLogistica + 'T00:00:00');
    d.setDate(d.getDate() + deltaDias);
    const nueva = d.toISOString().split('T')[0];
    setFechaLogistica(nueva);
    cargarDatosLogisticaAdmin(nueva);
  };

  const getFincasIdsDePlan = (plan: PlanificacionRutaChoferDto): number[] => {
    if (Array.isArray(plan.listaFincasIds) && plan.listaFincasIds.length > 0) {
      return plan.listaFincasIds.map(Number);
    }
    if (typeof plan.fincasIds === 'string' && plan.fincasIds.trim()) {
      return plan.fincasIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n > 0);
    }
    return [];
  };

  const handleGuardarPlanificacionMovil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalPlanificar) return;
    if (!modalPlanificar.camionId) {
      toast.error('Selecciona una cisterna / camión');
      return;
    }
    if (!modalPlanificar.conductorId) {
      toast.error('Selecciona un conductor');
      return;
    }
    if (modalPlanificar.fincasIds.length === 0) {
      toast.error('Selecciona al menos una finca para la ruta');
      return;
    }

    const litrosEst = modalPlanificar.fincasIds.reduce((sum, fid) => {
      const p = fincasPromedio.find((fp) => fp.fincaId === fid);
      return sum + (p?.promedioLitros || 0);
    }, 0);

    try {
      const dto: GuardarPlanificacionRutaChoferDto = {
        id: modalPlanificar.esEdicion ? modalPlanificar.id : undefined,
        fecha: fechaLogistica,
        camionId: modalPlanificar.camionId,
        conductorId: modalPlanificar.conductorId,
        rutaLogisticaId: modalPlanificar.rutaLogisticaId || undefined,
        fincasIds: modalPlanificar.fincasIds,
        litrosEstimados: Math.round(litrosEst),
        observacion: modalPlanificar.observacion.trim() || undefined,
      };

      const res = await operacionesApi.guardarPlanificacionChofer(dto);
      toast.success(res.message || 'Planificación guardada exitosamente');
      setModalPlanificar(null);
      cargarDatosLogisticaAdmin(fechaLogistica);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al guardar planificación');
    }
  };

  const handleEliminarPlanificacionMovil = async (planId: number) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta planificación de ruta?')) return;
    try {
      const res = await operacionesApi.eliminarPlanificacionChofer(planId);
      toast.success(res.message || 'Planificación eliminada');
      cargarDatosLogisticaAdmin(fechaLogistica);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al eliminar planificación');
    }
  };

  const handleAgregarFincaRapidaMovil = async (plan: PlanificacionRutaChoferDto, fincaIdNueva: number) => {
    if (!fincaIdNueva) return;
    const currentIds = getFincasIdsDePlan(plan);
    if (currentIds.includes(fincaIdNueva)) {
      toast.info('Esta finca ya está asignada a esta ruta');
      return;
    }
    const nuevosIds = [...currentIds, fincaIdNueva];
    const litrosEst = nuevosIds.reduce((sum, fid) => {
      const p = fincasPromedio.find((fp) => fp.fincaId === fid);
      return sum + (p?.promedioLitros || 0);
    }, 0);

    try {
      await operacionesApi.guardarPlanificacionChofer({
        id: plan.id,
        fecha: plan.fecha ? plan.fecha.split('T')[0] : fechaLogistica,
        camionId: plan.camionId,
        conductorId: plan.conductorId,
        rutaLogisticaId: plan.rutaLogisticaId || undefined,
        fincasIds: nuevosIds,
        litrosEstimados: Math.round(litrosEst),
        observacion: plan.observacion || undefined,
      });

      if (plan.controlRutaId) {
        try {
          await operacionesApi.agregarFincaViaje(plan.controlRutaId, {
            fincaId: fincaIdNueva,
            litrosLeche: 0,
          });
        } catch {}
      }

      toast.success('Finca añadida exitosamente a la ruta');
      setModalAgregarFincaRapida(null);
      cargarDatosLogisticaAdmin(fechaLogistica);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al agregar finca');
    }
  };

  const handleGuardarCircuitoMovil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalCircuito || !modalCircuito.nombre.trim()) {
      toast.error('El nombre del circuito es obligatorio');
      return;
    }
    try {
      if (modalCircuito.esEdicion && modalCircuito.id) {
        await operacionesApi.actualizarRutaLogistica(modalCircuito.id, {
          nombre: modalCircuito.nombre.trim(),
          descripcion: modalCircuito.descripcion.trim() || undefined,
        });
        toast.success('Circuito logístico actualizado');
      } else {
        await operacionesApi.crearRutaLogistica({
          nombre: modalCircuito.nombre.trim(),
          descripcion: modalCircuito.descripcion.trim() || undefined,
        });
        toast.success('Nuevo circuito logístico creado');
      }
      setModalCircuito(null);
      cargarDatosLogisticaAdmin(fechaLogistica);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al guardar circuito');
    }
  };

  const handleEliminarCircuitoMovil = async (circuitoId: number) => {
    if (!window.confirm('¿Seguro que deseas eliminar este circuito logístico?')) return;
    try {
      await operacionesApi.eliminarRutaLogistica(circuitoId);
      toast.success('Circuito eliminado');
      cargarDatosLogisticaAdmin(fechaLogistica);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al eliminar circuito');
    }
  };

  const handleGuardarFincasDeCircuitoMovil = async () => {
    if (!modalAsignarFincasCircuito) return;
    try {
      await operacionesApi.asignarFincasARuta(
        modalAsignarFincasCircuito.rutaId,
        modalAsignarFincasCircuito.fincasIds
      );
      toast.success('Fincas asignadas al circuito correctamente');
      setModalAsignarFincasCircuito(null);
      cargarDatosLogisticaAdmin(fechaLogistica);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al asignar fincas al circuito');
    }
  };

  // ===================================================================
  // Funciones Módulo Chofer: Combustible
  // ===================================================================
  const cargarHistorialCombustible = async () => {
    setCargandoCombustible(true);
    try {
      const camionIdParam = dispositivo?.camionId || undefined;
      const hist = await combustibleApi.getHistorial('GASOIL', camionIdParam, 20);
      setHistorialCombustible(Array.isArray(hist) ? hist : []);
    } catch {
      console.warn('No se pudo cargar historial de combustible.');
    } finally {
      setCargandoCombustible(false);
    }
  };

  const handleRegistrarCargaCombustible = async (e: React.FormEvent) => {
    e.preventDefault();
    const lts = Number(formCombustible.litros);
    if (!lts || lts <= 0) {
      toast.error('Ingresa una cantidad válida de litros');
      return;
    }
    const camionIdFinal =
      dispositivo?.camionId ||
      (camionesLista.length > 0 ? camionesLista[0].id : camionesTaller.length > 0 ? camionesTaller[0].id : 0);
    if (!camionIdFinal) {
      toast.error('No se detectó un camión asignado');
      return;
    }
    setGuardandoCombustible(true);
    try {
      const origenTexto = formCombustible.origen === 'MATERA' ? 'LA MATERA (Tanque Interno)' : 'BOMBA COMERCIAL';
      const obsFinal = `[ORIGEN: ${origenTexto}] ${
        formCombustible.observaciones ? '- ' + formCombustible.observaciones.trim() : ''
      }${formCombustible.fotoComprobante ? ' [COMPROBANTE ADJUNTO]' : ''}`;

      const res = await combustibleApi.registrarDespacho({
        camionId: camionIdFinal,
        tipoCombustible: formCombustible.tipoCombustible || 'GASOIL',
        litros: lts,
        odometroKm: formCombustible.odometroKm ? Number(formCombustible.odometroKm) : undefined,
        fecha: hoyStr,
        controlRutaId: viajeActivo?.id || undefined,
        observaciones: obsFinal,
      });

      toast.success(res.message || 'Carga de combustible registrada exitosamente');
      setFormCombustible({
        litros: '',
        origen: 'BOMBA',
        odometroKm: '',
        fotoComprobante: '',
        observaciones: '',
        tipoCombustible: 'GASOIL',
      });
      cargarHistorialCombustible();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al registrar carga de combustible');
    } finally {
      setGuardandoCombustible(false);
    }
  };

  // ===================================================================
  // Funciones Módulo Receptoría
  // ===================================================================
  const cargarDatosReceptoria = async (fechaParam?: string) => {
    const f = fechaParam || fechaReceptoria || hoyStr;
    setCargandoReceptoria(true);
    try {
      const [tickets, despachos, comps] = await Promise.all([
        operacionesApi.getControles(f),
        operacionesApi.getDespachosCompanias(f),
        catalogosApi.getCompanias(true),
      ]);
      setTicketsReceptoria(Array.isArray(tickets) ? tickets : []);
      setDespachosSalidaReceptoria(Array.isArray(despachos) ? despachos : []);
      setCompaniasReceptoria(Array.isArray(comps) ? comps : []);
    } catch {
      console.warn('Error al cargar datos de receptoría móvil');
    } finally {
      setCargandoReceptoria(false);
    }
  };

  const handleConfirmarVerificarLitros = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalVerificarLitros || !modalVerificarLitros.ticket) return;
    const lts = Number(modalVerificarLitros.litrosRecibidos);
    if (!lts || lts <= 0) {
      toast.error('Ingresa los litros recibidos en tanque/báscula');
      return;
    }
    try {
      const ticketId = modalVerificarLitros.ticket.id;
      const res = await operacionesApi.validarEntregaCompania(ticketId, {
        litrosConfirmados: lts,
        litrosRecibidosCompania: lts,
        observaciones: modalVerificarLitros.observacion.trim(),
      });
      toast.success(res.message || 'Litros verificados y conciliados en Receptoría.');
      setModalVerificarLitros(null);
      cargarDatosReceptoria(fechaReceptoria);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al verificar litros');
    }
  };

  const handleConfirmarDevolucionTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalDevolverTicket) return;
    try {
      const res = await operacionesApi.revertirProcesoViaje(modalDevolverTicket.ticketId, {
        nuevoProcesoId: 1,
        motivo: modalDevolverTicket.motivo.trim() || 'Devuelto desde receptoría para corregir fincas o litros.',
      });
      toast.success(res.message || 'Ticket devuelto al chofer');
      setModalDevolverTicket(null);
      cargarDatosReceptoria(fechaReceptoria);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al devolver ticket');
    }
  };

  const handleCrearTicketSalidaReceptoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalNuevoDespachoSalida) return;
    const lts = Number(modalNuevoDespachoSalida.litrosDespachados);
    if (!modalNuevoDespachoSalida.camionId || !modalNuevoDespachoSalida.companiaId || !lts || lts <= 0) {
      toast.error('Completa los campos obligatorios: Camión, Destino y Litros');
      return;
    }
    try {
      const res = await operacionesApi.crearDespachoCompania({
        fecha: modalNuevoDespachoSalida.fecha,
        camionId: modalNuevoDespachoSalida.camionId,
        usuarioId: modalNuevoDespachoSalida.conductorId || undefined,
        companiaId: modalNuevoDespachoSalida.companiaId,
        litrosDespachados: lts,
        tipoLeche: modalNuevoDespachoSalida.tipoLeche,
        numeroGuiaSADA: modalNuevoDespachoSalida.numeroGuiaSADA.trim(),
        observaciones: modalNuevoDespachoSalida.observacion.trim(),
      });
      toast.success(res.message || 'Ticket de salida a planta creado exitosamente');
      setModalNuevoDespachoSalida(null);
      cargarDatosReceptoria(fechaReceptoria);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al registrar salida de receptoría');
    }
  };

  // Carga reactiva de datos al cambiar de pestaña o modo
  useEffect(() => {
    if (tabActiva === 'incidentes') {
      cargarMisIncidentesChofer();
    } else if (tabActiva === 'combustible') {
      cargarHistorialCombustible();
    } else if (tabActiva === 'admin_envivo') {
      cargarDatosAdminEnVivo();
    } else if (tabActiva === 'admin_logistica') {
      cargarDatosLogisticaAdmin();
    } else if (tabActiva === 'taller_flota' || tabActiva === 'taller_mantenimiento') {
      cargarDatosTaller();
    } else if (
      tabActiva === 'receptoria_entrada' ||
      tabActiva === 'receptoria_salidas' ||
      tabActiva === 'receptoria_reporte' ||
      modoActivo === 'RECEPTORIA'
    ) {
      cargarDatosReceptoria(fechaReceptoria);
    }
  }, [tabActiva, modoActivo, fechaReceptoria]);

  // Capturar evento PWA install
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleInstalled = () => {
      setEsInstalada(true);
      setDeferredPrompt(null);
      toast.success('¡App instalada exitosamente en tu teléfono!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstalarApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setEsInstalada(true);
      }
      setDeferredPrompt(null);
    } else {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIos) {
        setMostrarGuiaIos(true);
      } else {
        toast.info('Para instalar en Android: pulsa los 3 puntos ⋮ en tu navegador y selecciona "Instalar aplicación" o "Agregar a la pantalla principal".');
      }
    }
  };

  // Acción: Vincular dispositivo con código de 6 dígitos
  const handleVincular = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codigoInput.replace(/\D/g, '').trim();
    if (clean.length < 6) {
      toast.error('El código debe contener al menos 6 dígitos numéricos');
      return;
    }

    setVinculando(true);
    try {
      const res = await authApi.vincularDispositivo({
        codigo: clean,
        deviceInfo: `${navigator.userAgent} (${navigator.platform})`,
      });

      localStorage.setItem(AUTH_TOKEN_KEY, res.token);
      localStorage.setItem('token', res.token);
      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          token: res.token,
          user: {
            id: res.id,
            username: res.username,
            nombreCompleto: res.nombreCompleto,
            rol: res.rol,
            permisos: res.permisos,
          }
        },
        version: 0
      }));

      // Determinar dominio y empresa automáticamente a partir del código de vinculación
      let nuevoDominio = 'transporte-vergel-carrillo.vercel.app';
      const codUpper = (res.empresaCodigo || '').toUpperCase();
      if (codUpper.includes('CAMPO')) {
        nuevoDominio = 'lacteos-campoverde.vercel.app';
      } else if (codUpper.includes('VERGEL')) {
        nuevoDominio = 'transporte-vergel-carrillo.vercel.app';
      } else if (tenantDomain) {
        nuevoDominio = tenantDomain;
      }

      const nuevoNombreEmpresa = res.empresaNombre || (codUpper.includes('CAMPO') ? 'Lácteos Campo Verde' : 'Transporte Vergel & Carrillo');

      setTenantDomain(nuevoDominio);
      setEmpresaGuardada(nuevoNombreEmpresa);
      localStorage.setItem('movil_tenant_domain', nuevoDominio);
      localStorage.setItem('movil_tenant_empresa', nuevoNombreEmpresa);

      const dispData: DispositivoMovilData = {
        token: res.token,
        empresaCodigo: res.empresaCodigo,
        empresaNombre: nuevoNombreEmpresa,
        id: res.id,
        username: res.username,
        nombreCompleto: res.nombreCompleto,
        rol: res.rol,
        camionId: res.camionId,
        placaCamion: res.placaCamion,
        capacidadTanqueLitros: res.capacidadTanqueLitros || 6000,
        permisos: res.permisos || [],
        modulosHabilitados: res.modulosHabilitados || [],
      };

      setDispositivo(dispData);
      localStorage.setItem('movil_device_info', JSON.stringify(dispData));

      // Sincronizar Zustand auth store
      useAuthStore.setState({
        token: res.token,
        user: {
          id: res.id,
          username: res.username,
          nombreCompleto: res.nombreCompleto,
          rol: res.rol,
          permisos: res.permisos || [],
        },
        isAuthenticated: true,
      });

      const rolRes = (res.rol || '').toUpperCase();
      const isAdminRes =
        rolRes === 'SUPERADMIN' ||
        rolRes === 'ADMINISTRADOR' ||
        rolRes === 'ADMIN' ||
        rolRes === 'SUPERVISOR' ||
        rolRes.includes('ADMIN');
      const isTallerRes = !isAdminRes && (rolRes === 'TALLER' || rolRes.includes('MECANICO'));
      const isRecepRes = !isAdminRes && (rolRes === 'RECEPTORIA' || rolRes === 'RECEPTOR' || rolRes.includes('RECEPT'));

      if (isAdminRes) {
        setModoActivo('ADMIN');
        setTabActiva('admin_envivo');
        localStorage.setItem('movil_modo_activo', 'ADMIN');
      } else if (isTallerRes) {
        setModoActivo('TALLER');
        setTabActiva('taller_flota');
        localStorage.removeItem('movil_modo_activo');
      } else if (isRecepRes) {
        setModoActivo('RECEPTORIA');
        setTabActiva('receptoria_entrada');
        localStorage.removeItem('movil_modo_activo');
      } else {
        setModoActivo('CHOFER');
        setTabActiva('principal');
        localStorage.removeItem('movil_modo_activo');
      }

      toast.success(`¡Dispositivo Vinculado a ${nuevoNombreEmpresa}! Bienvenido ${res.nombreCompleto}`);

      try {
        const fincasData = await catalogosApi.getFincas();
        if (Array.isArray(fincasData)) {
          setFincas(fincasData);
          localStorage.setItem('movil_fincas_cache', JSON.stringify(fincasData));
        }
      } catch {}
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Código inválido o expirado. Consulta con tu administrador.');
    } finally {
      setVinculando(false);
    }
  };

  // Acción: Iniciar sesión directa con Usuario y Contraseña (persistiendo base de datos del tenant)
  const handleLoginUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) {
      toast.error('Ingresa tu nombre de usuario y contraseña');
      return;
    }

    setIniciandoLogin(true);
    try {
      const res = await authApi.login({
        username: loginUsername.trim(),
        password: loginPassword,
      });

      localStorage.setItem(AUTH_TOKEN_KEY, res.token);
      localStorage.setItem('token', res.token);
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            token: res.token,
            user: {
              id: res.id,
              username: res.username,
              nombreCompleto: res.nombreCompleto,
              rol: res.rol,
              permisos: res.permisos,
            },
          },
          version: 0,
        })
      );

      const empNombre = res.empresaNombre || empresaGuardada;
      setEmpresaGuardada(empNombre);
      localStorage.setItem('movil_tenant_empresa', empNombre);

      // Buscar si el chofer tiene camión y capacidad asignada en el catálogo
      let camionId: number | undefined;
      let placaCamion: string | undefined;
      let capacidadTanqueLitros = 6000;

      try {
        const choferes = await catalogosApi.getChoferes();
        const ch = (choferes || []).find(
          (c) =>
            (c.username && res.username && c.username.toLowerCase() === res.username.toLowerCase()) ||
            (c.nombreCompleto &&
              res.nombreCompleto &&
              c.nombreCompleto.toLowerCase().trim() === res.nombreCompleto.toLowerCase().trim())
        );
        if (ch) {
          camionId = ch.camionId;
          placaCamion = ch.camionPlaca || ch.vehiculoPlaca;
          if (ch.capacidadLitros) capacidadTanqueLitros = ch.capacidadLitros;
        }
      } catch {}

      const dispData: DispositivoMovilData = {
        token: res.token,
        empresaCodigo: res.empresaCodigo || 'EMPRESA',
        empresaNombre: empNombre,
        id: res.id,
        username: res.username,
        nombreCompleto: res.nombreCompleto,
        rol: res.rol,
        camionId,
        placaCamion,
        capacidadTanqueLitros,
        permisos: res.permisos || [],
        modulosHabilitados: res.modulosHabilitados || [],
      };

      setDispositivo(dispData);
      localStorage.setItem('movil_device_info', JSON.stringify(dispData));

      // Sincronizar Zustand auth store
      useAuthStore.setState({
        token: res.token,
        user: {
          id: res.id,
          username: res.username,
          nombreCompleto: res.nombreCompleto,
          rol: res.rol,
          permisos: res.permisos || [],
        },
        isAuthenticated: true,
      });

      const rolRes = (res.rol || '').toUpperCase();
      const isAdminRes =
        rolRes === 'SUPERADMIN' ||
        rolRes === 'ADMINISTRADOR' ||
        rolRes === 'ADMIN' ||
        rolRes === 'SUPERVISOR' ||
        rolRes.includes('ADMIN');
      const isTallerRes = !isAdminRes && (rolRes === 'TALLER' || rolRes.includes('MECANICO'));
      const isRecepRes = !isAdminRes && (rolRes === 'RECEPTORIA' || rolRes === 'RECEPTOR' || rolRes.includes('RECEPT'));

      if (isAdminRes) {
        setModoActivo('ADMIN');
        setTabActiva('admin_envivo');
        localStorage.setItem('movil_modo_activo', 'ADMIN');
      } else if (isTallerRes) {
        setModoActivo('TALLER');
        setTabActiva('taller_flota');
        localStorage.removeItem('movil_modo_activo');
      } else if (isRecepRes) {
        setModoActivo('RECEPTORIA');
        setTabActiva('receptoria_entrada');
        localStorage.removeItem('movil_modo_activo');
      } else {
        setModoActivo('CHOFER');
        setTabActiva('principal');
        localStorage.removeItem('movil_modo_activo');
      }

      toast.success(`¡Bienvenido ${res.nombreCompleto}!`);

      // Descargar catálogo de fincas offline para este chofer
      try {
        const fincasData = await catalogosApi.getFincas();
        if (Array.isArray(fincasData) && fincasData.length > 0) {
          setFincas(fincasData);
          localStorage.setItem('movil_fincas_cache', JSON.stringify(fincasData));
        }
      } catch {}
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || 'Usuario o contraseña incorrectos. Verifica tus credenciales.'
      );
    } finally {
      setIniciandoLogin(false);
    }
  };

  // Acción: Cerrar Sesión
  const handleCerrarSesion = () => {
    if (window.confirm(`¿Deseas cerrar la sesión de ${dispositivo?.nombreCompleto || 'tu usuario'}?`)) {
      localStorage.removeItem('movil_device_info');
      localStorage.removeItem('movil_viaje_activo');
      localStorage.removeItem('movil_paradas_activo');
      localStorage.removeItem('movil_modo_activo');
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem('token');
      localStorage.removeItem('auth-storage');

      useAuthStore.setState({
        token: null,
        user: null,
        isAuthenticated: false,
        sessionExpiredMessage: null,
      });

      setDispositivo(null);
      setViajeActivo(null);
      setParadasViajeActivo([]);
      setLoginUsername('');
      setLoginPassword('');
      setModoActivo('CHOFER');
      setTabActiva('principal');
      toast.info('Sesión cerrada.');
    }
  };

  // Acción: Desvincular por completo y cambiar de base de datos / empresa
  const handleDesvincular = () => {
    if (
      window.confirm(
        '¿Seguro que deseas desvincular este dispositivo? Deberás ingresar el código de 6 dígitos de la empresa correspondiente para volver a conectarlo.'
      )
    ) {
      localStorage.removeItem('movil_device_info');
      localStorage.removeItem('movil_viaje_activo');
      localStorage.removeItem('movil_paradas_activo');
      localStorage.removeItem('movil_modo_activo');
      localStorage.removeItem('movil_tenant_domain');
      localStorage.removeItem('movil_tenant_empresa');
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem('token');
      localStorage.removeItem('auth-storage');

      useAuthStore.setState({
        token: null,
        user: null,
        isAuthenticated: false,
        sessionExpiredMessage: null,
      });

      setTenantDomain('');
      setEmpresaGuardada('');
      setDispositivo(null);
      setViajeActivo(null);
      setParadasViajeActivo([]);
      setModoLogin('codigo');
      setCodigoInput('');
      setModoActivo('CHOFER');
      setTabActiva('principal');
      toast.info('Dispositivo desvinculado. Ingresa el código de 6 dígitos de la nueva empresa.');
    }
  };

  // Acciones de Notificaciones
  const handleMarcarLeida = async (id: number) => {
    try {
      await notificacionesApi.marcarLeida(id);
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === id ? { ...n, leido: true } : n))
      );
    } catch {}
  };

  const handleMarcarTodasLeidas = async () => {
    try {
      await notificacionesApi.marcarTodasLeidas();
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));
      toast.success('Todas las notificaciones marcadas como leídas');
    } catch {}
  };

  // Forzar actualización y limpiar cachés del navegador / PWA
  const handleForzarRecarga = async () => {
    toast.info('Actualizando aplicación a la última versión...');
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
    } catch {}
    window.location.reload();
  };

  // Guardar cambios en el Perfil
  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (perfilForm.nuevoPassword && perfilForm.nuevoPassword !== perfilForm.confirmarPassword) {
      toast.error('Las contraseñas nuevas no coinciden');
      return;
    }

    setGuardandoPerfil(true);
    try {
      await authApi.updatePerfil({
        nombreCompleto: perfilForm.nombreCompleto,
        telefono: perfilForm.telefono,
        telefonoPagoMovil: perfilForm.telefonoPagoMovil,
        cedula: perfilForm.cedula,
        passwordActual: perfilForm.passwordActual || undefined,
        nuevoPassword: perfilForm.nuevoPassword || undefined,
      });
      toast.success('¡Perfil actualizado exitosamente!');
      setPerfilForm((prev) => ({
        ...prev,
        passwordActual: '',
        nuevoPassword: '',
        confirmarPassword: '',
      }));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al actualizar perfil');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  // Consultar Reporte
  const handleConsultarReporte = async () => {
    if (!isOnline) {
      toast.warning('Se requiere conexión a internet para consultar reportes.');
      return;
    }
    setCargandoReporte(true);
    setDatosReporte(null);
    try {
      let res: any = null;
      const choferNumId = dispositivo?.id;

      if (tipoReporte === 'DIARIOS') {
        const raw: any = await sistemaApi.getReporteDiarios(repFechaInicio, repFechaFin, choferNumId);
        const lista = raw?.diarioRutas || raw?.diarioTransporteRutas || (Array.isArray(raw) ? raw : []);
        const total = raw?.totalDiarioRutas ?? raw?.totalLitros ?? lista.reduce((a: number, b: any) => a + Number(b.litros || b.totalLitros || 0), 0);
        res = { items: lista, totalLitros: total, raw };
      } else if (tipoReporte === 'RECEPTORIAS') {
        const raw: any = await sistemaApi.getReporteReceptorias(repFechaInicio, repFechaFin);
        const lista = Array.isArray(raw) ? raw : (raw?.items || raw?.detalles || []);
        res = { items: lista, totalLitros: lista.reduce((a: number, b: any) => a + Number(b.litros || b.litrosRecibidos || 0), 0), raw };
      } else if (tipoReporte === 'FINCAS') {
        const raw: any = await sistemaApi.getReporteFincas(repFechaInicio, repFechaFin);
        const lista = Array.isArray(raw) ? raw : (raw?.fincas || raw?.items || []);
        res = { items: lista, totalLitros: lista.reduce((a: number, b: any) => a + Number(b.totalLitros || b.litros || 0), 0), raw };
      } else if (tipoReporte === 'CHOFERES') {
        const raw: any = await sistemaApi.getReporteChoferes(repFechaInicio, repFechaFin, choferNumId);
        const lista = Array.isArray(raw) ? raw : (raw?.detalles || raw?.items || []);
        const total = lista.reduce((a: number, b: any) => a + Number(b.totalLitrosFinca || b.litros || b.totalLitros || 0), 0);
        res = { items: lista, totalLitros: total, raw };
      } else if (tipoReporte === 'RELACION_CHOFER') {
        const raw: any = await sistemaApi.getReporteRelacionChoferes(repFechaInicio, repFechaFin);
        const allList = Array.isArray(raw) ? raw : [];
        const filtered = allList.filter((r: any) => 
          (choferNumId && Number(r.usuarioId || r.UsuarioId) === choferNumId) ||
          (dispositivo?.nombreCompleto && (r.chofer || '').toLowerCase().includes(dispositivo.nombreCompleto.toLowerCase())) ||
          (dispositivo?.username && (r.chofer || '').toLowerCase().includes(dispositivo.username.toLowerCase()))
        );
        const lista = filtered.length > 0 ? filtered : allList;
        const total = lista.reduce((a: number, b: any) => a + Number(b.litrosRuta || b.totalLitros || b.litros || 0), 0);
        res = { items: lista, totalLitros: total, raw };
      }
      setDatosReporte(res);
      toast.success('Reporte generado exitosamente');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al generar reporte');
    } finally {
      setCargandoReporte(false);
    }
  };

  // Cálculos de Cargas y Paradas del Viaje Activo
  const todasLasParadas = useMemo(() => {
    const lista: any[] = [];

    // 1. Paradas confirmadas en el servidor para el viaje activo
    (paradasViajeActivo || []).forEach((p, idx) => {
      lista.push({
        localId: `server_${p.id || idx}`,
        id: p.id,
        fincaNombre: p.fincaNombre || p.FincaNombre || p.finca || `Finca #${p.fincaId || p.FincaId}`,
        litros: Number(p.litros ?? p.Litros ?? 0),
        tipoLeche: (p.tipoLeche || p.TipoLeche || 'VACA').toUpperCase(),
        esAcida: Boolean(p.esAcida || p.EsAcida),
        esDiferido: Boolean(p.esDiferido || p.EsDiferido),
        hora: p.horaRecoleccion || p.hora || (p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Confirmada'),
        synced: true,
        origen: 'Servidor',
      });
    });

    // 2. Cargas locales en el teléfono aún pendientes de sincronizar
    cargas.filter((c) => !c.synced).forEach((c) => {
      lista.push({
        localId: c.localId,
        fincaNombre: c.fincaNombre,
        litros: Number(c.litros) || 0,
        tipoLeche: c.tipoLeche,
        esAcida: c.esAcida,
        esDiferido: c.esDiferido,
        temperatura: c.temperatura,
        hora: c.hora,
        synced: false,
        origen: 'Teléfono',
      });
    });

    return lista;
  }, [paradasViajeActivo, cargas]);

  const totalLitrosCargados = useMemo(() => {
    const sumParadasServer = (paradasViajeActivo || []).reduce((acc, p) => acc + Number(p.litros ?? p.Litros ?? 0), 0);
    const sumPendientes = cargas.filter((c) => !c.synced).reduce((acc, c) => acc + (Number(c.litros) || 0), 0);
    if (!viajeActivo) return sumPendientes;
    const serverTotal = (viajeActivo?.totalLitrosFinca && viajeActivo.totalLitrosFinca > sumParadasServer && (paradasViajeActivo || []).length > 0) 
      ? viajeActivo.totalLitrosFinca 
      : sumParadasServer;
    return serverTotal + sumPendientes;
  }, [viajeActivo, paradasViajeActivo, cargas]);

  const capacidad = viajeActivo?.capacidadCamionLitros || dispositivo?.capacidadTanqueLitros || 6000;
  const porcentajeLlenado = Math.min(Math.round((totalLitrosCargados / capacidad) * 100), 100);

  // Mantener alias para compatibilidad
  const cargasHoy = todasLasParadas;
  const totalLitrosHoy = totalLitrosCargados;

  const pendientesSync = useMemo(() => {
    return cargas.filter((c) => !c.synced);
  }, [cargas]);

  const noLeidasCount = useMemo(() => {
    return notificaciones.filter((n) => !n.leido).length;
  }, [notificaciones]);

  const rutasActivasIds = useMemo(() => {
    if (!viajeActivo) return [];
    const obs = viajeActivo.observacion || '';
    const match = obs.match(/\[RUTAS:([^\]]+)\]/);
    if (match) {
      return match[1].split(',').map((id: string) => Number(id.trim())).filter((x: number) => x > 0);
    }
    return viajeActivo.rutaLogisticaId ? [Number(viajeActivo.rutaLogisticaId)] : [];
  }, [viajeActivo]);

  // Fincas de la Ruta Asignada al Viaje Activo (con estado: recolectada / pendiente)
  const fincasDeMiRuta = useMemo(() => {
    if (!viajeActivo) return [];

    let fincasRuta: FincaDto[] = [];
    const planificadas = (viajeActivo as any).fincasPlanificadasIds || (viajeActivo as any).listaFincasIds;
    if (Array.isArray(planificadas) && planificadas.length > 0) {
      const idsNum = planificadas.map(Number);
      fincasRuta = fincas.filter((f) => idsNum.includes(f.id));
    } else if (typeof planificadas === 'string' && planificadas.trim()) {
      const idsNum = planificadas.split(',').map((x: string) => Number(x.trim())).filter((n: number) => n > 0);
      fincasRuta = fincas.filter((f) => idsNum.includes(f.id));
    } else if (rutasActivasIds.length > 0) {
      fincasRuta = fincas.filter((f) => f.rutaId && rutasActivasIds.includes(f.rutaId));
    }

    if (fincasRuta.length === 0) {
      const idsParadas = todasLasParadas.map((p) => Number(p.fincaId || p.FincaId || 0)).filter((id) => id > 0);
      fincasRuta = fincas.filter((f) => idsParadas.includes(f.id));
    }

    return fincasRuta.map((f) => {
      const parada = todasLasParadas.find((p) =>
        Number(p.fincaId || p.FincaId) === f.id ||
        (p.fincaNombre && f.nombre && p.fincaNombre.trim().toLowerCase() === f.nombre.trim().toLowerCase())
      );
      return {
        ...f,
        recolectada: Boolean(parada),
        parada,
        litrosRecolectados: parada ? Number(parada.litros || 0) : 0,
      };
    }).sort((a, b) => {
      if (a.recolectada && !b.recolectada) return -1;
      if (!a.recolectada && b.recolectada) return 1;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [viajeActivo, rutasActivasIds, fincas, todasLasParadas]);

  const fincasFiltradas = useMemo(() => {
    // Si el viaje tiene fincas planificadas por el Admin, el chofer sólo puede ver y cargar esas fincas
    let base = fincasDeMiRuta.length > 0 ? fincasDeMiRuta : fincas;
    if (busquedaFinca.trim()) {
      const term = busquedaFinca.toLowerCase();
      base = base.filter(
        (f) =>
          f.nombre.toLowerCase().includes(term) ||
          (f.codigo && f.codigo.toLowerCase().includes(term))
      );
    }

    return [...base].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [fincas, fincasDeMiRuta, busquedaFinca]);

  // Filtro de circuito en pestaña Recolección
  const [filtroCircuito, setFiltroCircuito] = useState<'todas' | 'pendientes' | 'recolectadas'>('todas');

  // Configuración dinámica de pestañas de navegación según modo activo
  const tabsNavegacion = useMemo(() => {
    if (modoActivo === 'RECEPTORIA') {
      const cantPendientesReceptoria = ticketsReceptoria.filter(
        (t) => (t.estado || '').toUpperCase() === 'EN RECEPTORIA' || (t.estado || '').toUpperCase() === 'EN ESPERA'
      ).length;
      return [
        {
          key: 'receptoria_entrada' as TabMovil,
          label: 'Entrada',
          icon: 'fa-arrow-down-to-bracket',
          color: '#4f46e5',
          bg: '#eef2ff',
          badge: cantPendientesReceptoria,
        },
        {
          key: 'receptoria_salidas' as TabMovil,
          label: 'Salidas',
          icon: 'fa-arrow-up-from-bracket',
          color: '#059669',
          bg: '#ecfdf5',
        },
        {
          key: 'receptoria_reporte' as TabMovil,
          label: 'Historial',
          icon: 'fa-clipboard-check',
          color: '#7c3aed',
          bg: '#f5f3ff',
        },
        { key: 'perfil' as TabMovil, label: 'Perfil', icon: 'fa-user-gear', color: '#0f172a', bg: '#f1f5f9' },
      ];
    }
    if (modoActivo === 'ADMIN') {
      return [
        { key: 'admin_envivo' as TabMovil, label: 'En Vivo', icon: 'fa-tower-broadcast', color: '#2563eb', bg: '#eff6ff' },
        { key: 'admin_logistica' as TabMovil, label: 'Logística', icon: 'fa-route', color: '#0284c7', bg: '#f0f9ff' },
        { key: 'reportes' as TabMovil, label: 'Reportes', icon: 'fa-chart-pie', color: '#7c3aed', bg: '#f5f3ff' },
        { key: 'perfil' as TabMovil, label: 'Perfil', icon: 'fa-user-gear', color: '#0f172a', bg: '#f1f5f9' },
      ];
    }
    if (modoActivo === 'TALLER') {
      const cantPend = incidentesTaller.filter((i) => (i.estado || '').toUpperCase() === 'PENDIENTE').length;
      return [
        { key: 'taller_flota' as TabMovil, label: 'Flota', icon: 'fa-truck-front', color: '#ea580c', bg: '#fff7ed' },
        {
          key: 'taller_mantenimiento' as TabMovil,
          label: 'Mantenimiento',
          icon: 'fa-wrench',
          color: '#d97706',
          bg: '#fef3c7',
          badge: cantPend,
        },
        { key: 'reportes' as TabMovil, label: 'Historial', icon: 'fa-clock-rotate-left', color: '#0284c7', bg: '#f0f9ff' },
        { key: 'perfil' as TabMovil, label: 'Perfil', icon: 'fa-user-gear', color: '#0f172a', bg: '#f1f5f9' },
      ];
    }
    // Modo CHOFER (Por defecto)
    const cantMisAverias = misIncidentes.filter((i) => (i.estado || '').toUpperCase() === 'PENDIENTE').length;
    return [
      { key: 'principal' as TabMovil, label: 'Inicio', icon: 'fa-house', color: '#2563eb', bg: '#eff6ff' },
      {
        key: 'entregas' as TabMovil,
        label: 'Entregas',
        icon: 'fa-warehouse',
        color: '#9333ea',
        bg: '#f5f3ff',
        badge: entregas.filter((e) => e.estado === 'EN VIA').length,
      },
      {
        key: 'incidentes' as TabMovil,
        label: 'Averías',
        icon: 'fa-wrench',
        color: '#d97706',
        bg: '#fffbeb',
        badge: cantMisAverias,
      },
      {
        key: 'combustible' as TabMovil,
        label: 'Combustible',
        icon: 'fa-gas-pump',
        color: '#e11d48',
        bg: '#fff1f2',
      },
      { key: 'reportes' as TabMovil, label: 'Reportes', icon: 'fa-chart-pie', color: '#0284c7', bg: '#f0f9ff' },
      { key: 'perfil' as TabMovil, label: 'Perfil', icon: 'fa-user-gear', color: '#0f172a', bg: '#f1f5f9' },
    ];
  }, [modoActivo, pendientesSync.length, entregas, misIncidentes, incidentesTaller, ticketsReceptoria]);

  // Sumar litros rápidamente en el modal
  const sumarLitros = (cant: number) => {
    setFormCarga((prev) => {
      const actual = Number(prev.litros) || 0;
      return { ...prev, litros: String(actual + cant) };
    });
  };

  // Abrir modal de carga preseleccionando una finca específica
  const abrirCargaParaFinca = (fincaItem: any) => {
    if (viajeActivo?.fecha) {
      setFormCarga((prev) => ({
        ...prev,
        fecha: viajeActivo.fecha.split('T')[0],
        fincaId: fincaItem.id,
      }));
    } else {
      setFormCarga((prev) => ({
        ...prev,
        fincaId: fincaItem.id,
      }));
    }
    setModalRegistro(true);
  };

  // Guardar nueva carga en local
  const handleGuardarCarga = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCarga.fincaId) {
      toast.error('Selecciona una finca de la lista');
      return;
    }
    const litrosNum = Number(formCarga.litros);
    if (!litrosNum || litrosNum <= 0) {
      toast.error('Ingresa una cantidad válida de litros');
      return;
    }

    const fincaSel = fincas.find((f) => f.id === Number(formCarga.fincaId));
    const now = new Date();
    const horaStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const fechaAUsar = viajeActivo?.fecha ? viajeActivo.fecha.split('T')[0] : (formCarga.fecha || hoyStr);

    const nuevaCarga: CargaOffline = {
      localId: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      fecha: fechaAUsar,
      hora: horaStr,
      fincaId: Number(formCarga.fincaId),
      fincaNombre: fincaSel ? fincaSel.nombre : `Finca #${formCarga.fincaId}`,
      litros: litrosNum,
      tipoLeche: formCarga.tipoLeche,
      esAcida: formCarga.esAcida,
      esDiferido: formCarga.esDiferido,
      temperatura: formCarga.temperatura ? Number(formCarga.temperatura) : undefined,
      observacion: formCarga.observacion,
      fotoRecibo: formCarga.fotoRecibo || undefined,
      synced: false,
    };

    const nuevasCargas = [nuevaCarga, ...cargas];
    setCargas(nuevasCargas);
    setModalRegistro(false);
    setFormCarga({
      fecha: viajeActivo?.fecha ? viajeActivo.fecha.split('T')[0] : hoyStr,
      fincaId: 0,
      litros: '',
      tipoLeche: 'VACA',
      esAcida: false,
      esDiferido: false,
      temperatura: '',
      observacion: '',
      fotoRecibo: '',
    });
    setBusquedaFinca('');

    toast.success(`Carga de ${litrosNum.toLocaleString()} L guardada en el teléfono`);

    if (isOnline) {
      setTimeout(() => sincronizarCargas(nuevasCargas), 500);
    }
  };

  // Sincronizar cargas con servidor
  const sincronizarCargas = async (cargasParaSync = cargas) => {
    if (!isOnline && !navigator.onLine) {
      toast.warning('No hay conexión a internet disponible para sincronizar.');
      return;
    }
    const pendientes = cargasParaSync.filter((c) => !c.synced);
    if (pendientes.length === 0) {
      toast.info('Todas las cargas ya están sincronizadas con la central.');
      return;
    }

    setSincronizando(true);
    let sincronizadasCount = 0;

    try {
      // 1. Priorizar el viaje activo ya cargado o asignado al chofer
      let idViaje: number | undefined = viajeActivo?.id;

      if (!idViaje) {
        // Consultar al servidor si existe un viaje activo abierto asignado a este chofer
        const vActivo = await operacionesApi.getViajeActivo(dispositivo?.id);
        if (vActivo && vActivo.id) {
          idViaje = vActivo.id;
          setViajeActivo(vActivo);
        }
      }

      // Si aún no se encontró, buscar en controles abiertos por chofer o unidad
      if (!idViaje) {
        const fechaCarga = pendientes[0]?.fecha || hoyStr;
        let viajes = await operacionesApi.getControles(fechaCarga);
        let viajeExistente = viajes.find(
          (v: any) =>
            (v.usuarioId === dispositivo?.id || v.conductorId === dispositivo?.id || v.choferId === dispositivo?.id || (dispositivo?.camionId && v.camionId === dispositivo.camionId)) &&
            v.estado !== 'Cerrado' && v.estado !== 'FINALIZADO' && v.estado !== 'Cancelado'
        );

        if (!viajeExistente) {
          const todosLosViajes = await operacionesApi.getControles();
          viajeExistente = todosLosViajes.find(
            (v: any) =>
              (v.usuarioId === dispositivo?.id || v.conductorId === dispositivo?.id || v.choferId === dispositivo?.id || (dispositivo?.camionId && v.camionId === dispositivo.camionId)) &&
              v.estado !== 'Cerrado' && v.estado !== 'FINALIZADO' && v.estado !== 'Cancelado'
          );
        }

        if (viajeExistente && viajeExistente.id) {
          idViaje = viajeExistente.id;
        }
      }

      // Solo si absolutamente ningún viaje abierto existe para el chofer, iniciar uno
      if (!idViaje) {
        const fechaCarga = pendientes[0]?.fecha || hoyStr;
        const viajeIniciado = await operacionesApi.iniciarViaje({
          fecha: fechaCarga,
          camionId: dispositivo?.camionId,
          choferId: dispositivo?.id,
          conductorId: dispositivo?.id,
          observacion: 'Viaje iniciado automáticamente desde App Móvil [ORIGEN_MOVIL]',
        });
        idViaje = viajeIniciado.id;
      }

      const actualizadas = [...cargasParaSync];
      for (const carga of pendientes) {
        try {
          // Sello obligatorio [ORIGEN_MOVIL] para trazabilidad en vivo
          const obsConOrigen = `${carga.observacion ? carga.observacion + ' ' : ''}[ORIGEN_MOVIL]`.trim();

          await operacionesApi.agregarFincaViaje(idViaje, {
            fincaId: carga.fincaId,
            litros: carga.litros,
            esAcida: carga.esAcida,
            esDiferido: carga.esDiferido,
            fecha: carga.fecha || hoyStr,
            tipoLeche: carga.tipoLeche,
            observacion: obsConOrigen,
            temperatura: carga.temperatura,
            fotoComprobante: carga.fotoRecibo,
          });

          const idx = actualizadas.findIndex((c) => c.localId === carga.localId);
          if (idx !== -1) {
            actualizadas[idx] = {
              ...actualizadas[idx],
              synced: true,
              syncedAt: new Date().toLocaleTimeString(),
              serverTicketId: idViaje,
            };
            sincronizadasCount++;
          }
        } catch (itemErr: any) {
          console.error('Error al sincronizar item:', carga, itemErr);
        }
      }

      setCargas(actualizadas);
      if (sincronizadasCount > 0) {
        toast.success(`¡Sincronización completada! ${sincronizadasCount} carga(s) enviadas a la central.`);
        try {
          localStorage.setItem('transporte_evento_finca_movil', JSON.stringify({
            timestamp: Date.now(),
            viajeId: idViaje,
            totalCargas: sincronizadasCount,
          }));
        } catch { /* tolerante */ }
      }

      // Actualizar paradas consolidadas y viaje activo desde la central
      await cargarViajeActivo();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al conectar con la central para sincronizar.');
    } finally {
      setSincronizando(false);
    }
  };

  // =========================================================================
  // VISTA 1: DISPOSITIVO NO VINCULADO (ACTIVACIÓN NEUTRA)
  // =========================================================================
  if (!dispositivo) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #090d16 0%, #0f172a 50%, #1e293b 100%)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            background: 'rgba(30, 41, 59, 0.85)',
            backdropFilter: 'blur(16px)',
            borderRadius: '24px',
            padding: '32px 24px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '22px',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              fontSize: '32px',
              color: '#ffffff',
              boxShadow: '0 10px 25px rgba(2, 132, 199, 0.4)',
            }}
          >
            <i className="fa-solid fa-truck-droplet"></i>
          </div>

          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            Rutas & Transporte Móvil
          </h1>
          <div style={{ marginBottom: '14px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                padding: '3px 12px',
                borderRadius: '16px',
                fontSize: '11.5px',
                fontWeight: 800,
                letterSpacing: '0.5px',
              }}
            >
              <i className="fa-solid fa-code-branch"></i> Versión {APP_VERSION}
            </span>
          </div>
          {/* Tarjeta de Base de Datos / Empresa Conectada (Fija, sin selector manual) */}
          {empresaGuardada ? (
            <div
              style={{
                marginBottom: '18px',
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '16px',
                padding: '12px 16px',
                textAlign: 'left',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(14, 165, 233, 0.2)',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '17px',
                  flexShrink: 0,
                }}
              >
                <i className="fa-solid fa-building"></i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>
                  Base de Datos Conectada
                </div>
                <div style={{ fontSize: '14.5px', fontWeight: 900, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {empresaGuardada}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px 0', lineHeight: '1.4' }}>
              Ingresa el código numérico de 6 dígitos para verificar de qué base de datos proviene y conectar este teléfono.
            </p>
          )}

          {/* Si tiene empresa guardada, muestra las opciones de acceso (Usuario/Clave o Código) */}
          {empresaGuardada && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                marginBottom: '20px',
                background: 'rgba(15, 23, 42, 0.6)',
                padding: '4px',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <button
                type="button"
                onClick={() => setModoLogin('credenciales')}
                style={{
                  padding: '9px 6px',
                  borderRadius: '10px',
                  border: 'none',
                  background: modoLogin === 'credenciales' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : 'transparent',
                  color: modoLogin === 'credenciales' ? '#ffffff' : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <i className="fa-solid fa-user-lock"></i>
                <span>Usuario y Clave</span>
              </button>

              <button
                type="button"
                onClick={() => setModoLogin('codigo')}
                style={{
                  padding: '9px 6px',
                  borderRadius: '10px',
                  border: 'none',
                  background: modoLogin === 'codigo' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : 'transparent',
                  color: modoLogin === 'codigo' ? '#ffffff' : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <i className="fa-solid fa-key"></i>
                <span>Código 6 Dígitos</span>
              </button>
            </div>
          )}

          {/* MODO 1: LOGIN CON USUARIO Y CONTRASEÑA */}
          {empresaGuardada && modoLogin === 'credenciales' ? (
            <form onSubmit={handleLoginUsuario} style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px 0', lineHeight: '1.4', textAlign: 'center' }}>
                Ingresa con tu usuario y contraseña de {empresaGuardada}.
              </p>

              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.8px',
                    textTransform: 'uppercase',
                    color: '#38bdf8',
                    marginBottom: '6px',
                  }}
                >
                  Usuario
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="ej: chofer1"
                  autoCapitalize="none"
                  autoCorrect="off"
                  style={{
                    width: '100%',
                    height: '48px',
                    background: '#0f172a',
                    border: '1.5px solid #334155',
                    borderRadius: '12px',
                    color: '#ffffff',
                    fontSize: '15px',
                    padding: '0 14px',
                    outline: 'none',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.8px',
                    textTransform: 'uppercase',
                    color: '#38bdf8',
                    marginBottom: '6px',
                  }}
                >
                  Contraseña
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={mostrarPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      height: '48px',
                      background: '#0f172a',
                      border: '1.5px solid #334155',
                      borderRadius: '12px',
                      color: '#ffffff',
                      fontSize: '15px',
                      padding: '0 44px 0 14px',
                      outline: 'none',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '15px',
                      padding: '4px',
                    }}
                  >
                    <i className={`fa-solid ${mostrarPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={iniciandoLogin || !loginUsername.trim() || !loginPassword.trim()}
                style={{
                  width: '100%',
                  height: '50px',
                  borderRadius: '14px',
                  background:
                    loginUsername.trim() && loginPassword.trim()
                      ? 'linear-gradient(135deg, #0284c7, #2563eb)'
                      : 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: loginUsername.trim() && loginPassword.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: loginUsername.trim() && loginPassword.trim() ? '0 8px 20px rgba(37, 99, 235, 0.4)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s ease',
                }}
              >
                {iniciandoLogin ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                    <span>Iniciando Sesión...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-right-to-bracket"></i>
                    <span>Iniciar Sesión</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* MODO 2: VINCULACIÓN CON CÓDIGO DE 6 DÍGITOS */
            <form onSubmit={handleVincular}>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px 0', lineHeight: '1.4' }}>
                Ingresa el código numérico suministrado por tu administrador para vincular este teléfono.
              </p>

              <div style={{ marginBottom: '22px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: '#38bdf8',
                    marginBottom: '10px',
                  }}
                >
                  Código de Vinculación
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={7}
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  placeholder="000 000"
                  style={{
                    width: '100%',
                    height: '62px',
                    background: '#0f172a',
                    border: '2px solid #334155',
                    borderRadius: '16px',
                    color: '#38bdf8',
                    fontSize: '32px',
                    fontWeight: 900,
                    letterSpacing: '8px',
                    textAlign: 'center',
                    outline: 'none',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={vinculando || codigoInput.trim().length < 6}
                style={{
                  width: '100%',
                  height: '52px',
                  borderRadius: '14px',
                  background:
                    codigoInput.trim().length >= 6
                      ? 'linear-gradient(135deg, #0284c7, #2563eb)'
                      : 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: codigoInput.trim().length >= 6 ? 'pointer' : 'not-allowed',
                  boxShadow: codigoInput.trim().length >= 6 ? '0 8px 20px rgba(37, 99, 235, 0.4)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s ease',
                }}
              >
                {vinculando ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                    <span>Verificando...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-mobile-screen-button"></i>
                    <span>Vincular y Entrar</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Botón inferior para desvincular la empresa y conectar a otra */}
          {empresaGuardada && (
            <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button
                type="button"
                onClick={handleDesvincular}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#f87171',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-link-slash"></i>
                <span>Desvincular Teléfono / Conectar a Otra Empresa</span>
              </button>
            </div>
          )}

          {!esInstalada && (
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={handleInstalarApp}
                style={{
                  width: '100%',
                  height: '48px',
                  borderRadius: '14px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1.5px solid rgba(16, 185, 129, 0.4)',
                  color: '#34d399',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <i className="fa-solid fa-download"></i>
                <span>Descargar / Instalar en mi Teléfono</span>
              </button>
            </div>
          )}

          <div style={{ marginTop: '22px', fontSize: '11px', color: '#64748b' }}>
            Terminal Móvil Chofer • {APP_VERSION} •{' '}
            <button
              type="button"
              onClick={handleForzarRecarga}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '11px',
                fontWeight: 700,
                padding: 0,
              }}
            >
              🔄 Recargar última versión
            </button>
          </div>

          {mostrarGuiaIos && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(0,0,0,0.8)',
                backdropFilter: 'blur(5px)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                padding: '16px',
              }}
            >
              <div
                style={{
                  background: '#1e293b',
                  borderRadius: '20px',
                  padding: '24px',
                  width: '100%',
                  maxWidth: '380px',
                  textAlign: 'left',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                    📲 Instalar en iPhone / iPad
                  </h3>
                  <button
                    type="button"
                    onClick={() => setMostrarGuiaIos(false)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '22px', cursor: 'pointer' }}
                  >
                    &times;
                  </button>
                </div>
                <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                  <ol style={{ paddingLeft: '20px', margin: 0 }}>
                    <li style={{ marginBottom: '8px' }}>
                      Toca el botón <strong>Compartir</strong> <i className="fa-solid fa-arrow-up-from-bracket text-sky-400"></i> en la barra de Safari.
                    </li>
                    <li style={{ marginBottom: '8px' }}>
                      Baja y pulsa <strong>«Agregar a la pantalla de inicio»</strong> <i className="fa-solid fa-square-plus text-emerald-400"></i>.
                    </li>
                    <li>
                      Pulsa <strong>«Agregar»</strong> arriba a la derecha.
                    </li>
                  </ol>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarGuiaIos(false)}
                  style={{
                    width: '100%',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 800,
                    marginTop: '16px',
                    cursor: 'pointer',
                  }}
                >
                  Entendido
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VISTA 2: TERMINAL MÓVIL VINCULADO CON 5 PESTAÑAS (ROL CHOFER)
  // =========================================================================
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        paddingBottom: '90px',
      }}
    >
      {/* Header Fijo Superior */}
      <header
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          padding: '14px 16px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 4px 15px rgba(15, 23, 42, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.25)',
                  color: isOnline ? '#34d399' : '#fbbf24',
                  padding: '2px 8px',
                  borderRadius: '20px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  border: isOnline ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                }}
              >
                <i className={`fa-solid ${isOnline ? 'fa-signal' : 'fa-plane'}`}></i>
                {isOnline ? 'En Línea' : 'Offline'}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {dispositivo.empresaNombre}
              </span>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  padding: '1px 6px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 800,
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                }}
              >
                {APP_VERSION}
              </span>
            </div>
            <h2 style={{ fontSize: '15.5px', fontWeight: 800, margin: '3px 0 0 0', color: '#ffffff' }}>
              {dispositivo.nombreCompleto}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Botón de Notificaciones con Badge */}
            <button
              type="button"
              onClick={() => setModalNotificaciones(true)}
              title="Notificaciones de Rutas y Salidas"
              style={{
                position: 'relative',
                background: noLeidasCount > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                border: noLeidasCount > 0 ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)',
                color: noLeidasCount > 0 ? '#fca5a5' : '#e2e8f0',
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <i className={`fa-solid fa-bell ${noLeidasCount > 0 ? 'fa-shake' : ''}`}></i>
              {noLeidasCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    background: '#ef4444',
                    color: '#ffffff',
                    fontSize: '9.5px',
                    fontWeight: 900,
                    minWidth: '17px',
                    height: '17px',
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    border: '1.5px solid #0f172a',
                    boxShadow: '0 2px 5px rgba(239,68,68,0.5)',
                  }}
                >
                  {noLeidasCount > 9 ? '9+' : noLeidasCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleForzarRecarga}
              title="Recargar última versión"
              style={{
                background: 'rgba(56, 189, 248, 0.2)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-arrows-rotate"></i>
            </button>
            {dispositivo.placaCamion && (
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#e2e8f0',
                  padding: '5px 9px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                }}
              >
                <i className="fa-solid fa-truck mr-1 text-sky-400"></i>
                {dispositivo.placaCamion}
              </span>
            )}
            <button
              type="button"
              onClick={handleCerrarSesion}
              title="Cerrar Sesión (Mantener Empresa)"
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-arrow-right-from-bracket"></i>
            </button>
          </div>
        </div>

        {/* Barra de Cambio Rápido de Módulo (Chofer / Admin / Taller / Receptoría) - Exclusivo Administradores */}
        {esAdminReal && (
          <div
            style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              overflowX: 'auto',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="fa-solid fa-layer-group text-sky-400"></i>
              <span>VISTA:</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '10px' }}>
              <button
                type="button"
                onClick={() => cambiarModo('CHOFER')}
                style={{
                  background: modoActivo === 'CHOFER' ? '#10b981' : 'transparent',
                  color: modoActivo === 'CHOFER' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: modoActivo === 'CHOFER' ? '0 2px 6px rgba(16, 185, 129, 0.4)' : 'none',
                }}
              >
                <i className="fa-solid fa-truck"></i> Chofer
              </button>
              <button
                type="button"
                onClick={() => cambiarModo('ADMIN')}
                style={{
                  background: modoActivo === 'ADMIN' ? '#2563eb' : 'transparent',
                  color: modoActivo === 'ADMIN' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: modoActivo === 'ADMIN' ? '0 2px 6px rgba(37, 99, 235, 0.4)' : 'none',
                }}
              >
                <i className="fa-solid fa-tower-broadcast"></i> Admin
              </button>
              <button
                type="button"
                onClick={() => cambiarModo('TALLER')}
                style={{
                  background: modoActivo === 'TALLER' ? '#ea580c' : 'transparent',
                  color: modoActivo === 'TALLER' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: modoActivo === 'TALLER' ? '0 2px 6px rgba(234, 88, 12, 0.4)' : 'none',
                }}
              >
                <i className="fa-solid fa-wrench"></i> Taller
              </button>
              <button
                type="button"
                onClick={() => cambiarModo('RECEPTORIA')}
                style={{
                  background: modoActivo === 'RECEPTORIA' ? '#4f46e5' : 'transparent',
                  color: modoActivo === 'RECEPTORIA' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: modoActivo === 'RECEPTORIA' ? '0 2px 6px rgba(79, 70, 229, 0.4)' : 'none',
                }}
              >
                <i className="fa-solid fa-warehouse"></i> Recept
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Barra de Instalación si no es PWA */}
      {!esInstalada && (
        <div
          style={{
            background: 'linear-gradient(90deg, #065f46, #047857)',
            padding: '8px 16px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px',
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-solid fa-mobile-screen text-emerald-300"></i>
            <span>Instala la app en tu pantalla para abrirla directo</span>
          </div>
          <button
            type="button"
            onClick={handleInstalarApp}
            style={{
              background: '#ffffff',
              color: '#065f46',
              border: 'none',
              padding: '3px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Instalar
          </button>
        </div>
      )}

      {/* CONTENIDO SEGÚN LA PESTAÑA ACTIVA */}
      <main style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* ===================================================================
            PESTAÑA 1: PRINCIPAL / INICIO (DASHBOARD MÓVIL PREMIUM)
           =================================================================== */}
        {tabActiva === 'principal' && (() => {
          const recCount = fincasDeMiRuta.filter((f) => f.recolectada).length;
          const pendientesCount = fincasDeMiRuta.length - recCount;
          const litrosDisponibles = Math.max(0, capacidad - totalLitrosCargados);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Barra de Supervisión de Chofer (Sólo visible para Administrador / SuperAdmin) */}
              {esAdminReal && (
                <div
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #fde047',
                    borderRadius: '16px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    boxShadow: '0 2px 8px rgba(217, 119, 6, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#92400e', fontWeight: 800 }}>
                    <i className="fa-solid fa-user-gear text-amber-600"></i>
                    <span>Supervisando Chofer:</span>
                  </div>
                  <select
                    value={choferSimuladoId}
                    onChange={(e) => {
                      const nuevoId = Number(e.target.value);
                      setChoferSimuladoId(nuevoId);
                      localStorage.setItem('movil_chofer_simulado_id', String(nuevoId));
                      cargarViajeActivo(nuevoId);
                      cargarDespachoActivo(nuevoId);
                      cargarEntregasChofer(nuevoId);
                    }}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #d97706',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      color: '#78350f',
                      outline: 'none',
                    }}
                  >
                    {choferesLista.length > 0 ? (
                      choferesLista.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.nombreCompleto} (#{ch.id})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value={13}>Julio Atencio (#13)</option>
                        <option value={1}>JOSE Perez (#1)</option>
                        <option value={2}>Manuel (#2)</option>
                        <option value={4}>Alfredy (#4)</option>
                      </>
                    )}
                  </select>
                </div>
              )}

              {/* Tarjeta de Bienvenida y Turno */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                  borderRadius: '20px',
                  padding: '16px 18px',
                  color: '#ffffff',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Turno de Operación • {new Date().toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                  <span
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}
                  >
                    🚛 {dispositivo?.placaCamion || 'Cisterna'}
                  </span>
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 4px 0', letterSpacing: '-0.3px' }}>
                  ¡Hola, {choferEfectivoNombre.split(' ')[0]}!
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
                  {despachoActivo
                    ? `Despacho #${despachoActivo.id} en viaje a ${despachoActivo.nombreCompania || 'Planta'}`
                    : viajeActivo
                    ? `Ticket #${viajeActivo.codigoTicket || viajeActivo.id} en curso`
                    : 'Listo para iniciar recolección en ruta'}
                </p>
              </div>

              {/* TARJETA DE TICKET ACTIVO DE DESPACHO / RECEPTORÍA (Ej. #20566) */}
              {despachoActivo && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 100%)',
                    borderRadius: '20px',
                    padding: '16px 18px',
                    border: '1.5px solid #c084fc',
                    boxShadow: '0 6px 20px rgba(168, 85, 247, 0.12)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 900, color: '#6b21a8' }}>
                        <i className="fa-solid fa-truck-fast mr-1 text-purple-600"></i> Despacho #{despachoActivo.id}
                      </span>
                      <span
                        style={{
                          background: '#f3e8ff',
                          color: '#7e22ce',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #d8b4fe',
                        }}
                      >
                        ● {despachoActivo.estado || 'EN VÍA'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => cargarDespachoActivo()}
                      disabled={cargandoDespacho}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #d8b4fe',
                        borderRadius: '8px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#7e22ce',
                        cursor: 'pointer',
                      }}
                      title="Actualizar despacho"
                    >
                      <i className={`fa-solid fa-rotate ${cargandoDespacho ? 'fa-spin' : ''}`}></i>
                    </button>
                  </div>

                  <div style={{ fontSize: '13px', color: '#1e293b', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <i className="fa-solid fa-building-wheat text-purple-600"></i>
                      <strong>Destino: {despachoActivo.nombreCompania || despachoActivo.companiaNombre || 'Planta / Receptoría'}</strong>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                      Conductor: <strong>{despachoActivo.nombreConductor || choferEfectivoNombre}</strong> • Fecha: {despachoActivo.fecha ? despachoActivo.fecha.split('T')[0] : ''}
                    </div>
                  </div>

                  {/* Estadísticas de Despacho */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ background: '#f5f3ff', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '1px solid #ddd6fe' }}>
                      <span style={{ fontSize: '10px', color: '#6b21a8', fontWeight: 800, textTransform: 'uppercase' }}>Litros Despachados</span>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#7e22ce', marginTop: '2px' }}>
                        {Number(despachoActivo.litrosDespachados || 0).toLocaleString()} L
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Tipo Leche</span>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#334155', marginTop: '3px' }}>
                        {despachoActivo.tipoLeche || 'VACA'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTabActiva('entregas')}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #7e22ce, #6b21a8)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '11px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(126, 34, 206, 0.25)',
                    }}
                  >
                    <i className="fa-solid fa-eye"></i>
                    <span>Ver Detalles en Entregas / Planta</span>
                  </button>
                </div>
              )}

              {/* TARJETA DE TICKET / VIAJE ACTIVO ASIGNADO */}
              {viajeActivo ? (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    padding: '16px 18px',
                    border: '1.5px solid #86efac',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 900, color: '#166534' }}>
                        <i className="fa-solid fa-ticket mr-1 text-emerald-600"></i> Ticket #{viajeActivo.codigoTicket || viajeActivo.id}
                      </span>
                      <span
                        style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #bbf7d0',
                        }}
                      >
                        ● {viajeActivo.estado || 'EN RUTA'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => cargarViajeActivo()}
                      disabled={cargandoViaje}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                      title="Actualizar datos del ticket"
                    >
                      <i className={`fa-solid fa-rotate ${cargandoViaje ? 'fa-spin' : ''}`}></i>
                    </button>
                  </div>

                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-route text-indigo-600"></i>
                      <strong style={{ color: '#0f172a' }}>
                        {viajeActivo.rutaLogisticaNombre ? `Ruta: ${viajeActivo.rutaLogisticaNombre}` : 'Modo Libre (Paradas Flexibles)'}
                      </strong>
                    </div>
                  </div>

                  {/* Estadísticas del Viaje Activo */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ background: '#f0fdf4', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                      <span style={{ fontSize: '10px', color: '#166534', fontWeight: 800, textTransform: 'uppercase' }}>Cargado</span>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#15803d', marginTop: '2px' }}>
                        {totalLitrosCargados.toLocaleString()} L
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Paradas</span>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                        {todasLasParadas.length}
                      </div>
                    </div>
                    <div style={{ background: '#eff6ff', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '1px solid #bfdbfe' }}>
                      <span style={{ fontSize: '10px', color: '#1e40af', fontWeight: 800, textTransform: 'uppercase' }}>Pendientes</span>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#1d4ed8', marginTop: '2px' }}>
                        {pendientesCount}
                      </div>
                    </div>
                  </div>

                  {/* Acciones Rápidas del Viaje */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (viajeActivo?.fecha) {
                          setFormCarga((prev) => ({ ...prev, fecha: viajeActivo.fecha.split('T')[0] }));
                        }
                        setModalRegistro(true);
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '11px',
                        fontSize: '13px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      <i className="fa-solid fa-plus text-xs"></i>
                      <span>+ Cargar Finca</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTabActiva('recoleccion')}
                      style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        borderRadius: '12px',
                        padding: '11px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className="fa-solid fa-route text-xs"></i>
                      <span>Ver Circuito</span>
                    </button>
                  </div>
                </div>
              ) : !despachoActivo ? (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    padding: '22px 18px',
                    border: '1.5px dashed #cbd5e1',
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '14px',
                      background: '#f1f5f9',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      margin: '0 auto 10px auto',
                    }}
                  >
                    <i className="fa-solid fa-truck-ramp-box"></i>
                  </div>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#1e293b' }}>
                    Sin Ticket de Ruta Activo
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 14px 0', lineHeight: '1.4' }}>
                    Registra tu primera recolección o pulsa el botón para iniciar el viaje del día.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFormCarga((prev) => ({ ...prev, fecha: hoyStr }));
                      setModalRegistro(true);
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '10px 18px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                    }}
                  >
                    <i className="fa-solid fa-play text-xs"></i>
                    <span>Iniciar Recorrido / Cargar Finca</span>
                  </button>
                </div>
              ) : null}

              {/* Widget Capacidad Cisterna (Dashboard Nivel de Tanque) */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '20px',
                  padding: '16px 18px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <i className="fa-solid fa-gas-pump" style={{ color: '#2563eb' }}></i>
                    <span>Nivel de Cisterna</span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 900,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: porcentajeLlenado > 95 ? '#fee2e2' : porcentajeLlenado >= 80 ? '#fef3c7' : '#ecfdf5',
                      color: porcentajeLlenado > 95 ? '#b91c1c' : porcentajeLlenado >= 80 ? '#b45309' : '#047857',
                    }}
                  >
                    {porcentajeLlenado}% Lleno
                  </span>
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '14px',
                    background: '#f1f5f9',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    marginBottom: '10px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(porcentajeLlenado, 100)}%`,
                      height: '100%',
                      background:
                        porcentajeLlenado > 95
                          ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                          : porcentajeLlenado >= 80
                          ? 'linear-gradient(90deg, #3b82f6, #f59e0b)'
                          : 'linear-gradient(90deg, #0284c7, #10b981)',
                      borderRadius: '999px',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b' }}>
                  <span>A Bordo: <strong style={{ color: '#0f172a' }}>{totalLitrosCargados.toLocaleString()} L</strong></span>
                  <span>Disponible: <strong style={{ color: '#0284c7' }}>{litrosDisponibles.toLocaleString()} L</strong></span>
                  <span>Total: <strong>{capacidad.toLocaleString()} L</strong></span>
                </div>
              </div>

              {/* SECCIÓN DIRECTA: FINCAS DE LA RUTA Y RECOLECCIÓN RÁPIDA */}
              {viajeActivo && (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    padding: '16px 18px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '14.5px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <i className="fa-solid fa-cow text-sky-600"></i>
                      <span>Fincas del Recorrido ({fincasDeMiRuta.length})</span>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 900,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: recCount === fincasDeMiRuta.length && fincasDeMiRuta.length > 0 ? '#dcfce7' : '#eff6ff',
                        color: recCount === fincasDeMiRuta.length && fincasDeMiRuta.length > 0 ? '#15803d' : '#1d4ed8',
                        border: recCount === fincasDeMiRuta.length && fincasDeMiRuta.length > 0 ? '1px solid #86efac' : '1px solid #bfdbfe',
                      }}
                    >
                      {recCount}/{fincasDeMiRuta.length} Hechas
                    </span>
                  </div>

                  {/* Barra de progreso rápida */}
                  <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: `${fincasDeMiRuta.length > 0 ? Math.round((recCount / fincasDeMiRuta.length) * 100) : 0}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

                  {/* Lista de Fincas con Detalle y Botón de Cargar Litros */}
                  {fincasDeMiRuta.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px', background: '#f8fafc', borderRadius: '12px' }}>
                      No hay fincas asignadas específicamente. Usa el botón superior <strong>+ Cargar Finca</strong> para registrar paradas libres.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {fincasDeMiRuta.map((f, idx) => (
                        <div
                          key={f.id}
                          style={{
                            background: f.recolectada ? '#f0fdf4' : '#ffffff',
                            borderRadius: '12px',
                            padding: '12px',
                            border: f.recolectada ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '6px',
                                  background: f.recolectada ? '#dcfce7' : '#f1f5f9',
                                  color: f.recolectada ? '#15803d' : '#64748b',
                                  fontSize: '11px',
                                  fontWeight: 900,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {idx + 1}
                              </span>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: f.recolectada ? '#15803d' : '#0f172a' }}>
                                {f.nombre}
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', paddingLeft: '26px' }}>
                              {f.codigo ? `${f.codigo} • ` : ''}
                              {f.recolectada ? (
                                <strong style={{ color: '#16a34a' }}>
                                  ✓ Recolectada: {f.litrosRecolectados.toLocaleString()} L
                                </strong>
                              ) : (
                                <span style={{ color: '#d97706', fontWeight: 700 }}>⏳ Pendiente por recoger</span>
                              )}
                            </div>
                          </div>

                          <div>
                            {f.recolectada ? (
                              <button
                                type="button"
                                onClick={() => abrirCargaParaFinca(f)}
                                style={{
                                  background: '#ffffff',
                                  border: '1px solid #86efac',
                                  color: '#16a34a',
                                  borderRadius: '8px',
                                  padding: '6px 10px',
                                  fontSize: '11.5px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                              >
                                <i className="fa-solid fa-pen mr-1"></i> Modificar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => abrirCargaParaFinca(f)}
                                style={{
                                  background: 'linear-gradient(135deg, #10b981, #059669)',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '8px',
                                  padding: '7px 12px',
                                  fontSize: '11.5px',
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <i className="fa-solid fa-faucet-drip"></i>
                                <span>+ Cargar Litros</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Botón Finalizar Recolección si ya recolectó */}
                  {viajeActivo && totalLitrosCargados > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.success('Recolección completada. Revisa tu entrega de leche en la pestaña Entregas.');
                        setTabActiva('entregas');
                      }}
                      style={{
                        width: '100%',
                        marginTop: '14px',
                        background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '12px',
                        fontSize: '13px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
                      }}
                    >
                      <i className="fa-solid fa-warehouse"></i>
                      <span>Finalizar Recolección y Despachar a Receptoría</span>
                    </button>
                  )}
                </div>
              )}

              {/* Botones de Acceso Rápido (Cuadrícula 2x2) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setTabActiva('recoleccion')}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0 }}>
                    <i className="fa-solid fa-faucet-drip"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Recolección</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{fincasDeMiRuta.length} fincas en ruta</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTabActiva('entregas')}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0 }}>
                    <i className="fa-solid fa-warehouse"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Entregas</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{entregas.length} asignadas</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTabActiva('reportes')}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f0f9ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0 }}>
                    <i className="fa-solid fa-chart-pie"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Reportes</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Resumen diario</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => sincronizarCargas()}
                  disabled={sincronizando || !isOnline}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: isOnline ? 'pointer' : 'not-allowed',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    textAlign: 'left',
                    opacity: isOnline ? 1 : 0.6,
                  }}
                >
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f0f9ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0 }}>
                    <i className={`fa-solid ${sincronizando ? 'fa-arrows-rotate fa-spin' : 'fa-cloud-arrow-up'}`}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Sincronizar</div>
                    <div style={{ fontSize: '11px', color: pendientesSync.length > 0 ? '#b45309' : '#15803d', fontWeight: 700 }}>
                      {pendientesSync.length > 0 ? `${pendientesSync.length} pendientes` : 'Al día'}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          );
        })()}

        {/* ===================================================================
            PESTAÑA 2: RECOLECCIÓN (SOLO SUS VIAJES Y CARGAS EN FINCAS)
           =================================================================== */}
        {tabActiva === 'recoleccion' && (
          <div>
            {/* Banner de Viaje / Ticket Activo */}
            {viajeActivo && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: '16px',
                  padding: '12px 16px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 900, color: '#166534' }}>
                      <i className="fa-solid fa-ticket mr-1"></i> Ticket #{viajeActivo.codigoTicket || viajeActivo.id}
                    </span>
                    <span
                      style={{
                        background: '#dcfce7',
                        color: '#15803d',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '5px',
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      ACTIVO
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#166534', marginTop: '2px' }}>
                    <span>🚛 {viajeActivo.camionPlaca || dispositivo?.placaCamion || 'Cisterna'}</span>
                    <span style={{ margin: '0 4px', color: '#86efac' }}>•</span>
                    <span>{viajeActivo.rutaLogisticaNombre ? `Ruta: ${viajeActivo.rutaLogisticaNombre}` : 'Modo Libre'}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#15803d' }}>
                    {totalLitrosCargados.toLocaleString()} L
                  </div>
                  <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>
                    {todasLasParadas.length} parada(s)
                  </div>
                </div>
              </div>
            )}

            {/* Banner Sync si hay cargas pendientes */}
            {pendientesSync.length > 0 && (
              <div
                style={{
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#92400e' }}>
                    <i className="fa-solid fa-clock-rotate-left mr-1"></i>
                    {pendientesSync.length} carga(s) en teléfono
                  </div>
                  <div style={{ fontSize: '11px', color: '#b45309' }}>
                    {isOnline ? 'Listo para enviar a la central' : 'Se enviarán al tener señal'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => sincronizarCargas()}
                  disabled={sincronizando || !isOnline}
                  style={{
                    background: isOnline ? '#d97706' : '#cbd5e1',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 12px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    cursor: isOnline ? 'pointer' : 'not-allowed',
                  }}
                >
                  {sincronizando ? 'Enviando...' : 'Sincronizar'}
                </button>
              </div>
            )}

            {/* BOTÓN REGISTRAR CARGA EN FINCA CON BLOQUEO SI ESTÁ EN RECEPTORÍA */}
            {(() => {
              const ticketEnReceptoria = viajeActivo && (
                (viajeActivo.procesoActualId != null && viajeActivo.procesoActualId >= 2) ||
                (viajeActivo.litrosEntregadosCompania != null && Number(viajeActivo.litrosEntregadosCompania) > 0) ||
                (viajeActivo.totalLitrosReceptoria != null && Number(viajeActivo.totalLitrosReceptoria) > 0) ||
                viajeActivo.estado === 'EN_RECEPTORIA' ||
                viajeActivo.estado === 'RECEPCIONADO' ||
                viajeActivo.estado === 'CAMINO A COMPAÑIA' ||
                viajeActivo.estado === 'POR VERIFICACIÓN'
              );

              if (ticketEnReceptoria) {
                return (
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '16px',
                      background: '#fffbeb',
                      border: '1.5px solid #fde68a',
                      color: '#92400e',
                      marginBottom: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: '0 2px 8px rgba(245, 158, 11, 0.1)',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: '#fef3c7',
                        color: '#b45309',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-lock"></i>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#92400e' }}>
                        Ticket en Receptoría (Por Verificación)
                      </div>
                      <div style={{ fontSize: '12px', marginTop: '3px', color: '#a16207', lineHeight: '1.35' }}>
                        Este viaje ya fue despachado para pesaje y control. No se pueden registrar más fincas salvo que el receptor devuelva el ticket a estado Abierto.
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  onClick={() => {
                    if (viajeActivo?.fecha) {
                      setFormCarga((prev) => ({ ...prev, fecha: viajeActivo.fecha.split('T')[0] }));
                    }
                    setModalRegistro(true);
                  }}
                  style={{
                    width: '100%',
                    height: '60px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '16px',
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 8px 22px rgba(16, 185, 129, 0.35)',
                    cursor: 'pointer',
                    marginBottom: '18px',
                  }}
                >
                  <i className="fa-solid fa-plus text-xl"></i>
                  <span>Registrar Carga en Finca</span>
                </button>
              );
            })()}

            {/* Recorrido de Fincas de la Ruta Asignada */}
            {fincasDeMiRuta.length > 0 && (() => {
              const recCount = fincasDeMiRuta.filter((f) => f.recolectada).length;
              const pendientesCount = fincasDeMiRuta.length - recCount;
              const pct = Math.round((recCount / fincasDeMiRuta.length) * 100);

              const fincasAMostrar = fincasDeMiRuta.filter((f) => {
                if (filtroCircuito === 'pendientes') return !f.recolectada;
                if (filtroCircuito === 'recolectadas') return f.recolectada;
                return true;
              });

              return (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    padding: '16px',
                    border: '1px solid #e2e8f0',
                    marginBottom: '18px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <i className="fa-solid fa-route" style={{ color: '#2563eb' }}></i>
                      <span>Circuito de Ruta ({fincasDeMiRuta.length})</span>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 900,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: pct === 100 ? '#dcfce7' : '#eff6ff',
                        color: pct === 100 ? '#15803d' : '#1d4ed8',
                        border: pct === 100 ? '1px solid #86efac' : '1px solid #bfdbfe',
                      }}
                    >
                      {recCount}/{fincasDeMiRuta.length} ({pct}%)
                    </span>
                  </div>

                  {/* Barra de progreso de recolección */}
                  <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: pct === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #10b981)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

                  {/* Filtro segmentado: Todas | Pendientes | Recolectadas */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setFiltroCircuito('todas')}
                      style={{
                        padding: '6px 4px',
                        borderRadius: '8px',
                        border: filtroCircuito === 'todas' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: filtroCircuito === 'todas' ? '#eff6ff' : '#f8fafc',
                        color: filtroCircuito === 'todas' ? '#1d4ed8' : '#64748b',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      Todas ({fincasDeMiRuta.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltroCircuito('pendientes')}
                      style={{
                        padding: '6px 4px',
                        borderRadius: '8px',
                        border: filtroCircuito === 'pendientes' ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                        background: filtroCircuito === 'pendientes' ? '#fef3c7' : '#f8fafc',
                        color: filtroCircuito === 'pendientes' ? '#b45309' : '#64748b',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      ⏳ Pendientes ({pendientesCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltroCircuito('recolectadas')}
                      style={{
                        padding: '6px 4px',
                        borderRadius: '8px',
                        border: filtroCircuito === 'recolectadas' ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                        background: filtroCircuito === 'recolectadas' ? '#ecfdf5' : '#f8fafc',
                        color: filtroCircuito === 'recolectadas' ? '#047857' : '#64748b',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      ✓ Hechas ({recCount})
                    </button>
                  </div>

                  {/* Lista de Fincas */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {fincasAMostrar.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '11.5px' }}>
                        No hay fincas en esta vista
                      </div>
                    ) : (
                      fincasAMostrar.map((f) => (
                        <div
                          key={f.id}
                          style={{
                            borderRadius: '14px',
                            padding: '11px 13px',
                            border: f.recolectada ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                            background: f.recolectada ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)' : '#f8fafc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 800, color: f.recolectada ? '#166534' : '#1e293b' }}>
                                {f.recolectada ? '✓ ' : ''}{f.nombre}
                              </span>
                              {f.recolectada ? (
                                <span
                                  style={{
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    padding: '1px 6px',
                                    borderRadius: '5px',
                                    border: '1px solid #bbf7d0',
                                  }}
                                >
                                  Recolectada
                                </span>
                              ) : (
                                <span
                                  style={{
                                    background: '#f1f5f9',
                                    color: '#64748b',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '5px',
                                  }}
                                >
                                  ⏳ Pendiente
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                              {f.propietarioNombre || f.propietario || f.codigo || 'Finca ganadera'}
                              {f.recolectada && f.parada?.hora ? ` • Recogida ${f.parada.hora}` : ''}
                              {f.parada?.tipoLeche === 'BUFALA' ? ' • 🐃 Búfala' : ''}
                            </div>
                          </div>

                          <div>
                            {f.recolectada ? (
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '15px', fontWeight: 900, color: '#15803d' }}>
                                  +{f.litrosRecolectados.toLocaleString()} L
                                </span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => abrirCargaParaFinca(f)}
                                style={{
                                  background: 'linear-gradient(135deg, #10b981, #059669)',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '10px',
                                  padding: '7px 14px',
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: '0 3px 8px rgba(16, 185, 129, 0.3)',
                                }}
                              >
                                <i className="fa-solid fa-plus text-[11px]"></i>
                                <span>Cargar</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Historial de Cargas de Hoy */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                Paradas de este Viaje ({todasLasParadas.length})
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Total: <strong>{totalLitrosCargados.toLocaleString()} L</strong>
              </span>
            </div>

            {todasLasParadas.length === 0 ? (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '32px 16px',
                  textAlign: 'center',
                  border: '1.5px dashed #cbd5e1',
                  color: '#94a3b8',
                }}
              >
                <i className="fa-solid fa-clipboard-list text-3xl mb-2 text-slate-300"></i>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#64748b' }}>
                  No hay cargas registradas en este ticket
                </div>
                <p style={{ fontSize: '11.5px', margin: '4px 0 0 0' }}>
                  Pulsa el botón verde para registrar una recolección en finca.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {todasLasParadas.map((c) => (
                  <div
                    key={c.localId}
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                          {c.fincaNombre}
                        </span>
                        {c.tipoLeche === 'BUFALA' && (
                          <span style={{ background: '#fed7aa', color: '#9a3412', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px' }}>
                            BÚFALA
                          </span>
                        )}
                        {c.esDiferido && (
                          <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px' }}>
                            DIFERIDO
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                        <i className="fa-regular fa-clock mr-1 text-slate-400"></i>
                        {c.hora}
                        {c.temperatura ? ` • ${c.temperatura}°C` : ''}
                        {c.esAcida && ' • ⚠️ Ácida'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {c.fotoRecibo && (
                        <button
                          type="button"
                          onClick={() => setFotoReciboVerModal(c.fotoRecibo!)}
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            borderRadius: '8px',
                            padding: '6px 8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                          title="Ver comprobante de finca"
                        >
                          <i className="fa-solid fa-receipt"></i>
                        </button>
                      )}
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#2563eb' }}>
                          {c.litros.toLocaleString()} L
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          {c.synced ? (
                            <span style={{ fontSize: '10.5px', color: '#059669', fontWeight: 700 }}>
                              <i className="fa-solid fa-circle-check mr-1"></i>Enviado
                            </span>
                          ) : (
                            <span style={{ fontSize: '10.5px', color: '#d97706', fontWeight: 700 }}>
                              <i className="fa-solid fa-mobile mr-1"></i>En Teléfono
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            PESTAÑA 3: ENTREGAS (RECEPTORÍAS / SALIDAS ASIGNADAS AL CHOFER)
           =================================================================== */}
        {tabActiva === 'entregas' && (() => {
          const listaEntregasEfectiva = (() => {
            const list = [...entregas];
            if (despachoActivo && !list.some((d: any) => d.id === despachoActivo.id)) {
              list.unshift(despachoActivo);
            }
            return list;
          })();

          return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                  Mis Entregas y Despachos
                </h3>
                <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0' }}>
                  Viajes asignados a receptoría o planta ({choferEfectivoNombre})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  cargarEntregasChofer();
                  cargarDespachoActivo();
                }}
                disabled={cargandoEntregas || !isOnline}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <i className={`fa-solid fa-rotate mr-1 ${cargandoEntregas ? 'fa-spin' : ''}`}></i>
                Actualizar
              </button>
            </div>

            {cargandoEntregas ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 text-purple-600"></i>
                <div style={{ fontSize: '12.5px', fontWeight: 700 }}>Cargando tus despachos...</div>
              </div>
            ) : listaEntregasEfectiva.length === 0 ? (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '36px 16px',
                  textAlign: 'center',
                  border: '1.5px dashed #cbd5e1',
                  color: '#94a3b8',
                }}
              >
                <i className="fa-solid fa-warehouse text-3xl mb-2 text-purple-300"></i>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#64748b' }}>
                  No tienes entregas a receptoría asignadas
                </div>
                <p style={{ fontSize: '11.5px', margin: '4px 0 0 0' }}>
                  Cuando el administrador asigne un despacho a tu camión, aparecerá aquí.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {listaEntregasEfectiva.map((d: any) => {
                  const desp = Number(d.litrosDespachados || 0);
                  const rec = Number(d.litrosRecibidosCompania || d.litrosConfirmados || 0);
                  const merma = rec > 0 ? rec - desp : 0;
                  const est = (d.estado || 'En Ruta').toUpperCase();

                  return (
                    <div
                      key={d.id}
                      style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#7e22ce' }}>
                          Ticket #{d.id} • Receptoría
                        </span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: est === 'FINALIZADO' || est === 'ENTREGADO' ? '#dcfce7' : '#fef3c7',
                            color: est === 'FINALIZADO' || est === 'ENTREGADO' ? '#15803d' : '#b45309',
                          }}
                        >
                          {d.estado || 'EN RUTA'}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                        <i className="fa-solid fa-building-wheat mr-1.5 text-purple-600"></i>
                        Destino: {d.nombreCompania || d.companiaNombre || 'Receptoría Principal'}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '10px', borderRadius: '10px' }}>
                        <div>
                          <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>Despachados:</span>
                          <strong style={{ fontSize: '14px', color: '#0369a1' }}>{desp.toLocaleString()} L</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>En Planta:</span>
                          <strong style={{ fontSize: '14px', color: '#15803d' }}>
                            {rec > 0 ? `${rec.toLocaleString()} L` : 'Pendiente'}
                          </strong>
                        </div>
                      </div>

                      {merma !== 0 && (
                        <div style={{ marginTop: '8px', fontSize: '11.5px', color: merma < 0 ? '#dc2626' : '#15803d', fontWeight: 700 }}>
                          Merma: {merma > 0 ? `+${merma.toLocaleString()} L` : `${merma.toLocaleString()} L`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {/* ===================================================================
            PESTAÑA 4: REPORTES (SOLO NÚMEROS 1, 2, 3, 4 Y 7)
           =================================================================== */}
        {tabActiva === 'reportes' && (
          <div>
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '16px',
                border: '1px solid #e2e8f0',
                marginBottom: '16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              <h3 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', margin: '0 0 12px 0' }}>
                <i className="fa-solid fa-file-invoice text-blue-600 mr-2"></i>
                Consulta de Reportes Chofer
              </h3>

              {/* Rango de Fechas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Desde:
                  </label>
                  <input
                    type="date"
                    value={repFechaInicio}
                    onChange={(e) => setRepFechaInicio(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '12.5px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Hasta:
                  </label>
                  <input
                    type="date"
                    value={repFechaFin}
                    onChange={(e) => setRepFechaFin(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              {/* Selector de Reportes Autorizados (1, 2, 3, 4 y 7) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                  Seleccione Reporte:
                </label>
                <select
                  value={tipoReporte}
                  onChange={(e) => setTipoReporte(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1.5px solid #2563eb',
                    background: '#eff6ff',
                    padding: '0 10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#1d4ed8',
                  }}
                >
                  {REPORTES_CHOFER.filter((r) =>
                    modoActivo === 'CHOFER' ? r.value === 'DIARIOS' || r.value === 'RECEPTORIAS' : true
                  ).map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleConsultarReporte}
                disabled={cargandoReporte || !isOnline}
                style={{
                  width: '100%',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #1e40af, #2563eb)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: isOnline ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {cargandoReporte ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i> Generando...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-magnifying-glass"></i> Consultar Reporte
                  </>
                )}
              </button>
            </div>

            {/* Vista de Datos del Reporte */}
            {datosReporte && (() => {
              const items: any[] = datosReporte?.items || (Array.isArray(datosReporte) ? datosReporte : []);
              const totalLitrosCalculados = Number(
                datosReporte?.totalLitros ?? 
                items.reduce((acc, r) => acc + Number(r.litros || r.totalLitros || r.litrosDespachados || 0), 0)
              );

              return (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    padding: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                      Resultados ({items.length} {items.length === 1 ? 'registro' : 'registros'})
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px' }}>
                      {totalLitrosCalculados.toLocaleString()} Lts Totales
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 12px', color: '#94a3b8', fontSize: '12px' }}>
                      <i className="fa-solid fa-folder-open text-2xl mb-1.5 block text-slate-300"></i>
                      No se encontraron registros para este rango de fechas ({repFechaInicio} al {repFechaFin}).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {tipoReporte === 'CHOFERES' ? (
                        items.map((row: any, idx: number) => {
                          const difGlobal = Number(row.totalLitros || 0);
                          const esPos = difGlobal > 0;
                          const esZero = difGlobal === 0;
                          const detalleFechas: any[] = row.detalle || [];

                          return (
                            <div
                              key={idx}
                              style={{
                                background: '#f8fafc',
                                borderRadius: '14px',
                                padding: '14px',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              {/* Encabezado del Chofer */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                                <div>
                                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                                    <i className="fa-solid fa-truck mr-1.5 text-blue-600"></i>
                                    {row.nombre || 'Chofer'}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                    Recogido Fincas: <strong>{Number(row.totalLitrosFinca || 0).toLocaleString()} L</strong> • Entregado: <strong>{Number(row.totalLitrosEntregados || 0).toLocaleString()} L</strong>
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <span
                                    style={{
                                      fontSize: '12px',
                                      fontWeight: 900,
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: esZero ? '#f1f5f9' : esPos ? '#ecfdf5' : '#fef2f2',
                                      color: esZero ? '#64748b' : esPos ? '#059669' : '#dc2626',
                                      border: `1px solid ${esZero ? '#cbd5e1' : esPos ? '#a7f3d0' : '#fecaca'}`,
                                      display: 'inline-block',
                                    }}
                                  >
                                    {esPos ? `+${difGlobal.toLocaleString()}` : difGlobal.toLocaleString()} L
                                  </span>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Diferencia Total</div>
                                </div>
                              </div>

                              {/* Fechas con diferencias */}
                              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                                  📅 Fechas con Diferencias ({detalleFechas.length})
                                </div>
                                {detalleFechas.length === 0 ? (
                                  <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', padding: '6px' }}>
                                    No hay viajes registrados en este período.
                                  </div>
                                ) : (
                                  detalleFechas.map((det: any, dIdx: number) => {
                                    const diff = Number(det.litros ?? (Number(det.litrosEntregados || 0) - Number(det.totalLitrosFinca || 0)));
                                    const esDPos = diff > 0;
                                    const esDZero = diff === 0;

                                    return (
                                      <div
                                        key={dIdx}
                                        style={{
                                          background: '#ffffff',
                                          borderRadius: '8px',
                                          padding: '8px 10px',
                                          border: '1px solid #e2e8f0',
                                          fontSize: '11.5px',
                                        }}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: 800, color: '#1e293b' }}>
                                              {det.fecha ? String(det.fecha).split('T')[0] : 'Fecha'}
                                            </span>
                                            {det.ticketId && (
                                              <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                #{det.ticketId}
                                              </span>
                                            )}
                                          </div>
                                          <span
                                            style={{
                                              fontWeight: 900,
                                              fontSize: '11.5px',
                                              padding: '1px 6px',
                                              borderRadius: '4px',
                                              background: esDZero ? '#f1f5f9' : esDPos ? '#ecfdf5' : '#fef2f2',
                                              color: esDZero ? '#64748b' : esDPos ? '#059669' : '#dc2626',
                                            }}
                                          >
                                            {esDPos ? `+${diff.toLocaleString()}` : diff.toLocaleString()} L
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                                          <span>Fincas: <strong>{Number(det.totalLitrosFinca || 0).toLocaleString()} L</strong> • Entregado: <strong>{Number(det.litrosEntregados || 0).toLocaleString()} L</strong></span>
                                          <span>{det.destinoNombre || 'Receptoría'}</span>
                                        </div>
                                        {det.observacion && (
                                          <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px' }}>
                                            {det.observacion}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : tipoReporte === 'RELACION_CHOFER' ? (
                        items.map((row: any, idx: number) => {
                          const difGlobal = Number(row.diferencias || 0);
                          const esPos = difGlobal > 0;
                          const esZero = difGlobal === 0;
                          const detalleDiario: any[] = row.detalleDiario || [];

                          return (
                            <div
                              key={idx}
                              style={{
                                background: '#f8fafc',
                                borderRadius: '14px',
                                padding: '14px',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              {/* Encabezado Relación Chofer */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                                <div>
                                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                                    <i className="fa-solid fa-file-invoice mr-1.5 text-purple-600"></i>
                                    {row.chofer || 'Chofer'}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                    Ruta: <strong>{Number(row.litrosRuta || 0).toLocaleString()} L</strong> • Quesera: <strong>{Number(row.litrosQuesera || 0).toLocaleString()} L</strong>
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <span
                                    style={{
                                      fontSize: '12px',
                                      fontWeight: 900,
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: esZero ? '#f1f5f9' : esPos ? '#ecfdf5' : '#fef2f2',
                                      color: esZero ? '#64748b' : esPos ? '#059669' : '#dc2626',
                                      border: `1px solid ${esZero ? '#cbd5e1' : esPos ? '#a7f3d0' : '#fecaca'}`,
                                      display: 'inline-block',
                                    }}
                                  >
                                    {esPos ? `+${difGlobal.toLocaleString()}` : difGlobal.toLocaleString()} L
                                  </span>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Diferencia Total</div>
                                </div>
                              </div>

                              {/* Fechas con diferencias */}
                              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                                  📅 Desglose Diario por Fechas ({detalleDiario.length})
                                </div>
                                {detalleDiario.length === 0 ? (
                                  <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', padding: '6px' }}>
                                    No hay registros diarios para este período.
                                  </div>
                                ) : (
                                  detalleDiario.map((dd: any, dIdx: number) => {
                                    const diff = Number(dd.diferencia ?? (Number(dd.litrosQuesera || 0) - Number(dd.litrosRuta || 0)));
                                    const esDPos = diff > 0;
                                    const esDZero = diff === 0;

                                    return (
                                      <div
                                        key={dIdx}
                                        style={{
                                          background: '#ffffff',
                                          borderRadius: '8px',
                                          padding: '8px 10px',
                                          border: '1px solid #e2e8f0',
                                          fontSize: '11.5px',
                                        }}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: 800, color: '#1e293b' }}>
                                              {dd.fecha ? String(dd.fecha).split('T')[0] : 'Fecha'}
                                            </span>
                                            {dd.ticketId && (
                                              <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                #{dd.ticketId}
                                              </span>
                                            )}
                                          </div>
                                          <span
                                            style={{
                                              fontWeight: 900,
                                              fontSize: '11.5px',
                                              padding: '1px 6px',
                                              borderRadius: '4px',
                                              background: esDZero ? '#f1f5f9' : esDPos ? '#ecfdf5' : '#fef2f2',
                                              color: esDZero ? '#64748b' : esDPos ? '#059669' : '#dc2626',
                                            }}
                                          >
                                            {esDPos ? `+${diff.toLocaleString()}` : diff.toLocaleString()} L
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                                          <span>Ruta: <strong>{Number(dd.litrosRuta || 0).toLocaleString()} L</strong> • Quesera: <strong>{Number(dd.litrosQuesera || 0).toLocaleString()} L</strong></span>
                                          <span>{dd.destino || 'Receptoría'}</span>
                                        </div>
                                        {dd.observacion && (
                                          <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px' }}>
                                            {dd.observacion}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        items.slice(0, 50).map((row: any, idx: number) => {
                          const lts = Number(row.litros || row.totalLitros || row.litrosDespachados || row.Litros || 0);
                          const titulo = row.nombre || row.fincaNombre || row.finca || row.FincaNombre || row.choferNombre || row.companiaNombre || row.rutaLogisticaNombre || `Registro #${idx + 1}`;
                          const sub = row.propietario || row.dueño || row.placaCamion || row.observacion || '';
                          const fechaStr = row.fecha ? String(row.fecha).split('T')[0] : '';
                          const tipoLeche = (row.tipoLeche || row.TipoLeche || 'VACA').toUpperCase();

                          return (
                            <div
                              key={idx}
                              style={{
                                background: '#f8fafc',
                                borderRadius: '10px',
                                padding: '10px 12px',
                                border: '1px solid #e2e8f0',
                                fontSize: '12px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontWeight: 700, color: '#1e293b' }}>
                                <div>
                                  <span>{titulo}</span>
                                  {sub && <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{sub}</div>}
                                </div>
                                <span style={{ color: '#0284c7', fontWeight: 900, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                                  {lts.toLocaleString()} L
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                <span>{fechaStr ? `Fecha: ${fechaStr}` : ''}</span>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: tipoLeche === 'BUFALA' ? '#f3e8ff' : '#dbeafe',
                                  color: tipoLeche === 'BUFALA' ? '#7e22ce' : '#1d4ed8'
                                }}>
                                  {tipoLeche}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ===================================================================
            PESTAÑA 5: MI PERFIL (DATOS Y CAMBIO DE CLAVE)
           =================================================================== */}
        {tabActiva === 'perfil' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Tarjeta de Identidad */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: '18px',
                padding: '20px',
                color: '#ffffff',
                boxShadow: '0 6px 20px rgba(15, 23, 42, 0.2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    fontWeight: 900,
                  }}
                >
                  {dispositivo.nombreCompleto.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                    {dispositivo.nombreCompleto}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#38bdf8', marginTop: '2px' }}>
                    @{dispositivo.username} • <span style={{ textTransform: 'uppercase' }}>{dispositivo.rol}</span>
                  </div>
                  {dispositivo.placaCamion && (
                    <div style={{ fontSize: '12px', color: '#34d399', marginTop: '2px', fontWeight: 700 }}>
                      <i className="fa-solid fa-truck mr-1"></i> Cisterna: {dispositivo.placaCamion} ({capacidad.toLocaleString()} L)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SELECTOR DE MODOS OPERATIVOS (SOLO ADMIN / SUPERADMIN) */}
            {esAdminReal && (
              <div
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                  borderRadius: '18px',
                  padding: '20px',
                  color: '#ffffff',
                  boxShadow: '0 8px 25px rgba(15, 23, 42, 0.25)',
                  border: '1.5px solid rgba(56, 189, 248, 0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: 'rgba(56, 189, 248, 0.2)',
                        color: '#38bdf8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                      }}
                    >
                      <i className="fa-solid fa-layer-group"></i>
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#f8fafc' }}>
                        Modo de la Aplicación Móvil
                      </h4>
                      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                        Acceso SuperAdmin: Alterna libremente entre los 3 entornos
                      </p>
                    </div>
                  </div>
                  <span
                    style={{
                      background:
                        modoActivo === 'ADMIN'
                          ? 'rgba(37, 99, 235, 0.3)'
                          : modoActivo === 'TALLER'
                          ? 'rgba(234, 88, 12, 0.3)'
                          : 'rgba(16, 185, 129, 0.3)',
                      color:
                        modoActivo === 'ADMIN'
                          ? '#60a5fa'
                          : modoActivo === 'TALLER'
                          ? '#fb923c'
                          : '#4ade80',
                      border: `1px solid ${
                        modoActivo === 'ADMIN'
                          ? '#3b82f6'
                          : modoActivo === 'TALLER'
                          ? '#f97316'
                          : '#22c55e'
                      }`,
                      fontSize: '11px',
                      fontWeight: 900,
                      padding: '4px 10px',
                      borderRadius: '8px',
                    }}
                  >
                    {modoActivo === 'ADMIN' ? '👑 ENTORNO ADMIN' : modoActivo === 'TALLER' ? '🔧 ENTORNO TALLER' : '🚛 ENTORNO CHOFER'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  {/* Tarjeta Modo Chofer */}
                  <button
                    type="button"
                    onClick={() => cambiarModo('CHOFER')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '14px',
                      border: modoActivo === 'CHOFER' ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.1)',
                      background: modoActivo === 'CHOFER' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: modoActivo === 'CHOFER' ? '#22c55e' : 'rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-truck"></i>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff' }}>
                          1. Módulo Chofer / Conductor
                        </span>
                        {modoActivo === 'CHOFER' && (
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#4ade80' }}>✓ ACTIVO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Recolección en finca, rutas, entregas a plantas y reporte de averías.
                      </div>
                    </div>
                  </button>

                  {/* Tarjeta Modo Admin */}
                  <button
                    type="button"
                    onClick={() => cambiarModo('ADMIN')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '14px',
                      border: modoActivo === 'ADMIN' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                      background: modoActivo === 'ADMIN' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: modoActivo === 'ADMIN' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-tower-broadcast"></i>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff' }}>
                          2. Módulo Administrador
                        </span>
                        {modoActivo === 'ADMIN' && (
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#60a5fa' }}>✓ ACTIVO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Supervisión En Vivo de camiones, logística de rutas y reportes.
                      </div>
                    </div>
                  </button>

                  {/* Tarjeta Modo Taller */}
                  <button
                    type="button"
                    onClick={() => cambiarModo('TALLER')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '14px',
                      border: modoActivo === 'TALLER' ? '2px solid #f97316' : '1px solid rgba(255,255,255,0.1)',
                      background: modoActivo === 'TALLER' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: modoActivo === 'TALLER' ? '#f97316' : 'rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-wrench"></i>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff' }}>
                          3. Módulo Taller & Flota
                        </span>
                        {modoActivo === 'TALLER' && (
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#fb923c' }}>✓ ACTIVO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Estado de camiones (Activo, Inactivo, Mantenimiento) y reparaciones.
                      </div>
                    </div>
                  </button>

                  {/* Tarjeta Modo Receptoría */}
                  <button
                    type="button"
                    onClick={() => cambiarModo('RECEPTORIA')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '14px',
                      border: modoActivo === 'RECEPTORIA' ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                      background: modoActivo === 'RECEPTORIA' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: modoActivo === 'RECEPTORIA' ? '#6366f1' : 'rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-warehouse"></i>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff' }}>
                          4. Módulo Receptoría
                        </span>
                        {modoActivo === 'RECEPTORIA' && (
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#a5b4fc' }}>✓ ACTIVO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Entrada de leche de campo, verificación con merma y tickets de salida a plantas.
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Formulario de Actualización */}
            <form
              onSubmit={handleGuardarPerfil}
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '18px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: '0 0 14px 0' }}>
                <i className="fa-solid fa-user-pen mr-2 text-blue-600"></i>
                Datos Personales & Contacto
              </h4>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={perfilForm.nombreCompleto}
                  onChange={(e) => setPerfilForm({ ...perfilForm, nombreCompleto: e.target.value })}
                  style={{ width: '100%', height: '40px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Teléfono Móvil
                  </label>
                  <input
                    type="text"
                    value={perfilForm.telefono}
                    onChange={(e) => setPerfilForm({ ...perfilForm, telefono: e.target.value })}
                    placeholder="0412-1234567"
                    style={{ width: '100%', height: '40px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Cédula / Documento
                  </label>
                  <input
                    type="text"
                    value={perfilForm.cedula}
                    onChange={(e) => setPerfilForm({ ...perfilForm, cedula: e.target.value })}
                    placeholder="V-12345678"
                    style={{ width: '100%', height: '40px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '14px' }}>
                <h5 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0' }}>
                  <i className="fa-solid fa-lock mr-1.5 text-amber-500"></i>
                  Cambiar Contraseña (Opcional)
                </h5>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '3px' }}>
                    Contraseña Actual
                  </label>
                  <input
                    type="password"
                    value={perfilForm.passwordActual}
                    onChange={(e) => setPerfilForm({ ...perfilForm, passwordActual: e.target.value })}
                    placeholder="••••••••"
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '3px' }}>
                      Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      value={perfilForm.nuevoPassword}
                      onChange={(e) => setPerfilForm({ ...perfilForm, nuevoPassword: e.target.value })}
                      placeholder="Mínimo 6 caracteres"
                      style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '3px' }}>
                      Confirmar
                    </label>
                    <input
                      type="password"
                      value={perfilForm.confirmarPassword}
                      onChange={(e) => setPerfilForm({ ...perfilForm, confirmarPassword: e.target.value })}
                      placeholder="Repetir clave"
                      style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={guardandoPerfil || !isOnline}
                style={{
                  width: '100%',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: isOnline ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {guardandoPerfil ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </form>

            {/* Información de Versión del Sistema Móvil */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '14px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Versión del Sistema
                </div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#0284c7' }}>
                  {APP_VERSION} (Producción)
                </div>
              </div>
              <button
                type="button"
                onClick={handleForzarRecarga}
                style={{
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  color: '#0284c7',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-arrows-rotate"></i>
                Actualizar
              </button>
            </div>

            {/* Acciones de Sesión y Dispositivo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
              <button
                type="button"
                onClick={handleCerrarSesion}
                style={{
                  width: '100%',
                  height: '46px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)',
                }}
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                Cerrar Sesión
              </button>

              <button
                type="button"
                onClick={handleDesvincular}
                style={{
                  width: '100%',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#fee2e2',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-trash-can"></i>
                Desvincular y Olvidar Empresa
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: INCIDENTES / AVERÍAS (CHOFER -> TALLER)
           =================================================================== */}
        {tabActiva === 'incidentes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Cabecera Informativa */}
            <div
              style={{
                background: 'linear-gradient(135deg, #b45309 0%, #78350f 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 24px rgba(180, 83, 9, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fde68a' }}>
                    Soporte Mecánico & Flota
                  </span>
                  <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 900 }}>
                    Reportar Avería al Taller
                  </h3>
                </div>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}
                >
                  <i className="fa-solid fa-wrench"></i>
                </div>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#fef3c7', opacity: 0.95 }}>
                Cisterna Asignada: <strong style={{ color: '#ffffff' }}>{dispositivo?.placaCamion || 'Sin Placa Asignada'}</strong>
              </p>
            </div>

            {/* Formulario de Reporte de Avería */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '18px',
                padding: '18px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                border: '1px solid #e2e8f0',
              }}
            >
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                Nueva Notificación Mecánica
              </h4>

              {/* Botones de Selección Rápida */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
                ACCESO RÁPIDO (Toca para autocompletar):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                {[
                  'Arreglar Motor',
                  'Luz Trasera / Stop',
                  'Cambio de Aceite',
                  'Frenos Desgastados',
                  'Reparar Caucho / Neumático',
                  'Fuga en Cisterna / Manguera',
                ].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFormIncidente((prev) => ({ ...prev, titulo: item }))}
                    style={{
                      background: formIncidente.titulo === item ? '#fef3c7' : '#f8fafc',
                      color: formIncidente.titulo === item ? '#92400e' : '#475569',
                      border: formIncidente.titulo === item ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + {item}
                  </button>
                ))}
              </div>

              <form onSubmit={handleEnviarIncidenteChofer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    ¿Qué se debe reparar? *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Falla de encendido, luz trasera quemada..."
                    value={formIncidente.titulo}
                    onChange={(e) => setFormIncidente((prev) => ({ ...prev, titulo: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      Nivel de Urgencia
                    </label>
                    <select
                      value={formIncidente.urgencia}
                      onChange={(e) => setFormIncidente((prev) => ({ ...prev, urgencia: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '12.5px',
                        background: '#ffffff',
                      }}
                    >
                      <option value="BAJA">Baja (Preventivo)</option>
                      <option value="MEDIA">Media (En jornada)</option>
                      <option value="ALTA">Alta (Afecta ruta)</option>
                      <option value="CRITICA">Crítica (Camión varado)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      Odómetro / Km Actual
                    </label>
                    <input
                      type="number"
                      placeholder="Ej: 145000"
                      value={formIncidente.odometroKm}
                      onChange={(e) => setFormIncidente((prev) => ({ ...prev, odometroKm: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Descripción o detalles para el mecánico
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Describe el ruido, comportamiento o pieza afectada..."
                    value={formIncidente.descripcion}
                    onChange={(e) => setFormIncidente((prev) => ({ ...prev, descripcion: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #d97706, #b45309)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '13.5px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
                  }}
                >
                  <i className="fa-solid fa-paper-plane"></i>
                  Enviar Reporte al Taller
                </button>
              </form>
            </div>

            {/* Listado de Averías Reportadas */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                  Mis Averías Registradas ({misIncidentes.length})
                </h4>
                <button
                  type="button"
                  onClick={cargarMisIncidentesChofer}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#0284c7',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-rotate-right mr-1"></i> Actualizar
                </button>
              </div>

              {cargandoIncidentes ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-spinner fa-spin mr-2"></i> Consultando incidentes...
                </div>
              ) : misIncidentes.length === 0 ? (
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '14px',
                    padding: '24px',
                    textAlign: 'center',
                    color: '#64748b',
                    border: '1px dashed #cbd5e1',
                  }}
                >
                  <i className="fa-solid fa-circle-check text-emerald-500" style={{ fontSize: '28px', marginBottom: '8px', display: 'block' }}></i>
                  No tienes averías pendientes para esta cisterna.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {misIncidentes.map((inc) => {
                    const st = (inc.estado || 'PENDIENTE').toUpperCase();
                    const colorBadge =
                      st === 'REPARADO' || st === 'FINALIZADO'
                        ? '#16a34a'
                        : st === 'EN REVISION' || st === 'EN PROCESO'
                        ? '#2563eb'
                        : '#ea580c';
                    const bgBadge =
                      st === 'REPARADO' || st === 'FINALIZADO'
                        ? '#dcfce7'
                        : st === 'EN REVISION' || st === 'EN PROCESO'
                        ? '#dbeafe'
                        : '#ffedd5';

                    return (
                      <div
                        key={inc.id}
                        style={{
                          background: '#ffffff',
                          borderRadius: '14px',
                          padding: '14px 16px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>{inc.titulo}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                              Fecha: {inc.fechaEvento ? new Date(inc.fechaEvento).toLocaleDateString() : 'Hoy'}
                              {inc.tipoEvento && ` • ${inc.tipoEvento}`}
                            </div>
                          </div>
                          <span
                            style={{
                              background: bgBadge,
                              color: colorBadge,
                              fontSize: '10.5px',
                              fontWeight: 900,
                              padding: '3px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            {st}
                          </span>
                        </div>
                        {inc.descripcion && (
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '8px', background: '#f8fafc', padding: '8px', borderRadius: '8px' }}>
                            {inc.descripcion}
                          </div>
                        )}
                        {inc.solucionAplicada && (
                          <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: '6px', fontWeight: 600 }}>
                            <i className="fa-solid fa-check mr-1"></i> Solución Taller: {inc.solucionAplicada}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: CHOFER COMBUSTIBLE (CARGA Y DESPACHO DE COMBUSTIBLE)
           =================================================================== */}
        {tabActiva === 'combustible' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Combustible */}
            <div
              style={{
                background: 'linear-gradient(135deg, #be123c 0%, #881337 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 25px rgba(190, 18, 60, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#fecdd3', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <i className="fa-solid fa-gas-pump mr-1"></i> Control de Combustible
                </div>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.18)',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 900,
                  }}
                >
                  🚛 {dispositivo?.placaCamion || 'Cisterna Asignada'}
                </span>
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 4px 0' }}>
                Registro de Combustible (Gasoil)
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#ffe4e6' }}>
                Registra la recarga de tu camión desde Bomba comercial o patio interno La Matera.
              </p>
            </div>

            {/* Formulario de Carga */}
            <form
              onSubmit={handleRegistrarCargaCombustible}
              style={{
                background: '#ffffff',
                borderRadius: '18px',
                padding: '18px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                Datos de la Recarga
              </div>

              {/* Selector de Origen: Bomba vs Matera */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                  Origen de la Carga *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setFormCombustible((prev) => ({ ...prev, origen: 'BOMBA' }))}
                    style={{
                      padding: '12px 10px',
                      borderRadius: '12px',
                      border: formCombustible.origen === 'BOMBA' ? '2px solid #e11d48' : '1px solid #cbd5e1',
                      background: formCombustible.origen === 'BOMBA' ? '#fff1f2' : '#f8fafc',
                      color: formCombustible.origen === 'BOMBA' ? '#be123c' : '#475569',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fa-solid fa-gas-pump text-base"></i>
                    <span>Bomba Comercial</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormCombustible((prev) => ({ ...prev, origen: 'MATERA' }))}
                    style={{
                      padding: '12px 10px',
                      borderRadius: '12px',
                      border: formCombustible.origen === 'MATERA' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: formCombustible.origen === 'MATERA' ? '#eff6ff' : '#f8fafc',
                      color: formCombustible.origen === 'MATERA' ? '#1d4ed8' : '#475569',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fa-solid fa-warehouse text-base"></i>
                    <span>La Matera (Patio)</span>
                  </button>
                </div>
              </div>

              {/* Litros a Cargar con Botones Rápidos */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                  Litros Despachados *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    placeholder="Ej: 80"
                    value={formCombustible.litros}
                    onChange={(e) => setFormCombustible((prev) => ({ ...prev, litros: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '18px',
                      fontWeight: 900,
                      color: '#0f172a',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: '14px',
                      top: '13px',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#64748b',
                    }}
                  >
                    Lts
                  </span>
                </div>

                {/* Botones de incremento rápido */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  {[20, 50, 100, 150].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => {
                        const cur = Number(formCombustible.litros) || 0;
                        setFormCombustible((prev) => ({ ...prev, litros: cur + inc }));
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      +{inc} L
                    </button>
                  ))}
                </div>
              </div>

              {/* Odómetro / Kilometraje Actual */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                  Kilometraje Odómetro (Km Actual)
                </label>
                <input
                  type="number"
                  placeholder="Ej: 145200"
                  value={formCombustible.odometroKm}
                  onChange={(e) => setFormCombustible((prev) => ({ ...prev, odometroKm: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13.5px',
                    fontWeight: 700,
                  }}
                />
              </div>

              {/* Foto Comprobante / Tablero */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                  Foto del Comprobante / Marcador de Bomba
                </label>
                {formCombustible.fotoComprobante ? (
                  <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                    <img
                      src={formCombustible.fotoComprobante}
                      alt="Comprobante combustible"
                      style={{ width: '100%', maxHeight: '160px', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      onClick={() => setFormCombustible((prev) => ({ ...prev, fotoComprobante: '' }))}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fa-solid fa-trash mr-1"></i> Quitar Foto
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1.5px dashed #cbd5e1',
                      background: '#f8fafc',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#475569',
                    }}
                  >
                    <i className="fa-solid fa-camera text-sky-600 text-lg"></i>
                    <span>Tomar Foto / Subir Imagen</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            setFormCombustible((prev) => ({ ...prev, fotoComprobante: String(evt.target?.result || '') }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Observación / Notas */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                  Observaciones / Nro Factura / Estación
                </label>
                <input
                  type="text"
                  placeholder="Ej: Estación El Trigal, tanque lleno"
                  value={formCombustible.observaciones}
                  onChange={(e) => setFormCombustible((prev) => ({ ...prev, observaciones: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '12.5px',
                  }}
                />
              </div>

              {/* Botón Enviar */}
              <button
                type="submit"
                disabled={guardandoCombustible}
                style={{
                  background: 'linear-gradient(135deg, #e11d48, #be123c)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '13px',
                  fontSize: '14px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(225, 29, 72, 0.35)',
                  marginTop: '4px',
                }}
              >
                <i className="fa-solid fa-gas-pump"></i>
                <span>{guardandoCombustible ? 'Guardando Carga...' : 'Registrar Despacho de Combustible'}</span>
              </button>
            </form>

            {/* Historial Reciente de Cargas */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '18px',
                padding: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  <i className="fa-solid fa-clock-rotate-left mr-2 text-rose-600"></i>
                  Cargas Recientes
                </h3>
                <button
                  type="button"
                  onClick={cargarHistorialCombustible}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#0284c7',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <i className={`fa-solid fa-rotate ${cargandoCombustible ? 'fa-spin' : ''}`}></i>
                </button>
              </div>

              {cargandoCombustible ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando historial...
                </div>
              ) : historialCombustible.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                  No hay recargas de combustible registradas recientemente.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {historialCombustible.slice(0, 10).map((h, idx) => (
                    <div
                      key={h.id || idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                          ⛽ {h.litros || (h as any).Litros || 0} Lts Gasoil
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                          {h.fecha ? new Date(h.fecha).toLocaleDateString() : 'Hoy'}
                          {h.odometroKm ? ` • ${h.odometroKm.toLocaleString()} Km` : ''}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          color: '#475569',
                        }}
                      >
                        {(h.observaciones || '').includes('MATERA') ? 'LA MATERA' : 'BOMBA'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: RECEPTORÍA ENTRADA (TICKETS DE CHOFERES A RECEPTORÍA)
           =================================================================== */}
        {tabActiva === 'receptoria_entrada' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Entrada Receptoría */}
            <div
              style={{
                background: 'linear-gradient(135deg, #3730a3 0%, #1e1b4b 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 25px rgba(55, 48, 163, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span
                  style={{
                    background: 'rgba(99, 102, 241, 0.25)',
                    color: '#c7d2fe',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 900,
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                  }}
                >
                  🏭 Receptoría de Planta
                </span>
                <input
                  type="date"
                  value={fechaReceptoria}
                  onChange={(e) => {
                    setFechaReceptoria(e.target.value);
                    cargarDatosReceptoria(e.target.value);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '3px 8px',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 4px 0' }}>
                Entrada de Leche (Campo ➔ Receptoría)
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#e0e7ff' }}>
                Verifica los litros de las cisternas que llegaron de ruta o devuélvelos si faltan paradas.
              </p>
            </div>

            {/* Buscador de Tickets */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Buscar por chofer, placa de camión o ticket..."
                value={busquedaReceptoria}
                onChange={(e) => setBusquedaReceptoria(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 12px 11px 36px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#ffffff',
                }}
              />
              <i
                className="fa-solid fa-magnifying-glass"
                style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8', fontSize: '13px' }}
              ></i>
            </div>

            {/* Lista de Tickets en Receptoría */}
            {cargandoReceptoria ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando tickets en receptoría...
              </div>
            ) : (() => {
              const ticketsFiltrados = ticketsReceptoria.filter((t) => {
                if (!busquedaReceptoria.trim()) return true;
                const term = busquedaReceptoria.toLowerCase();
                const choferNom = String((t as any).conductorNombre || (t as any).choferNombre || '');
                return (
                  (t.codigoTicket && t.codigoTicket.toLowerCase().includes(term)) ||
                  choferNom.toLowerCase().includes(term) ||
                  (t.camionPlaca && t.camionPlaca.toLowerCase().includes(term)) ||
                  (t.rutaLogisticaNombre && t.rutaLogisticaNombre.toLowerCase().includes(term))
                );
              });

              if (ticketsFiltrados.length === 0) {
                return (
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      padding: '24px',
                      textAlign: 'center',
                      border: '1.5px dashed #cbd5e1',
                      color: '#64748b',
                    }}
                  >
                    <i className="fa-solid fa-warehouse text-slate-300" style={{ fontSize: '36px', marginBottom: '8px', display: 'block' }}></i>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>Sin Tickets en Receptoría</div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11.5px' }}>
                      No se encontraron cisternas enviadas a receptoría para la fecha seleccionada.
                    </p>
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {ticketsFiltrados.map((t) => {
                    const ltsChofer = Number((t as any).totalLitrosFinca || (t as any).litrosCargadosTotal || 0);
                    const ltsRecibidos = Number(t.totalLitrosReceptoria || t.litrosEntregadosCompania || 0);
                    const merma = ltsRecibidos > 0 ? ltsRecibidos - ltsChofer : 0;
                    const paradas = (t as any).paradas || [];
                    const chofNom = (t as any).conductorNombre || (t as any).choferNombre || 'Chofer';

                    return (
                      <div
                        key={t.id}
                        style={{
                          background: '#ffffff',
                          borderRadius: '16px',
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 3px 10px rgba(0,0,0,0.03)',
                        }}
                      >
                        {/* Cabecera del Ticket */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 900, color: '#1e1b4b' }}>
                                🎫 Ticket #{t.codigoTicket || t.id}
                              </span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  background: '#e0e7ff',
                                  color: '#3730a3',
                                  padding: '2px 6px',
                                  borderRadius: '5px',
                                }}
                              >
                                {t.estado || 'EN RECEPTORIA'}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700, marginTop: '2px' }}>
                              <i className="fa-solid fa-user mr-1 text-slate-400"></i> {chofNom} • 🚛 {t.camionPlaca || 'S/P'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: '#2563eb' }}>
                              {ltsChofer.toLocaleString()} L
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748b' }}>Campo Chofer</div>
                          </div>
                        </div>

                        {/* Circuito y Paradas */}
                        <div
                          style={{
                            background: '#f8fafc',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            fontSize: '11.5px',
                            color: '#334155',
                            marginBottom: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                            <span>Ruta: {t.rutaLogisticaNombre || 'Modo Libre'}</span>
                            <span>{paradas.length} Fincas Recolectadas</span>
                          </div>
                          {ltsRecibidos > 0 && (
                            <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#15803d', fontWeight: 800 }}>Recibido: {ltsRecibidos.toLocaleString()} L</span>
                              <span style={{ color: merma < 0 ? '#dc2626' : '#15803d', fontWeight: 800 }}>
                                Merma: {merma > 0 ? `+${merma}` : merma} L
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Botones de Acción: Verificar Litros vs Devolver Ticket */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() =>
                              setModalVerificarLitros({
                                open: true,
                                ticket: t,
                                litrosRecibidos: ltsRecibidos > 0 ? ltsRecibidos : ltsChofer,
                                observacion: '',
                              })
                            }
                            style={{
                              flex: 1,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1.5px solid #bfdbfe',
                              borderRadius: '10px',
                              padding: '9px 10px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                            }}
                          >
                            <i className="fa-solid fa-scale-balanced"></i>
                            <span>Verificar Litros</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setModalDevolverTicket({
                                open: true,
                                ticketId: t.id,
                                motivo: '',
                              })
                            }
                            style={{
                              background: '#fff1f2',
                              color: '#e11d48',
                              border: '1.5px solid #fecdd3',
                              borderRadius: '10px',
                              padding: '9px 12px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                            title="Devolver ticket al chofer para corregir fincas o litros"
                          >
                            <i className="fa-solid fa-arrow-rotate-left"></i>
                            <span>Devolver</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: RECEPTORÍA SALIDAS (DESPACHO A PLANTAS / QUESERAS)
           =================================================================== */}
        {tabActiva === 'receptoria_salidas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Salidas Receptoría */}
            <div
              style={{
                background: 'linear-gradient(135deg, #065f46 0%, #022c22 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 25px rgba(6, 95, 70, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.25)',
                    color: '#6ee7b7',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 900,
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                  }}
                >
                  🚀 Salidas y Despachos
                </span>
                <span style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: 700 }}>
                  {fechaReceptoria}
                </span>
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 4px 0' }}>
                Tickets de Salida (Receptoría ➔ Plantas)
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#d1fae5' }}>
                Emisión de tickets de despacho a queseras con chofer, camión, litros y guía SADA.
              </p>
            </div>

            {/* Botón Nuevo Ticket de Salida */}
            <button
              type="button"
              onClick={() => {
                setModalNuevoDespachoSalida({
                  open: true,
                  fecha: fechaReceptoria,
                  camionId: camionesLista.length > 0 ? camionesLista[0].id : 0,
                  conductorId: choferesLista.length > 0 ? choferesLista[0].id : 0,
                  litrosDespachados: '',
                  companiaId: companiasReceptoria.length > 0 ? companiasReceptoria[0].id : 0,
                  tipoLeche: 'VACA',
                  numeroGuiaSADA: '',
                  observacion: '',
                });
              }}
              style={{
                background: 'linear-gradient(135deg, #059669, #047857)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '14px',
                padding: '13px',
                fontSize: '14px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
              }}
            >
              <i className="fa-solid fa-plus-circle text-lg"></i>
              <span>+ Nuevo Ticket de Salida</span>
            </button>

            {/* Listado de Despachos de Salida */}
            {cargandoReceptoria ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando salidas...
              </div>
            ) : despachosSalidaReceptoria.length === 0 ? (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center',
                  border: '1.5px dashed #cbd5e1',
                  color: '#64748b',
                }}
              >
                <i className="fa-solid fa-truck-arrow-right text-slate-300" style={{ fontSize: '36px', marginBottom: '8px', display: 'block' }}></i>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>Sin Salidas Registradas</div>
                <p style={{ margin: '4px 0 0 0', fontSize: '11.5px' }}>
                  Pulsa el botón superior para crear el primer ticket de salida a planta.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {despachosSalidaReceptoria.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#065f46' }}>
                          🏢 {d.companiaNombre || 'Compañía / Planta'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px', fontWeight: 700 }}>
                          🚛 {d.camionPlaca || 'S/P'} • {(d as any).conductorNombre || (d as any).choferNombre || (d as any).usuarioNombre || 'Chofer'}
                        </div>
                        {d.numeroGuiaSADA && (
                          <div style={{ fontSize: '10.5px', color: '#0284c7', marginTop: '2px', fontWeight: 800 }}>
                            Guía SADA: {d.numeroGuiaSADA}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>
                          {Number(d.litrosDespachados || 0).toLocaleString()} L
                        </div>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '5px',
                            background: d.estado === 'RECIBIDO' ? '#dcfce7' : '#eff6ff',
                            color: d.estado === 'RECIBIDO' ? '#15803d' : '#1d4ed8',
                          }}
                        >
                          {d.estado || 'DESPACHADO'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: RECEPTORÍA REPORTE / HISTORIAL
           =================================================================== */}
        {tabActiva === 'receptoria_reporte' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Historial Receptoría */}
            <div
              style={{
                background: 'linear-gradient(135deg, #581c87 0%, #3b0764 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 25px rgba(88, 28, 135, 0.3)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#e9d5ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                <i className="fa-solid fa-chart-column mr-1"></i> Balance Operativo Receptoría
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 4px 0' }}>
                Historial y Reportes de Receptoría
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#f3e8ff' }}>
                Consolidado de litros entrados de campo vs litros despachados a plantas.
              </p>
            </div>

            {/* KPIs Rápidos de Receptoría */}
            {(() => {
              const totalEntrado = ticketsReceptoria.reduce(
                (sum, t) => sum + Number(t.totalLitrosReceptoria || t.totalLitrosFinca || 0),
                0
              );
              const totalSalido = despachosSalidaReceptoria.reduce(
                (sum, d) => sum + Number(d.litrosDespachados || 0),
                0
              );
              const saldoLitros = totalEntrado - totalSalido;

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      padding: '12px 10px',
                      border: '1px solid #e2e8f0',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>ENTRADAS</div>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#3730a3', marginTop: '2px' }}>
                      {Math.round(totalEntrado).toLocaleString()} L
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      padding: '12px 10px',
                      border: '1px solid #e2e8f0',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>SALIDAS</div>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
                      {Math.round(totalSalido).toLocaleString()} L
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      padding: '12px 10px',
                      border: '1px solid #e2e8f0',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>DIFERENCIA</div>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: saldoLitros >= 0 ? '#15803d' : '#dc2626', marginTop: '2px' }}>
                      {Math.round(saldoLitros).toLocaleString()} L
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Lista Resumen de Movimientos */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0' }}>
                Movimientos de la Jornada
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  • {ticketsReceptoria.length} cisterna(s) en proceso de entrada
                </div>
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  • {despachosSalidaReceptoria.length} ticket(s) de salida emitidos
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: ADMIN EN VIVO (CISTERNAS EN RUTA)
           =================================================================== */}
        {tabActiva === 'admin_envivo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header En Vivo */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 25px rgba(30, 58, 138, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#22c55e',
                        boxShadow: '0 0 8px #22c55e',
                        display: 'inline-block',
                      }}
                    ></span>
                    <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.8px', color: '#60a5fa' }}>
                      RADAR OPERATIVO EN VIVO
                    </span>
                  </div>
                  <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 900 }}>
                    Control de Flota y Rutas
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={cargarDatosAdminEnVivo}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: '#ffffff',
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                  }}
                >
                  <i className={`fa-solid fa-rotate ${cargandoViajesEnVivo ? 'fa-spin' : ''}`}></i>
                </button>
              </div>

              {/* KPIs Rápidos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '16px' }}>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#38bdf8' }}>{viajesEnVivo.length}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>VIAJES HOY</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#4ade80' }}>
                    {viajesEnVivo.reduce((acc, v) => acc + (v.totalLitrosFinca || v.totalLitrosRecogidos || 0), 0).toLocaleString()} L
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>RECOLECTADOS</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#facc15' }}>
                    {viajesEnVivo.reduce((acc, v) => acc + (v.fincasDetalle?.length || (v as any).paradas?.length || (v as any).totalParadas || 0), 0)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>PARADAS</div>
                </div>
              </div>
            </div>

            {/* Lista de Camiones Cisterna En Ruta */}
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                Cisternas en Operación ({viajesEnVivo.length})
              </h4>

              {cargandoViajesEnVivo ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-spinner fa-spin mr-2"></i> Rastreador en vivo actualizándose...
                </div>
              ) : viajesEnVivo.length === 0 ? (
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '14px',
                    padding: '24px',
                    textAlign: 'center',
                    color: '#64748b',
                    border: '1px dashed #cbd5e1',
                  }}
                >
                  <i className="fa-solid fa-truck text-slate-400" style={{ fontSize: '32px', marginBottom: '8px', display: 'block' }}></i>
                  No hay rutas o cisternas registradas para la fecha de hoy ({hoyStr}).
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {viajesEnVivo.map((viaje) => {
                    const lts = viaje.totalLitrosFinca || viaje.totalLitrosRecogidos || 0;
                    const cap = viaje.capacidadCamionLitros || 6000;
                    const pct = Math.min(100, Math.round((lts / cap) * 100));

                    return (
                      <div
                        key={viaje.id}
                        style={{
                          background: '#ffffff',
                          borderRadius: '16px',
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 900, color: '#1e3a8a' }}>
                                Ticket {viaje.codigoTicket || `#${viaje.id}`}
                              </span>
                              <span
                                style={{
                                  background: viaje.estado === 'FINALIZADO' ? '#dcfce7' : '#e0f2fe',
                                  color: viaje.estado === 'FINALIZADO' ? '#16a34a' : '#0284c7',
                                  fontSize: '10px',
                                  fontWeight: 900,
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                }}
                              >
                                {viaje.estado || 'EN RUTA'}
                              </span>
                            </div>
                            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                              <i className="fa-solid fa-user mr-1 text-slate-400"></i> {viaje.nombreConductor || viaje.choferNombre || 'Chofer Asignado'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              <i className="fa-solid fa-truck mr-1"></i> {viaje.camionPlaca || 'S/P'} • Capacidad: {cap.toLocaleString()} L
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '17px', fontWeight: 900, color: '#0284c7' }}>
                              {lts.toLocaleString()} L
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>
                              {viaje.fincasDetalle?.length || (viaje as any).paradas?.length || (viaje as any).totalParadas || 0} Paradas
                            </div>
                          </div>
                        </div>

                        {/* Barra de Ocupación Cisterna */}
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px' }}>
                            <span>Ocupación Cisterna</span>
                            <span>{pct}%</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: pct > 90 ? '#ef4444' : pct > 60 ? '#3b82f6' : '#10b981',
                                borderRadius: '4px',
                                transition: 'width 0.4s ease',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: ADMIN LOGÍSTICA (GESTIÓN Y PLANIFICACIÓN DE RUTAS EN MÓVIL)
           =================================================================== */}
        {tabActiva === 'admin_logistica' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Cabecera Principal */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0369a1 0%, #0c4a6e 100%)',
                borderRadius: '18px',
                padding: '16px 18px',
                color: '#ffffff',
                boxShadow: '0 8px 24px rgba(3, 105, 161, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '10.5px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#bae6fd' }}>
                    Centro de Mando Logístico
                  </span>
                  <h3 style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: 900 }}>
                    Planificación & Circuitos
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => cargarDatosLogisticaAdmin(fechaLogistica)}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: '#ffffff',
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '15px',
                  }}
                >
                  <i className={`fa-solid fa-rotate ${cargandoPlanificaciones ? 'fa-spin' : ''}`}></i>
                </button>
              </div>

              {/* Selector de Fecha Operativa Rápido */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '12px',
                  background: 'rgba(0,0,0,0.25)',
                  padding: '5px 8px',
                  borderRadius: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => cambiarFechaLogistica(-1)}
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="fa-solid fa-chevron-left text-xs"></i>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-regular fa-calendar text-sky-300 text-sm"></i>
                  <input
                    type="date"
                    value={fechaLogistica}
                    onChange={(e) => {
                      setFechaLogistica(e.target.value);
                      cargarDatosLogisticaAdmin(e.target.value);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '13px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                  {fechaLogistica === hoyStr && (
                    <span style={{ fontSize: '9.5px', background: '#0284c7', color: '#ffffff', padding: '2px 6px', borderRadius: '6px', fontWeight: 900 }}>
                      HOY
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  {fechaLogistica !== hoyStr && (
                    <button
                      type="button"
                      onClick={() => {
                        setFechaLogistica(hoyStr);
                        cargarDatosLogisticaAdmin(hoyStr);
                      }}
                      style={{
                        background: '#0284c7',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '8px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Hoy
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cambiarFechaLogistica(1)}
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: '8px',
                      width: '32px',
                      height: '32px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className="fa-solid fa-chevron-right text-xs"></i>
                  </button>
                </div>
              </div>
            </div>

            {/* Selector de Sub-Vistas: Asignaciones vs Circuitos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSubTabLogistica('asignaciones')}
                style={{
                  background: subTabLogistica === 'asignaciones' ? '#0284c7' : '#ffffff',
                  color: subTabLogistica === 'asignaciones' ? '#ffffff' : '#475569',
                  border: subTabLogistica === 'asignaciones' ? 'none' : '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '10px 8px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: subTabLogistica === 'asignaciones' ? '0 4px 12px rgba(2, 132, 199, 0.25)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                <i className="fa-solid fa-truck"></i>
                Asignaciones ({planificaciones.length})
              </button>
              <button
                type="button"
                onClick={() => setSubTabLogistica('circuitos')}
                style={{
                  background: subTabLogistica === 'circuitos' ? '#0284c7' : '#ffffff',
                  color: subTabLogistica === 'circuitos' ? '#ffffff' : '#475569',
                  border: subTabLogistica === 'circuitos' ? 'none' : '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '10px 8px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: subTabLogistica === 'circuitos' ? '0 4px 12px rgba(2, 132, 199, 0.25)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                <i className="fa-solid fa-route"></i>
                Circuitos ({rutasLogisticas.length})
              </button>
            </div>

            {/* CONTENIDO 1: ASIGNACIONES DE LA JORNADA */}
            {subTabLogistica === 'asignaciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Botón Principal: Planificar Camión / Ruta */}
                <button
                  type="button"
                  onClick={() => {
                    setBusquedaFincaPlanificar('');
                    setModalPlanificar({
                      open: true,
                      esEdicion: false,
                      camionId: camionesLista.length > 0 ? camionesLista[0].id : 0,
                      conductorId: choferesLista.length > 0 ? choferesLista[0].id : 0,
                      rutaLogisticaId: undefined,
                      fincasIds: [],
                      observacion: '',
                    });
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    fontSize: '13.5px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                  }}
                >
                  <i className="fa-solid fa-plus-circle text-lg"></i>
                  Planificar Nuevo Camión / Ruta
                </button>

                {/* Lista de Planificaciones */}
                {cargandoPlanificaciones ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando planificaciones...
                  </div>
                ) : planificaciones.length === 0 ? (
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      padding: '24px',
                      textAlign: 'center',
                      color: '#64748b',
                      border: '1.5px dashed #cbd5e1',
                    }}
                  >
                    <i className="fa-solid fa-clipboard-list text-slate-300" style={{ fontSize: '36px', marginBottom: '8px', display: 'block' }}></i>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>Sin Asignaciones para esta fecha</div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: '#64748b' }}>
                      Toca el botón superior para asignar la primera cisterna y sus fincas.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {planificaciones.map((plan) => {
                      const fincaIds = getFincasIdsDePlan(plan);
                      const cantFincas = fincaIds.length;
                      const cap = plan.capacidadCamionLitros || 6000;
                      const ltsEst = plan.litrosEstimados || 0;
                      const pct = Math.min(100, Math.round((ltsEst / cap) * 100));

                      return (
                        <div
                          key={plan.id}
                          style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            padding: '16px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 3px 10px rgba(0,0,0,0.03)',
                          }}
                        >
                          {/* Cabecera de la tarjeta */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                                  🚛 {plan.camionPlaca || 'S/P'}
                                </span>
                                {plan.rutaLogisticaNombre && (
                                  <span style={{ fontSize: '10.5px', background: '#eff6ff', color: '#2563eb', padding: '2px 7px', borderRadius: '6px', fontWeight: 800 }}>
                                    {plan.rutaLogisticaNombre}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700, marginTop: '2px' }}>
                                <i className="fa-solid fa-user text-slate-400 mr-1"></i> {plan.conductorNombre || 'Chofer no asignado'}
                              </div>
                            </div>
                            <span
                              style={{
                                background: plan.estadoTicket === 'FINALIZADO' ? '#dcfce7' : plan.controlRutaId ? '#e0f2fe' : '#fef3c7',
                                color: plan.estadoTicket === 'FINALIZADO' ? '#16a34a' : plan.controlRutaId ? '#0284c7' : '#d97706',
                                fontSize: '10.5px',
                                fontWeight: 900,
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              {plan.estadoTicket || (plan.controlRutaId ? 'EN RUTA' : 'PLANIFICADO')}
                            </span>
                          </div>

                          {/* Estadísticas de la asignación */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, 1fr)',
                              gap: '6px',
                              marginTop: '12px',
                              background: '#f8fafc',
                              padding: '8px 10px',
                              borderRadius: '10px',
                              textAlign: 'center',
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 900, color: '#0284c7' }}>{cantFincas}</div>
                              <div style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 700 }}>FINCAS</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 900, color: '#16a34a' }}>{ltsEst.toLocaleString()} L</div>
                              <div style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 700 }}>ESTIMADO</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 900, color: pct > 90 ? '#dc2626' : '#2563eb' }}>{pct}%</div>
                              <div style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 700 }}>OCUPACIÓN</div>
                            </div>
                          </div>

                          {/* Barra de Progreso Ocupación */}
                          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: pct > 90 ? '#ef4444' : pct > 60 ? '#3b82f6' : '#10b981',
                                borderRadius: '3px',
                              }}
                            />
                          </div>

                          {/* Lista resumida de fincas asignadas */}
                          <div style={{ marginTop: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                              Fincas en Circuito ({cantFincas}):
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '72px', overflowY: 'auto' }}>
                              {fincaIds.slice(0, 8).map((fid) => {
                                const fObj = fincas.find((item) => item.id === fid);
                                return (
                                  <span
                                    key={fid}
                                    style={{
                                      background: '#f1f5f9',
                                      color: '#334155',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}
                                  >
                                    <i className="fa-solid fa-cow text-sky-500" style={{ fontSize: '8px' }}></i>
                                    {fObj?.nombre || `Finca #${fid}`}
                                  </span>
                                );
                              })}
                              {cantFincas > 8 && (
                                <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: 800, padding: '2px 4px' }}>
                                  +{cantFincas - 8} más...
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Botonera de Acciones en Móvil */}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setBusquedaFincaPlanificar('');
                                setModalPlanificar({
                                  open: true,
                                  esEdicion: true,
                                  id: plan.id,
                                  camionId: plan.camionId,
                                  conductorId: plan.conductorId,
                                  rutaLogisticaId: plan.rutaLogisticaId,
                                  fincasIds: fincaIds,
                                  observacion: plan.observacion || '',
                                });
                              }}
                              style={{
                                flex: 1,
                                background: '#f0f9ff',
                                color: '#0284c7',
                                border: '1px solid #bae6fd',
                                borderRadius: '10px',
                                padding: '8px 4px',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                              }}
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                              Editar / Asignar
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setModalAgregarFincaRapida({
                                  open: true,
                                  plan,
                                  fincaId: fincas.length > 0 ? fincas[0].id : 0,
                                });
                              }}
                              style={{
                                background: '#ecfdf5',
                                color: '#059669',
                                border: '1px solid #a7f3d0',
                                borderRadius: '10px',
                                padding: '8px 10px',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <i className="fa-solid fa-plus"></i>
                              + Finca
                            </button>

                            <button
                              type="button"
                              onClick={() => handleEliminarPlanificacionMovil(plan.id)}
                              style={{
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '10px',
                                padding: '8px 10px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
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
            )}

            {/* CONTENIDO 2: RUTAS & CIRCUITOS MAESTROS */}
            {subTabLogistica === 'circuitos' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setModalCircuito({
                      open: true,
                      esEdicion: false,
                      nombre: '',
                      codigo: '',
                      color: '#2563eb',
                      descripcion: '',
                    });
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    fontSize: '13.5px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)',
                  }}
                >
                  <i className="fa-solid fa-plus-circle text-lg"></i>
                  Crear Nuevo Circuito Logístico
                </button>

                {rutasLogisticas.length === 0 ? (
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      padding: '24px',
                      textAlign: 'center',
                      color: '#64748b',
                      border: '1.5px dashed #cbd5e1',
                    }}
                  >
                    <i className="fa-solid fa-route text-slate-300" style={{ fontSize: '36px', marginBottom: '8px', display: 'block' }}></i>
                    No hay circuitos maestros creados.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {rutasLogisticas.map((ruta) => {
                      const cantFincasCircuito = Array.isArray(ruta.fincas) ? ruta.fincas.length : ruta.totalFincas || 0;
                      return (
                        <div
                          key={ruta.id}
                          style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            padding: '14px 16px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: '#2563eb',
                                    display: 'inline-block',
                                  }}
                                ></span>
                                <span style={{ fontSize: '14.5px', fontWeight: 900, color: '#0f172a' }}>
                                  {ruta.nombre}
                                </span>
                                {ruta.codigo && (
                                  <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                    {ruta.codigo}
                                  </span>
                                )}
                              </div>
                              {ruta.descripcion && (
                                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                  {ruta.descripcion}
                                </div>
                              )}
                            </div>
                            <span
                              style={{
                                background: '#f0fdf4',
                                color: '#16a34a',
                                fontSize: '11px',
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              {cantFincasCircuito} Fincas
                            </span>
                          </div>

                          {/* Acciones Circuito */}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setBusquedaFincasCircuito('');
                                const fIds = Array.isArray(ruta.fincas) ? ruta.fincas.map((f) => f.fincaId) : [];
                                setModalAsignarFincasCircuito({
                                  open: true,
                                  rutaId: ruta.id,
                                  rutaNombre: ruta.nombre,
                                  fincasIds: fIds,
                                });
                              }}
                              style={{
                                flex: 1,
                                background: '#f0fdf4',
                                color: '#16a34a',
                                border: '1px solid #bbf7d0',
                                borderRadius: '10px',
                                padding: '8px',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                              }}
                            >
                              <i className="fa-solid fa-cow"></i>
                              Asignar Fincas
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setModalCircuito({
                                  open: true,
                                  esEdicion: true,
                                  id: ruta.id,
                                  nombre: ruta.nombre,
                                  codigo: ruta.codigo || '',
                                  color: '#2563eb',
                                  descripcion: ruta.descripcion || '',
                                });
                              }}
                              style={{
                                background: '#f8fafc',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                borderRadius: '10px',
                                padding: '8px 10px',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="fa-solid fa-pen"></i>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleEliminarCircuitoMovil(ruta.id)}
                              style={{
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '10px',
                                padding: '8px 10px',
                                fontSize: '12px',
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
            )}
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: TALLER FLOTA (ESTADO DE CAMIONES: ACTIVO / MANTENIMIENTO / INACTIVO)
           =================================================================== */}
        {tabActiva === 'taller_flota' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Taller Flota */}
            <div
              style={{
                background: 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 24px rgba(194, 65, 12, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#ffedd5' }}>
                    Gestión Taller Mecánico
                  </span>
                  <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 900 }}>
                    Flota de Camiones Cisterna
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={cargarDatosTaller}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: '#ffffff',
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                  }}
                >
                  <i className={`fa-solid fa-rotate ${cargandoCamionesTaller ? 'fa-spin' : ''}`}></i>
                </button>
              </div>

              {/* Contadores de Estado */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '14px' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#4ade80' }}>
                    {camionesTaller.filter((c) => (c.estado || 'ACTIVO').toUpperCase() === 'ACTIVO').length}
                  </div>
                  <div style={{ fontSize: '10px', color: '#fed7aa', fontWeight: 700 }}>APTOS (ACTIVO)</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#facc15' }}>
                    {camionesTaller.filter((c) => (c.estado || '').toUpperCase() === 'MANTENIMIENTO').length}
                  </div>
                  <div style={{ fontSize: '10px', color: '#fed7aa', fontWeight: 700 }}>EN TALLER</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#f87171' }}>
                    {camionesTaller.filter((c) => (c.estado || '').toUpperCase() === 'INACTIVO').length}
                  </div>
                  <div style={{ fontSize: '10px', color: '#fed7aa', fontWeight: 700 }}>NO APTOS</div>
                </div>
              </div>
            </div>

            {/* Buscador de Camión */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Buscar por placa, modelo o chofer..."
                value={busquedaFlota}
                onChange={(e) => setBusquedaFlota(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <i
                className="fa-solid fa-magnifying-glass"
                style={{ position: 'absolute', left: '13px', top: '13px', color: '#94a3b8', fontSize: '13px' }}
              ></i>
            </div>

            {/* Listado de Camiones */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {camionesTaller
                .filter((c) =>
                  !busquedaFlota ||
                  (c.placa || '').toLowerCase().includes(busquedaFlota.toLowerCase()) ||
                  (`${c.marca || ''} ${c.modelo || ''}`).toLowerCase().includes(busquedaFlota.toLowerCase())
                )
                .map((camion) => {
                  const est = (camion.estado || 'ACTIVO').toUpperCase();
                  const esActivo = est === 'ACTIVO';
                  const esMantenimiento = est === 'MANTENIMIENTO';
                  const esInactivo = est === 'INACTIVO';

                  return (
                    <div
                      key={camion.id}
                      style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                            🚛 {camion.placa}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {`${camion.marca || ''} ${camion.modelo || ''}`.trim() || 'Cisterna Láctea'} • Capacidad: {(camion.capacidadLitros || 6000).toLocaleString()} L
                          </div>
                        </div>
                        <span
                          style={{
                            background: esActivo ? '#dcfce7' : esMantenimiento ? '#fef3c7' : '#fee2e2',
                            color: esActivo ? '#16a34a' : esMantenimiento ? '#d97706' : '#dc2626',
                            fontSize: '11px',
                            fontWeight: 900,
                            padding: '4px 9px',
                            borderRadius: '8px',
                          }}
                        >
                          {esActivo ? '✓ ACTIVO' : esMantenimiento ? '🔧 EN TALLER' : '⛔ INACTIVO'}
                        </span>
                      </div>

                      {/* Botones de Cambio Rápido de Estado */}
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', marginBottom: '6px' }}>
                          CAMBIAR ESTADO OPERATIVO:
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleCambiarEstadoCamionTaller(camion.id, 'ACTIVO')}
                            style={{
                              background: esActivo ? '#16a34a' : '#f8fafc',
                              color: esActivo ? '#ffffff' : '#16a34a',
                              border: esActivo ? 'none' : '1px solid #bbf7d0',
                              borderRadius: '8px',
                              padding: '6px 4px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            ✓ Activo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarEstadoCamionTaller(camion.id, 'MANTENIMIENTO')}
                            style={{
                              background: esMantenimiento ? '#d97706' : '#f8fafc',
                              color: esMantenimiento ? '#ffffff' : '#d97706',
                              border: esMantenimiento ? 'none' : '1px solid #fde68a',
                              borderRadius: '8px',
                              padding: '6px 4px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            🔧 Taller
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarEstadoCamionTaller(camion.id, 'INACTIVO')}
                            style={{
                              background: esInactivo ? '#dc2626' : '#f8fafc',
                              color: esInactivo ? '#ffffff' : '#dc2626',
                              border: esInactivo ? 'none' : '1px solid #fecaca',
                              borderRadius: '8px',
                              padding: '6px 4px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            ⛔ Inactivo
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ===================================================================
            PESTAÑA: TALLER MANTENIMIENTO (AVERÍAS Y TAREAS MECÁNICAS)
           =================================================================== */}
        {tabActiva === 'taller_mantenimiento' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Taller Mantenimiento */}
            <div
              style={{
                background: 'linear-gradient(135deg, #ea580c 0%, #9a3412 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 24px rgba(234, 88, 12, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#ffedd5' }}>
                    Cola de Reparaciones
                  </span>
                  <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 900 }}>
                    Averías y Mantenimientos
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={cargarDatosTaller}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: '#ffffff',
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                  }}
                >
                  <i className={`fa-solid fa-rotate ${cargandoIncidentesTaller ? 'fa-spin' : ''}`}></i>
                </button>
              </div>

              {/* Pestañas de Filtro */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '14px', overflowX: 'auto', paddingBottom: '4px' }}>
                {['TODOS', 'PENDIENTE', 'EN REVISION', 'REPARADO'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltroIncidenteTaller(f)}
                    style={{
                      background: filtroIncidenteTaller === f ? '#ffffff' : 'rgba(255,255,255,0.15)',
                      color: filtroIncidenteTaller === f ? '#9a3412' : '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '5px 12px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de Incidentes Mecánicos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {incidentesTaller
                .filter((i) => {
                  if (filtroIncidenteTaller === 'TODOS') return true;
                  return (i.estado || 'PENDIENTE').toUpperCase() === filtroIncidenteTaller;
                })
                .map((inc) => {
                  const est = (inc.estado || 'PENDIENTE').toUpperCase();
                  const esPend = est === 'PENDIENTE';
                  const esRev = est === 'EN REVISION' || est === 'EN PROCESO';
                  const esRep = est === 'REPARADO' || est === 'FINALIZADO';

                  return (
                    <div
                      key={inc.id}
                      style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                            {inc.titulo}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            <i className="fa-solid fa-truck mr-1"></i> Camión: <strong>{inc.camionPlaca || 'Sin Placa'}</strong> • {inc.fechaEvento ? new Date(inc.fechaEvento).toLocaleDateString() : 'Hoy'}
                          </div>
                        </div>
                        <span
                          style={{
                            background: esRep ? '#dcfce7' : esRev ? '#dbeafe' : '#ffedd5',
                            color: esRep ? '#16a34a' : esRev ? '#2563eb' : '#ea580c',
                            fontSize: '10.5px',
                            fontWeight: 900,
                            padding: '3px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          {est}
                        </span>
                      </div>

                      {inc.descripcion && (
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '8px', background: '#f8fafc', padding: '8px 10px', borderRadius: '8px' }}>
                          {inc.descripcion}
                        </div>
                      )}

                      {inc.solucionAplicada && (
                        <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: '6px', fontWeight: 600 }}>
                          ✓ Solución: {inc.solucionAplicada} {inc.costoTotalUSD ? `($${inc.costoTotalUSD})` : ''}
                        </div>
                      )}

                      {/* Acciones del Mecánico */}
                      {!esRep && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                          {esPend && (
                            <button
                              type="button"
                              onClick={() => handleAtenderIncidenteTaller(inc.id, 'EN REVISION')}
                              style={{
                                flex: 1,
                                background: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                borderRadius: '8px',
                                padding: '8px',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              ⚙️ Poner En Revisión
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setModalReparacion({ open: true, incidenteId: inc.id, titulo: inc.titulo });
                              setFormReparacion({ solucion: '', costo: '' });
                            }}
                            style={{
                              flex: 1,
                              background: '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            ✓ Marcar como Reparado
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </main>

      {/* BARRA DE NAVEGACIÓN INFERIOR MÓVIL ESTILO NATIVO DINÁMICA SEGÚN MODO */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '68px',
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(226, 232, 240, 0.8)',
          display: 'grid',
          gridTemplateColumns: `repeat(${tabsNavegacion.length}, 1fr)`,
          alignItems: 'center',
          zIndex: 1000,
          boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.06)',
          padding: '0 8px env(safe-area-inset-bottom, 0px) 8px',
        }}
      >
        {tabsNavegacion.map((item) => {
          const isActiva = tabActiva === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTabActiva(item.key)}
              style={{
                background: isActiva ? item.bg : 'transparent',
                border: 'none',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                color: isActiva ? item.color : '#64748b',
                cursor: 'pointer',
                padding: '6px 2px',
                position: 'relative',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isActiva ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              <i className={`fa-solid ${item.icon}`} style={{ fontSize: '18px' }}></i>
              <span style={{ fontSize: '10.5px', fontWeight: isActiva ? 900 : 600, letterSpacing: '-0.2px' }}>
                {item.label}
              </span>
              {item.badge && item.badge > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '12px',
                    minWidth: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: item.key === 'recoleccion' ? '#f59e0b' : '#ef4444',
                    boxShadow: '0 0 0 2px #ffffff',
                  }}
                ></span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* MODAL REPARACIÓN TALLER */}
      {modalReparacion?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#ffffff',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                Concluir Reparación
              </h3>
              <button
                type="button"
                onClick={() => setModalReparacion(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748b' }}>
              Avería: <strong>{modalReparacion.titulo}</strong>
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAtenderIncidenteTaller(
                  modalReparacion.incidenteId,
                  'REPARADO',
                  formReparacion.solucion,
                  formReparacion.costo ? Number(formReparacion.costo) : undefined
                );
                setModalReparacion(null);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Solución Aplicada / Trabajo Realizado *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ej: Se cambió empacadura de motor y filtro de aceite..."
                  value={formReparacion.solucion}
                  onChange={(e) => setFormReparacion((prev) => ({ ...prev, solucion: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Costo Total Repuestos/Mano de obra (USD opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej: 45.00"
                  value={formReparacion.costo}
                  onChange={(e) => setFormReparacion((prev) => ({ ...prev, costo: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setModalReparacion(null)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#64748b',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Guardar Reparación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR CARGA EN FINCA */}
      {modalRegistro && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#ffffff',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
              padding: '24px 20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#ecfdf5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                  }}
                >
                  <i className="fa-solid fa-faucet-drip"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    Nueva Carga en Finca
                  </h3>
                  <p style={{ margin: '1px 0 0 0', fontSize: '11.5px', color: '#64748b' }}>
                    Registro rápido offline
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalRegistro(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '34px',
                  height: '34px',
                  fontSize: '20px',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGuardarCarga}>
              {/* Finca con buscador integrado */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>
                  Finca Productora <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="🔍 Buscar finca por nombre..."
                  value={busquedaFinca}
                  onChange={(e) => setBusquedaFinca(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    padding: '0 12px',
                    fontSize: '13px',
                    marginBottom: '8px',
                    outline: 'none',
                  }}
                />
                <select
                  value={formCarga.fincaId}
                  onChange={(e) => setFormCarga({ ...formCarga, fincaId: Number(e.target.value) })}
                  required
                  style={{
                    width: '100%',
                    height: '46px',
                    borderRadius: '10px',
                    border: '1.5px solid #0284c7',
                    background: '#f0f9ff',
                    padding: '0 12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0369a1',
                    outline: 'none',
                  }}
                >
                  <option value={0}>-- Selecciona la Finca ({fincasFiltradas.length}) --</option>
                  {fincasFiltradas.map((f) => {
                    const enRuta = f.rutaId && rutasActivasIds.includes(f.rutaId);
                    return (
                      <option key={f.id} value={f.id}>
                        {enRuta ? '⭐ [En Ruta] ' : ''}{f.nombre} {f.codigo ? `(${f.codigo})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Fecha de Recolección: si hay un ticket activo asignado, se toma automáticamente su fecha y no se muestra el selector manual */}
              {viajeActivo ? (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '10px',
                    padding: '9px 12px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-ticket text-emerald-600"></i>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#166534' }}>
                      Ticket #{viajeActivo.codigoTicket || viajeActivo.id}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    📅 {new Date(viajeActivo.fecha).toLocaleDateString('es-VE')}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>
                    📅 Fecha de Recolección
                  </label>
                  <input
                    type="date"
                    value={formCarga.fecha || hoyStr}
                    onChange={(e) => setFormCarga({ ...formCarga, fecha: e.target.value })}
                    style={{
                      width: '100%',
                      height: '44px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      padding: '0 12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#0f172a',
                      background: '#f8fafc',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {/* Litros Entrada Táctil */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>
                  Litros Recolectados <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={formCarga.litros}
                    onChange={(e) => setFormCarga({ ...formCarga, litros: e.target.value })}
                    placeholder="0"
                    required
                    style={{
                      width: '100%',
                      height: '56px',
                      borderRadius: '12px',
                      border: '2px solid #3b82f6',
                      padding: '0 60px 0 16px',
                      fontSize: '24px',
                      fontWeight: 900,
                      color: '#1e3a8a',
                      background: '#f8fafc',
                      outline: 'none',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: '16px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#64748b',
                    }}
                  >
                    Litros
                  </span>
                </div>
                {/* Botones de incremento rápido táctil */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {[50, 100, 200, 500, 1000].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => sumarLitros(inc)}
                      style={{
                        flex: 1,
                        minWidth: '55px',
                        padding: '6px 2px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      +{inc}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormCarga((p) => ({ ...p, litros: '' }))}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      background: '#f1f5f9',
                      color: '#64748b',
                      border: '1px solid #cbd5e1',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </div>

              {/* Tipo de Leche */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>
                  Tipo de Leche
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setFormCarga({ ...formCarga, tipoLeche: 'VACA' })}
                    style={{
                      height: '42px',
                      borderRadius: '10px',
                      border: formCarga.tipoLeche === 'VACA' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: formCarga.tipoLeche === 'VACA' ? '#eff6ff' : '#ffffff',
                      color: formCarga.tipoLeche === 'VACA' ? '#1d4ed8' : '#64748b',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    🥛 Vaca (Estándar)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormCarga({ ...formCarga, tipoLeche: 'BUFALA' })}
                    style={{
                      height: '42px',
                      borderRadius: '10px',
                      border: formCarga.tipoLeche === 'BUFALA' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                      background: formCarga.tipoLeche === 'BUFALA' ? '#fff7ed' : '#ffffff',
                      color: formCarga.tipoLeche === 'BUFALA' ? '#c2410c' : '#64748b',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    🐃 Búfala
                  </button>
                </div>
              </div>

              {/* Calidad y Temperatura */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    Temperatura (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej. 4.5"
                    value={formCarga.temperatura}
                    onChange={(e) => setFormCarga({ ...formCarga, temperatura: e.target.value })}
                    style={{ width: '100%', height: '40px', borderRadius: '8px', border: '1.5px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    Calidad / Estado
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '40px',
                      padding: '0 8px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formCarga.esAcida}
                      onChange={(e) => setFormCarga({ ...formCarga, esAcida: e.target.checked })}
                    />
                    <span style={{ color: formCarga.esAcida ? '#dc2626' : '#64748b', fontWeight: 700 }}>
                      ⚠️ Leche Ácida
                    </span>
                  </label>
                </div>
              </div>

              {/* Foto del Comprobante / Recibo de Finca */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>
                  <span><i className="fa-solid fa-camera" style={{ color: '#2563eb', marginRight: '6px' }}></i> Foto del Recibo en Finca</span>
                  {formCarga.fotoRecibo ? (
                    <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>
                      <i className="fa-solid fa-check"></i> Foto adjunta
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Opcional</span>
                  )}
                </label>

                <input
                  ref={inputFotoReciboRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleSubirFotoReciboMovil}
                />

                {formCarga.fotoRecibo ? (
                  <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid #93c5fd', background: '#000' }}>
                    <img
                      src={formCarga.fotoRecibo}
                      alt="Comprobante Finca"
                      style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={() => setFormCarga((prev) => ({ ...prev, fotoRecibo: '' }))}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      }}
                      title="Quitar foto"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputFotoReciboRef.current?.click()}
                    style={{
                      width: '100%',
                      height: '46px',
                      borderRadius: '10px',
                      border: '1.5px dashed #93c5fd',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: '13px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fa-solid fa-camera"></i>
                    <span>Tomar Foto / Subir Recibo</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setModalRegistro(false)}
                  style={{
                    flex: 1,
                    height: '48px',
                    borderRadius: '12px',
                    background: '#f1f5f9',
                    border: 'none',
                    color: '#64748b',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 2,
                    height: '48px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '15px',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
                    cursor: 'pointer',
                  }}
                >
                  Guardar Carga
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PLANIFICAR / EDITAR RUTA CHOFER */}
      {modalPlanificar?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#ffffff',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            {/* Header del Modal */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
              }}
            >
              <div>
                <span style={{ fontSize: '10.5px', fontWeight: 900, color: '#0284c7', textTransform: 'uppercase' }}>
                  Fecha: {fechaLogistica}
                </span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                  {modalPlanificar.esEdicion ? 'Editar Asignación de Ruta' : 'Planificar Nuevo Camión / Ruta'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalPlanificar(null)}
                style={{
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                  fontSize: '14px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Cuerpo con Scroll */}
            <form onSubmit={handleGuardarPlanificacionMovil} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Selector de Camión */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                    1. Cisterna / Camión *
                  </label>
                  <select
                    value={modalPlanificar.camionId}
                    onChange={(e) => setModalPlanificar((prev) => prev ? { ...prev, camionId: Number(e.target.value) } : null)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      background: '#ffffff',
                      fontWeight: 700,
                    }}
                  >
                    <option value={0}>-- Selecciona Camión --</option>
                    {camionesLista.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.placa} • {c.marca} {c.modelo} ({c.capacidadLitros.toLocaleString()} L)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selector de Chofer */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                    2. Chofer / Conductor *
                  </label>
                  <select
                    value={modalPlanificar.conductorId}
                    onChange={(e) => setModalPlanificar((prev) => prev ? { ...prev, conductorId: Number(e.target.value) } : null)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      background: '#ffffff',
                      fontWeight: 700,
                    }}
                  >
                    <option value={0}>-- Selecciona Chofer --</option>
                    {choferesLista.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.nombreCompleto} {ch.cedula ? `(C.I. ${ch.cedula})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selector de Circuito Maestro (Opcional) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                      3. Circuito Base (Opcional)
                    </label>
                    {modalPlanificar.rutaLogisticaId && (
                      <button
                        type="button"
                        onClick={() => {
                          const rSel = rutasLogisticas.find((r) => r.id === modalPlanificar.rutaLogisticaId);
                          if (rSel && Array.isArray(rSel.fincas)) {
                            const ids = rSel.fincas.map((f) => f.fincaId);
                            setModalPlanificar((prev) =>
                              prev ? { ...prev, fincasIds: Array.from(new Set([...prev.fincasIds, ...ids])) } : null
                            );
                            toast.success(`Cargadas ${ids.length} fincas del circuito`);
                          }
                        }}
                        style={{
                          background: '#f0f9ff',
                          color: '#0284c7',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: '6px',
                        }}
                      >
                        ⚡ Cargar Fincas
                      </button>
                    )}
                  </div>
                  <select
                    value={modalPlanificar.rutaLogisticaId || 0}
                    onChange={(e) => {
                      const rId = Number(e.target.value) || undefined;
                      setModalPlanificar((prev) => (prev ? { ...prev, rutaLogisticaId: rId } : null));
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      background: '#ffffff',
                    }}
                  >
                    <option value={0}>-- Sin circuito predeterminado --</option>
                    {rutasLogisticas.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre} {r.codigo ? `(${r.codigo})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Buscador & Selección de Fincas */}
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                      4. Fincas Asignadas ({modalPlanificar.fincasIds.length}) *
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const visIds = fincas
                            .filter(
                              (f) =>
                                !busquedaFincaPlanificar.trim() ||
                                f.nombre.toLowerCase().includes(busquedaFincaPlanificar.toLowerCase()) ||
                                (f.codigo && f.codigo.toLowerCase().includes(busquedaFincaPlanificar.toLowerCase()))
                            )
                            .map((f) => f.id);
                          setModalPlanificar((prev) =>
                            prev ? { ...prev, fincasIds: Array.from(new Set([...prev.fincasIds, ...visIds])) } : null
                          );
                        }}
                        style={{
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 800,
                          borderRadius: '6px',
                          padding: '3px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        Visibles
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const planActual = planificaciones.find((p) => p.id === modalPlanificar.id);
                          const controlAsociado = planActual?.controlRutaId
                            ? viajesEnVivo.find((v) => v.id === planActual.controlRutaId)
                            : viajesEnVivo.find((v) => v.camionId === modalPlanificar.camionId);
                          const paradasConLeche = (controlAsociado as any)?.paradas || [];
                          const fincasLlenasIds = modalPlanificar.esEdicion
                            ? paradasConLeche
                                .filter((p: any) => Number(p.litros || p.litrosCargados || 0) > 0)
                                .map((p: any) => Number(p.fincaId || p.FincaId))
                            : [];
                          setModalPlanificar((prev) => (prev ? { ...prev, fincasIds: fincasLlenasIds } : null));
                          if (fincasLlenasIds.length > 0) {
                            toast.info(`Se mantuvieron ${fincasLlenasIds.length} fincas con leche ya recolectada.`);
                          }
                        }}
                        style={{
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 800,
                          borderRadius: '6px',
                          padding: '3px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        Limpiar Vacías
                      </button>
                    </div>
                  </div>

                  {/* Input Búsqueda */}
                  <div style={{ position: 'relative', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="Buscar finca por nombre o código..."
                      value={busquedaFincaPlanificar}
                      onChange={(e) => setBusquedaFincaPlanificar(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 34px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '12.5px',
                        outline: 'none',
                      }}
                    />
                    <i
                      className="fa-solid fa-magnifying-glass"
                      style={{ position: 'absolute', left: '11px', top: '11px', color: '#94a3b8', fontSize: '12px' }}
                    ></i>
                  </div>

                  {/* Lista de Fincas con Checkboxes */}
                  <div
                    style={{
                      maxHeight: '190px',
                      overflowY: 'auto',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      background: '#f8fafc',
                    }}
                  >
                    {(() => {
                      const planActual = planificaciones.find((p) => p.id === modalPlanificar.id);
                      const controlAsociado = planActual?.controlRutaId
                        ? viajesEnVivo.find((v) => v.id === planActual.controlRutaId)
                        : viajesEnVivo.find((v) => v.camionId === modalPlanificar.camionId);
                      const paradasConLeche = (controlAsociado as any)?.paradas || [];

                      return fincas
                        .filter(
                          (f) =>
                            !busquedaFincaPlanificar.trim() ||
                            f.nombre.toLowerCase().includes(busquedaFincaPlanificar.toLowerCase()) ||
                            (f.codigo && f.codigo.toLowerCase().includes(busquedaFincaPlanificar.toLowerCase()))
                        )
                        .map((f) => {
                          const seleccionada = modalPlanificar.fincasIds.includes(f.id);
                          const promedio = fincasPromedio.find((p) => p.fincaId === f.id)?.promedioLitros;

                          // REGLA: Si la finca ya tiene leche recolectada (litros > 0), está LLENA y NO se puede desasignar ni cambiar
                          const paradaReal = paradasConLeche.find(
                            (p: any) =>
                              (p.fincaId === f.id || p.FincaId === f.id) &&
                              Number(p.litros || p.litrosCargados || 0) > 0
                          );
                          const estaLlena = Boolean(paradaReal && modalPlanificar.esEdicion);
                          const ltsRecolectados = paradaReal
                            ? Number((paradaReal as any).litros || (paradaReal as any).litrosCargados || 0)
                            : 0;

                          return (
                            <div
                              key={f.id}
                              onClick={() => {
                                if (estaLlena) {
                                  toast.warning(
                                    `La finca "${f.nombre}" ya tiene ${ltsRecolectados} L recolectados en ruta. No se puede modificar ni desasignar.`
                                  );
                                  return;
                                }
                                setModalPlanificar((prev) => {
                                  if (!prev) return null;
                                  const exists = prev.fincasIds.includes(f.id);
                                  return {
                                    ...prev,
                                    fincasIds: exists
                                      ? prev.fincasIds.filter((id) => id !== f.id)
                                      : [...prev.fincasIds, f.id],
                                  };
                                });
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                background: estaLlena ? '#f0fdf4' : seleccionada ? '#eff6ff' : '#ffffff',
                                border: estaLlena
                                  ? '1.5px solid #86efac'
                                  : seleccionada
                                  ? '1px solid #bfdbfe'
                                  : '1px solid #f1f5f9',
                                cursor: estaLlena ? 'not-allowed' : 'pointer',
                                opacity: estaLlena ? 0.92 : 1,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={seleccionada || estaLlena}
                                  disabled={estaLlena}
                                  onChange={() => {}}
                                  style={{
                                    width: '16px',
                                    height: '16px',
                                    accentColor: estaLlena ? '#16a34a' : '#2563eb',
                                  }}
                                />
                                <div>
                                  <div
                                    style={{
                                      fontSize: '12.5px',
                                      fontWeight: 800,
                                      color: estaLlena ? '#15803d' : seleccionada ? '#1e40af' : '#1e293b',
                                    }}
                                  >
                                    {f.nombre}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#64748b' }}>
                                    {f.codigo ? `${f.codigo} • ` : ''}
                                    {f.propietarioNombre || 'Productor'}
                                  </div>
                                </div>
                              </div>
                              {estaLlena ? (
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    fontWeight: 900,
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    border: '1px solid #bbf7d0',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                  title="Finca con leche recogida en ruta: no modificable"
                                >
                                  <i className="fa-solid fa-lock text-green-600"></i>
                                  <span>{ltsRecolectados} L Recogidos</span>
                                </span>
                              ) : promedio !== undefined ? (
                                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#0284c7' }}>
                                  ~{Math.round(promedio)} L
                                </span>
                              ) : null}
                            </div>
                          );
                        });
                    })()}
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Instrucciones / Observación (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Empezar por el sector norte, llevar envases..."
                    value={modalPlanificar.observacion}
                    onChange={(e) => setModalPlanificar((prev) => prev ? { ...prev, observacion: e.target.value } : null)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '12.5px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Barra Inferior Fija de Guardar */}
              {(() => {
                const camSel = camionesLista.find((c) => c.id === modalPlanificar.camionId);
                const capLitros = camSel?.capacidadLitros || 6000;
                const estTotal = modalPlanificar.fincasIds.reduce((acc, fid) => {
                  const p = fincasPromedio.find((fp) => fp.fincaId === fid);
                  return acc + (p?.promedioLitros || 0);
                }, 0);
                const ocupacion = Math.min(100, Math.round((estTotal / capLitros) * 100));

                return (
                  <div
                    style={{
                      padding: '12px 20px',
                      background: '#ffffff',
                      borderTop: '1px solid #e2e8f0',
                      boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                        {modalPlanificar.fincasIds.length} fincas • ~{Math.round(estTotal).toLocaleString()} L
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 900, color: ocupacion > 90 ? '#dc2626' : '#0284c7' }}>
                        {ocupacion}% de capacidad cisterna
                      </div>
                    </div>
                    <button
                      type="submit"
                      style={{
                        background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '12px 20px',
                        fontSize: '13px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                      }}
                    >
                      Guardar Asignación
                    </button>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* MODAL RÁPIDO: AGREGAR FINCA A RUTA ACTIVA */}
      {modalAgregarFincaRapida?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#ffffff',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                + Agregar Finca a la Ruta
              </h3>
              <button
                type="button"
                onClick={() => setModalAgregarFincaRapida(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748b' }}>
              Camión: <strong>{modalAgregarFincaRapida.plan.camionPlaca}</strong> • Chofer: <strong>{modalAgregarFincaRapida.plan.conductorNombre}</strong>
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Selecciona la finca a incorporar:
              </label>
              <select
                value={modalAgregarFincaRapida.fincaId}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setModalAgregarFincaRapida((prev) => (prev ? { ...prev, fincaId: val } : null));
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  background: '#ffffff',
                }}
              >
                {fincas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre} ({f.propietarioNombre || 'Productor'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setModalAgregarFincaRapida(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleAgregarFincaRapidaMovil(modalAgregarFincaRapida.plan, modalAgregarFincaRapida.fincaId)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Añadir a la Ruta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR CIRCUITO LOGÍSTICO */}
      {modalCircuito?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#ffffff',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                {modalCircuito.esEdicion ? 'Editar Circuito Logístico' : 'Nuevo Circuito Logístico'}
              </h3>
              <button
                type="button"
                onClick={() => setModalCircuito(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarCircuitoMovil} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Nombre del Circuito / Ruta *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Ruta 1 - Sur, Circuito Carora..."
                  value={modalCircuito.nombre}
                  onChange={(e) => setModalCircuito((prev) => prev ? { ...prev, nombre: e.target.value } : null)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Código o Abreviatura
                </label>
                <input
                  type="text"
                  placeholder="Ej: RUTA-01"
                  value={modalCircuito.codigo}
                  onChange={(e) => setModalCircuito((prev) => prev ? { ...prev, codigo: e.target.value } : null)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Descripción o Zonas
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Comprende fincas de la zona baja..."
                  value={modalCircuito.descripcion}
                  onChange={(e) => setModalCircuito((prev) => prev ? { ...prev, descripcion: e.target.value } : null)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setModalCircuito(null)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#64748b',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#0d9488',
                    color: '#ffffff',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Guardar Circuito
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ASIGNAR FINCAS A CIRCUITO MAESTRO */}
      {modalAsignarFincasCircuito?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#ffffff',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
              }}
            >
              <div>
                <span style={{ fontSize: '10.5px', fontWeight: 900, color: '#16a34a', textTransform: 'uppercase' }}>
                  Circuito Maestro
                </span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                  Fincas de: {modalAsignarFincasCircuito.rutaNombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAsignarFincasCircuito(null)}
                style={{
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                  fontSize: '14px',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Buscar finca..."
                  value={busquedaFincasCircuito}
                  onChange={(e) => setBusquedaFincasCircuito(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 34px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '12.5px',
                    outline: 'none',
                  }}
                />
                <i
                  className="fa-solid fa-magnifying-glass"
                  style={{ position: 'absolute', left: '11px', top: '11px', color: '#94a3b8', fontSize: '12px' }}
                ></i>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#64748b' }}>
                <span>Seleccionadas: {modalAsignarFincasCircuito.fincasIds.length}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const visIds = fincas
                        .filter(
                          (f) =>
                            !busquedaFincasCircuito.trim() ||
                            f.nombre.toLowerCase().includes(busquedaFincasCircuito.toLowerCase())
                        )
                        .map((f) => f.id);
                      setModalAsignarFincasCircuito((prev) =>
                        prev ? { ...prev, fincasIds: Array.from(new Set([...prev.fincasIds, ...visIds])) } : null
                      );
                    }}
                    style={{ background: '#f0fdf4', color: '#16a34a', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Marcar Visibles
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalAsignarFincasCircuito((prev) => (prev ? { ...prev, fincasIds: [] } : null))}
                    style={{ background: '#fef2f2', color: '#dc2626', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              <div
                style={{
                  maxHeight: '340px',
                  overflowY: 'auto',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {fincas
                  .filter(
                    (f) =>
                      !busquedaFincasCircuito.trim() ||
                      f.nombre.toLowerCase().includes(busquedaFincasCircuito.toLowerCase())
                  )
                  .map((f) => {
                    const sel = modalAsignarFincasCircuito.fincasIds.includes(f.id);
                    return (
                      <div
                        key={f.id}
                        onClick={() => {
                          setModalAsignarFincasCircuito((prev) => {
                            if (!prev) return null;
                            const exists = prev.fincasIds.includes(f.id);
                            return {
                              ...prev,
                              fincasIds: exists
                                ? prev.fincasIds.filter((id) => id !== f.id)
                                : [...prev.fincasIds, f.id],
                            };
                          });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: sel ? '#f0fdf4' : '#ffffff',
                          border: sel ? '1px solid #bbf7d0' : '1px solid #f1f5f9',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => {}}
                            style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                          />
                          <div>
                            <div style={{ fontSize: '12.5px', fontWeight: 800, color: sel ? '#166534' : '#1e293b' }}>
                              {f.nombre}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                              {f.codigo ? `${f.codigo} • ` : ''}{f.propietarioNombre || 'Productor'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                gap: '8px',
                background: '#ffffff',
              }}
            >
              <button
                type="button"
                onClick={() => setModalAsignarFincasCircuito(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarFincasDeCircuitoMovil}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Guardar Asignación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE NOTIFICACIONES Y ASIGNACIONES (PUSH) */}
      {modalNotificaciones && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#ffffff',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
              padding: '22px 20px',
            }}
          >
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '17px',
                  }}
                >
                  <i className="fa-solid fa-bell"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    Centro de Notificaciones
                  </h3>
                  <p style={{ margin: '1px 0 0 0', fontSize: '11.5px', color: '#64748b' }}>
                    {noLeidasCount > 0 ? `${noLeidasCount} mensaje(s) sin leer` : 'Al día, no hay alertas nuevas'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {noLeidasCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarcarTodasLeidas}
                    title="Marcar todas como leídas"
                    style={{
                      background: '#f1f5f9',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    Marcar leídas
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModalNotificaciones(false)}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '50%',
                    width: '34px',
                    height: '34px',
                    fontSize: '20px',
                    color: '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Listado de Notificaciones */}
            {notificaciones.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <i className="fa-solid fa-bell-slash" style={{ fontSize: '36px', marginBottom: '12px', color: '#cbd5e1' }}></i>
                <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>No tienes notificaciones recibidas</p>
                <p style={{ fontSize: '12px', margin: '4px 0 0 0' }}>Las rutas planificadas y salidas asignadas aparecerán aquí.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {notificaciones.map((notif) => {
                  const esRuta = notif.tipo === 'RUTA_ASIGNADA';
                  const esSalida = notif.tipo === 'SALIDA_COMPANIA';

                  const badgeBg = esRuta ? '#dcfce7' : esSalida ? '#f3e8ff' : '#e0f2fe';
                  const badgeColor = esRuta ? '#15803d' : esSalida ? '#7e22ce' : '#0369a1';
                  const badgeIcon = esRuta ? 'fa-route' : esSalida ? 'fa-industry' : 'fa-bell';
                  const badgeLabel = esRuta ? 'RUTA ASIGNADA' : esSalida ? 'SALIDA A COMPAÑÍA' : 'AVISO';

                  return (
                    <div
                      key={notif.id}
                      style={{
                        background: notif.leido ? '#ffffff' : '#f8fafc',
                        border: notif.leido ? '1px solid #e2e8f0' : '1.5px solid #38bdf8',
                        borderRadius: '14px',
                        padding: '14px',
                        boxShadow: notif.leido ? 'none' : '0 4px 12px rgba(56, 189, 248, 0.15)',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                        <span
                          style={{
                            background: badgeBg,
                            color: badgeColor,
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            letterSpacing: '0.4px',
                          }}
                        >
                          <i className={`fa-solid ${badgeIcon}`}></i>
                          {badgeLabel}
                        </span>
                        <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                          {notif.createdAt ? new Date(notif.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      <h4 style={{ margin: '0 0 4px 0', fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                        {notif.titulo}
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: '1.45', whiteSpace: 'pre-line' }}>
                        {notif.mensaje}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                        {esRuta && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!notif.leido) handleMarcarLeida(notif.id);
                              setModalNotificaciones(false);
                              setTabActiva('recoleccion');
                            }}
                            style={{
                              background: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '5px 12px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span>Ir a Recolección</span>
                            <i className="fa-solid fa-arrow-right"></i>
                          </button>
                        )}
                        {esSalida && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!notif.leido) handleMarcarLeida(notif.id);
                              setModalNotificaciones(false);
                              setTabActiva('entregas');
                            }}
                            style={{
                              background: '#9333ea',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '5px 12px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span>Ver en Entregas</span>
                            <i className="fa-solid fa-arrow-right"></i>
                          </button>
                        )}
                        {!esRuta && !esSalida && <div />}

                        {!notif.leido && (
                          <button
                            type="button"
                            onClick={() => handleMarcarLeida(notif.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#0284c7',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Marcar leída
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {/* MODAL VER COMPROBANTE / FOTO RECIBO EN MÓVIL */}
      {fotoReciboVerModal && (
        <div
          onClick={() => setFotoReciboVerModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.9)',
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '480px',
              background: '#0f172a',
              borderRadius: '16px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', color: '#ffffff' }}>
              <span style={{ fontWeight: 800, fontSize: '13px' }}>
                <i className="fa-solid fa-receipt mr-2" style={{ color: '#38bdf8' }}></i> Recibo / Comprobante
              </span>
              <button
                type="button"
                onClick={() => setFotoReciboVerModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div style={{ padding: '8px', background: '#020617', display: 'flex', justifyContent: 'center' }}>
              <img
                src={fotoReciboVerModal}
                alt="Comprobante Finca"
                style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
          </div>
        </div>
      )}
      {/* ===================================================================
          MODAL 1 RECEPTORÍA: VERIFICAR LITROS Y CONCILIAR
         =================================================================== */}
      {modalVerificarLitros?.open && modalVerificarLitros.ticket && (() => {
        const ltsChofer = Number(
          (modalVerificarLitros.ticket as any).totalLitrosFinca ||
            (modalVerificarLitros.ticket as any).litrosCargadosTotal ||
            0
        );
        const ltsRecibidosNum = Number(modalVerificarLitros.litrosRecibidos) || 0;
        const merma = ltsRecibidosNum > 0 ? ltsRecibidosNum - ltsChofer : 0;
        const nombreCond =
          (modalVerificarLitros.ticket as any).conductorNombre ||
          (modalVerificarLitros.ticket as any).choferNombre ||
          'Chofer';

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(5px)',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '540px',
                background: '#ffffff',
                borderTopLeftRadius: '24px',
                borderTopRightRadius: '24px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'linear-gradient(135deg, #3730a3, #1e1b4b)',
                  color: '#ffffff',
                  borderTopLeftRadius: '24px',
                  borderTopRightRadius: '24px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 900 }}>
                    ⚖️ Verificar Litros en Receptoría
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#c7d2fe', marginTop: '2px' }}>
                    Ticket #{modalVerificarLitros.ticket.codigoTicket || modalVerificarLitros.ticket.id} • {nombreCond}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalVerificarLitros(null)}
                  style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '20px', cursor: 'pointer' }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              {/* Formulario */}
              <form onSubmit={handleConfirmarVerificarLitros} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Comparativo Visual */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>LITROS CHOFER (CAMPO)</div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563eb', marginTop: '2px' }}>
                      {ltsChofer.toLocaleString()} L
                    </div>
                  </div>
                  <div style={{ background: '#eef2ff', padding: '12px', borderRadius: '12px', border: '1px solid #c7d2fe', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#4338ca', fontWeight: 800 }}>MERMA / DIFERENCIA</div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 900,
                        color: merma < 0 ? '#dc2626' : merma > 0 ? '#15803d' : '#4338ca',
                        marginTop: '2px',
                      }}
                    >
                      {merma > 0 ? `+${merma}` : merma} L
                    </div>
                  </div>
                </div>

                {/* Input Litros Recibidos */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    Litros Recibidos en Planta (Tanque / Báscula) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    value={modalVerificarLitros.litrosRecibidos}
                    onChange={(e) =>
                      setModalVerificarLitros((prev) =>
                        prev ? { ...prev, litrosRecibidos: e.target.value } : null
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '2px solid #4f46e5',
                      fontSize: '18px',
                      fontWeight: 900,
                      color: '#1e1b4b',
                    }}
                  />
                </div>

                {/* Observaciones */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                    Observaciones / Notas de Receptoría
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Pesaje conforme, acidez adecuada, merma normal de transporte"
                    value={modalVerificarLitros.observacion}
                    onChange={(e) =>
                      setModalVerificarLitros((prev) =>
                        prev ? { ...prev, observacion: e.target.value } : null
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                    }}
                  />
                </div>

                {/* Botones */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setModalVerificarLitros(null)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#475569',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 2,
                      padding: '12px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
                      color: '#ffffff',
                      fontWeight: 900,
                      fontSize: '13.5px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
                    }}
                  >
                    Confirmar y Conciliar
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ===================================================================
          MODAL 2 RECEPTORÍA: DEVOLVER TICKET AL CHOFER
         =================================================================== */}
      {modalDevolverTicket?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              background: '#ffffff',
              borderRadius: '20px',
              padding: '22px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#ffe4e6',
                  color: '#e11d48',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  flexShrink: 0,
                }}
              >
                <i className="fa-solid fa-arrow-rotate-left"></i>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 900, color: '#0f172a' }}>
                  ¿Devolver Ticket #{modalDevolverTicket.ticketId} al Chofer?
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#64748b' }}>
                  El viaje volverá a estado ABIERTO para que el chofer pueda agregar fincas o corregir litros.
                </p>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                Motivo de la Devolución *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Ej: Faltó registrar la finca Los Olivos o verificar litros de leche ácida..."
                value={modalDevolverTicket.motivo}
                onChange={(e) =>
                  setModalDevolverTicket((prev) => (prev ? { ...prev, motivo: e.target.value } : null))
                }
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setModalDevolverTicket(null)}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarDevolucionTicket}
                style={{
                  flex: 1.5,
                  padding: '11px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#e11d48',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Sí, Devolver al Chofer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL 3 RECEPTORÍA: CREAR TICKET DE SALIDA A PLANTA
         =================================================================== */}
      {modalNuevoDespachoSalida?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#ffffff',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'linear-gradient(135deg, #059669, #047857)',
                color: '#ffffff',
                borderTopLeftRadius: '24px',
                borderTopRightRadius: '24px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 900 }}>
                  🚀 Nuevo Ticket de Salida (Despacho a Planta)
                </h3>
                <div style={{ fontSize: '11.5px', color: '#a7f3d0', marginTop: '2px' }}>
                  Emisión de ticket de despacho a quesera o empresa compradora
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalNuevoDespachoSalida(null)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '20px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Formulario */}
            <form
              onSubmit={handleCrearTicketSalidaReceptoria}
              style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}
            >
              {/* Fecha */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  Fecha de Despacho *
                </label>
                <input
                  type="date"
                  required
                  value={modalNuevoDespachoSalida.fecha}
                  onChange={(e) =>
                    setModalNuevoDespachoSalida((prev) => (prev ? { ...prev, fecha: e.target.value } : null))
                  }
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              {/* Destino / Compañía */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  Destino (Empresa / Quesera Receptora) *
                </label>
                <select
                  required
                  value={modalNuevoDespachoSalida.companiaId}
                  onChange={(e) =>
                    setModalNuevoDespachoSalida((prev) =>
                      prev ? { ...prev, companiaId: Number(e.target.value) } : null
                    )
                  }
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px', background: '#ffffff', fontWeight: 700 }}
                >
                  <option value={0}>-- Selecciona Empresa Destino --</option>
                  {companiasReceptoria.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cisterna / Camión */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  Cisterna / Camión *
                </label>
                <select
                  required
                  value={modalNuevoDespachoSalida.camionId}
                  onChange={(e) =>
                    setModalNuevoDespachoSalida((prev) =>
                      prev ? { ...prev, camionId: Number(e.target.value) } : null
                    )
                  }
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px', background: '#ffffff', fontWeight: 700 }}
                >
                  <option value={0}>-- Selecciona Camión --</option>
                  {camionesLista.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.placa} • {c.marca} {c.modelo} ({c.capacidadLitros.toLocaleString()} L)
                    </option>
                  ))}
                </select>
              </div>

              {/* Chofer */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  Chofer / Conductor
                </label>
                <select
                  value={modalNuevoDespachoSalida.conductorId}
                  onChange={(e) =>
                    setModalNuevoDespachoSalida((prev) =>
                      prev ? { ...prev, conductorId: Number(e.target.value) } : null
                    )
                  }
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px', background: '#ffffff', fontWeight: 700 }}
                >
                  <option value={0}>-- Selecciona Chofer --</option>
                  {choferesLista.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.nombreCompleto}
                    </option>
                  ))}
                </select>
              </div>

              {/* Litros y Tipo de Leche */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                    Litros Despachados *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    placeholder="Ej: 5000"
                    value={modalNuevoDespachoSalida.litrosDespachados}
                    onChange={(e) =>
                      setModalNuevoDespachoSalida((prev) =>
                        prev ? { ...prev, litrosDespachados: e.target.value } : null
                      )
                    }
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                    Tipo de Leche
                  </label>
                  <select
                    value={modalNuevoDespachoSalida.tipoLeche}
                    onChange={(e) =>
                      setModalNuevoDespachoSalida((prev) =>
                        prev ? { ...prev, tipoLeche: e.target.value } : null
                      )
                    }
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px', background: '#ffffff', fontWeight: 700 }}
                  >
                    <option value="VACA">🥛 Vaca</option>
                    <option value="BUFALA">🐃 Búfala</option>
                  </select>
                </div>
              </div>

              {/* Nro Guía SADA */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  Nro de Guía SADA (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: SADA-2026-9812"
                  value={modalNuevoDespachoSalida.numeroGuiaSADA}
                  onChange={(e) =>
                    setModalNuevoDespachoSalida((prev) =>
                      prev ? { ...prev, numeroGuiaSADA: e.target.value } : null
                    )
                  }
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              {/* Observación */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  Observaciones / Notas
                </label>
                <input
                  type="text"
                  placeholder="Ej: Despacho para proceso de queso madurado"
                  value={modalNuevoDespachoSalida.observacion}
                  onChange={(e) =>
                    setModalNuevoDespachoSalida((prev) =>
                      prev ? { ...prev, observacion: e.target.value } : null
                    )
                  }
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              {/* Botones */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setModalNuevoDespachoSalida(null)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
                  }}
                >
                  Emitir Ticket de Salida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppMovilPage;
