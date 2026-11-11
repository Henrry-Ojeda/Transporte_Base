import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { AUTH_TOKEN_KEY } from '@/api/client';
import { authApi } from '@/api/auth.api';
import { catalogosApi } from '@/api/catalogos.api';
import { operacionesApi } from '@/api/operaciones.api';
import { sistemaApi } from '@/api/sistema.api';
import { mantenimientoApi } from '@/api/mantenimiento.api';
import { combustibleApi } from '@/api/combustible.api';
import { notificacionesApi, type NotificacionMovil } from '@/api/notificaciones.api';
import { finanzasApi } from '@/api/finanzas.api';
import { useAuthStore } from '@/stores/authStore';
import { updateAppIcon } from '@/utils/pwaIcons';
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
import { dbLocal } from '@/lib/dbLocal';
import { syncEngine } from '@/lib/syncEngine';
import { ticketsLocales } from '@/lib/ticketsLocales';
import { getTimestampParada, formatFechaHoraParada } from '@/utils/timelapseUtils';
import { CompaniaSelect } from '@/components/selectors/CompaniaSelect';
import { ChoferSelect } from '@/components/selectors/ChoferSelect';
import { viajeEstaEnviadoAReceptoria, esReceptoriaPrincipal } from '@/utils/procesoViaje';

interface DispositivoMovilData {
  token: string;
  empresaCodigo: string;
  empresaNombre: string;
  empresaLogo?: string;
  id: number;
  username: string;
  nombreCompleto: string;
  rol: string;
  permisoCrearViaje?: boolean;
  camionId?: number;
  placaCamion?: string;
  capacidadTanqueLitros: number;
  permisos: string[];
  modulosHabilitados: string[];
}

interface CargaOffline {
  localId: string;
  dbLocalId?: number;
  fecha: string;
  hora: string;
  fincaId: number;
  fincaNombre: string;
  litros: number;
  tipoLeche: string;
  esAcida: boolean;
  esDiferido: boolean;
  litrosDiferir?: number;
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

import { APP_VERSION } from '@/config/version';
export { APP_VERSION };

export const AppMovilPage: React.FC = () => {
  // Navegación de Pestañas Móviles
  const [tabActiva, setTabActiva] = useState<TabMovil>('principal');

  // Redirigir siempre a principal si se invoca recolección antigua
  useEffect(() => {
    if ((tabActiva as any) === 'recoleccion') {
      setTabActiva('principal');
    }
  }, [tabActiva]);

  // Estado de Red (Online / Offline)
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Resolver empresa y dominio estrictamente según el hostname actual o parámetro en la URL
  const currentTenant = (() => {
    const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlEmpresa = (params?.get('empresa') || params?.get('tenant') || '').toUpperCase();

    if (host.includes('campoverde') || urlEmpresa.includes('CAMPO')) {
      return {
        domain: 'lacteos-campoverde.vercel.app',
        nombre: 'Productos Lácteos Campo Verde',
        codigo: 'CAMPO_VERDE',
      };
    }
    if (host.includes('vergel') || urlEmpresa.includes('VERGEL')) {
      return {
        domain: 'transporte-vergel-carrillo.vercel.app',
        nombre: 'Transporte Vergel & Carrillo',
        codigo: 'VERGEL_CARRILLO',
      };
    }
    if (host.includes('base') || urlEmpresa.includes('BASE')) {
      return {
        domain: 'transporte-base.vercel.app',
        nombre: 'Sistema de Transporte Base (Demo)',
        codigo: 'PRODUCTO_BASE',
      };
    }
    return {
      domain: host || 'localhost',
      nombre: 'Sistema de Transporte',
      codigo: 'PRODUCTO_BASE',
    };
  })();

  // Tenant / Base de Datos Guardada en este Dispositivo
  const [tenantDomain, setTenantDomain] = useState<string>(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    if (host && !host.includes('localhost') && host !== '127.0.0.1') {
      return currentTenant.domain;
    }
    try {
      const saved = localStorage.getItem('movil_tenant_domain');
      if (saved) return saved;
      return currentTenant.domain;
    } catch {
      return currentTenant.domain;
    }
  });

  const [empresaGuardada, setEmpresaGuardada] = useState<string>(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    if (host && !host.includes('localhost') && host !== '127.0.0.1') {
      return currentTenant.nombre;
    }
    try {
      const saved = localStorage.getItem('movil_tenant_empresa');
      if (saved) return saved;
      return currentTenant.nombre;
    } catch {
      return currentTenant.nombre;
    }
  });

  const [logoGuardado, setLogoGuardado] = useState<string>(() => {
    try {
      return localStorage.getItem('movil_tenant_logo') || localStorage.getItem('app_empresa_logo') || '';
    } catch {
      return '';
    }
  });

  // Modo de Login (cuando !dispositivo): 'codigo' (6 dígitos por defecto) o 'credenciales' (Usuario y Contraseña)
  const [modoLogin, setModoLogin] = useState<'credenciales' | 'codigo'>('codigo');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [iniciandoLogin, setIniciandoLogin] = useState(false);

  // Notificaciones Push y Alertas
  const [notificaciones, setNotificaciones] = useState<NotificacionMovil[]>([]);
  const [modalNotificaciones, setModalNotificaciones] = useState(false);
  const ultimasIdsNotificadas = useRef<Set<number>>(new Set());
  const [permisoNotificaciones, setPermisoNotificaciones] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  // Sintetizador de audio nativo para alerta sonora al recibir notificación
  const reproducirAlertaSonora = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {}
  };

  // Notificación a nivel de sistema del teléfono (vibración + sonido + pantalla bloqueada vía Service Worker)
  const emitirNotificacionTelefono = async (titulo: string, mensaje: string, id?: number) => {
    // 1. Vibración háptica intensa
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([300, 100, 300, 100, 400]);
      } catch {}
    }

    // 2. Alerta Sonora nativa
    reproducirAlertaSonora();

    // 3. Notificación del sistema vía Service Worker (visible con pantalla bloqueada)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && 'showNotification' in reg) {
            await (reg as any).showNotification(titulo, {
              body: mensaje,
              icon: '/favicon.svg',
              badge: '/favicon.svg',
              vibrate: [300, 100, 300, 100, 400],
              requireInteraction: true,
              tag: `transporte-notif-${id || Date.now()}`,
              renotify: true,
              data: { url: '/movil', id },
            });
            return;
          }
        } catch (e) {
          console.warn('Error en serviceWorker.showNotification:', e);
        }
      }

      // Fallback
      try {
        new Notification(titulo, {
          body: mensaje,
          icon: '/favicon.svg',
        });
      } catch {}
    }
  };

  // VAPID Public Key fija para Web Push a nivel de SO
  const VAPID_PUBLIC_KEY = 'BLaD6DOWHSNTZ2TVY91CnRLuOCb8p9NpUv4AGslQ_Cp1vg3oiHA7MIR-qF74ZxzkHKp1ucbg2kVMU61S4IpxRHo';

  // Convertir VAPID Public Key en Uint8Array para Web Push
  const urlB64ToUint8Array = (base64String: string) => {
    try {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    } catch {
      return new Uint8Array(0);
    }
  };

  // Obtener registro de Service Worker de forma segura y con timeout estricto (previene cuelgues)
  const getServiceWorkerRegistrationSafe = async (timeoutMs = 2000): Promise<ServiceWorkerRegistration | null> => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

    const resolver = async (): Promise<ServiceWorkerRegistration | null> => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) return reg;
        return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (err) {
        console.warn('[SW] Error obteniendo registration:', err);
        return null;
      }
    };

    return Promise.race([
      resolver(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  };

  // Suscribir dispositivo a Web Push en el servidor para notificaciones con pantalla bloqueada
  const suscribirWebPushDispositivo = async (timeoutMs = 2500): Promise<boolean> => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    const ejecutarSuscripcion = async (): Promise<boolean> => {
      try {
        const reg = await getServiceWorkerRegistrationSafe(1800);
        if (!reg || !reg.pushManager) {
          console.warn('[Push] ServiceWorker o PushManager no disponibles.');
          return false;
        }

        const convertedKey = urlB64ToUint8Array(VAPID_PUBLIC_KEY);
        let sub = await reg.pushManager.getSubscription();

        if (!sub && convertedKey.length > 0) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey,
            });
          } catch (errSub) {
            console.warn('[Push] Reintentando suscribir tras limpiar suscripción:', errSub);
            const old = await reg.pushManager.getSubscription();
            if (old) await old.unsubscribe().catch(() => {});
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey,
            });
          }
        }

        if (sub) {
          const subJson = sub.toJSON ? sub.toJSON() : null;
          let p256dh = subJson?.keys?.p256dh || '';
          let auth = subJson?.keys?.auth || '';

          if (!p256dh && sub.getKey) {
            const raw = sub.getKey('p256dh');
            if (raw) p256dh = btoa(String.fromCharCode(...new Uint8Array(raw)));
          }
          if (!auth && sub.getKey) {
            const rawA = sub.getKey('auth');
            if (rawA) auth = btoa(String.fromCharCode(...new Uint8Array(rawA)));
          }

          if (sub.endpoint && p256dh && auth) {
            const uid = authUser?.id || dispositivo?.id;
            await notificacionesApi.suscribirPush({
              endpoint: sub.endpoint,
              p256dh,
              auth,
              userAgent: navigator.userAgent,
              usuarioId: uid ? Number(uid) : undefined,
            });
            console.log('✅ WebPush registrado exitosamente para pantalla apagada.');
            return true;
          }
        }
      } catch (err) {
        console.warn('[Push] Error suscribiendo dispositivo:', err);
      }
      return false;
    };

    return Promise.race([
      ejecutarSuscripcion(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
  };

  // Probar notificación diferida de 5 segundos para que el usuario bloquee la pantalla
  const probarNotificacionPantallaApagada = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Tu dispositivo no soporta notificaciones nativas.');
      return;
    }
    if (Notification.permission !== 'granted') {
      try {
        const p = await Notification.requestPermission();
        setPermisoNotificaciones(p);
        if (p !== 'granted') {
          toast.error('Debes autorizar las notificaciones en tu navegador primero.');
          return;
        }
      } catch {
        toast.error('No se pudo solicitar el permiso de notificaciones.');
        return;
      }
    }

    const toastLoadingId = toast.loading('Sincronizando Push con el servidor...');
    let sincronizadoOk = false;

    try {
      sincronizadoOk = await suscribirWebPushDispositivo(2500);
    } catch (err) {
      console.warn('Aviso durante suscripción:', err);
    } finally {
      // SIEMPRE descartar el toast de carga de inmediato
      toast.dismiss(toastLoadingId);
    }

    try {
      const uid = authUser?.id || dispositivo?.id;
      await notificacionesApi.probarPushDiferido(5, uid ? Number(uid) : undefined);

      // Si el Service Worker está disponible, programar también emisión local por postMessage
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        setTimeout(() => {
          try {
            navigator.serviceWorker.controller?.postMessage({
              type: 'SHOW_NOTIFICATION',
              titulo: '🚨 AVISO DE RUTA (Pantalla Bloqueada)',
              mensaje: '¡Tu dispositivo y pantalla bloqueada reciben las alertas de transporte perfectamente!',
              id: Date.now(),
            });
          } catch {}
        }, 5000);
      }

      await Swal.fire({
        title: '🔒 ¡BLOQUEA TU PANTALLA YA!',
        html: `
          <div style="font-size: 13.5px; text-align: left; line-height: 1.5; color: #cbd5e1;">
            <p>Se ha enviado la orden al servidor para emitir una <strong>notificación push a nivel de sistema</strong> en <strong>5 segundos</strong>.</p>
            <div style="background: rgba(16, 185, 129, 0.15); border: 1.5px solid #10b981; padding: 12px; border-radius: 10px; margin: 10px 0; color: #a7f3d0; text-align: center;">
              <strong style="font-size: 16px;">⏱️ Pulsa el botón de bloqueo de tu teléfono AHORA.</strong>
            </div>
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">Tu teléfono vibrará y sonará con la pantalla completamente apagada.</p>
            ${!sincronizadoOk ? '<p style="font-size: 11px; color: #f59e0b; margin-top: 6px;">⚠️ Push en cola de envío; se disparará al cumplirse el conteo.</p>' : ''}
          </div>
        `,
        icon: 'info',
        confirmButtonText: '¡Bloqueando pantalla!',
        confirmButtonColor: '#2563eb',
        background: '#1e293b',
        color: '#fff',
        timer: 4500,
        timerProgressBar: true,
      });
    } catch (err: any) {
      toast.error('Error al programar prueba: ' + (err?.response?.data?.message || err.message));
    }
  };

  // Solicitar permiso explícito mediante gesto del usuario
  const solicitarPermisoNotificaciones = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Este navegador o dispositivo no soporta notificaciones nativas.');
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setPermisoNotificaciones(res);
      if (res === 'granted') {
        toast.success('¡Avisos de teléfono activados!');
        await suscribirWebPushDispositivo();
        await emitirNotificacionTelefono(
          '🔔 Notificaciones Activadas en tu Teléfono',
          'Ahora recibirás avisos de cambios de ruta y despachos, incluso con la pantalla bloqueada.'
        );
      } else {
        toast.error('Permiso denegado. Puedes habilitarlo en los permisos de sitio de tu navegador.');
      }
    } catch (err: any) {
      toast.error('No se pudo solicitar el permiso: ' + (err?.message || 'Error'));
    }
  };

  // Estado del Dispositivo Vinculado (con validación estricta de pertenencia a la empresa actual)
  const [dispositivo, setDispositivo] = useState<DispositivoMovilData | null>(() => {
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
      const isCampoVerde = host.includes('campoverde');
      const isVergel = host.includes('vergel');

      const saved = localStorage.getItem('movil_device_info');
      if (!saved) return null;
      const parsed: DispositivoMovilData = JSON.parse(saved);
      if (!parsed) return null;

      const dIsVergel = (parsed.empresaCodigo || '').toUpperCase().includes('VERGEL') || (parsed.empresaNombre || '').toLowerCase().includes('vergel');
      const dIsCampo = (parsed.empresaCodigo || '').toUpperCase().includes('CAMPO') || (parsed.empresaNombre || '').toLowerCase().includes('campo');

      // Si el dispositivo guardado pertenece a otra empresa, forzar solicitud de código/clave
      if ((isCampoVerde && dIsVergel) || (isVergel && dIsCampo)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  // Efecto para sincronizar dinámicamente el logotipo de la empresa como icono del móvil
  useEffect(() => {
    const l = dispositivo?.empresaLogo || logoGuardado;
    if (l) {
      updateAppIcon(l);
    } else {
      catalogosApi.getEmpresaConfig()
        .then((res: any) => {
          const fetchedLogo = res?.logoUrl || res?.LogoUrl;
          if (fetchedLogo) {
            setLogoGuardado(fetchedLogo);
            try {
              localStorage.setItem('movil_tenant_logo', fetchedLogo);
              localStorage.setItem('app_empresa_logo', fetchedLogo);
            } catch {}
            updateAppIcon(fetchedLogo);
          }
        })
        .catch(() => {});
    }
  }, [dispositivo?.empresaLogo]);

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

  // Despachos / Entregas Asignadas (Filtradas por Día y Chofer)
  const [entregas, setEntregas] = useState<DespachoCompaniaDto[]>([]);
  const [cargandoEntregas, setCargandoEntregas] = useState(false);
  const [filtroFechaEntregas, setFiltroFechaEntregas] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Estado para animar/titilar finca cuando se ingresan litros
  const [fincaRecienActualizadaId, setFincaRecienActualizadaId] = useState<number | null>(null);

  const cambiarDiaEntregas = (offset: number) => {
    try {
      const baseStr = filtroFechaEntregas || new Date().toISOString().split('T')[0];
      const [y, m, d] = baseStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + offset);
      const nuevaFecha = dt.toISOString().split('T')[0];
      setFiltroFechaEntregas(nuevaFecha);
      cargarEntregasChofer(undefined, nuevaFecha);
    } catch {}
  };

  // Viajes / Tickets del Chofer para el Día (Turno 1 Mañana, Turno 2 Tarde, etc.)
  const [viajesChofer, setViajesChofer] = useState<ControlRutaDto[]>(() => {
    try {
      const saved = localStorage.getItem('movil_viajes_chofer');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [viajeSeleccionadoId, setViajeSeleccionadoId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('movil_viaje_seleccionado_id');
      return saved ? Number(saved) : null;
    } catch {
      return null;
    }
  });
  const [modalNuevoViajeChofer, setModalNuevoViajeChofer] = useState(false);
  const [rutaNuevoViajeId, setRutaNuevoViajeId] = useState<number | null>(null);
  const [obsNuevoViaje, setObsNuevoViaje] = useState('');
  const [iniciandoViajeChofer, setIniciandoViajeChofer] = useState(false);

  // Panel de Autorizaciones para Crear Ruta (Solo Admin y SuperAdmin)
  const [modalAutorizacionesChoferes, setModalAutorizacionesChoferes] = useState(false);
  const [usuariosChoferesPermisos, setUsuariosChoferesPermisos] = useState<any[]>([]);
  const [cargandoPermisosChoferes, setCargandoPermisosChoferes] = useState(false);
  const [busquedaChoferPermiso, setBusquedaChoferPermiso] = useState('');
  const [modificandoPermisoChoferId, setModificandoPermisoChoferId] = useState<number | null>(null);

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

  // Despachos Activos a Planta / Receptoría / Compañías (TB_CONTROL_COMPANIAS, ej. #20567 RECEPTORIA y #20568 PABLO MARIN)
  const [despachoActivo, setDespachoActivo] = useState<DespachoCompaniaDto | null>(() => {
    try {
      const saved = localStorage.getItem('movil_despacho_activo');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [despachosActivos, setDespachosActivos] = useState<DespachoCompaniaDto[]>(() => {
    try {
      const saved = localStorage.getItem('movil_despachos_activos');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [cargandoDespacho, setCargandoDespacho] = useState(false);

  // Helper para identificar si un despacho es hacia Receptoría / Planta
  const esDestinoReceptoria = (d: DespachoCompaniaDto | null | undefined): boolean => {
    if (!d) return false;
    if (Number(d.companiaId) === 5028) return true;
    const nom = (d.nombreCompania || (d as any).companiaNombre || '').toUpperCase();
    return nom.includes('RECEPTORIA') || nom.includes('RECEPTORÍA') || esReceptoriaPrincipal(d) || esReceptoriaPrincipal(nom);
  };

  // Persistir despachos activos en LocalStorage
  useEffect(() => {
    if (despachoActivo) {
      localStorage.setItem('movil_despacho_activo', JSON.stringify(despachoActivo));
    } else {
      localStorage.removeItem('movil_despacho_activo');
    }
    if (despachosActivos && despachosActivos.length > 0) {
      localStorage.setItem('movil_despachos_activos', JSON.stringify(despachosActivos));
    } else {
      localStorage.removeItem('movil_despachos_activos');
    }
  }, [despachoActivo, despachosActivos]);

  // Lista de Choferes disponibles para supervisión / simulación y logística
  const [choferesLista, setChoferesLista] = useState<ChoferDto[]>([]);

  // Filtro en vista Supervisar Chofer: 'activos' (solo con viaje activo) o 'todos'
  const [filtroChoferSupervisar, setFiltroChoferSupervisar] = useState<'activos' | 'todos'>('activos');

  // Chofer seleccionado para supervisar/auditar (cuando el usuario es Administrador/SuperAdmin)
  const [choferSimuladoId, setChoferSimuladoId] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('movil_chofer_simulado_id');
      if (saved) return Number(saved);
      const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
      if (host.includes('vergel')) return 13; // Julio Atencio exclusivamente en Vergel Carrillo
      return 0;
    } catch {
      return 0;
    }
  });

  // Helper para obtener lista de IDs de fincas de una planificación
  const getFincasIdsDePlan = (plan: PlanificacionRutaChoferDto | any): number[] => {
    if (!plan) return [];
    if (Array.isArray(plan.listaFincasIds) && plan.listaFincasIds.length > 0) {
      return plan.listaFincasIds.map(Number);
    }
    if (typeof plan.fincasIds === 'string' && plan.fincasIds.trim()) {
      return plan.fincasIds
        .split(',')
        .map((s: string) => Number(s.trim()))
        .filter((n: number) => !isNaN(n) && n > 0);
    }
    return [];
  };

  // Estados para Multi-Ruta y Recolecciones del Día (Regla Asimétrica y Solicitudes Extraordinarias)
  const [recoleccionesHoy, setRecoleccionesHoy] = useState<any[]>([]);
  const [solicitudesExtraordinarias, setSolicitudesExtraordinarias] = useState<any[]>([]);

  const cargarRecoleccionesYSolicitudes = async (fechaParam?: string) => {
    try {
      const f = fechaParam || (viajeActivo?.fecha ? viajeActivo.fecha.split('T')[0] : hoyStr);
      const [recs, solics] = await Promise.all([
        operacionesApi.getRecoleccionesHoyFincas(f),
        operacionesApi.getSolicitudesExtraordinariasHoy(f),
      ]);
      setRecoleccionesHoy(Array.isArray(recs) ? recs : []);
      setSolicitudesExtraordinarias(Array.isArray(solics) ? solics : []);
    } catch {}
  };

  const solicitarEmergenciaFinca = async (finca: any, recPrev?: any) => {
    const { value: motivo } = await Swal.fire({
      title: `🚨 Recogida de Emergencia`,
      html: `<div style="text-align:left; font-size:13px; color:#334155;">
        <p><b>Finca:</b> ${finca.nombre}</p>
        <p style="color:#d97706; margin-bottom:8px;">⚠️ Esta finca ya fue recogida hoy ${recPrev ? `(${recPrev.litros} Lts)` : ''}.</p>
        <p>Indica el motivo de la recogida extraordinaria:</p>
      </div>`,
      input: 'select',
      inputOptions: {
        'Corte eléctrico (Sin luz / Tanque apagado)': '⚡ Corte eléctrico (Sin luz / Tanque apagado)',
        'Tanque dañado / Falla mecánica': '🛠️ Tanque dañado / Falla mecánica',
        'Doble ordeño vespertino': '🥛 Doble ordeño vespertino',
        'Requerimiento urgente de administración': '📋 Requerimiento urgente de administración',
      },
      inputPlaceholder: '-- Selecciona el motivo --',
      showCancelButton: true,
      confirmButtonText: 'Enviar Solicitud',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d97706',
    });

    if (!motivo) return;

    try {
      await operacionesApi.solicitarRecoleccionExtraordinaria({
        fincaId: finca.id,
        rutaLogisticaId: viajeActivo?.rutaLogisticaId,
        controlRutaId: viajeActivo?.id,
        motivo,
      });
      Swal.fire({
        icon: 'success',
        title: '¡Solicitud Enviada!',
        text: 'La solicitud de recogida extraordinaria se notificó a supervisión. Al ser aprobada, la finca se habilitará automáticamente para ingresar litros.',
        confirmButtonColor: '#10b981',
      });
      cargarRecoleccionesYSolicitudes();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al enviar solicitud.');
    }
  };

  const responderEmergencia = async (solicitudId: number, aprobar: boolean) => {
    try {
      await operacionesApi.responderSolicitudExtraordinaria(solicitudId, aprobar);
      toast.success(aprobar ? 'Solicitud aprobada con éxito' : 'Solicitud rechazada');
      cargarRecoleccionesYSolicitudes();
      cargarViajeActivo();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al procesar solicitud');
    }
  };

  const abrirFincaDesdeTimelapse = (v: ControlRutaDto, p: any) => {
    setViajeActivo(v);
    const fid = Number(p.fincaId || p.FincaId || (p.id > 0 ? p.id : 0));
    const targetFinca = fincas.find((f) => f.id === fid) || {
      id: fid,
      nombre: p.fincaNombre || p.nombreFinca || `Finca #${fid}`,
      propietario: p.propietario || '',
      codigo: p.codigo || '',
      tipoLeche: p.tipoLeche || 'VACA',
      litrosRecolectados: Number(p.litros || p.litrosLeche || 0),
      parada: p,
    };
    abrirCargaParaFinca(targetFinca);
  };

  // Estados para Modal Timelapse de Viaje Móvil (Paradas, Horas, Litros, Trazabilidad)
  const [modalTimelapseMovil, setModalTimelapseMovil] = useState(false);
  const [viajeTimelapseMovil, setViajeTimelapseMovil] = useState<ControlRutaDto | null>(null);
  const [paradasTimelapseMovil, setParadasTimelapseMovil] = useState<any[]>([]);
  const [cargandoTimelapseMovil, setCargandoTimelapseMovil] = useState(false);

  const abrirTimelapseMovil = async (viaje: ControlRutaDto) => {
    setViajeTimelapseMovil(viaje);
    setModalTimelapseMovil(true);
    setCargandoTimelapseMovil(true);
    try {
      const paradas = await operacionesApi.getFincasViaje(viaje.id);
      const paradasArray = Array.isArray(paradas) ? paradas : [];

      // Buscar si existen fincas planificadas para este ticket o conductor en la fecha del ticket
      const fViajeStr = (viaje.fecha || '').split('T')[0];
      let plans = planificaciones;
      if (!plans || plans.length === 0) {
        try {
          plans = await operacionesApi.getPlanificacionesChoferes(fViajeStr || hoyStr);
          if (Array.isArray(plans)) setPlanificaciones(plans);
        } catch {}
      }

      const plan = (plans || []).find(
        (p) =>
          (p.controlRutaId && p.controlRutaId === viaje.id) ||
          (p.conductorId === viaje.usuarioId && (p.fecha || '').split('T')[0] === fViajeStr)
      );

      let todasParadas = [...paradasArray];

      if (plan) {
        const fincasIdsPlan = getFincasIdsDePlan(plan);
        const yaIncluidas = new Set(
          paradasArray.map((p) => Number(p.fincaId || (p as any).FincaId || 0))
        );

        fincasIdsPlan.forEach((fId) => {
          if (!yaIncluidas.has(fId)) {
            const fObj = fincas.find((f) => f.id === fId);
            todasParadas.push({
              id: -(fId),
              fincaId: fId,
              fincaNombre: fObj?.nombre || `Finca #${fId}`,
              propietario: (fObj as any)?.propietario || '',
              litros: 0,
              esPlanificada: true,
              controlRutaId: viaje.id,
              esAcida: false,
              tipoLeche: 'VACA',
            } as any);
          }
        });
      }

      // Ordenar cronológicamente ascendente: parada 1 registrada queda de 1ra, parada 2 de 2da
      todasParadas.sort((a: any, b: any) => {
        const ltsA = Number(a.litros || a.Litros || 0);
        const ltsB = Number(b.litros || b.Litros || 0);
        const recA = ltsA > 0;
        const recB = ltsB > 0;
        if (recA && !recB) return -1;
        if (!recA && recB) return 1;
        if (recA && recB) {
          const timeA = getTimestampParada(a);
          const timeB = getTimestampParada(b);
          if (timeA !== timeB) return timeA - timeB;
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        }
        const nomA = a.fincaNombre || a.finca || '';
        const nomB = b.fincaNombre || b.finca || '';
        return nomA.localeCompare(nomB);
      });

      setParadasTimelapseMovil(todasParadas);
    } catch (err) {
      console.warn('Error al cargar paradas para timelapse:', err);
      setParadasTimelapseMovil([]);
    } finally {
      setCargandoTimelapseMovil(false);
    }
  };

  // Estados para Modal Administrador Cargar / Registrar Litros Directo en Ticket En Vivo
  const [modalAdminCargarLitros, setModalAdminCargarLitros] = useState<{
    open: boolean;
    ticket: ControlRutaDto | null;
    paradaExistente?: any | null;
  }>({
    open: false,
    ticket: null,
    paradaExistente: null,
  });

  const [formAdminLitros, setFormAdminLitros] = useState({
    fincaId: 0,
    litros: '',
    tipoLeche: 'VACA',
    esAcida: false,
    esDiferido: false,
    temperatura: '',
    observacion: '',
    fotoComprobante: '',
  });
  const [busquedaFincaAdmin, setBusquedaFincaAdmin] = useState('');
  const [guardandoLitrosAdmin, setGuardandoLitrosAdmin] = useState(false);
  const inputFotoReciboAdminRef = useRef<HTMLInputElement | null>(null);

  const handleSubirFotoReciboAdmin = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await comprimirImagenMovil(file);
      setFormAdminLitros((prev) => ({ ...prev, fotoComprobante: base64 }));
      toast.success('Foto del comprobante/recibo adjuntada');
    } catch (err) {
      toast.error('No se pudo procesar la foto');
    }
    e.target.value = '';
  };

  const abrirModalAdminCargarLitros = (ticket: ControlRutaDto, paradaExistente?: any) => {
    setModalAdminCargarLitros({
      open: true,
      ticket,
      paradaExistente: paradaExistente || null,
    });
    if (paradaExistente) {
      const fId = Number(paradaExistente.fincaId || paradaExistente.FincaId || 0);
      setFormAdminLitros({
        fincaId: fId,
        litros: Number(paradaExistente.litros || 0) > 0 ? String(paradaExistente.litros || paradaExistente.litrosLeche || paradaExistente.litrosCargados || '') : '',
        tipoLeche: paradaExistente.tipoLeche || 'VACA',
        esAcida: Boolean(paradaExistente.esAcida),
        esDiferido: Boolean(paradaExistente.esDiferido),
        temperatura: paradaExistente.temperatura ? String(paradaExistente.temperatura) : '',
        observacion: paradaExistente.observacion || '',
        fotoComprobante: paradaExistente.fotoComprobante || paradaExistente.fotoRecibo || '',
      });
    } else {
      setFormAdminLitros({
        fincaId: 0,
        litros: '',
        tipoLeche: 'VACA',
        esAcida: false,
        esDiferido: false,
        temperatura: '',
        observacion: '',
        fotoComprobante: '',
      });
    }
    setBusquedaFincaAdmin('');
  };

  const handleGuardarLitrosAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalAdminCargarLitros.ticket) return;
    const ticketId = modalAdminCargarLitros.ticket.id;
    const fId = Number(formAdminLitros.fincaId);
    if (!fId) {
      toast.error('Selecciona la finca ganadera');
      return;
    }
    const lts = Number(formAdminLitros.litros);
    if (!lts || lts <= 0) {
      toast.error('Ingresa una cantidad válida de litros');
      return;
    }

    setGuardandoLitrosAdmin(true);
    try {
      const esEdicionReal =
        modalAdminCargarLitros.paradaExistente?.id &&
        Number(modalAdminCargarLitros.paradaExistente.id) > 0 &&
        !modalAdminCargarLitros.paradaExistente.esPlanificada;

      if (esEdicionReal) {
        await operacionesApi.editarRecoleccion(modalAdminCargarLitros.paradaExistente.id, {
          fincaId: fId,
          litros: lts,
          tipoLeche: formAdminLitros.tipoLeche,
          esAcida: formAdminLitros.esAcida,
          esDiferido: formAdminLitros.esDiferido,
          temperatura: formAdminLitros.temperatura ? Number(formAdminLitros.temperatura) : undefined,
          observacion: formAdminLitros.observacion,
          fotoComprobante: formAdminLitros.fotoComprobante || undefined,
        });
        toast.success(`Parada actualizada en el Ticket #${ticketId}`);
      } else {
        await operacionesApi.agregarFincaViaje(ticketId, {
          fincaId: fId,
          litros: lts,
          tipoLeche: formAdminLitros.tipoLeche,
          esAcida: formAdminLitros.esAcida,
          esDiferido: formAdminLitros.esDiferido,
          temperatura: formAdminLitros.temperatura ? Number(formAdminLitros.temperatura) : undefined,
          observacion: formAdminLitros.observacion,
          fotoComprobante: formAdminLitros.fotoComprobante || undefined,
        });
        toast.success(`${lts.toLocaleString()} Lts agregados al Ticket #${ticketId}`);
      }

      // Notificar al chofer del ticket
      const choferId = modalAdminCargarLitros.ticket.usuarioId;
      const fincaObj = fincas.find((f) => f.id === fId);
      const fincaNom = fincaObj?.nombre || `Finca #${fId}`;
      if (choferId) {
        try {
          await notificacionesApi.enviarNotificacion({
            usuarioId: choferId,
            tipo: 'CARGA_REGISTRADA',
            titulo: '📝 Litros Registrados por Administrador',
            mensaje: `Se registraron ${lts.toLocaleString()} Lts (${formAdminLitros.tipoLeche}) en la finca "${fincaNom}" para tu Ticket #${ticketId}.`,
            fechaOperativa: modalAdminCargarLitros.ticket.fecha ? modalAdminCargarLitros.ticket.fecha.split('T')[0] : hoyStr,
            referenciaId: ticketId,
          });
        } catch {}
      }

      // Refrescar viajes en vivo
      cargarDatosAdminEnVivo();
      if (modalTimelapseMovil && viajeTimelapseMovil?.id === ticketId) {
        abrirTimelapseMovil(viajeTimelapseMovil);
      }
      if (choferEfectivoId === choferId) {
        cargarViajeActivo(choferId);
      }

      setModalAdminCargarLitros({ open: false, ticket: null, paradaExistente: null });
    } catch (err: any) {
      console.error('Error al registrar litros admin:', err);
      toast.error(err.response?.data?.message || 'Error al registrar los litros');
    } finally {
      setGuardandoLitrosAdmin(false);
    }
  };

  // Ciclos operativos para validar semanas abiertas/cerradas en móvil
  const [ciclosOperativos, setCiclosOperativos] = useState<any[]>([]);

  useEffect(() => {
    finanzasApi
      .getCiclos()
      .then((data) => {
        if (Array.isArray(data)) setCiclosOperativos(data);
      })
      .catch(() => {});
  }, []);

  const verificarSemanaOperativa = (fechaStr?: string) => {
    if (!fechaStr || !ciclosOperativos.length) return { esOperativa: true, ciclo: null, texto: 'Semana Operativa' };
    const fSolo = fechaStr.includes('T') ? fechaStr.split('T')[0] : fechaStr;
    const ciclo = ciclosOperativos.find((c: any) => {
      const fIni = String(c.fechaInicio).split('T')[0];
      const fFin = String(c.fechaFin).split('T')[0];
      return fSolo >= fIni && fSolo <= fFin;
    });
    if (!ciclo) return { esOperativa: true, ciclo: null, texto: 'Sin ciclo' };
    const estado = String(ciclo.estado || '').toUpperCase();
    const abierta = estado === 'ABIERTO' || estado === 'ACTIVO' || estado === 'OPERATIVO';
    return {
      esOperativa: abierta,
      ciclo,
      texto: abierta
        ? `Semana ${ciclo.numeroSemana} (Abierta)`
        : `Semana ${ciclo.numeroSemana} (Cerrada)`,
    };
  };

  const handleLimpiarRecoleccionMovil = async (ticket: ControlRutaDto, parada: any) => {
    if (!ticket || !parada) return;
    const ticketId = ticket.id;
    const pId = parada.id;
    const fNom = parada.fincaNombre || parada.nombreFinca || 'esta finca';
    const lts = Number(parada.litros || parada.litrosLeche || parada.litrosCargados || 0);

    const res = await Swal.fire({
      title: '¿Limpiar Recolección?',
      html: `¿Deseas reiniciar los datos de recolección de <b>${fNom}</b>?<br/><br/><div style="text-align: left; font-size: 13px; color: #cbd5e1; background: #1e293b; padding: 10px; border-radius: 8px;">
        <p>✅ <b>La finca NO se eliminará</b> del ticket #${ticket.codigoTicket || ticketId}.</p>
        <p>✅ Quedará como <b>NO RECOGIDA (0 Litros)</b> para que el chofer pueda recolectarla.</p>
        <p>⚠️ Se eliminarán los litros registrados (${lts} L), foto de comprobante y observaciones.</p>
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

    if (!res.isConfirmed) return;

    try {
      await operacionesApi.limpiarRecoleccion(pId, ticketId);
      toast.success(`Datos de ${fNom} limpiados. Marcada como No Recogida.`);

      const choferId = ticket.usuarioId;
      if (choferId) {
        try {
          await notificacionesApi.enviarNotificacion({
            usuarioId: choferId,
            tipo: 'FINCA_LIMPIADA',
            titulo: '🔄 Recolección Reiniciada por Administrador',
            mensaje: `Se reiniciaron los datos de la finca "${fNom}". Ahora figura como Pendiente / No Recogida en tu Ticket #${ticket.codigoTicket || ticketId}.`,
            fechaOperativa: ticket.fecha ? ticket.fecha.split('T')[0] : hoyStr,
            referenciaId: ticketId,
          });
        } catch {}
      }

      // Recargar datos en vivo y timelapse
      cargarDatosAdminEnVivo();
      if (modalTimelapseMovil && viajeTimelapseMovil?.id === ticketId) {
        const paradasActualizadas = await operacionesApi.getFincasViaje(ticketId);
        setParadasTimelapseMovil(Array.isArray(paradasActualizadas) ? paradasActualizadas : []);
      }
      if (modalAdminCargarLitros.open) {
        setModalAdminCargarLitros({ open: false, ticket: null, paradaExistente: null });
      }
      if (choferEfectivoId === choferId) {
        cargarViajeActivo(choferId);
      }
    } catch (err: any) {
      console.error('Error al limpiar recolección móvil:', err);
      toast.error(err.response?.data?.message || 'Error al limpiar recolección de la finca');
    }
  };

  // Persistir viaje activo y paradas en LocalStorage (Solo guardar, no borrar por fallo de red)
  useEffect(() => {
    if (viajeActivo && viajeActivo.id) {
      try {
        localStorage.setItem('movil_viaje_activo', JSON.stringify(viajeActivo));
      } catch {}
    }
  }, [viajeActivo]);

  useEffect(() => {
    if (paradasViajeActivo && paradasViajeActivo.length > 0) {
      try {
        localStorage.setItem('movil_paradas_activo', JSON.stringify(paradasViajeActivo));
      } catch {}
    }
  }, [paradasViajeActivo]);

  // Salvaguarda: Rehidratar viaje activo y paradas de LocalStorage si la memoria quedó vacía
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      const isCampoVerde = host.includes('campoverde');
      const isVergel = host.includes('vergel');

      // Limpieza automática si el dispositivo guardado en LocalStorage pertenece a la otra empresa
      const savedDev = localStorage.getItem('movil_device_info');
      if (savedDev) {
        try {
          const d = JSON.parse(savedDev);
          const dIsVergel = (d.empresaCodigo || '').toUpperCase().includes('VERGEL') || (d.empresaNombre || '').toLowerCase().includes('vergel');
          const dIsCampo = (d.empresaCodigo || '').toUpperCase().includes('CAMPO') || (d.empresaNombre || '').toLowerCase().includes('campo');
          if ((isCampoVerde && dIsVergel) || (isVergel && dIsCampo)) {
            localStorage.removeItem('movil_device_info');
            localStorage.removeItem('movil_viaje_activo');
            localStorage.removeItem('movil_paradas_activo');
            localStorage.removeItem('movil_cargas_local');
            localStorage.removeItem('movil_fincas_cache');
            localStorage.removeItem('movil_despacho_activo');
            localStorage.removeItem('movil_despachos_activos');
            localStorage.removeItem('movil_entregas_chofer');
            localStorage.removeItem('movil_chofer_simulado_id');
            setDispositivo(null);
            setViajeActivo(null);
            setParadasViajeActivo([]);
          }
        } catch {}
      }

      // Limpiar tenant_domain en LocalStorage si apunta a la otra empresa
      const savedTenant = localStorage.getItem('movil_tenant_domain');
      if (savedTenant) {
        if ((isCampoVerde && savedTenant.includes('vergel')) || (isVergel && savedTenant.includes('campoverde'))) {
          localStorage.removeItem('movil_tenant_domain');
          localStorage.removeItem('movil_tenant_empresa');
          setTenantDomain(currentTenant.domain);
          setEmpresaGuardada(currentTenant.nombre);
        }
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === '1' || params.get('logout') === '1' || params.get('nuevo') === '1') {
        localStorage.removeItem('movil_device_info');
        localStorage.removeItem('movil_viaje_activo');
        localStorage.removeItem('movil_paradas_activo');
        localStorage.removeItem('movil_modo_activo');
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setDispositivo(null);
        setViajeActivo(null);
        setParadasViajeActivo([]);
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
    }

    if (!viajeActivo) {
      try {
        const savedV = localStorage.getItem('movil_viaje_activo');
        if (savedV) setViajeActivo(JSON.parse(savedV));
      } catch {}
    }
    if (!paradasViajeActivo || paradasViajeActivo.length === 0) {
      try {
        const savedP = localStorage.getItem('movil_paradas_activo');
        if (savedP) {
          const list = JSON.parse(savedP);
          if (Array.isArray(list) && list.length > 0) setParadasViajeActivo(list);
        }
      } catch {}
    }
  }, []);

  // Usuario autenticado en la plataforma web global
  const authUser = useAuthStore((s) => s.user);
  const authToken = useAuthStore((s) => s.token);
  const hasTenantModule = useAuthStore((s) => s.hasTenantModule);
  const syncModulosTenant = useAuthStore((s) => s.syncModulosTenant);
  const tieneModuloBufala = hasTenantModule('MOD_LECHE_BUFALA');
  const authEmpresa = authUser?.empresaNombre;

  // Auto-sintetizar dispositivo si el usuario ya inició sesión en la plataforma
  useEffect(() => {
    if (!dispositivo && authUser && authToken) {
      const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
      const isCampoVerde = host.includes('campoverde');
      const isVergel = host.includes('vergel');
      const userCod = ((authUser as any)?.empresaCodigo || '').toUpperCase();
      const userNom = (authUser.empresaNombre || '').toLowerCase();

      // Validación estricta: nunca sintetizar si el usuario web es de otra empresa
      if (isCampoVerde && (userCod.includes('VERGEL') || userNom.includes('vergel'))) {
        return;
      }
      if (isVergel && (userCod.includes('CAMPO') || userNom.includes('campo'))) {
        return;
      }

      const dispData: DispositivoMovilData = {
        token: authToken,
        empresaCodigo: (authUser as any).empresaCodigo || currentTenant.codigo,
        empresaNombre: authUser.empresaNombre || currentTenant.nombre,
        id: authUser.id,
        username: authUser.username,
        nombreCompleto: authUser.nombreCompleto,
        rol: authUser.rol,
        permisoCrearViaje: (authUser as any).permisoCrearViaje ?? false,
        camionId: (authUser as any).camionId,
        placaCamion: (authUser as any).placaCamion,
        capacidadTanqueLitros: (authUser as any).capacidadTanqueLitros || 6000,
        permisos: authUser.permisos || [],
        modulosHabilitados: (authUser as any).modulosHabilitados || [],
      };
      setDispositivo(dispData);
      try {
        localStorage.setItem('movil_device_info', JSON.stringify(dispData));
      } catch {}
    }
  }, [authUser, authToken, dispositivo, currentTenant]);

  // Fecha de hoy por defecto (fecha LOCAL del teléfono; toISOString usa UTC y después de las 8pm daría "mañana")
  const hoyStr = (() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  })();

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
  const choferEfectivoId = esAdminReal ? (choferSimuladoId || 0) : (dispositivo?.id || 0);
  const choferEfectivoNombre = useMemo(() => {
    if (!esAdminReal && dispositivo?.nombreCompleto) return dispositivo.nombreCompleto;
    const encontrado = choferesLista.find((c) => c.id === choferSimuladoId || (c as any).usuarioId === choferSimuladoId);
    return encontrado?.nombreCompleto || dispositivo?.nombreCompleto || 'Conductor';
  }, [esAdminReal, choferSimuladoId, choferesLista, dispositivo]);

  // Modo Híbrido: Los choferes pueden iniciar libremente sus turnos y rutas sin permiso temporal previo
  const tienePermisoCrearRuta = true;

  // Estados para creación de viajes/tickets por el chofer con selección de fecha, turno y camión
  const [fechaNuevoViaje, setFechaNuevoViaje] = useState(hoyStr);
  const [camionNuevoViajeId, setCamionNuevoViajeId] = useState<number | null>(null);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<'MANANA' | 'TARDE' | 'OTRO'>('MANANA');

  const abrirModalCrearTicket = (fechaInicial?: string, turnoInicial?: 'MANANA' | 'TARDE') => {
    const f = fechaInicial || (viajeActivo?.fecha ? viajeActivo.fecha.split('T')[0] : hoyStr);
    setFechaNuevoViaje(f);
    setCamionNuevoViajeId(dispositivo?.camionId || viajeActivo?.camionId || (camionesLista.length > 0 ? camionesLista[0].id : null));
    setRutaNuevoViajeId(null);
    setObsNuevoViaje('');
    setTurnoSeleccionado(turnoInicial || (viajesChofer.length === 0 ? 'MANANA' : 'TARDE'));
    setModalNuevoViajeChofer(true);
  };

  const cargarChoferesPermisos = async () => {
    setCargandoPermisosChoferes(true);
    try {
      const list = await sistemaApi.getUsuarios('CHOFER');
      setUsuariosChoferesPermisos(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.warn('Error al cargar choferes para permisos:', err);
    } finally {
      setCargandoPermisosChoferes(false);
    }
  };

  const handleTogglePermisoChofer = async (choferId: number, estadoActual: boolean) => {
    setModificandoPermisoChoferId(choferId);
    try {
      const nuevo = !estadoActual;
      const res = await sistemaApi.actualizarPermisoCrearViaje(choferId, nuevo);
      toast.success(res.message || (nuevo ? 'Permiso de 1 ruta otorgado' : 'Permiso revocado'));
      setUsuariosChoferesPermisos((prev) =>
        prev.map((u) => (u.id === choferId ? { ...u, permisoCrearViaje: nuevo } : u))
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al actualizar permiso.');
    } finally {
      setModificandoPermisoChoferId(null);
    }
  };

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

  // Mapa reactivo de Choferes que tienen viaje o ruta activa actualmente
  const choferesConViajeActivo = useMemo(() => {
    const mapActivos = new Map<number, ControlRutaDto>();
    viajesEnVivo.forEach((v) => {
      const est = String(v.estado || '').toUpperCase();
      const esActivo =
        (v.procesoActualId || 1) < 4 &&
        est !== 'FINALIZADO' &&
        est !== 'CERRADO' &&
        est !== 'AUDITADO' &&
        est !== 'CUADRADO';
      if (esActivo) {
        if (v.usuarioId && !mapActivos.has(v.usuarioId)) {
          mapActivos.set(v.usuarioId, v);
        }
        if (v.choferId && !mapActivos.has(v.choferId)) {
          mapActivos.set(v.choferId, v);
        }
        const nom = (v.nombreConductor || v.choferNombre || '').trim().toLowerCase();
        if (nom) {
          const matchCh = choferesLista.find(
            (c) => c.nombreCompleto && c.nombreCompleto.trim().toLowerCase() === nom
          );
          if (matchCh && !mapActivos.has(matchCh.id)) {
            mapActivos.set(matchCh.id, v);
          }
        }
      }
    });
    return mapActivos;
  }, [viajesEnVivo, choferesLista]);

  // Si el Admin entra a vista Chofer y el chofer seleccionado no tiene viaje activo pero otros sí, auto-seleccionar el primer activo
  useEffect(() => {
    if (esAdminReal && choferesConViajeActivo.size > 0) {
      const tieneActivo = choferesConViajeActivo.has(choferSimuladoId);
      if (!tieneActivo) {
        const primerId = Array.from(choferesConViajeActivo.keys())[0];
        if (primerId) {
          setChoferSimuladoId(primerId);
          try {
            localStorage.setItem('movil_chofer_simulado_id', String(primerId));
          } catch {}
          cargarViajeActivo(primerId);
          cargarDespachoActivo(primerId);
          cargarEntregasChofer(primerId);
        }
      }
    }
  }, [esAdminReal, choferesConViajeActivo]);
  const [cargandoViajesEnVivo, setCargandoViajesEnVivo] = useState(false);

  // Estados para Módulo Administrador - Logística Móvil
  const [fechaLogistica, setFechaLogistica] = useState(hoyStr);
  const [subTabLogistica, setSubTabLogistica] = useState<'asignaciones' | 'circuitos'>('asignaciones');
  const [planificaciones, setPlanificaciones] = useState<PlanificacionRutaChoferDto[]>([]);
  const [cargandoPlanificaciones, setCargandoPlanificaciones] = useState(false);
  const [rutasLogisticas, setRutasLogisticas] = useState<RutaLogisticaDto[]>(() => {
    try {
      const saved = localStorage.getItem('movil_rutas_cache');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [camionesLista, setCamionesLista] = useState<CamionDto[]>(() => {
    try {
      const saved = localStorage.getItem('movil_camiones_cache');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Catálogos para "Inicio de Nuevo Turno": se guardan en el teléfono para poder usarlos sin internet
  useEffect(() => {
    if (rutasLogisticas.length > 0) {
      try { localStorage.setItem('movil_rutas_cache', JSON.stringify(rutasLogisticas)); } catch {}
    }
  }, [rutasLogisticas]);
  useEffect(() => {
    if (camionesLista.length > 0) {
      try { localStorage.setItem('movil_camiones_cache', JSON.stringify(camionesLista)); } catch {}
    }
  }, [camionesLista]);
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
  const [busquedaFincaRapida, setBusquedaFincaRapida] = useState('');
  const [filtroEnVivo, setFiltroEnVivo] = useState<'activos' | 'hoy' | 'anteriores' | 'todos'>('activos');

  const [modalCircuito, setModalCircuito] = useState<{
    open: boolean;
    esEdicion: boolean;
    id?: number;
    nombre: string;
    codigo: string;
    color: string;
    descripcion: string;
    fincasIds: number[];
  } | null>(null);
  const [busquedaFincasNuevoCircuito, setBusquedaFincasNuevoCircuito] = useState('');
  const [busquedaChoferSupervisar, setBusquedaChoferSupervisar] = useState('');
  const [dropdownChoferSupervisarAbierto, setDropdownChoferSupervisarAbierto] = useState(false);

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
  const [fincasVerificarMovil, setFincasVerificarMovil] = useState<any[]>([]);
  const [fincasVerificadasMovilIds, setFincasVerificadasMovilIds] = useState<Set<number>>(new Set());
  const [cargandoFincasMovil, setCargandoFincasMovil] = useState<boolean>(false);
  const [fotoZoomMovil, setFotoZoomMovil] = useState<string | null>(null);

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

  // Cargar fincas del ticket al abrir el modal de verificación de litros en receptoría
  useEffect(() => {
    const tId = modalVerificarLitros?.ticket?.id;
    if (tId) {
      setCargandoFincasMovil(true);
      operacionesApi.getFincasViaje(tId)
        .then((res) => {
          const list = Array.isArray(res) ? res : [];
          setFincasVerificarMovil(list);
          setFincasVerificadasMovilIds(new Set());
        })
        .catch(() => {
          setFincasVerificarMovil([]);
          setFincasVerificadasMovilIds(new Set());
        })
        .finally(() => {
          setCargandoFincasMovil(false);
        });
    } else {
      setFincasVerificarMovil([]);
      setFincasVerificadasMovilIds(new Set());
    }
  }, [modalVerificarLitros?.ticket?.id]);

  // Estado para la pantalla de Vinculación
  const [codigoInput, setCodigoInput] = useState('');
  const [vinculando, setVinculando] = useState(false);

  // Estado para el modal de Registro de Carga
  const [modalRegistro, setModalRegistro] = useState(false);
  const [fincaFijadaParaModal, setFincaFijadaParaModal] = useState<any>(null);
  const [formCarga, setFormCarga] = useState({
    fecha: hoyStr,
    fincaId: 0,
    litros: '',
    tipoLeche: 'VACA',
    esAcida: false,
    esDiferido: false,
    litrosDiferir: '',
    temperatura: '',
    observacion: '',
    fotoRecibo: '',
  });
  const [busquedaFinca, setBusquedaFinca] = useState('');
  const [fotoReciboVerModal, setFotoReciboVerModal] = useState<string | null>(null);
  const inputFotoReciboRef = useRef<HTMLInputElement | null>(null);

  // Sincronización en tiempo real de módulos SaaS en App Móvil
  useEffect(() => {
    syncModulosTenant();
    const interval = setInterval(() => {
      syncModulosTenant();
    }, 4000);
    return () => clearInterval(interval);
  }, [syncModulosTenant]);

  // Si Búfala se deshabilita mientras se está usando en el formulario de carga o admin litros
  const prevBufalaRef = useRef<boolean>(tieneModuloBufala);
  useEffect(() => {
    if (prevBufalaRef.current && !tieneModuloBufala) {
      if (formCarga.tipoLeche === 'BUFALA') {
        setFormCarga((prev) => ({ ...prev, tipoLeche: 'VACA' }));
        Swal.fire({
          icon: 'warning',
          title: 'Módulo Búfala Deshabilitado',
          text: 'El Módulo de Leche de Búfala ha sido deshabilitado para su empresa desde SaaS. Por favor de recargar la pagina',
          confirmButtonColor: '#0284c7',
        });
      }
      if (formAdminLitros.tipoLeche === 'BUFALA') {
        setFormAdminLitros((prev) => ({ ...prev, tipoLeche: 'VACA' }));
        Swal.fire({
          icon: 'warning',
          title: 'Módulo Búfala Deshabilitado',
          text: 'El Módulo de Leche de Búfala ha sido deshabilitado para su empresa desde SaaS. Por favor de recargar la pagina',
          confirmButtonColor: '#0284c7',
        });
      }
    }
    prevBufalaRef.current = tieneModuloBufala;
  }, [tieneModuloBufala, formCarga.tipoLeche, formAdminLitros.tipoLeche]);

  // =========================================================================
  // ESTADOS MODAL ENTREGA DIRECTA A COMPAÑÍAS / RECEPTORÍA (1:1 V2_3_11_26)
  // =========================================================================
  interface FilaEntregaDirectaMovil {
    companiaId: number;
    litros: number | string;
    tipoLeche: string;
    origenServicio?: 'RUTA' | 'TRANSPORTE' | 'ACIDA';
    origenFincasCount?: number;
  }
  const [modalEntregaDirecta, setModalEntregaDirecta] = useState(false);
  const [filasEntregaDirecta, setFilasEntregaDirecta] = useState<FilaEntregaDirectaMovil[]>([
    { companiaId: 0, litros: '', tipoLeche: 'VACA' },
  ]);
  const [obsEntregaDirecta, setObsEntregaDirecta] = useState('');
  const [guardandoEntregaDirecta, setGuardandoEntregaDirecta] = useState(false);
  const [listaCompaniasMovil, setListaCompaniasMovil] = useState<CompaniaDto[]>([]);

  // =========================================================================
  // ESTADOS MODAL TRASPASO DE LECHE A OTRO CHOFER (1:1 RecoleccionRutasPage)
  // =========================================================================
  const [modalTraspasoMovil, setModalTraspasoMovil] = useState(false);
  const [modoTraspasoMovil, setModoTraspasoMovil] = useState<'EXISTENTE' | 'NUEVO'>('EXISTENTE');
  const [formTraspasoMovil, setFormTraspasoMovil] = useState({
    ticketDestinoId: 0,
    litrosTraspaso: 0 as number | string,
    observacion: '',
  });
  const [traspasoChoferDestinoId, setTraspasoChoferDestinoId] = useState<number>(0);
  const [traspasoFechaDestino, setTraspasoFechaDestino] = useState<string>(hoyStr);
  const [guardandoTraspaso, setGuardandoTraspaso] = useState(false);
  const [viajesDisponiblesTraspaso, setViajesDisponiblesTraspaso] = useState<ControlRutaDto[]>([]);

  const comprimirImagenMovil = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxWidth = 800;
          const maxHeight = 800;
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
          resolve(canvas.toDataURL('image/jpeg', 0.65));
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

  // Estados y Funciones para Confirmación de Despacho / Entrega en Planta (Chofer)
  const [modalConfirmarDespachoChofer, setModalConfirmarDespachoChofer] = useState<DespachoCompaniaDto | null>(null);
  const [formConfirmacionDespacho, setFormConfirmacionDespacho] = useState({
    litrosRecibidos: '' as string | number,
    observacion: '',
    fotoReciboUrl: '',
  });
  const [guardandoConfirmacionDespacho, setGuardandoConfirmacionDespacho] = useState(false);
  const inputFotoReciboDespachoRef = useRef<HTMLInputElement | null>(null);

  const handleSubirFotoReciboDespacho = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await comprimirImagenMovil(file);
      setFormConfirmacionDespacho((prev) => ({ ...prev, fotoReciboUrl: base64 }));
      toast.success('Foto del comprobante/recibo capturada');
    } catch {
      toast.error('No se pudo procesar la foto del recibo');
    }
    e.target.value = '';
  };

  const handleConfirmarEntregaChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalConfirmarDespachoChofer) return;
    const litrosNum = Number(formConfirmacionDespacho.litrosRecibidos);
    if (!litrosNum || litrosNum <= 0) {
      toast.error('Por favor ingresa los litros reales recibidos en planta');
      return;
    }
    setGuardandoConfirmacionDespacho(true);
    try {
      const res = await operacionesApi.validarEntregaCompania(modalConfirmarDespachoChofer.id, {
        litrosConfirmados: litrosNum,
        litrosRecibidosCompania: litrosNum,
        observacion: formConfirmacionDespacho.observacion || 'Confirmado por chofer desde App Móvil',
        observaciones: formConfirmacionDespacho.observacion || 'Confirmado por chofer desde App Móvil',
        fotoReciboUrl: formConfirmacionDespacho.fotoReciboUrl || undefined,
      });
      toast.success(res.message || '¡Entrega confirmada y recibo enviado exitosamente!');
      setModalConfirmarDespachoChofer(null);
      setFormConfirmacionDespacho({ litrosRecibidos: '', observacion: '', fotoReciboUrl: '' });
      await cargarEntregasChofer();
      await cargarDespachoActivo();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al confirmar la entrega en planta');
    } finally {
      setGuardandoConfirmacionDespacho(false);
    }
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
    if ((!dispositivo && !authUser) || !isOnline) return;

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

            // Alerta visual Toast en pantalla si la app está visible
            const nReciente = nuevas[0];
            toast.info(`🔔 ${nReciente.titulo}`, {
              description: nReciente.mensaje,
              duration: 8000,
              action: {
                label: 'Ver Alerta',
                onClick: () => setModalNotificaciones(true),
              },
            });

            // AVISO DIRECTO AL TELÉFONO (Vibración + Sonido + Notificación en Pantalla Bloqueada vía Service Worker)
            emitirNotificacionTelefono(nReciente.titulo, nReciente.mensaje, nReciente.id);

            // AUTO-ACTUALIZACIÓN INMEDIATA MULTI-ROL:
            // Al recibir una notificación (recolección de leche, nueva finca, cambio de ruta, confirmación, etc.):
            // Recargar automáticamente todas las vistas según el modo activo sin requerir refresh manual
            cargarViajeActivo();
            cargarDespachoActivo();
            cargarDatosAdminEnVivo(true);
            cargarDatosLogisticaAdmin();
            if (modalTimelapseMovil && viajeTimelapseMovil?.id) {
              operacionesApi.getFincasViaje(viajeTimelapseMovil.id).then((p) => {
                if (Array.isArray(p)) setParadasTimelapseMovil(p);
              }).catch(() => {});
            }
            if (modoActivo === 'TALLER') {
              cargarDatosTaller();
            }
          }

          setNotificaciones(data);
        }
      } catch (err) {
        console.warn('Error al consultar notificaciones móvil:', err);
      }
    };

    pollingNotificaciones();
    // Consultar cada 6 segundos para respuesta casi instantánea a cambios de ruta y cargas en vivo
    const interval = setInterval(pollingNotificaciones, 6000);
    return () => clearInterval(interval);
  }, [dispositivo, authUser, isOnline, modoActivo, tabActiva, modalTimelapseMovil, viajeTimelapseMovil?.id]);

  // Sincronización continua en segundo plano cada 12s para todas las vistas (auto-actualización silenciosa)
  useEffect(() => {
    if (!isOnline) return;
    const intervalAutoSync = setInterval(() => {
      if (modoActivo === 'CHOFER') {
        cargarViajeActivo();
      } else if (modoActivo === 'ADMIN') {
        cargarDatosAdminEnVivo(true);
        if (tabActiva === 'admin_logistica') {
          cargarDatosLogisticaAdmin();
        }
      } else if (modoActivo === 'TALLER') {
        cargarDatosTaller();
      }
    }, 12000);
    return () => clearInterval(intervalAutoSync);
  }, [isOnline, modoActivo, tabActiva, fechaLogistica, viajeSeleccionadoId]);

  // Helper para persistencia segura de cargas locales tolerante a cuota de localStorage
  const guardarCargasLocalSeguro = (listaCargas: CargaOffline[]) => {
    try {
      localStorage.setItem('movil_cargas_local', JSON.stringify(listaCargas));
    } catch (e) {
      console.warn('Quota de localStorage excedida por fotos, guardando versión ligera en localStorage:', e);
      try {
        const cargasLigeras = listaCargas.map((c) => ({
          ...c,
          fotoRecibo: c.fotoRecibo ? (c.fotoRecibo.length > 500 ? '[EN_INDEXEDDB]' : c.fotoRecibo) : undefined,
        }));
        localStorage.setItem('movil_cargas_local', JSON.stringify(cargasLigeras));
      } catch {}
    }
  };

  // Guardar cargas en LocalStorage cada vez que cambian (con protección anti-quota)
  useEffect(() => {
    guardarCargasLocalSeguro(cargas);
  }, [cargas]);

  // Auto-sincronización automática cuando se recupera o detecta conexión a internet
  useEffect(() => {
    if (isOnline && dispositivo) {
      sincronizarCargas();
    }
  }, [isOnline]);

  // Listener de eventos del SyncEngine (IndexedDB)
  useEffect(() => {
    const handleSyncComplete = (e: any) => {
      const detail = e.detail;
      if (detail && detail.totalSubidos > 0) {
        cargarViajeActivo();
        cargarDatosAdminEnVivo();
        if (tabActiva === 'admin_logistica') {
          cargarDatosLogisticaAdmin();
        }
        if (modalTimelapseMovil && viajeTimelapseMovil?.id) {
          operacionesApi.getFincasViaje(viajeTimelapseMovil.id).then((p) => {
            if (Array.isArray(p)) setParadasTimelapseMovil(p);
          }).catch(() => {});
        }
      }
    };

    const handleNotifAlerta = (e: any) => {
      const d = e.detail;
      if (d) {
        toast.success(d.titulo, { description: d.mensaje });
      }
    };

    window.addEventListener('transporte_sync_completada', handleSyncComplete);
    window.addEventListener('transporte_notificacion_alerta', handleNotifAlerta);
    return () => {
      window.removeEventListener('transporte_sync_completada', handleSyncComplete);
      window.removeEventListener('transporte_notificacion_alerta', handleNotifAlerta);
    };
  }, [dispositivo]);

  // Cargar catálogo de choferes y rutas para selector de administración y nuevos turnos si está online
  useEffect(() => {
    if (isOnline) {
      catalogosApi.getChoferes().then((ch) => {
        if (Array.isArray(ch) && ch.length > 0) {
          const soloActivos = ch.filter((c) => c.activo === true || (c as any).activo === 1);
          setChoferesLista(soloActivos);
        }
      }).catch(() => {});

      operacionesApi.getRutasLogistica().then((rutas: any) => {
        if (Array.isArray(rutas) && rutas.length > 0) setRutasLogisticas(rutas);
      }).catch(() => {});

      // Cisternas disponibles para "Inicio de Nuevo Turno" (se guardan en el teléfono para uso offline)
      catalogosApi.getCamiones(false).then((cams: any) => {
        if (Array.isArray(cams) && cams.length > 0) setCamionesLista(cams);
      }).catch(() => {});

      if (esAdminReal) {
        cargarDatosAdminEnVivo();
      }
    }
  }, [isOnline, esAdminReal]);

  // Refrescar fincas, entregas, perfil, viaje activo y despacho activo (soporta online y offline sin interrupciones)
  useEffect(() => {
    if (dispositivo) {
      if (isOnline) {
        cargarFincasServidor();
        cargarPerfilServidor();
      }
      cargarViajeActivo();
      cargarDespachoActivo();
      cargarEntregasChofer();
    }
  }, [choferEfectivoId, isOnline, dispositivo]);

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

  const seleccionarViaje = async (v: ControlRutaDto) => {
    if (!v || !v.id) return;
    setViajeSeleccionadoId(v.id);
    setViajeActivo(v);
    try {
      localStorage.setItem('movil_viaje_seleccionado_id', String(v.id));
      localStorage.setItem('movil_viaje_activo', JSON.stringify(v));
    } catch {}

    if (v.camionId || v.camionPlaca) {
      setDispositivo((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          camionId: v.camionId || prev.camionId,
          placaCamion: v.camionPlaca || prev.placaCamion,
          capacidadTanqueLitros: v.capacidadCamionLitros || prev.capacidadTanqueLitros || 6000,
        };
      });
    }

    setCargandoViaje(true);
    try {
      if (v.id < 0) {
        // Ticket iniciado sin conexión: aún no existe en la central, no hay nada que consultar
        setParadasViajeActivo([]);
        return;
      }
      const paradas = await operacionesApi.getFincasViaje(v.id);
      if (Array.isArray(paradas)) {
        setParadasViajeActivo(paradas);
        try { localStorage.setItem('movil_paradas_activo', JSON.stringify(paradas)); } catch {}
      }
      await cargarDespachoActivo(choferEfectivoId, v.id);
    } catch (err) {
      console.warn('Error al cambiar de viaje activo:', err);
    } finally {
      setCargandoViaje(false);
    }
  };

  const handleIniciarNuevoViajeChofer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!choferEfectivoId) {
      toast.error('No se ha detectado el conductor asignado');
      return;
    }
    const fFinal = fechaNuevoViaje || hoyStr;
    setIniciandoViajeChofer(true);
    const turnoNombre =
      turnoSeleccionado === 'MANANA'
        ? 'Turno 1 (Mañana)'
        : turnoSeleccionado === 'TARDE'
        ? 'Turno 2 (Tarde)'
        : `Turno ${viajesChofer.length + 1}`;
    const camionEfectivoId = camionNuevoViajeId || dispositivo?.camionId || viajeActivo?.camionId || undefined;
    // Marca única del turno: si el envío se repite (señal débil, doble toque, reintento), la central
    // reconoce este código y devuelve el MISMO ticket en vez de crear otro.
    const uuidViaje = ticketsLocales.nuevoUuid();
    const payloadViaje = {
      fecha: fFinal,
      choferId: choferEfectivoId,
      conductorId: choferEfectivoId,
      camionId: camionEfectivoId,
      rutaLogisticaId: rutaNuevoViajeId || undefined,
      observaciones: `[LOCAL:${uuidViaje}] Viaje creado desde App Móvil - ${turnoNombre}. ${obsNuevoViaje}`.trim(),
    };

    // Crea el ticket SOLO en el teléfono (sin internet). Se subirá solo a la central al recuperar señal.
    const crearTicketLocal = async () => {
      const camionSel = camionesLista.find((c) => c.id === camionEfectivoId);
      const rutaSel = rutasLogisticas.find((r) => r.id === rutaNuevoViajeId);
      const localId = ticketsLocales.nuevoIdLocal();
      const ticketLocal: any = {
        id: localId,
        codigoTicket: 'LOCAL',
        fecha: fFinal,
        usuarioId: choferEfectivoId,
        choferId: choferEfectivoId,
        nombreConductor: choferEfectivoNombre,
        camionId: camionEfectivoId,
        camionPlaca: camionSel?.placa || dispositivo?.placaCamion,
        capacidadCamionLitros: camionSel?.capacidadLitros || dispositivo?.capacidadTanqueLitros || 6000,
        procesoActualId: 1,
        estado: 'ABIERTO',
        rutaLogisticaId: rutaNuevoViajeId || undefined,
        rutaNombre: rutaSel?.nombre,
        totalLitrosFinca: 0,
        totalFincas: 0,
        observacion: payloadViaje.observaciones,
        createdAt: new Date().toISOString(),
        _pendienteSync: true,
      };
      ticketsLocales.agregar({
        localId,
        creadoEn: ticketLocal.createdAt,
        payload: payloadViaje,
        ticket: ticketLocal,
      });

      const nuevaLista = [...viajesChofer.filter((v) => v.id !== localId), ticketLocal as ControlRutaDto];
      setViajesChofer(nuevaLista);
      setViajeSeleccionadoId(localId);
      setViajeActivo(ticketLocal as ControlRutaDto);
      setParadasViajeActivo([]);
      try {
        localStorage.setItem('movil_viajes_chofer', JSON.stringify(nuevaLista));
        localStorage.setItem(`movil_viajes_chofer_${choferEfectivoId}`, JSON.stringify(nuevaLista));
        localStorage.setItem('movil_viaje_seleccionado_id', String(localId));
        localStorage.setItem('movil_viaje_activo', JSON.stringify(ticketLocal));
        localStorage.setItem(`movil_viaje_activo_${choferEfectivoId}`, JSON.stringify(ticketLocal));
        localStorage.setItem('movil_paradas_activo', JSON.stringify([]));
      } catch {}

      setModalNuevoViajeChofer(false);
      setRutaNuevoViajeId(null);
      setObsNuevoViaje('');
      toast.info(`${turnoNombre} iniciado en el teléfono (sin conexión). Se enviará a la central al tener señal.`);
    };

    try {
      if (!navigator.onLine || !isOnline) {
        await crearTicketLocal();
        return;
      }

      const res = await operacionesApi.iniciarViaje(payloadViaje);

      await Swal.fire({
        icon: 'success',
        title: `¡${turnoNombre} Creado!`,
        text: `Se ha generado el Ticket #${res.id || ''} para la fecha ${fFinal}.`,
        confirmButtonColor: '#059669',
        timer: 2500,
        showConfirmButton: false,
      });

      setModalNuevoViajeChofer(false);
      setRutaNuevoViajeId(null);
      setObsNuevoViaje('');
      await cargarViajeActivo(choferEfectivoId, res.id);
    } catch (err: any) {
      const status = err?.response?.status;
      const sinRespuestaDelServidor = !err?.response || status === 0 || status === 502 || status === 503 || status === 504;
      if (sinRespuestaDelServidor) {
        // Señal débil o servidor inalcanzable: no se pierde el turno, se guarda en el teléfono
        await crearTicketLocal();
      } else {
        toast.error(err.response?.data?.message || 'Error al iniciar nuevo viaje');
      }
    } finally {
      setIniciandoViajeChofer(false);
    }
  };

  const getTurnoInfo = (viaje: ControlRutaDto, idx: number) => {
    let tituloTurno = '';
    let iconoTurno = 'fa-sun';
    if (idx === 0) {
      tituloTurno = '🌅 Turno 1 (Mañana)';
      iconoTurno = 'fa-sun';
    } else if (idx === 1) {
      tituloTurno = '🌇 Turno 2 (Tarde)';
      iconoTurno = 'fa-cloud-sun';
    } else if (idx === 2) {
      tituloTurno = '🌙 Turno 3 (Noche)';
      iconoTurno = 'fa-moon';
    } else {
      tituloTurno = `🚛 Viaje #${idx + 1}`;
      iconoTurno = 'fa-truck';
    }
    const proc = viaje.procesoActualId || 1;
    const est = String(viaje.estado || '').toUpperCase();
    const esFinalizado = proc >= 4 || est === 'FINALIZADO' || est === 'CERRADO' || est === 'ENTREGADO' || est === 'CUADRADO';
    const esReceptoria = proc === 2 || est === 'RECEPCIONADO' || est === 'EN RECEPTORIA';
    const esPlanta = proc === 3 || est === 'CAMINO_COMPANIA' || est === 'EN VIA';

    let estadoLabel = '🟢 EN RECOLECCIÓN';
    let estadoColor = '#15803d';
    let estadoBg = '#dcfce7';

    if (esFinalizado) {
      estadoLabel = '🔒 CERRADO';
      estadoColor = '#475569';
      estadoBg = '#f1f5f9';
    } else if (esReceptoria) {
      estadoLabel = '🔒 EN RECEPTORÍA';
      estadoColor = '#b45309';
      estadoBg = '#fef3c7';
    } else if (esPlanta) {
      estadoLabel = '🏭 EN PLANTA';
      estadoColor = '#1d4ed8';
      estadoBg = '#dbeafe';
    }

    return { tituloTurno, iconoTurno, estadoLabel, estadoColor, estadoBg, esFinalizado, esReceptoria, esPlanta };
  };

  const cargarViajeActivo = async (idTarget?: number, forzarId?: number) => {
    const idBusqueda = idTarget || choferEfectivoId;
    if (!idBusqueda) return;

    // Si no hay red disponible, recuperar de LocalStorage inmediatamente
    if (!navigator.onLine || !isOnline) {
      try {
        const savedList = localStorage.getItem(`movil_viajes_chofer_${idBusqueda}`) || localStorage.getItem('movil_viajes_chofer');
        if (savedList) {
          const listParsed = JSON.parse(savedList);
          if (Array.isArray(listParsed)) setViajesChofer(listParsed);
        }
        const savedV = localStorage.getItem(`movil_viaje_activo_${idBusqueda}`) || localStorage.getItem('movil_viaje_activo');
        if (savedV) {
          const vParsed = JSON.parse(savedV);
          if (vParsed && vParsed.id) setViajeActivo(vParsed);
        }
        const savedP = localStorage.getItem('movil_paradas_activo');
        if (savedP) {
          const pParsed = JSON.parse(savedP);
          if (Array.isArray(pParsed)) setParadasViajeActivo(pParsed);
        }
      } catch {}
      return;
    }

    setCargandoViaje(true);
    try {
      // 1. Obtener todos los viajes activos del chofer en TB_CONTROL_RUTAS (sin restringir por fecha de hoy para no bloquear tickets abiertos de días anteriores como #21303)
      let lista = await operacionesApi.getViajesActivosChofer(idBusqueda);
      if (!Array.isArray(lista) || lista.length === 0) {
        const fConsulta = viajeActivo?.fecha ? viajeActivo.fecha.split('T')[0] : hoyStr;
        lista = await operacionesApi.getViajesActivosChofer(idBusqueda, fConsulta);
      }
      if (!Array.isArray(lista) || lista.length === 0) {
        const unico = await operacionesApi.getViajeActivo(idBusqueda);
        if (unico && unico.id) lista = [unico];
        else lista = [];
      }

      // REGLA: Los choferes solo ven tickets y rutas de HOY hacia atrás, salvo que se haya forzado un ticket creado
      if (esChoferReal && Array.isArray(lista)) {
        lista = lista.filter((t: any) => {
          if (forzarId && t.id === forzarId) return true;
          const f = t.fecha ? String(t.fecha).split('T')[0] : '';
          return !f || f <= hoyStr || (viajeSeleccionadoId && t.id === viajeSeleccionadoId);
        });
      }

      // Tickets iniciados SIN conexión que aún no se han subido a la central: se siguen mostrando
      const ticketsLocalesPend = ticketsLocales
        .listarPendientes()
        .filter((t) => Number(t.ticket?.usuarioId) === Number(idBusqueda))
        .map((t) => t.ticket as ControlRutaDto);
      if (ticketsLocalesPend.length > 0) {
        lista = [...lista, ...ticketsLocalesPend];
      }

      // Si el ticket seleccionado era local y ya fue creado en la central, pasar a su ID real
      if (!forzarId && viajeSeleccionadoId && viajeSeleccionadoId < 0) {
        const idReal = ticketsLocales.resolverId(viajeSeleccionadoId);
        if (idReal > 0) forzarId = idReal;
      }

      setViajesChofer(lista);
      try {
        localStorage.setItem('movil_viajes_chofer', JSON.stringify(lista));
        localStorage.setItem(`movil_viajes_chofer_${idBusqueda}`, JSON.stringify(lista));
      } catch {}

      // 2. Determinar cuál viaje seleccionar
      let targetV: ControlRutaDto | null = null;
      if (forzarId) {
        targetV = lista.find((x) => x.id === forzarId) || null;
      }
      // Si se especificó un chofer diferente (idTarget), buscar prioritariamente el viaje activo de ese chofer
      if (!targetV && !idTarget && viajeSeleccionadoId) {
        targetV = lista.find((x) => x.id === viajeSeleccionadoId) || null;
      }
      if (!targetV && lista.length > 0) {
        // Priorizar el primer viaje que esté en proceso < 4 (abierto o en ruta)
        const abierto = lista.find(
          (x) =>
            (x.procesoActualId || 1) < 4 &&
            String(x.estado || '').toUpperCase() !== 'FINALIZADO' &&
            String(x.estado || '').toUpperCase() !== 'CERRADO'
        );
        targetV = abierto || lista[0] || lista[lista.length - 1];
      }

      if (targetV && targetV.id) {
        setViajeSeleccionadoId(targetV.id);
        setViajeActivo(targetV);
        try {
          localStorage.setItem('movil_viaje_seleccionado_id', String(targetV.id));
          localStorage.setItem('movil_viaje_activo', JSON.stringify(targetV));
          localStorage.setItem(`movil_viaje_activo_${idBusqueda}`, JSON.stringify(targetV));
        } catch {}

        if (targetV.camionId || targetV.camionPlaca) {
          setDispositivo((prev) => {
            if (!prev) return null;
            if (
              prev.camionId === targetV.camionId &&
              prev.placaCamion === (targetV.camionPlaca || prev.placaCamion) &&
              prev.capacidadTanqueLitros === (targetV.capacidadCamionLitros || prev.capacidadTanqueLitros)
            ) {
              return prev;
            }
            const updated = {
              ...prev,
              camionId: targetV.camionId || prev.camionId,
              placaCamion: targetV.camionPlaca || prev.placaCamion,
              capacidadTanqueLitros: targetV.capacidadCamionLitros || prev.capacidadTanqueLitros || 6000,
            };
            localStorage.setItem('movil_device_info', JSON.stringify(updated));
            return updated;
          });
        }

        // Cargar paradas del viaje seleccionado (un ticket local aún no existe en la central)
        const paradas = targetV.id < 0 ? null : await operacionesApi.getFincasViaje(targetV.id);
        if (Array.isArray(paradas)) {
          // Unificación Defensiva: No permitir que paradas del servidor con 0 litros sobrescriban
          // recolecciones locales pendientes o confirmadas recientemente en memoria
          const paradasUnificadas = paradas.map((p: any) => {
            const fId = Number(p.fincaId || p.FincaId);
            const cargaLocal = cargas.find((c) => Number(c.fincaId) === fId);
            if (cargaLocal && (!p.litros || p.litros === 0)) {
              return {
                ...p,
                litros: cargaLocal.litros,
                Litros: cargaLocal.litros,
                tipoLeche: cargaLocal.tipoLeche || p.tipoLeche,
                esAcida: typeof cargaLocal.esAcida === 'boolean' ? cargaLocal.esAcida : p.esAcida,
                esDiferido: typeof cargaLocal.esDiferido === 'boolean' ? cargaLocal.esDiferido : p.esDiferido,
                litrosDiferir: cargaLocal.litrosDiferir,
              };
            }
            return p;
          });

          setParadasViajeActivo(paradasUnificadas);
          try { localStorage.setItem('movil_paradas_activo', JSON.stringify(paradasUnificadas)); } catch {}
          setCargas((prev) => {
            const soloPendientes = prev.filter((c) => !c.synced);
            guardarCargasLocalSeguro(soloPendientes);
            return soloPendientes;
          });
        }

        if (targetV.id > 0) {
          await cargarDespachoActivo(idBusqueda, targetV.id);
          await cargarRecoleccionesYSolicitudes(targetV.fecha ? targetV.fecha.split('T')[0] : hoyStr);
        }
      } else {
        setViajeSeleccionadoId(null);
        setViajeActivo(null);
        setParadasViajeActivo([]);
        try {
          localStorage.removeItem('movil_viaje_seleccionado_id');
          localStorage.removeItem('movil_viaje_activo');
          localStorage.removeItem('movil_paradas_activo');
        } catch {}
      }

      // Refrescar permiso de creación de viaje si es chofer y hay dispositivo conectado
      if (dispositivo?.id) {
        authApi.getMe().then((me: any) => {
          if (me && typeof me.permisoCrearViaje !== 'undefined') {
            setDispositivo((prev) => {
              if (!prev || prev.permisoCrearViaje === me.permisoCrearViaje) return prev;
              const upd = { ...prev, permisoCrearViaje: me.permisoCrearViaje };
              try { localStorage.setItem('movil_device_info', JSON.stringify(upd)); } catch {}
              return upd;
            });
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('No se pudo sincronizar viajes activos con el servidor (recuperando de caché local):', err);
      try {
        const savedList = localStorage.getItem(`movil_viajes_chofer_${idBusqueda}`) || localStorage.getItem('movil_viajes_chofer');
        if (savedList) {
          const listParsed = JSON.parse(savedList);
          if (Array.isArray(listParsed) && listParsed.length > 0) setViajesChofer(listParsed);
        }
        const savedV = localStorage.getItem(`movil_viaje_activo_${idBusqueda}`) || localStorage.getItem('movil_viaje_activo');
        if (savedV) {
          const vParsed = JSON.parse(savedV);
          if (vParsed && vParsed.id) setViajeActivo(vParsed);
        }
        const savedP = localStorage.getItem('movil_paradas_activo');
        if (savedP) {
          const pParsed = JSON.parse(savedP);
          if (Array.isArray(pParsed) && pParsed.length > 0) setParadasViajeActivo(pParsed);
        }
      } catch {}
    } finally {
      setCargandoViaje(false);
    }
  };

  const cargarDespachoActivo = async (idTarget?: number, controlRutaIdTarget?: number) => {
    const idBusqueda = idTarget || choferEfectivoId;
    if (!idBusqueda) return;
    const targetRutaId = controlRutaIdTarget || viajeActivo?.id;

    // Si no hay red disponible, recuperar de LocalStorage inmediatamente
    if (!navigator.onLine || !isOnline) {
      try {
        const savedD = localStorage.getItem('movil_despacho_activo');
        if (savedD) setDespachoActivo(JSON.parse(savedD));
        const savedDs = localStorage.getItem('movil_despachos_activos');
        if (savedDs) setDespachosActivos(JSON.parse(savedDs));
      } catch {}
      return;
    }

    setCargandoDespacho(true);
    try {
      // 1. Consultar todos los tickets activos de despacho del chofer y viaje en curso
      const activos = await operacionesApi.getTicketsActivosDespachoChofer(idBusqueda, targetRutaId);
      if (Array.isArray(activos) && activos.length > 0) {
        setDespachosActivos(activos);
        setDespachoActivo(activos[0]);
        try {
          localStorage.setItem('movil_despacho_activo', JSON.stringify(activos[0]));
          localStorage.setItem('movil_despachos_activos', JSON.stringify(activos));
        } catch {}
      } else {
        // Fallback al endpoint legacy
        let t = await operacionesApi.getTicketActivoDespachoChofer(idBusqueda);
        if (!t || !t.id) {
          // Fallback: buscar en la lista general de despachos por usuario o nombre
          const all = await operacionesApi.getDespachosCompanias(undefined, undefined, undefined, undefined, idBusqueda);
          const enVia = (all || []).filter((d: any) => {
            const uId = Number(d.usuarioId || d.choferId || d.conductorId);
            const est = String(d.estado || '').toUpperCase();
            const nombreD = (d.nombreConductor || d.choferNombre || '').toLowerCase();
            const nombreTarget = (choferEfectivoNombre || dispositivo?.nombreCompleto || '').toLowerCase();
            return (uId === idBusqueda || (nombreTarget && nombreD.length > 2 && nombreD.includes(nombreTarget))) &&
              (est === 'EN VIA' || est === 'EN_TRANSITO' || est === 'PENDIENTE');
          });
          setDespachosActivos(enVia);
          setDespachoActivo(enVia.length > 0 ? enVia[0] : null);
          try {
            if (enVia.length > 0) localStorage.setItem('movil_despacho_activo', JSON.stringify(enVia[0]));
            localStorage.setItem('movil_despachos_activos', JSON.stringify(enVia));
          } catch {}
        } else {
          setDespachosActivos([t]);
          setDespachoActivo(t);
          try {
            localStorage.setItem('movil_despacho_activo', JSON.stringify(t));
            localStorage.setItem('movil_despachos_activos', JSON.stringify([t]));
          } catch {}
        }
      }
    } catch (err) {
      console.warn('No se pudo sincronizar el despacho activo con el servidor (recuperando de caché local):', err);
      try {
        const savedD = localStorage.getItem('movil_despacho_activo');
        if (savedD) setDespachoActivo(JSON.parse(savedD));
        const savedDs = localStorage.getItem('movil_despachos_activos');
        if (savedDs) setDespachosActivos(JSON.parse(savedDs));
      } catch {}
    } finally {
      setCargandoDespacho(false);
    }
  };

  const cargarEntregasChofer = async (idTarget?: number, fechaTarget?: string) => {
    const idBusqueda = idTarget || choferEfectivoId;
    if (!idBusqueda) return;
    const fEfectiva = fechaTarget || filtroFechaEntregas || hoyStr;

    // Si no hay red disponible, recuperar de LocalStorage inmediatamente
    if (!navigator.onLine || !isOnline) {
      try {
        const savedE = localStorage.getItem('movil_entregas_chofer');
        if (savedE) setEntregas(JSON.parse(savedE));
      } catch {}
      return;
    }

    setCargandoEntregas(true);
    try {
      const allDespachos = await operacionesApi.getDespachosCompanias(fEfectiva, undefined, undefined, undefined, idBusqueda);
      
      // Consultar también los despachos activos del chofer / viaje para asegurar que siempre aparezcan en la bandeja
      const activosViaje = await operacionesApi.getTicketsActivosDespachoChofer(idBusqueda, viajeActivo?.id);

      const unificadosMap = new Map<number, DespachoCompaniaDto>();
      (allDespachos || []).forEach((d: any) => {
        if (d.id) unificadosMap.set(d.id, d);
      });
      (activosViaje || []).forEach((d: any) => {
        if (d.id) unificadosMap.set(d.id, d);
      });

      const misDespachos = Array.from(unificadosMap.values()).filter((d: any) => {
        const uId = Number(d.usuarioId || d.choferId || d.conductorId);
        const nombreD = (d.nombreConductor || d.choferNombre || '').toLowerCase();
        const nombreTarget = (choferEfectivoNombre || dispositivo?.nombreCompleto || '').toLowerCase();
        const coincideId = uId === idBusqueda;
        const coincideNombre = Boolean(nombreTarget && nombreD.length > 2 && nombreD.includes(nombreTarget));
        const coincideCamion = Boolean(dispositivo?.camionId && d.camionId === dispositivo.camionId);
        const coincideViaje = Boolean(viajeActivo?.id && d.controlRutaId === viajeActivo.id);
        const perteneceAlChofer = coincideId || coincideNombre || coincideCamion || coincideViaje;
        if (!perteneceAlChofer) return false;

        // Si coincide con el viaje activo, mostrarlo prioritariamente en la bandeja
        if (coincideViaje) return true;

        // Filtrar estrictamente por el día seleccionado
        if (fEfectiva && d.fecha) {
          const dFechaStr = String(d.fecha).split('T')[0];
          return dFechaStr === fEfectiva;
        }
        return true;
      });
      setEntregas(misDespachos);
      try {
        localStorage.setItem('movil_entregas_chofer', JSON.stringify(misDespachos));
      } catch {}
    } catch (err) {
      console.warn('No se pudieron obtener entregas del servidor (recuperando de caché local):', err);
      try {
        const savedE = localStorage.getItem('movil_entregas_chofer');
        if (savedE) setEntregas(JSON.parse(savedE));
      } catch {}
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

      // Persistir en IndexedDB local
      dbLocal.guardarAveria({
        empresaCodigo: dispositivo?.empresaCodigo || 'EMPRESA',
        camionId: dispositivo.camionId,
        conductorId: dispositivo.id,
        titulo: formIncidente.titulo.trim(),
        descripcion: formIncidente.descripcion.trim(),
        urgencia: formIncidente.urgencia as any,
        odometroKm: formIncidente.odometroKm ? Number(formIncidente.odometroKm) : null,
        fecha: new Date().toISOString(),
        estadoSync: 'SINCRONIZADO',
      }).catch(() => {});

      toast.success(res.message || 'Avería enviada al Taller correctamente.');
      setFormIncidente({ titulo: '', descripcion: '', urgencia: 'MEDIA', odometroKm: '' });
      cargarMisIncidentesChofer();
    } catch (err: any) {
      // Guardar en IndexedDB offline para sincronización posterior
      dbLocal.guardarAveria({
        empresaCodigo: dispositivo?.empresaCodigo || 'EMPRESA',
        camionId: dispositivo.camionId,
        conductorId: dispositivo.id,
        titulo: formIncidente.titulo.trim(),
        descripcion: formIncidente.descripcion.trim(),
        urgencia: formIncidente.urgencia as any,
        odometroKm: formIncidente.odometroKm ? Number(formIncidente.odometroKm) : null,
        fecha: new Date().toISOString(),
        estadoSync: 'PENDIENTE',
      }).catch(() => {});

      toast.warning('Avería guardada en la base de datos local. Se enviará al taller al tener señal.');
      setFormIncidente({ titulo: '', descripcion: '', urgencia: 'MEDIA', odometroKm: '' });
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

  // Funciones Módulo Administrador Móvil con actualización interna/silenciosa en segundo plano
  const cargarDatosAdminEnVivo = async (silentParam?: boolean | any) => {
    const silent = typeof silentParam === 'boolean' ? silentParam : false;
    if (!silent && viajesEnVivo.length === 0) {
      setCargandoViajesEnVivo(true);
    }
    try {
      // Cargar todos los controles disponibles (sin restringir por fecha de hoy para ver tickets activos de días anteriores como #21303)
      const viajes = await operacionesApi.getControles();
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
      setChoferesLista(Array.isArray(chofs) ? chofs.filter((c) => c.activo === true || (c as any).activo === 1) : []);
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

    // Asegurar que ninguna finca que ya recolectó leche en esta ruta pueda ser eliminada (Blindaje)
    const planActual = planificaciones.find((p) => p.id === modalPlanificar.id);
    const controlAsociado = planActual?.controlRutaId
      ? viajesEnVivo.find((v) => v.id === planActual.controlRutaId)
      : viajesEnVivo.find((v) => v.camionId === modalPlanificar.camionId && (v.procesoActualId || 1) < 4);
    const paradasConLeche = (controlAsociado as any)?.paradas || (controlAsociado as any)?.fincasDetalle || [];
    const fincasConLecheIds = paradasConLeche
      .filter((p: any) => Number(p.litros || p.litrosLeche || p.litrosCargados || 0) > 0)
      .map((p: any) => Number(p.fincaId || p.FincaId))
      .filter((id: number) => id > 0);
    if (planActual?.fincasRecolectadasIds) {
      planActual.fincasRecolectadasIds.forEach((fId) => fincasConLecheIds.push(fId));
    }

    const fincasFinales = Array.from(new Set([...modalPlanificar.fincasIds, ...fincasConLecheIds]));

    const litrosEst = fincasFinales.reduce((sum, fid) => {
      const p = fincasPromedio.find((fp) => fp.fincaId === fid);
      return sum + (p?.promedioLitros || 0);
    }, 0);

    try {
      const dto: GuardarPlanificacionRutaChoferDto = {
        id: modalPlanificar.esEdicion ? modalPlanificar.id : undefined,
        fecha: modalPlanificar.esEdicion && planActual?.fecha ? planActual.fecha.split('T')[0] : fechaLogistica,
        camionId: modalPlanificar.camionId,
        conductorId: modalPlanificar.conductorId,
        rutaLogisticaId: modalPlanificar.rutaLogisticaId || undefined,
        fincasIds: fincasFinales,
        litrosEstimados: Math.round(litrosEst),
        observacion: modalPlanificar.observacion.trim() || undefined,
      };

      const res = await operacionesApi.guardarPlanificacionChofer(dto);

      // Sincronizar paradas en el ticket si existe
      const ticketIdRef = planActual?.controlRutaId || controlAsociado?.id;
      if (ticketIdRef) {
        try {
          await operacionesApi.modificarFincasTicket(ticketIdRef, fincasFinales);
        } catch {}
      }

      toast.success(res.message || 'Planificación guardada exitosamente');
      setModalPlanificar(null);
      await cargarDatosLogisticaAdmin(fechaLogistica);
      await cargarDatosAdminEnVivo();

      // Recargar la vista activa del chofer en tiempo real
      await cargarViajeActivo(modalPlanificar.conductorId);
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

      // Notificación instantánea directa al chofer sobre la finca agregada
      const fincaObj = fincas.find((f) => f.id === fincaIdNueva);
      const fincaNom = fincaObj?.nombre || `Finca #${fincaIdNueva}`;
      try {
        await notificacionesApi.enviarNotificacion({
          usuarioId: plan.conductorId,
          tipo: 'FINCA_AGREGADA',
          titulo: '➕ Finca Agregada a tu Recorrido',
          mensaje: `El Administrador agregó la finca "${fincaNom}" a tu recorrido en el camión ${plan.camionPlaca || 'cisterna'}.`,
          fechaOperativa: plan.fecha ? plan.fecha.split('T')[0] : fechaLogistica,
          referenciaId: plan.controlRutaId || plan.id,
        });
      } catch {}

      toast.success('Finca añadida exitosamente a la ruta');
      setModalAgregarFincaRapida(null);
      cargarDatosLogisticaAdmin(fechaLogistica);
      cargarDatosAdminEnVivo();
      // Si el usuario actual es o simula a este chofer, recargar su vista activa de inmediato
      if (choferEfectivoId === plan.conductorId) {
        cargarViajeActivo();
      }
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
        if (Array.isArray(modalCircuito.fincasIds)) {
          await operacionesApi.asignarFincasARuta(modalCircuito.id, modalCircuito.fincasIds);
        }
        toast.success('Circuito logístico y fincas actualizados correctamente');
      } else {
        const res = await operacionesApi.crearRutaLogistica({
          nombre: modalCircuito.nombre.trim(),
          descripcion: modalCircuito.descripcion.trim() || undefined,
        });
        const nuevoId = res?.id || (res as any)?.data?.id;
        if (nuevoId && Array.isArray(modalCircuito.fincasIds) && modalCircuito.fincasIds.length > 0) {
          await operacionesApi.asignarFincasARuta(nuevoId, modalCircuito.fincasIds);
        }
        toast.success('Nuevo circuito logístico creado con sus fincas asociadas');
      }
      setModalCircuito(null);
      setBusquedaFincasNuevoCircuito('');
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
    const origenTexto = formCombustible.origen === 'MATERA' ? 'LA MATERA (Tanque Interno)' : 'BOMBA COMERCIAL';
    const tipoComb: 'GASOIL' | 'GASOLINA' = formCombustible.tipoCombustible === 'GASOLINA' ? 'GASOLINA' : 'GASOIL';
    try {
      const obsFinal = `[ORIGEN: ${origenTexto}] ${
        formCombustible.observaciones ? '- ' + formCombustible.observaciones.trim() : ''
      }${formCombustible.fotoComprobante ? ' [COMPROBANTE ADJUNTO]' : ''}`;

      const res = await combustibleApi.registrarDespacho({
        camionId: camionIdFinal,
        tipoCombustible: tipoComb,
        litros: lts,
        odometroKm: formCombustible.odometroKm ? Number(formCombustible.odometroKm) : undefined,
        fecha: hoyStr,
        controlRutaId: viajeActivo?.id || undefined,
        observaciones: obsFinal,
      });

      // Persistir en IndexedDB local
      dbLocal.guardarCombustible({
        empresaCodigo: dispositivo?.empresaCodigo || 'EMPRESA',
        choferId: dispositivo?.id || 0,
        camionId: camionIdFinal,
        tipoCombustible: tipoComb,
        litros: lts,
        odometroKm: formCombustible.odometroKm ? Number(formCombustible.odometroKm) : 0,
        estacion: origenTexto,
        fecha: new Date().toISOString(),
        estadoSync: 'SINCRONIZADO',
      }).catch(() => {});

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
      // Guardar en IndexedDB offline si no hay conexión
      dbLocal.guardarCombustible({
        empresaCodigo: dispositivo?.empresaCodigo || 'EMPRESA',
        choferId: dispositivo?.id || 0,
        camionId: camionIdFinal,
        tipoCombustible: tipoComb,
        litros: lts,
        odometroKm: formCombustible.odometroKm ? Number(formCombustible.odometroKm) : 0,
        estacion: origenTexto,
        fecha: new Date().toISOString(),
        estadoSync: 'PENDIENTE',
      }).catch(() => {});

      toast.warning('Sin conexión al servidor. Combustible guardado en el teléfono; se enviará automáticamente al tener señal.');
      setFormCombustible({
        litros: '',
        origen: 'BOMBA',
        odometroKm: '',
        fotoComprobante: '',
        observaciones: '',
        tipoCombustible: 'GASOIL',
      });
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
      const t = modalVerificarLitros.ticket as any;
      const esDespachoCompania = Boolean(t?.companiaId || t?.companiaNombre || t?.esDespachoCompania || t?.tipo === 'DESPACHO');

      // REGLA OBLIGATORIA: Los procesos se respetan (incluso para ADMIN y SUPER ADMIN)
      if (!esDespachoCompania && !viajeEstaEnviadoAReceptoria(t)) {
        toast.error('El chofer aún no ha finalizado la ruta ni ha enviado el viaje a Receptoría. El proceso debe respetarse obligatoriamente.');
        return;
      }

      let res: any;
      if (esDespachoCompania) {
        // Validación de entrega en compañía / cliente final
        res = await operacionesApi.validarEntregaCompania(ticketId, {
          litrosConfirmados: lts,
          litrosRecibidosCompania: lts,
          observaciones: modalVerificarLitros.observacion.trim(),
        });
      } else {
        // Recepción y conciliación de ruta recolectora en receptoría/planta
        res = await operacionesApi.recibirEnReceptoria(ticketId, {
          litrosRecibidos: lts,
          accion: 'DEJAR_EN_RECEPTORIA',
          observacion: modalVerificarLitros.observacion.trim(),
        });
      }
      toast.success(res?.message || 'Litros verificados y conciliados en Receptoría.');
      setModalVerificarLitros(null);
      cargarDatosReceptoria(fechaReceptoria);
      if (esAdminReal) {
        cargarDatosAdminEnVivo();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Error al verificar litros');
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

  // Interceptar tecla física o gesto ATRÁS (<) de Android para evitar salir a pantallas en blanco
  const ultimoAtrasRef = useRef<number>(0);
  useEffect(() => {
    try {
      window.history.pushState({ app: 'movil' }, '', window.location.href);
    } catch {}

    const handlePopState = () => {
      // 1. Cerrar cualquier modal abierto antes de retroceder
      if (modalRegistro) {
        setModalRegistro(false);
        setFincaFijadaParaModal(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalNotificaciones) {
        setModalNotificaciones(false);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalConfirmarDespachoChofer) {
        setModalConfirmarDespachoChofer(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalPlanificar) {
        setModalPlanificar(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalCircuito) {
        setModalCircuito(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalAsignarFincasCircuito) {
        setModalAsignarFincasCircuito(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalReparacion) {
        setModalReparacion(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalVerificarLitros) {
        setModalVerificarLitros(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalDevolverTicket) {
        setModalDevolverTicket(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }
      if (modalNuevoDespachoSalida) {
        setModalNuevoDespachoSalida(null);
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }

      // 2. Si está en otra pestaña, regresar a la pestaña Principal (Inicio)
      if (tabActiva !== 'principal') {
        setTabActiva('principal');
        try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
        return;
      }

      // 3. Si ya está en la pestaña principal, evitar salir accidentalmente hacia una pantalla en blanco
      const now = Date.now();
      if (now - ultimoAtrasRef.current < 2000) {
        // Permitir salida si pulsa dos veces seguidas en menos de 2s
        return;
      }
      ultimoAtrasRef.current = now;
      toast.info('Presiona Atrás nuevamente para salir de la aplicación.');
      try { window.history.pushState({ app: 'movil' }, '', window.location.href); } catch {}
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    modalRegistro,
    modalNotificaciones,
    modalConfirmarDespachoChofer,
    modalPlanificar,
    modalCircuito,
    modalAsignarFincasCircuito,
    modalReparacion,
    modalVerificarLitros,
    modalDevolverTicket,
    modalNuevoDespachoSalida,
    tabActiva,
  ]);

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
      let nuevoDominio = currentTenant.domain;
      const codUpper = (res.empresaCodigo || '').toUpperCase();
      if (codUpper.includes('CAMPO')) {
        nuevoDominio = 'lacteos-campoverde.vercel.app';
      } else if (codUpper.includes('VERGEL')) {
        nuevoDominio = 'transporte-vergel-carrillo.vercel.app';
      } else if (currentTenant.domain) {
        nuevoDominio = currentTenant.domain;
      }

      const nuevoNombreEmpresa = res.empresaNombre || (codUpper.includes('CAMPO') ? 'Productos Lácteos Campo Verde' : (codUpper.includes('VERGEL') ? 'Transporte Vergel & Carrillo' : currentTenant.nombre));

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
        permisoCrearViaje: (res as any).permisoCrearViaje ?? false,
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

      const empNombre = res.empresaNombre || currentTenant.nombre;
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
        permisoCrearViaje: (res as any).permisoCrearViaje ?? false,
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
      setModoLogin('codigo');
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
        fincaId: Number(p.fincaId || p.FincaId || 0),
        fincaNombre: p.fincaNombre || p.FincaNombre || p.finca || `Finca #${p.fincaId || p.FincaId}`,
        litros: Number(p.litros ?? p.Litros ?? 0),
        tipoLeche: (p.tipoLeche || p.TipoLeche || 'VACA').toUpperCase(),
        esAcida: Boolean(p.esAcida || p.EsAcida),
        esDiferido: Boolean(p.esDiferido || p.EsDiferido),
        hora: p.horaRecoleccion || p.hora || (p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Confirmada'),
        synced: true,
        origen: 'Servidor',
        createdAt: p.createdAt || p.CreatedAt || p.fecha,
        modifiedAt: p.modifiedAt || p.ModifiedAt,
      });
    });

    // 2. Cargas locales en el teléfono aún pendientes de sincronizar (del viaje actual)
    cargas
      .filter((c) => !c.synced && (!c.serverTicketId || Number(c.serverTicketId) === Number(viajeActivo?.id)))
      .forEach((c) => {
        lista.push({
          localId: c.localId,
          fincaId: Number(c.fincaId || 0),
          fincaNombre: c.fincaNombre,
          litros: Number(c.litros) || 0,
          tipoLeche: c.tipoLeche,
          esAcida: c.esAcida,
          esDiferido: c.esDiferido,
          temperatura: c.temperatura,
          hora: c.hora,
          synced: false,
          origen: 'Teléfono',
          createdAt: c.fecha || new Date().toISOString(),
        });
      });

    return lista;
  }, [paradasViajeActivo, cargas, viajeActivo]);

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

    // Modo Híbrido: Incorporar automáticamente cualquier finca extra recolectada o registrada en este viaje
    const idsParadasExtra = todasLasParadas.map((p) => Number(p.fincaId || p.FincaId || 0)).filter((id) => id > 0);
    idsParadasExtra.forEach((idExtra) => {
      if (!fincasRuta.some((f) => f.id === idExtra)) {
        const fMatch = fincas.find((f) => f.id === idExtra);
        if (fMatch) {
          fincasRuta.push(fMatch);
        } else {
          const pMatch = todasLasParadas.find((p) => Number(p.fincaId || p.FincaId || 0) === idExtra);
          if (pMatch) {
            fincasRuta.push({
              id: idExtra,
              nombre: pMatch.fincaNombre || pMatch.FincaNombre || `Finca #${idExtra}`,
              propietario: pMatch.propietario || pMatch.Propietario || '',
              propietarioNombre: pMatch.propietario || pMatch.Propietario || '',
              codigo: '',
              tipoLeche: pMatch.tipoLeche || 'VACA',
            } as any);
          }
        }
      }
    });

    // Incorporar también cargas locales offline que pertenezcan a este viaje
    cargas.forEach((c) => {
      const cFincaId = Number(c.fincaId);
      if (cFincaId > 0 && !fincasRuta.some((f) => f.id === cFincaId)) {
        const fMatch = fincas.find((f) => f.id === cFincaId);
        if (fMatch) {
          fincasRuta.push(fMatch);
        } else {
          fincasRuta.push({
            id: cFincaId,
            nombre: c.fincaNombre || `Finca #${cFincaId}`,
            propietario: '',
            propietarioNombre: '',
            codigo: '',
            tipoLeche: c.tipoLeche || 'VACA',
          } as any);
        }
      }
    });

    if (fincasRuta.length === 0) {
      const idsParadas = todasLasParadas.map((p) => Number(p.fincaId || p.FincaId || 0)).filter((id) => id > 0);
      fincasRuta = fincas.filter((f) => idsParadas.includes(f.id));
    }

    // Salvaguarda Offline: Si fincas no estaba en caché pero hay paradas en local, reconstruirlas
    if (fincasRuta.length === 0 && todasLasParadas.length > 0) {
      const mapa = new Map<number, FincaDto>();
      todasLasParadas.forEach((p) => {
        const id = Number(p.fincaId || p.FincaId || 0);
        if (id > 0 && !mapa.has(id)) {
          mapa.set(id, {
            id,
            nombre: p.fincaNombre || p.FincaNombre || `Finca #${id}`,
            propietario: p.propietario || p.Propietario || '',
            propietarioNombre: p.propietario || p.Propietario || '',
            codigo: '',
            tipoLeche: p.tipoLeche || 'VACA',
          } as any);
        }
      });
      fincasRuta = Array.from(mapa.values());
    }

    return fincasRuta
      .map((f) => {
        const paradasDeFinca = todasLasParadas.filter((p) =>
          (Number(p.fincaId) > 0 && Number(p.fincaId) === f.id) ||
          (p.fincaNombre && f.nombre && p.fincaNombre.trim().toLowerCase() === f.nombre.trim().toLowerCase())
        );
        // Solo cargas locales pendientes de sincronizar que pertenezcan a este viaje
        const cargaLocal = cargas.find((c) =>
          Number(c.fincaId) === f.id &&
          !c.synced &&
          (!c.serverTicketId || Number(c.serverTicketId) === Number(viajeActivo.id))
        );

        let lts = 0;
        if (cargaLocal && Number(cargaLocal.litros) > 0) {
          lts = Number(cargaLocal.litros);
        } else if (paradasDeFinca.length > 0) {
          lts = paradasDeFinca.reduce((acc, p) => acc + (Number(p.litros) || 0), 0);
        }

        // Revisar recolecciones de hoy por OTRO camión o ticket
        const recOtro = recoleccionesHoy.find(
          (r: any) => Number(r.fincaId) === f.id && Number(r.controlRutaId) !== Number(viajeActivo.id)
        );

        // Revisar solicitud de emergencia
        const solicAprobada = solicitudesExtraordinarias.find(
          (s: any) => Number(s.fincaId) === f.id && s.estado === 'APROBADA'
        );
        const solicPendiente = solicitudesExtraordinarias.find(
          (s: any) => Number(s.fincaId) === f.id && s.estado === 'PENDIENTE'
        );

        // Identificar si la finca es habitual o alterna para este viaje/ruta
        const miRutaId = viajeActivo.rutaLogisticaId;
        const esHabitualParaMi =
          (miRutaId && f.rutaId === miRutaId) ||
          (f as any).esPrincipal === 1 ||
          !(f as any).esAlterna;

        // REGLA ASIMÉTRICA 1:
        // Si ya la recogió otro ticket y NO hay solicitud de emergencia aprobada:
        // - Si para este chofer la finca es ALTERNA: desaparece de su lista
        if (!esHabitualParaMi && recOtro && !solicAprobada && lts === 0) {
          return null;
        }

        // - Si para este chofer la finca es HABITUAL: se muestra con aviso de recogida por otro y litros en solo lectura
        const recogidaPorOtro = Boolean(recOtro && !solicAprobada && lts === 0);
        const soloLectura = recogidaPorOtro;

        const esRec = lts > 0 || (recogidaPorOtro && Number(recOtro.litros) > 0);
        const ltsFinal = lts > 0 ? lts : (recogidaPorOtro ? Number(recOtro.litros) : 0);

        const paradaConLitros = paradasDeFinca.filter((p) => (Number(p.litros) || 0) > 0);
        const parada = paradaConLitros.length > 0 
          ? paradaConLitros[paradaConLitros.length - 1] 
          : (paradasDeFinca.length > 0 ? paradasDeFinca[paradasDeFinca.length - 1] : null);

        const esAcida = cargaLocal ? Boolean(cargaLocal.esAcida) : Boolean(parada?.esAcida || (parada as any)?.EsAcida || recOtro?.esAcida);
        const esDiferido = cargaLocal 
          ? Boolean((cargaLocal as any).esDiferido) 
          : Boolean(parada?.esDiferido || (parada as any)?.EsDiferido);
        const litrosDiferidos = cargaLocal 
          ? Number((cargaLocal as any).litrosDiferidos || 0) 
          : Number(parada?.litrosOriginales || (parada as any)?.LitrosOriginales || 0);
        const tipoLeche = (cargaLocal?.tipoLeche || parada?.tipoLeche || (parada as any)?.TipoLeche || recOtro?.tipoLeche || (f as any).tipoLeche || 'VACA').toUpperCase();
        const horaRecogida = cargaLocal?.hora || (parada ? (parada.hora || (parada as any).createdAt || (parada as any).CreatedAt) : (recOtro?.createdAt ? new Date(recOtro.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null));

        return {
          ...f,
          recolectada: esRec,
          parada: esRec && !recogidaPorOtro ? parada : null,
          litrosRecolectados: ltsFinal,
          esAcida,
          esDiferido,
          litrosDiferidos,
          tipoLeche,
          horaRecogida,
          recogidaPorOtro,
          soloLectura,
          otroConductorNombre: recOtro?.conductorNombre,
          otroCamionPlaca: recOtro?.camionPlaca,
          otroTicketCodigo: recOtro?.ticketCodigo || recOtro?.controlRutaId,
          solicAprobada: Boolean(solicAprobada),
          solicPendiente: Boolean(solicPendiente),
          recOtro,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
      // 1. Las fincas recolectadas (> 0 Lts) se ubican de primero
      const recA = a.recolectada && a.litrosRecolectados > 0;
      const recB = b.recolectada && b.litrosRecolectados > 0;
      if (recA && !recB) return -1;
      if (!recA && recB) return 1;

      // 2. Entre las recolectadas: Ordenar por FECHA Y HORA DE REGISTRO DE LECHE (más reciente arriba)
      if (recA && recB) {
        const timeA = new Date(
          (a.parada as any)?.modifiedAt ||
          (a.parada as any)?.createdAt ||
          (a.parada as any)?.CreatedAt ||
          (a.parada as any)?.fecha ||
          a.horaRecogida ||
          0
        ).getTime();
        const timeB = new Date(
          (b.parada as any)?.modifiedAt ||
          (b.parada as any)?.createdAt ||
          (b.parada as any)?.CreatedAt ||
          (b.parada as any)?.fecha ||
          b.horaRecogida ||
          0
        ).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return (Number(b.parada?.id) || 0) - (Number(a.parada?.id) || 0);
      }

      // 3. Las pendientes por orden alfabético
      return a.nombre.localeCompare(b.nombre);
    });
  }, [viajeActivo, rutasActivasIds, fincas, todasLasParadas, cargas, recoleccionesHoy, solicitudesExtraordinarias]);

  const totalLitrosCargados = useMemo(() => {
    // Si tenemos fincas planificadas/asignadas en la ruta, calcular directamente de fincasDeMiRuta
    // para evitar cualquier duplicación entre el servidor y cargas locales offline
    if (fincasDeMiRuta && fincasDeMiRuta.length > 0) {
      return fincasDeMiRuta.reduce((acc, f) => acc + (Number(f.litrosRecolectados) || 0), 0);
    }
    const sumParadasServer = (paradasViajeActivo || []).reduce((acc, p) => acc + Number(p.litros ?? p.Litros ?? 0), 0);
    const sumPendientes = cargas.filter((c) => !c.synced).reduce((acc, c) => acc + (Number(c.litros) || 0), 0);
    if (!viajeActivo) return sumPendientes;
    const serverTotal = (viajeActivo?.totalLitrosFinca && viajeActivo.totalLitrosFinca > sumParadasServer && (paradasViajeActivo || []).length > 0) 
      ? viajeActivo.totalLitrosFinca 
      : sumParadasServer;
    return serverTotal + sumPendientes;
  }, [viajeActivo, paradasViajeActivo, cargas, fincasDeMiRuta]);

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

  const fincasFiltradas = useMemo(() => {
    // Modo Híbrido: Si hay fincas asignadas en la ruta, se presentan ordenadas al inicio con prioridad,
    // pero el chofer mantiene acceso completo a todo el catálogo de fincas para poder agregar paradas extra.
    const idsRuta = new Set(fincasDeMiRuta.map((f) => f.id));
    let base = [...fincas].sort((a, b) => {
      const aEnRuta = idsRuta.has(a.id);
      const bEnRuta = idsRuta.has(b.id);
      if (aEnRuta && !bEnRuta) return -1;
      if (!aEnRuta && bEnRuta) return 1;
      return a.nombre.localeCompare(b.nombre);
    });

    if (busquedaFinca.trim()) {
      const term = busquedaFinca.toLowerCase();
      base = base.filter(
        (f) =>
          f.nombre.toLowerCase().includes(term) ||
          (f.codigo && f.codigo.toLowerCase().includes(term))
      );
    }

    return base;
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

  // Abrir modal de carga preseleccionando una finca específica (fija y cargando litros previos)
  const abrirCargaParaFinca = (fincaItem: any) => {
    setFincaFijadaParaModal(fincaItem);
    const fechaAUsar = viajeActivo?.fecha ? viajeActivo.fecha.split('T')[0] : hoyStr;

    // 7.- Cargar los litros que ya se habían colocado (offline o servidor)
    const cargaLocal = cargas.find((c) => Number(c.fincaId) === Number(fincaItem.id));
    const paradaServidor = (paradasViajeActivo || []).find((p) => Number(p.fincaId || p.FincaId) === Number(fincaItem.id));
    let ltsPrevios = '';
    if (cargaLocal && Number(cargaLocal.litros) > 0) {
      ltsPrevios = String(cargaLocal.litros);
    } else if (fincaItem.litrosRecolectados && Number(fincaItem.litrosRecolectados) > 0) {
      ltsPrevios = String(fincaItem.litrosRecolectados);
    } else if (paradaServidor && Number(paradaServidor.litros || paradaServidor.Litros || 0) > 0) {
      ltsPrevios = String(paradaServidor.litros || paradaServidor.Litros);
    }

    setFormCarga((prev) => {
      const esDiferidoPrev = Boolean(cargaLocal?.esDiferido ?? fincaItem.parada?.esDiferido ?? prev.esDiferido);
      const ltsDiferirPrev = cargaLocal?.litrosDiferir ? String(cargaLocal.litrosDiferir) : (esDiferidoPrev ? ltsPrevios : '');
      return {
        ...prev,
        fecha: fechaAUsar,
        fincaId: Number(fincaItem.id),
        litros: ltsPrevios,
        tipoLeche: cargaLocal?.tipoLeche || fincaItem.parada?.tipoLeche || prev.tipoLeche || 'VACA',
        esAcida: Boolean(cargaLocal?.esAcida ?? fincaItem.parada?.esAcida ?? prev.esAcida),
        esDiferido: esDiferidoPrev,
        litrosDiferir: ltsDiferirPrev,
        temperatura: cargaLocal?.temperatura ? String(cargaLocal.temperatura) : '',
        observacion: cargaLocal?.observacion || '',
        fotoRecibo: cargaLocal?.fotoRecibo || '',
      };
    });
    setModalRegistro(true);
  };

  // Guardar nueva carga en local
  const handleGuardarCarga = async (e: React.FormEvent) => {
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

    const fincaSel = fincas.find((f) => f.id === Number(formCarga.fincaId)) || fincaFijadaParaModal;

    const now = new Date();
    const horaStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const fechaAUsar = viajeActivo?.fecha ? viajeActivo.fecha.split('T')[0] : (formCarga.fecha || hoyStr);
    const litrosDiferirNum = formCarga.esDiferido ? Number(formCarga.litrosDiferir || formCarga.litros) : undefined;
    const ticketIdEfectivo = ticketsLocales.resolverId(
      viajeActivo?.id || viajeSeleccionadoId || (viajesChofer.length > 0 ? viajesChofer[0].id : 0)
    );

    // Intento de guardado directo y síncrono si el dispositivo está online
    let sincronizadoOnline = false;
    if (isOnline && ticketIdEfectivo > 0) {
      try {
        const obsConOrigen = `${formCarga.observacion ? formCarga.observacion + ' ' : ''}[ORIGEN_MOVIL]`.trim();
        await operacionesApi.agregarFincaViaje(ticketIdEfectivo, {
          fincaId: Number(formCarga.fincaId),
          litros: litrosNum,
          esAcida: formCarga.esAcida,
          esDiferido: formCarga.esDiferido,
          fecha: fechaAUsar,
          tipoLeche: formCarga.tipoLeche,
          observacion: obsConOrigen,
          temperatura: formCarga.temperatura ? Number(formCarga.temperatura) : undefined,
          fotoComprobante: formCarga.fotoRecibo || undefined,
        });
        sincronizadoOnline = true;
      } catch (errApi: any) {
        console.warn('Error al enviar carga directamente al servidor, se guardará en cola local:', errApi);
        const errMsg = errApi?.response?.data?.message || errApi?.message || 'Error de conexión con la central';
        toast.warning(`Guardado en el teléfono. Pendiente de sincronizar: ${errMsg}`);
      }
    }

    const nuevaCarga: CargaOffline = {
      localId: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      serverTicketId: ticketIdEfectivo || undefined,
      fecha: fechaAUsar,
      hora: horaStr,
      fincaId: Number(formCarga.fincaId),
      fincaNombre: fincaSel ? fincaSel.nombre : `Finca #${formCarga.fincaId}`,
      litros: litrosNum,
      tipoLeche: formCarga.tipoLeche,
      esAcida: formCarga.esAcida,
      esDiferido: formCarga.esDiferido,
      litrosDiferir: litrosDiferirNum,
      temperatura: formCarga.temperatura ? Number(formCarga.temperatura) : undefined,
      observacion: formCarga.observacion,
      fotoRecibo: formCarga.fotoRecibo || undefined,
      synced: sincronizadoOnline,
    };

    // 7.- Si ya existe una carga local para esta finca, actualizarla en vez de duplicarla
    const idxExistente = cargas.findIndex((c) => Number(c.fincaId) === Number(formCarga.fincaId));
    let nuevasCargas: CargaOffline[];
    if (idxExistente >= 0) {
      nuevasCargas = [...cargas];
      nuevasCargas[idxExistente] = {
        ...nuevasCargas[idxExistente],
        litros: litrosNum,
        tipoLeche: formCarga.tipoLeche,
        esAcida: formCarga.esAcida,
        esDiferido: formCarga.esDiferido,
        litrosDiferir: litrosDiferirNum,
        temperatura: formCarga.temperatura ? Number(formCarga.temperatura) : undefined,
        observacion: formCarga.observacion,
        fotoRecibo: formCarga.fotoRecibo || nuevasCargas[idxExistente].fotoRecibo,
        synced: sincronizadoOnline,
      };
    } else {
      nuevasCargas = [nuevaCarga, ...cargas];
    }
    setCargas(nuevasCargas);
    guardarCargasLocalSeguro(nuevasCargas);

    // Persistencia Robusta en IndexedDB Local (sin límite de tamaño por fotos)
    const codEmpresa = dispositivo?.empresaCodigo || 'EMPRESA';
    const idLocalPrevio = idxExistente >= 0 ? cargas[idxExistente]?.dbLocalId : undefined;
    dbLocal.guardarRecoleccion({
      idLocal: idLocalPrevio,
      empresaCodigo: codEmpresa,
      ticketId: ticketIdEfectivo || 0,
      fincaId: Number(formCarga.fincaId),
      fincaNombre: fincaSel ? fincaSel.nombre : `Finca #${formCarga.fincaId}`,
      productorNombre: fincaSel?.productor || '',
      litros: litrosNum,
      tipoLeche: formCarga.tipoLeche === 'BUFALA' ? 'BUFALA' : 'VACA',
      esDiferida: Boolean(formCarga.esDiferido),
      esAcida: formCarga.esAcida,
      temperatura: formCarga.temperatura ? Number(formCarga.temperatura) : null,
      foto: formCarga.fotoRecibo || null,
      observaciones: formCarga.observacion,
      fechaRegistro: new Date().toISOString(),
      estadoSync: sincronizadoOnline ? 'SINCRONIZADO' : 'PENDIENTE',
    }).then((nuevoIdLocal) => {
      if (nuevoIdLocal) {
        setCargas((prev) => {
          const upd = prev.map((c) =>
            c.localId === nuevaCarga.localId || Number(c.fincaId) === Number(formCarga.fincaId)
              ? { ...c, dbLocalId: nuevoIdLocal }
              : c
          );
          guardarCargasLocalSeguro(upd);
          return upd;
        });
      }
    }).catch((err) => console.warn('Error guardando en IndexedDB (tolerante):', err));

    // 6.- Actualizar inmediatamente las paradas locales para que el móvil las visualice sin wifi
    setParadasViajeActivo((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      const idxP = list.findIndex((p) => Number(p.fincaId || p.FincaId) === Number(formCarga.fincaId));
      if (idxP >= 0) {
        list[idxP] = {
          ...list[idxP],
          litros: litrosNum,
          Litros: litrosNum,
          tipoLeche: formCarga.tipoLeche,
          esAcida: formCarga.esAcida,
          esDiferido: formCarga.esDiferido,
          litrosDiferir: litrosDiferirNum,
        };
      } else {
        list.push({
          id: Date.now(),
          fincaId: Number(formCarga.fincaId),
          fincaNombre: fincaSel ? fincaSel.nombre : `Finca #${formCarga.fincaId}`,
          litros: litrosNum,
          Litros: litrosNum,
          tipoLeche: formCarga.tipoLeche,
          esAcida: formCarga.esAcida,
          esDiferido: formCarga.esDiferido,
          litrosDiferir: litrosDiferirNum,
          createdAt: new Date().toISOString(),
          origen: 'Teléfono',
        });
      }
      try { localStorage.setItem('movil_paradas_activo', JSON.stringify(list)); } catch {}
      return list;
    });

    setModalRegistro(false);
    setFincaFijadaParaModal(null);
    setFormCarga({
      fecha: viajeActivo?.fecha ? viajeActivo.fecha.split('T')[0] : hoyStr,
      fincaId: 0,
      litros: '',
      tipoLeche: 'VACA',
      esAcida: false,
      esDiferido: false,
      litrosDiferir: '',
      temperatura: '',
      observacion: '',
      fotoRecibo: '',
    });
    setBusquedaFinca('');

    // Notificación clara al usuario
    if (sincronizadoOnline) {
      toast.success(`¡Carga de ${litrosNum.toLocaleString()} L guardada y sincronizada con el servidor!`);
    } else {
      toast.info(`Carga de ${litrosNum.toLocaleString()} L guardada en el teléfono (modo offline).`);
      if (isOnline) {
        setTimeout(() => sincronizarCargas(), 800);
      }
    }
  };

  // Sincronizar cargas con servidor mediante el SyncEngine Unificado
  const sincronizarCargas = async () => {
    if (!isOnline && !navigator.onLine) {
      toast.warning('No hay conexión a internet disponible para sincronizar.');
      return;
    }

    setSincronizando(true);
    try {
      // 1. Ejecutar sincronización a través del motor unificado (evita carreras y doble envío)
      const resSync = await syncEngine.sincronizarTodo();
      const ticketsPendientes = ticketsLocales.listarPendientes();
      if (ticketsPendientes.length > 0) {
        const motivo = ticketsPendientes[0].ultimoError || 'La central no respondió';
        toast.error(`El turno nuevo aún no se pudo enviar a la central: ${motivo}`, { duration: 8000 });
      } else if (resSync.totalSubidos > 0) {
        toast.success(`¡Sincronización completada! ${resSync.totalSubidos} registro(s) sincronizados.`);
      } else {
        toast.info('Todas las cargas ya están sincronizadas con la central.');
      }

      // 2. Marcar estado local como sincronizado (solo si no quedan turnos locales por enviar)
      if (ticketsPendientes.length === 0) {
        setCargas((prev) => {
          const actualizadas = prev.map((c) => ({ ...c, synced: true }));
          guardarCargasLocalSeguro(actualizadas);
          return actualizadas;
        });
      }

      // 3. Actualizar paradas consolidadas y viaje activo desde la central
      await cargarViajeActivo();
    } catch (err: any) {
      console.error('Error al sincronizar cargas:', err);
      toast.error('Error al conectar con la central para sincronizar.');
    } finally {
      setSincronizando(false);
    }
  };

  // =========================================================================
  // HANDLERS: ENTREGA DIRECTA A COMPAÑÍAS / RECEPTORÍA (1:1 V2_3_11_26)
  // =========================================================================
  const handleAbrirEntregaDirecta = async () => {
    if (!viajeActivo) {
      toast.error('No hay un viaje o ticket activo seleccionado');
      return;
    }

    // 1. Obtener lista fresca de compañías si no están en memoria
    let comps = listaCompaniasMovil;
    if (!comps || comps.length === 0) {
      try {
        comps = await catalogosApi.getCompanias(true);
        if (Array.isArray(comps)) {
          setListaCompaniasMovil(comps);
        }
      } catch (err) {
        console.warn('Error al cargar compañías para entrega directa:', err);
      }
    }
    if (!comps || comps.length === 0) {
      comps = companiasReceptoria || [];
    }

    // 2. Cargar paradas del ticket si no están o asegurar sincronización
    let fincasT = paradasViajeActivo;
    if (!fincasT || fincasT.length === 0) {
      try {
        const resParadas = await operacionesApi.getFincasViaje(viajeActivo.id);
        if (Array.isArray(resParadas)) {
          fincasT = resParadas;
          setParadasViajeActivo(resParadas);
        }
      } catch (err) {
        console.warn('Error al cargar paradas del viaje:', err);
      }
    }

    const totalCamion = ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosFinca || viajeActivo.totalLitrosRecogidos || 0) > 0
      ? ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosFinca || viajeActivo.totalLitrosRecogidos)
      : (fincasT || []).reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
    const yaAsignado = (viajeActivo as any)._litrosEntregados || (viajeActivo as any).litrosEntregadosCompania || viajeActivo.totalLitrosEntregados || 0;
    const faltante = Math.max(0, totalCamion - yaAsignado);

    // Identificar compañía receptoría y transporte por defecto (ej. COLONA, Campo Verde)
    const compRecep = (comps || []).find((c) => {
      const nom = (c.nombre || '').toUpperCase();
      return nom.includes('RECEPTORIA') || nom.includes('RECEPTORÍA') || esReceptoriaPrincipal(c);
    });

    const compTranspDefault = (comps || []).find((c) => {
      const nom = (c.nombre || '').toUpperCase();
      const ts = Number((c as any).tipoServicioId || 1);
      return ts === 2 || nom.includes('COLONA');
    }) || (comps || []).find((c) => {
      const nom = (c.nombre || '').toUpperCase();
      return !nom.includes('RECEPTORIA') && !nom.includes('RECEPTORÍA');
    });

    // Detectar si alguna finca del ticket tiene compañía asignada
    let compTicketTranspId: number | undefined = undefined;
    const fincaConCompTransp = (fincasT || []).find(
      (x: any) => Number(x.tipoServicioId || x.TipoServicioId) === 2 && (x.companiaId || x.CompaniaId)
    );
    if (fincaConCompTransp) {
      compTicketTranspId = Number(fincaConCompTransp.companiaId || fincaConCompTransp.CompaniaId);
    }
    if (!compTicketTranspId && compTranspDefault) {
      compTicketTranspId = compTranspDefault.id;
    }

    // Agrupar por destino (Compañía), tipo de leche y origen (Ruta vs Transporte vs Ácida)
    const destinosAgrupados: Record<string, FilaEntregaDirectaMovil> = {};

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
          targetCompId = compRecep ? compRecep.id : (compFincaId || (comps[0]?.id || 0));
        } else if (tipoServ === 1) {
          origenServ = 'RUTA';
          targetCompId = compRecep ? compRecep.id : (compFincaId || (comps[0]?.id || 0));
        } else {
          // tipoServ === 2 (TRANSPORTE)
          origenServ = 'TRANSPORTE';
          targetCompId = compFincaId || compTicketTranspId || (comps[0]?.id || 0);
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
          companiaId: (viajeActivo as any).companiaDestinoId || compRecep?.id || (comps.length > 0 ? comps[0].id : 0),
          litros: faltante > 0 ? faltante : totalCamion,
          tipoLeche: 'VACA',
          origenServicio: 'RUTA',
        },
      ]);
    }

    setObsEntregaDirecta('');
    setModalEntregaDirecta(true);
  };

  const handleSubmitEntregaDirecta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viajeActivo) return;

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

    setGuardandoEntregaDirecta(true);
    try {
      const primeraFilaValida = filasEntregaDirecta.find((f) => Number(f.companiaId) > 0 && Number(f.litros) > 0) || filasEntregaDirecta[0];
      const resp = await operacionesApi.enviarACompania(viajeActivo.id, {
        companiaId: Number(primeraFilaValida?.companiaId || 0),
        litrosDespachados: Number(primeraFilaValida?.litros || 0),
        observacion: obsEntregaDirecta,
        destinos: filasEntregaDirecta.map((f) => ({
          companiaId: Number(f.companiaId),
          litros: Number(f.litros || 0),
          litrosDespachados: Number(f.litros || 0),
          tipoLeche: f.tipoLeche || 'VACA',
          observacion: obsEntregaDirecta,
        })),
      });

      await Swal.fire({
        icon: 'success',
        title: '¡Entrega Registrada Exitosamente!',
        text: resp?.message || 'Se registraron los despachos a compañía correctamente.',
        confirmButtonColor: '#059669',
        timer: 2800,
        showConfirmButton: false,
      });

      setModalEntregaDirecta(false);
      await cargarViajeActivo();
      await cargarDespachoActivo();
      await cargarEntregasChofer();
      setTabActiva('entregas');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al despachar a compañía / receptoría');
    } finally {
      setGuardandoEntregaDirecta(false);
    }
  };

  // =========================================================================
  // HANDLERS: TRASPASO DE LECHE A OTRO CHOFER (1:1 RecoleccionRutasPage)
  // =========================================================================
  const handleAbrirTraspasoMovil = async () => {
    if (!viajeActivo) {
      toast.error('No hay un viaje o ticket activo seleccionado');
      return;
    }

    let fincasT = paradasViajeActivo;
    if (!fincasT || fincasT.length === 0) {
      try {
        const resParadas = await operacionesApi.getFincasViaje(viajeActivo.id);
        if (Array.isArray(resParadas)) {
          fincasT = resParadas;
          setParadasViajeActivo(resParadas);
        }
      } catch (err) {
        console.warn('Error al cargar paradas:', err);
      }
    }

    const totalCamion = ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosFinca || viajeActivo.totalLitrosRecogidos || 0) > 0
      ? ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosFinca || viajeActivo.totalLitrosRecogidos)
      : (fincasT || []).reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
    const yaAsignado = (viajeActivo as any)._litrosEntregados || (viajeActivo as any).litrosEntregadosCompania || viajeActivo.totalLitrosEntregados || 0;
    const ltsDisponibles = Math.max(0, totalCamion - yaAsignado);

    // Cargar viajes del día para tickets destino
    try {
      const fBusqueda = viajeActivo.fecha ? viajeActivo.fecha.split('T')[0] : hoyStr;
      const viajesHoy = await operacionesApi.getControles(fBusqueda);
      const otrosViajes = Array.isArray(viajesHoy) ? viajesHoy.filter((v) => v.id !== viajeActivo.id && v.estado !== 'FINALIZADO') : [];
      setViajesDisponiblesTraspaso(otrosViajes);
    } catch (err) {
      console.warn('Error al cargar viajes para traspaso:', err);
    }

    setModoTraspasoMovil('EXISTENTE');
    setFormTraspasoMovil({
      ticketDestinoId: 0,
      litrosTraspaso: ltsDisponibles > 0 ? ltsDisponibles : totalCamion,
      observacion: '',
    });
    setTraspasoChoferDestinoId(0);
    setTraspasoFechaDestino(viajeActivo.fecha ? viajeActivo.fecha.split('T')[0] : hoyStr);
    setModalTraspasoMovil(true);
  };

  const handleSubmitTraspasoMovil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viajeActivo) return;

    if (modoTraspasoMovil === 'EXISTENTE') {
      if (!formTraspasoMovil.ticketDestinoId || Number(formTraspasoMovil.ticketDestinoId) <= 0) {
        toast.error('Seleccione un viaje / cisterna destino');
        return;
      }
    } else {
      if (!traspasoChoferDestinoId || Number(traspasoChoferDestinoId) <= 0) {
        toast.error('Seleccione el conductor de destino');
        return;
      }
    }

    if (!formTraspasoMovil.litrosTraspaso || Number(formTraspasoMovil.litrosTraspaso) <= 0) {
      toast.error('Ingrese litros válidos a transferir');
      return;
    }

    setGuardandoTraspaso(true);
    try {
      const payload: any = {
        litrosTraspaso: Number(formTraspasoMovil.litrosTraspaso),
        observacion: formTraspasoMovil.observacion,
      };
      if (modoTraspasoMovil === 'EXISTENTE') {
        payload.ticketDestinoId = Number(formTraspasoMovil.ticketDestinoId);
      } else {
        payload.choferDestinoId = Number(traspasoChoferDestinoId);
        payload.fechaDestino = traspasoFechaDestino;
      }

      const res = await operacionesApi.traspasarLeche(viajeActivo.id, payload);

      await Swal.fire({
        icon: 'success',
        title: '¡Traspaso Realizado!',
        text: res?.message || 'Se transfirieron los litros exitosamente.',
        confirmButtonColor: '#0d9488',
        timer: 2800,
        showConfirmButton: false,
      });

      setModalTraspasoMovil(false);
      await cargarViajeActivo();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al realizar el traspaso');
    } finally {
      setGuardandoTraspaso(false);
    }
  };

  // =========================================================================
  // VISTA 1: DISPOSITIVO NO VINCULADO (ACTIVACIÓN NEUTRA)
  // =========================================================================
  if (!dispositivo) {
    const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const nombreEmpresaActual = host.includes('campoverde')
      ? 'Productos Lácteos Campo Verde'
      : (host.includes('vergel')
          ? 'Transporte Vergel & Carrillo'
          : (empresaGuardada || currentTenant.nombre || 'Sistema de Transporte'));

    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #f8fafc 0%, #edf2f7 50%, #e2e8f0 100%)',
          color: '#0f172a',
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
            maxWidth: '430px',
            background: '#ffffff',
            borderRadius: '24px',
            padding: '32px 24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.1)',
            textAlign: 'center',
          }}
        >
          {/* Logo / Cabecera Dinámica (Toma el logo de la empresa como icono del móvil) */}
          {logoGuardado ? (
            <div
              style={{
                width: '78px',
                height: '78px',
                borderRadius: '22px',
                background: '#ffffff',
                border: '2px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
                padding: '8px',
              }}
            >
              <img
                src={logoGuardado}
                alt="Logo Empresa"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '22px',
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                fontSize: '32px',
                color: '#ffffff',
                boxShadow: '0 10px 25px rgba(2, 132, 199, 0.35)',
              }}
            >
              <i className="fa-solid fa-truck-droplet"></i>
            </div>
          )}

          <h1 style={{ fontSize: '21px', fontWeight: 900, margin: '0 0 4px 0', letterSpacing: '-0.5px', color: '#0f172a' }}>
            Rutas de Leche
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px 0', fontWeight: 600 }}>
            Terminal Móvil de Conductor {nombreEmpresaActual ? `• ${nombreEmpresaActual}` : ''}
          </p>

          <div style={{ marginBottom: '18px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#e0f2fe',
                color: '#0284c7',
                border: '1px solid #bae6fd',
                padding: '3px 12px',
                borderRadius: '16px',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.5px',
              }}
            >
              <i className="fa-solid fa-code-branch"></i> Versión {APP_VERSION}
            </span>
          </div>

          {/* Tarjeta 1: Descarga / Instalación de la Aplicación Oficial */}
          <div
            style={{
              marginBottom: '18px',
              background: 'linear-gradient(135deg, #f0f9ff 0%, #f0fdf4 100%)',
              border: '1.5px solid #bae6fd',
              borderRadius: '18px',
              padding: '16px',
              textAlign: 'left',
              boxShadow: '0 4px 15px rgba(2, 132, 199, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: logoGuardado ? '#ffffff' : '#dbeafe',
                  color: '#0284c7',
                  border: logoGuardado ? '1px solid #e2e8f0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '17px',
                  flexShrink: 0,
                  overflow: 'hidden',
                  padding: logoGuardado ? '3px' : '0',
                }}
              >
                {logoGuardado ? (
                  <img src={logoGuardado} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <i className="fa-solid fa-mobile-screen-button"></i>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', color: '#0284c7', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>
                  Paso 1: Instalación
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                  Descarga la App de Rutas de Leche
                </div>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              Instala la aplicación en tu teléfono para recolectar leche sin internet y sincronizar con la central.
            </p>
            <button
              type="button"
              onClick={handleInstalarApp}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(2, 132, 199, 0.35)',
              }}
            >
              <i className="fa-solid fa-download"></i>
              <span>{esInstalada ? 'App Ya Instalada en este Teléfono' : 'Instalar / Agregar a Inicio'}</span>
            </button>
          </div>

          {/* Tarjeta 2: Formulario de Acceso Móvil (Tabs: Usuario/Clave vs Código 6 Dígitos) */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '18px',
              padding: '18px 16px',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            {/* SELECTOR DE PESTAÑAS (TABS SUPERIORES) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                background: '#e2e8f0',
                padding: '4px',
                borderRadius: '14px',
                marginBottom: '18px',
              }}
            >
              <button
                type="button"
                onClick={() => setModoLogin('codigo')}
                style={{
                  padding: '9px 6px',
                  borderRadius: '10px',
                  border: 'none',
                  background: modoLogin === 'codigo' ? '#ffffff' : 'transparent',
                  color: modoLogin === 'codigo' ? '#059669' : '#64748b',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: modoLogin === 'codigo' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                }}
              >
                <i className="fa-solid fa-hashtag"></i>
                <span>Código 6 Dígitos</span>
              </button>

              <button
                type="button"
                onClick={() => setModoLogin('credenciales')}
                style={{
                  padding: '9px 6px',
                  borderRadius: '10px',
                  border: 'none',
                  background: modoLogin === 'credenciales' ? '#ffffff' : 'transparent',
                  color: modoLogin === 'credenciales' ? '#0284c7' : '#64748b',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: modoLogin === 'credenciales' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                }}
              >
                <i className="fa-solid fa-user-lock"></i>
                <span>Usuario y Clave</span>
              </button>
            </div>

            {modoLogin === 'codigo' ? (
              /* MODO CÓDIGO DE VERIFICACIÓN / 6 DÍGITOS */
              <form onSubmit={handleVincular}>
                <div style={{ fontSize: '11px', color: '#059669', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px', marginBottom: '4px' }}>
                  Acceso Rápido Chofer
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                  Ingresa tu Código de 6 Dígitos
                </h3>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                  Escribe el código numérico asignado por tu supervisor o la central para activar tu terminal.
                </p>

                <div style={{ marginBottom: '18px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={7}
                    value={codigoInput}
                    onChange={(e) => setCodigoInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="000 000"
                    autoFocus
                    style={{
                      width: '100%',
                      height: '60px',
                      background: '#ffffff',
                      border: '2px solid #059669',
                      borderRadius: '16px',
                      color: '#059669',
                      fontSize: '30px',
                      fontWeight: 900,
                      letterSpacing: '8px',
                      textAlign: 'center',
                      outline: 'none',
                      boxShadow: '0 4px 15px rgba(5, 150, 105, 0.15)',
                    }}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={vinculando || codigoInput.trim().length < 6}
                  style={{
                    width: '100%',
                    height: '50px',
                    borderRadius: '14px',
                    background:
                      codigoInput.trim().length >= 6
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : '#cbd5e1',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: codigoInput.trim().length >= 6 ? 'pointer' : 'not-allowed',
                    boxShadow: codigoInput.trim().length >= 6 ? '0 8px 20px rgba(16, 185, 129, 0.35)' : 'none',
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
                      <span>Verificando Código...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-key"></i>
                      <span>Vincular y Comenzar</span>
                    </>
                  )}
                </button>

                <div style={{ marginTop: '14px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setModoLogin('credenciales')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#0284c7',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    <i className="fa-solid fa-user-lock mr-1"></i> ¿Prefieres ingresar con contraseña? Pulsa aquí
                  </button>
                </div>
              </form>
            ) : (
              /* MODO CREDENCIALES: LOGIN CON USUARIO Y CONTRASEÑA */
              <form onSubmit={handleLoginUsuario} style={{ textAlign: 'left' }}>
                <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                  <div style={{ fontSize: '11px', color: '#0284c7', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px', marginBottom: '4px' }}>
                    Acceso con Credenciales
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
                    Iniciar con Usuario y Clave
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                    Para Choferes, Supervisores, Taller y Administradores.
                  </p>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 800,
                      letterSpacing: '0.8px',
                      textTransform: 'uppercase',
                      color: '#0284c7',
                      marginBottom: '6px',
                    }}
                  >
                    Usuario o Nombre
                  </label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="ej: Alfredy o alfredy.4"
                    autoCapitalize="none"
                    autoCorrect="off"
                    style={{
                      width: '100%',
                      height: '46px',
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      color: '#0f172a',
                      fontSize: '14.5px',
                      padding: '0 14px',
                      outline: 'none',
                    }}
                    required
                  />
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 800,
                      letterSpacing: '0.8px',
                      textTransform: 'uppercase',
                      color: '#0284c7',
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
                        height: '46px',
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '12px',
                        color: '#0f172a',
                        fontSize: '14.5px',
                        padding: '0 44px 0 14px',
                        outline: 'none',
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
                        color: '#64748b',
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
                    height: '48px',
                    borderRadius: '12px',
                    background:
                      loginUsername.trim() && loginPassword.trim()
                        ? 'linear-gradient(135deg, #0284c7, #2563eb)'
                        : '#cbd5e1',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    cursor: loginUsername.trim() && loginPassword.trim() ? 'pointer' : 'not-allowed',
                    boxShadow: loginUsername.trim() && loginPassword.trim() ? '0 8px 20px rgba(37, 99, 235, 0.35)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
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

                <div style={{ marginTop: '14px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setModoLogin('codigo')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#059669',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    <i className="fa-solid fa-hashtag mr-1"></i> ¿Tienes un código de 6 dígitos? Ingresar con código
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Botón inferior si desea cambiar de empresa */}
          {empresaGuardada && (
            <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={handleDesvincular}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-rotate"></i>
                <span>Cambiar de Base de Datos ({empresaGuardada})</span>
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
      {/* Estilos para animación de Titilar al ingresar litros en fincas */}
      <style>{`
        @keyframes titilarFincaVerde {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.85);
            border-color: #10b981 !important;
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 18px 6px rgba(16, 185, 129, 0.5);
            border-color: #059669 !important;
            background-color: #ecfdf5 !important;
            transform: scale(1.02);
          }
        }
        @keyframes titilarPuntoPulso {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(1.35); }
        }
      `}</style>

      {/* Header Fijo Superior */}
      <header
        style={{
          background: '#ffffff',
          color: '#0f172a',
          padding: '12px 16px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
          borderBottom: '1px solid #e2e8f0',
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
                  background: isOnline ? '#ecfdf5' : '#fef3c7',
                  color: isOnline ? '#059669' : '#d97706',
                  padding: '2px 8px',
                  borderRadius: '20px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  border: isOnline ? '1px solid #a7f3d0' : '1px solid #fde68a',
                }}
              >
                <i className={`fa-solid ${isOnline ? 'fa-signal' : 'fa-plane'}`}></i>
                {isOnline ? 'En Línea' : 'Offline'}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                {(dispositivo.empresaLogo || logoGuardado) && (
                  <img
                    src={dispositivo.empresaLogo || logoGuardado}
                    alt="Logo"
                    style={{ width: '16px', height: '16px', objectFit: 'contain', borderRadius: '3px' }}
                  />
                )}
                {dispositivo.empresaNombre}
              </span>
              <span
                style={{
                  background: '#e0f2fe',
                  color: '#0284c7',
                  padding: '1px 6px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 800,
                  border: '1px solid #bae6fd',
                }}
              >
                {APP_VERSION}
              </span>
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 900, margin: '3px 0 0 0', color: '#0f172a' }}>
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
                background: noLeidasCount > 0 ? '#fee2e2' : '#f8fafc',
                border: noLeidasCount > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                color: noLeidasCount > 0 ? '#ef4444' : '#64748b',
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
                    border: '1.5px solid #ffffff',
                    boxShadow: '0 2px 5px rgba(239,68,68,0.3)',
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
                background: '#e0f2fe',
                border: '1px solid #bae6fd',
                color: '#0284c7',
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
                  background: '#f1f5f9',
                  color: '#1e293b',
                  padding: '5px 9px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  border: '1px solid #cbd5e1',
                }}
              >
                <i className="fa-solid fa-truck mr-1 text-sky-600"></i>
                {dispositivo.placaCamion}
              </span>
            )}
            <button
              type="button"
              onClick={handleCerrarSesion}
              title="Cerrar Sesión (Mantener Empresa)"
              style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                color: '#d97706',
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

        {/* Banner Activador de Notificaciones de Teléfono (Requisito 3) */}
        {typeof window !== 'undefined' && 'Notification' in window && permisoNotificaciones !== 'granted' && (
          <div
            style={{
              marginTop: '10px',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1.5px solid #93c5fd',
              borderRadius: '12px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <i className="fa-solid fa-bell text-blue-600" style={{ fontSize: '15px' }}></i>
              <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700, lineHeight: 1.2 }}>
                Activar avisos en teléfono (sonido y pantalla bloqueada)
              </div>
            </div>
            <button
              type="button"
              onClick={solicitarPermisoNotificaciones}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '7px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
              }}
            >
              Activar
            </button>
          </div>
        )}

        {permisoNotificaciones === 'granted' && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '10px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#166534', fontWeight: 700 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }}></span>
              <span>Avisos de ruta activos (Pantalla bloqueada)</span>
            </div>
            <button
              type="button"
              onClick={probarNotificacionPantallaApagada}
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '10.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Programa un push en 5 segundos para que apagues tu pantalla y verifiques que suena y vibra"
            >
              <i className="fa-solid fa-mobile-screen"></i> Probar en Bloqueo (5s)
            </button>
          </div>
        )}

        {/* Barra de Cambio Rápido de Módulo (Chofer / Admin / Taller / Receptoría) - Exclusivo Administradores */}
        {esAdminReal && (
          <div
            style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              overflowX: 'auto',
            }}
          >
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="fa-solid fa-layer-group text-sky-600"></i>
              <span>VISTA:</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
              <button
                type="button"
                onClick={() => cambiarModo('CHOFER')}
                style={{
                  background: modoActivo === 'CHOFER' ? '#10b981' : 'transparent',
                  color: modoActivo === 'CHOFER' ? '#ffffff' : '#64748b',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: modoActivo === 'CHOFER' ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                }}
              >
                <i className="fa-solid fa-truck"></i> Chofer
              </button>
              <button
                type="button"
                onClick={() => cambiarModo('ADMIN')}
                style={{
                  background: modoActivo === 'ADMIN' ? '#2563eb' : 'transparent',
                  color: modoActivo === 'ADMIN' ? '#ffffff' : '#64748b',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: modoActivo === 'ADMIN' ? '0 2px 6px rgba(37, 99, 235, 0.3)' : 'none',
                }}
              >
                <i className="fa-solid fa-tower-broadcast"></i> Admin
              </button>
              <button
                type="button"
                onClick={() => cambiarModo('TALLER')}
                style={{
                  background: modoActivo === 'TALLER' ? '#ea580c' : 'transparent',
                  color: modoActivo === 'TALLER' ? '#ffffff' : '#64748b',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: modoActivo === 'TALLER' ? '0 2px 6px rgba(234, 88, 12, 0.3)' : 'none',
                }}
              >
                <i className="fa-solid fa-wrench"></i> Taller
              </button>
              <button
                type="button"
                onClick={() => cambiarModo('RECEPTORIA')}
                style={{
                  background: modoActivo === 'RECEPTORIA' ? '#4f46e5' : 'transparent',
                  color: modoActivo === 'RECEPTORIA' ? '#ffffff' : '#64748b',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: modoActivo === 'RECEPTORIA' ? '0 2px 6px rgba(79, 70, 229, 0.3)' : 'none',
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
            background: 'linear-gradient(90deg, #ecfdf5, #f0fdf4)',
            borderBottom: '1px solid #a7f3d0',
            padding: '8px 16px',
            color: '#065f46',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px',
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-solid fa-mobile-screen text-emerald-600"></i>
            <span>Instala la app en tu pantalla para abrirla directo</span>
          </div>
          <button
            type="button"
            onClick={handleInstalarApp}
            style={{
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              padding: '3px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)',
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
          const todasFincasRecolectadas = (fincasDeMiRuta.length > 0 || todasLasParadas.length > 0) && pendientesCount === 0;
          const litrosDisponibles = Math.max(0, capacidad - totalLitrosCargados);
          const viajeBloqueadoPorReceptoria = Boolean(viajeActivo && (
            (viajeActivo.procesoActualId != null && viajeActivo.procesoActualId >= 2) ||
            (viajeActivo.litrosEntregadosCompania != null && Number(viajeActivo.litrosEntregadosCompania) > 0) ||
            (viajeActivo.totalLitrosReceptoria != null && Number(viajeActivo.totalLitrosReceptoria) > 0) ||
            viajeActivo.estado === 'EN_RECEPTORIA' ||
            viajeActivo.estado === 'RECEPCIONADO' ||
            viajeActivo.estado === 'CAMINO A COMPAÑIA' ||
            viajeActivo.estado === 'POR VERIFICACIÓN' ||
            viajeActivo.estado === 'FINALIZADO'
          ));
          const listaDespachosDashboard = (despachosActivos && despachosActivos.length > 0)
            ? despachosActivos
            : (despachoActivo ? [despachoActivo] : []);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Barra de Supervisión de Chofer (Exclusiva para Administrador / SuperAdmin) */}
              {esAdminReal && (() => {
                // 1. REGLA ESTRICTA (Requisito 1): Solo usuarios con Activo = 1 / true y rol Chofer
                // Inactivos como Alejandro (Activo = 0) NUNCA se muestran en ningún filtro del selector
                const choferesActivosSistema = choferesLista.filter((c) => {
                  const esActivo = c.activo === true || (c as any).activo === 1;
                  const rol = String((c as any).rol || 'CHOFER').toUpperCase();
                  const esChofer = rol === 'CHOFER' || rol === 'CONDUCTOR';
                  return esActivo && esChofer;
                });

                // Choferes activos con viaje o ticket en curso actualmente
                const choferesConViajeLista = choferesActivosSistema.filter(
                  (ch) => choferesConViajeActivo.has(ch.id) || choferesConViajeActivo.has((ch as any).usuarioId)
                );

                // Base según filtro:
                // 'activos' -> Solo choferes con viaje activo
                // 'todos'   -> TODOS los choferes ACTIVOS del sistema (Activo = 1, como Alfredy; NUNCA inactivos como Alejandro)
                const baseLista = filtroChoferSupervisar === 'activos'
                  ? choferesConViajeLista
                  : choferesActivosSistema;

                // Búsqueda en tiempo real por nombre, cédula, camión o ticket
                const q = busquedaChoferSupervisar.trim().toLowerCase();
                const listaFiltrada = baseLista.filter((ch) => {
                  if (!q) return true;
                  const nom = (ch.nombreCompleto || '').toLowerCase();
                  const ced = (ch.cedula || '').toLowerCase();
                  const v = choferesConViajeActivo.get(ch.id) || choferesConViajeActivo.get((ch as any).usuarioId);
                  const tkt = v ? String(v.codigoTicket || v.id).toLowerCase() : '';
                  const cam = v ? String(v.camionPlaca || '').toLowerCase() : '';
                  return nom.includes(q) || ced.includes(q) || tkt.includes(q) || cam.includes(q);
                });

                // Chofer seleccionado actualmente
                const choferSeleccionado = choferesActivosSistema.find(
                  (c) => c.id === choferSimuladoId || (c as any).usuarioId === choferSimuladoId
                ) || choferesLista.find((c) => c.id === choferSimuladoId || (c as any).usuarioId === choferSimuladoId);
                const viajeDelSeleccionado = choferesConViajeActivo.get(choferSimuladoId) ||
                  (choferSeleccionado ? choferesConViajeActivo.get((choferSeleccionado as any).usuarioId) : undefined);
                const ltsSeleccionado = viajeDelSeleccionado
                  ? (viajeDelSeleccionado.totalLitrosFinca || viajeDelSeleccionado.totalLitrosRecogidos || 0)
                  : 0;

                const fechaViajeSel = viajeDelSeleccionado?.fecha ? viajeDelSeleccionado.fecha.split('T')[0] : '';
                const esTicketHoySel = fechaViajeSel === hoyStr;

                const seleccionarChofer = (nuevoId: number) => {
                  setChoferSimuladoId(nuevoId);
                  setDropdownChoferSupervisarAbierto(false);
                  try {
                    localStorage.setItem('movil_chofer_simulado_id', String(nuevoId));
                  } catch {}
                  cargarViajeActivo(nuevoId);
                  cargarDespachoActivo(nuevoId);
                  cargarEntregasChofer(nuevoId);
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div
                      style={{
                        background: '#fffbeb',
                        border: '1.5px solid #fde68a',
                        borderRadius: '18px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(217, 119, 6, 0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#92400e', fontWeight: 900 }}>
                          <i className="fa-solid fa-user-gear text-amber-600"></i>
                          <span>Supervisando Chofer:</span>
                          <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#15803d', padding: '2px 7px', borderRadius: '6px', fontWeight: 800 }}>
                            {choferesConViajeLista.length} con Viaje
                          </span>
                        </div>

                        {/* Filtro: Solo Activos vs Todos */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setFiltroChoferSupervisar('activos')}
                            style={{
                              background: filtroChoferSupervisar === 'activos' ? '#16a34a' : '#ffffff',
                              color: filtroChoferSupervisar === 'activos' ? '#ffffff' : '#15803d',
                              border: '1px solid #86efac',
                              borderRadius: '7px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            🟢 Solo Activos ({choferesConViajeLista.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiltroChoferSupervisar('todos')}
                            style={{
                              background: filtroChoferSupervisar === 'todos' ? '#92400e' : '#ffffff',
                              color: filtroChoferSupervisar === 'todos' ? '#ffffff' : '#92400e',
                              border: '1px solid #fde047',
                              borderRadius: '7px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            👥 Todos ({choferesActivosSistema.length})
                          </button>
                        </div>
                      </div>

                      {/* Botón Selector Desplegable con Información del Chofer */}
                      <button
                        type="button"
                        onClick={() => setDropdownChoferSupervisarAbierto((prev) => !prev)}
                        style={{
                          width: '100%',
                          background: '#ffffff',
                          border: dropdownChoferSupervisarAbierto ? '2px solid #d97706' : '1.5px solid #d97706',
                          borderRadius: '12px',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          textAlign: 'left',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: viajeDelSeleccionado ? '#16a34a' : '#94a3b8',
                              boxShadow: viajeDelSeleccionado ? '0 0 6px rgba(22, 163, 74, 0.6)' : 'none',
                              flexShrink: 0,
                            }}
                          ></span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {choferSeleccionado?.nombreCompleto || 'Seleccionar Chofer Activo'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
                              {viajeDelSeleccionado ? (
                                <>
                                  {esTicketHoySel ? (
                                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', fontWeight: 900, fontSize: '9.5px' }}>
                                      🟢 HOY
                                    </span>
                                  ) : (
                                    <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b', padding: '1px 6px', borderRadius: '4px', fontWeight: 900, fontSize: '9.5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      <i className="fa-solid fa-clock-rotate-left"></i> DÍA ANTERIOR ({fechaViajeSel})
                                    </span>
                                  )}
                                  <span style={{ color: esTicketHoySel ? '#15803d' : '#b45309', fontWeight: 800 }}>
                                    Ticket #{viajeDelSeleccionado.codigoTicket || viajeDelSeleccionado.id} • {ltsSeleccionado.toLocaleString()} L
                                    {viajeDelSeleccionado.camionPlaca ? ` • 🚛 ${viajeDelSeleccionado.camionPlaca}` : ''}
                                  </span>
                                </>
                              ) : (
                                <span>Sin viaje activo</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <i
                          className={`fa-solid ${dropdownChoferSupervisarAbierto ? 'fa-chevron-up' : 'fa-chevron-down'}`}
                          style={{ color: '#d97706', fontSize: '13px', marginLeft: '8px' }}
                        ></i>
                      </button>

                      {/* Menú Desplegable con Buscador Integrado */}
                      {dropdownChoferSupervisarAbierto && (
                        <div
                          style={{
                            background: '#ffffff',
                            borderRadius: '14px',
                            border: '1.5px solid #fed7aa',
                            boxShadow: '0 8px 24px rgba(217, 119, 6, 0.15)',
                            padding: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            marginTop: '4px',
                          }}
                        >
                          {/* Buscador de Chofer */}
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              placeholder="🔍 Buscar chofer activo, ticket o camión..."
                              value={busquedaChoferSupervisar}
                              onChange={(e) => setBusquedaChoferSupervisar(e.target.value)}
                              autoFocus
                              style={{
                                width: '100%',
                                padding: '8px 30px 8px 10px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '12px',
                                outline: 'none',
                              }}
                            />
                            {busquedaChoferSupervisar && (
                              <button
                                type="button"
                                onClick={() => setBusquedaChoferSupervisar('')}
                                style={{
                                  position: 'absolute',
                                  right: '8px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'none',
                                  border: 'none',
                                  color: '#94a3b8',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>

                          {/* Lista de Choferes Activos Filtrados */}
                          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {listaFiltrada.length > 0 ? (
                              listaFiltrada.map((ch) => {
                                const v = choferesConViajeActivo.get(ch.id) || choferesConViajeActivo.get((ch as any).usuarioId);
                                const esSel = ch.id === choferSimuladoId;
                                const lts = v ? (v.totalLitrosFinca || v.totalLitrosRecogidos || 0) : 0;
                                const fViaje = v?.fecha ? v.fecha.split('T')[0] : '';
                                const esHoyV = fViaje === hoyStr;

                                return (
                                  <div
                                    key={ch.id}
                                    onClick={() => seleccionarChofer(ch.id)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 10px',
                                      borderRadius: '8px',
                                      background: esSel ? '#fef3c7' : '#f8fafc',
                                      border: esSel ? '1.5px solid #f59e0b' : '1px solid #f1f5f9',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                      <span
                                        style={{
                                          width: '10px',
                                          height: '10px',
                                          borderRadius: '50%',
                                          background: v ? (esHoyV ? '#16a34a' : '#d97706') : '#cbd5e1',
                                          flexShrink: 0,
                                        }}
                                      ></span>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {ch.nombreCompleto}
                                        </div>
                                        <div style={{ fontSize: '10.5px', marginTop: '2px' }}>
                                          {v ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                              {esHoyV ? (
                                                <span style={{ background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: '4px', fontWeight: 900, fontSize: '9.5px' }}>
                                                  🟢 HOY
                                                </span>
                                              ) : (
                                                <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde047', padding: '1px 5px', borderRadius: '4px', fontWeight: 900, fontSize: '9.5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                  <i className="fa-solid fa-clock-rotate-left"></i> DÍA ANTERIOR ({fViaje})
                                                </span>
                                              )}
                                              <span style={{ color: esHoyV ? '#15803d' : '#b45309', fontWeight: 700 }}>
                                                Ticket #{v.codigoTicket || v.id} • {lts.toLocaleString()} L{v.camionPlaca ? ` • ${v.camionPlaca}` : ''}
                                              </span>
                                            </div>
                                          ) : (
                                            <span style={{ color: '#94a3b8' }}>Sin ticket activo</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {esSel && (
                                      <i className="fa-solid fa-check text-amber-600" style={{ fontSize: '13px' }}></i>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <div style={{ padding: '12px', textAlign: 'center', fontSize: '11.5px', color: '#94a3b8' }}>
                                No se encontraron choferes activos con "{busquedaChoferSupervisar}".
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Banner Diferenciador de Ticket de Días Anteriores (Requisito 2) */}
                    {viajeActivo && (viajeActivo.fecha || '').split('T')[0] !== hoyStr && (
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                          border: '2px solid #f59e0b',
                          borderRadius: '16px',
                          padding: '12px 14px',
                          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: '#fde68a',
                            color: '#b45309',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            flexShrink: 0,
                          }}
                        >
                          <i className="fa-solid fa-clock-rotate-left"></i>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#92400e' }}>
                              TICKET DE DÍA ANTERIOR
                            </span>
                            <span style={{ background: '#f59e0b', color: '#ffffff', fontSize: '10px', fontWeight: 900, padding: '2px 7px', borderRadius: '6px' }}>
                              Fecha: {(viajeActivo.fecha || '').split('T')[0]}
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#78350f', marginTop: '2px' }}>
                            Este ticket activo (#{viajeActivo.codigoTicket || viajeActivo.id}) fue iniciado en una jornada anterior a hoy y sigue en curso / pendiente de liquidación.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Tarjeta de Bienvenida y Turno */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
                  borderRadius: '20px',
                  padding: '16px 18px',
                  color: '#0f172a',
                  boxShadow: '0 4px 16px rgba(2, 132, 199, 0.08)',
                  border: '1.5px solid #bae6fd',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span>Turno de Operación • {new Date().toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    {(() => {
                      const sem = verificarSemanaOperativa(viajeActivo?.fecha || hoyStr);
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '1px 6px',
                            borderRadius: '5px',
                            fontSize: '9.5px',
                            fontWeight: 800,
                            background: sem.esOperativa ? '#dcfce7' : '#fee2e2',
                            color: sem.esOperativa ? '#15803d' : '#b91c1c',
                            border: `1px solid ${sem.esOperativa ? '#86efac' : '#fca5a5'}`,
                          }}
                        >
                          <i className={`fa-solid ${sem.esOperativa ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
                          {sem.texto}
                        </span>
                      );
                    })()}
                  </div>
                  <span
                    style={{
                      background: '#e0f2fe',
                      color: '#0369a1',
                      border: '1px solid #7dd3fc',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}
                  >
                    🚛 {dispositivo?.placaCamion || 'Cisterna'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 2px 0', letterSpacing: '-0.3px', color: '#0f172a' }}>
                      ¡Hola, {choferEfectivoNombre.split(' ')[0]}!
                    </h2>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                      {listaDespachosDashboard.length > 0
                        ? `${listaDespachosDashboard.length} despacho(s) activo(s) hacia Planta / Receptoría / Compañías`
                        : viajeActivo
                        ? `Ticket #${viajeActivo.codigoTicket || viajeActivo.id} en curso`
                        : 'Listo para iniciar recolección en ruta'}
                    </p>
                  </div>
                </div>
              </div>

              {/* TARJETAS DE TICKETS ACTIVOS DE DESPACHO / RECEPTORÍA / COMPAÑÍAS */}
              {listaDespachosDashboard.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-truck-fast text-purple-600"></i> Despachos en Curso ({listaDespachosDashboard.length})
                    </span>
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
                      title="Actualizar despachos"
                    >
                      <i className={`fa-solid fa-rotate ${cargandoDespacho ? 'fa-spin' : ''}`}></i>
                    </button>
                  </div>

                  {listaDespachosDashboard.map((despItem) => {
                    const esRecep = esDestinoReceptoria(despItem);
                    return (
                      <div
                        key={despItem.id}
                        style={{
                          background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 100%)',
                          borderRadius: '20px',
                          padding: '16px 18px',
                          border: esRecep ? '1.5px solid #86efac' : '1.5px solid #c084fc',
                          boxShadow: '0 6px 20px rgba(168, 85, 247, 0.12)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '15px', fontWeight: 900, color: esRecep ? '#15803d' : '#6b21a8' }}>
                              <i className={`fa-solid ${esRecep ? 'fa-building-wheat text-emerald-600' : 'fa-building-circle-check text-purple-600'} mr-1`}></i>
                              Despacho #{despItem.id}
                            </span>
                            <span
                              style={{
                                background: esRecep ? '#dcfce7' : '#f3e8ff',
                                color: esRecep ? '#15803d' : '#7e22ce',
                                fontSize: '10.5px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                border: esRecep ? '1px solid #bbf7d0' : '1px solid #d8b4fe',
                              }}
                            >
                              ● {despItem.estado || 'EN VÍA'}
                            </span>
                          </div>
                        </div>

                        <div style={{ fontSize: '13px', color: '#1e293b', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <i className="fa-solid fa-location-dot text-indigo-600"></i>
                            <strong>Destino: {despItem.nombreCompania || despItem.companiaNombre || (esRecep ? 'RECEPTORÍA' : 'Compañía')}</strong>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                            Conductor: <strong>{despItem.nombreConductor || choferEfectivoNombre}</strong> • Fecha: {despItem.fecha ? despItem.fecha.split('T')[0] : ''}
                          </div>
                        </div>

                        {/* Estadísticas de Despacho */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ background: '#f5f3ff', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '1px solid #ddd6fe' }}>
                            <span style={{ fontSize: '10px', color: '#6b21a8', fontWeight: 800, textTransform: 'uppercase' }}>Litros Despachados</span>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: '#7e22ce', marginTop: '2px' }}>
                              {Number(despItem.litrosDespachados || 0).toLocaleString()} L
                            </div>
                          </div>
                          <div style={{ background: '#f8fafc', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Tipo Leche</span>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#334155', marginTop: '3px' }}>
                              {despItem.tipoLeche || 'VACA'}
                            </div>
                          </div>
                        </div>

                        {/* Acciones de Entrega: Receptoría NO confirma chofer; Compañía SÍ confirma */}
                        {esRecep ? (
                          <div
                            style={{
                              background: '#ecfdf5',
                              border: '1.5px solid #a7f3d0',
                              borderRadius: '12px',
                              padding: '10px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <i className="fa-solid fa-hourglass-half text-emerald-600 text-lg"></i>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '12.5px', color: '#065f46' }}>
                                ⏳ Pendiente por Recepcionar en Planta
                              </div>
                              <div style={{ fontSize: '11px', color: '#047857' }}>
                                La comprobación y descarga la procesa directamente el personal de Receptoría.
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setModalConfirmarDespachoChofer(despItem);
                              setFormConfirmacionDespacho({
                                litrosRecibidos: despItem.litrosDespachados || '',
                                observacion: '',
                                fotoReciboUrl: despItem.fotoReciboUrl || '',
                              });
                            }}
                            style={{
                              width: '100%',
                              background: 'linear-gradient(135deg, #10b981, #059669)',
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
                              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                            }}
                          >
                            <i className="fa-solid fa-clipboard-check"></i>
                            <span>Confirmar Entrega en Planta & Subir Recibo</span>
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setTabActiva('entregas')}
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      color: '#7e22ce',
                      border: '1px solid #d8b4fe',
                      borderRadius: '12px',
                      padding: '9px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fa-solid fa-list-check"></i>
                    <span>Ir a Bandeja de Entregas</span>
                  </button>
                </div>
              )}

              {/* SELECTOR DE TURNOS DEL DÍA (MAÑANA / TARDE) */}
              {viajesChofer.length > 0 && (() => {
                const viajesOrdenados = [...viajesChofer].sort((a, b) => a.id - b.id);
                return (
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '20px',
                      padding: '14px 16px',
                      marginBottom: '14px',
                      border: '1.5px solid #cbd5e1',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa-solid fa-calendar-day text-emerald-600 text-sm"></i>
                        <span style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>
                          Viajes / Turnos del Día ({viajesOrdenados.length})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => abrirModalCrearTicket()}
                        style={{
                          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                          border: '1.5px solid #86efac',
                          color: '#065f46',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxShadow: '0 2px 6px rgba(16, 185, 129, 0.15)',
                        }}
                        title="Crear un nuevo ticket o turno para esta jornada u otra fecha"
                      >
                        <i className="fa-solid fa-plus-circle text-emerald-600"></i>
                        <span>Inicio de Nuevo Turno</span>
                      </button>
                    </div>

                    {/* Chips de selección de Turnos */}
                    <div style={{ display: 'grid', gridTemplateColumns: viajesOrdenados.length > 1 ? '1fr 1fr' : '1fr', gap: '8px' }}>
                      {viajesOrdenados.map((v, idx) => {
                        const esSel = viajeActivo?.id === v.id;
                        const info = getTurnoInfo(v, idx);
                        const lts = (v.totalLitrosFinca || 0).toLocaleString();
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => seleccionarViaje(v)}
                            style={{
                              textAlign: 'left',
                              background: esSel ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#f8fafc',
                              border: esSel ? '2px solid #10b981' : '1.5px solid #e2e8f0',
                              borderRadius: '14px',
                              padding: '10px 12px',
                              cursor: 'pointer',
                              position: 'relative',
                              boxShadow: esSel ? '0 4px 12px rgba(16, 185, 129, 0.2)' : 'none',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 900, color: esSel ? '#166534' : '#1e293b' }}>
                                {info.tituloTurno}
                              </span>
                              {esSel && (
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: esSel ? '#15803d' : '#475569' }}>
                              Ticket #{v.codigoTicket || v.id} • {lts} L
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                              <span
                                style={{
                                  fontSize: '9.5px',
                                  fontWeight: 800,
                                  background: info.estadoBg,
                                  color: info.estadoColor,
                                  padding: '1px 6px',
                                  borderRadius: '5px',
                                }}
                              >
                                {info.estadoLabel}
                              </span>
                              <span style={{ fontSize: '10px', color: '#64748b' }}>
                                {(v as any).totalFincas || 0} paradas
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Botón o banner para 2do viaje si el actual ya está despachado/recepcionado */}
              {viajeActivo && (viajeBloqueadoPorReceptoria || (viajeActivo.procesoActualId || 1) >= 2) && viajesChofer.length === 1 && (
                <div
                  style={{
                    background: tienePermisoCrearRuta
                      ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
                      : '#f8fafc',
                    border: tienePermisoCrearRuta ? '1.5px solid #86efac' : '1.5px dashed #cbd5e1',
                    borderRadius: '16px',
                    padding: '12px 14px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    boxShadow: tienePermisoCrearRuta ? '0 2px 8px rgba(16, 185, 129, 0.1)' : 'none',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#166534' }}>
                      🌅 Turno Mañana Despachado
                    </div>
                    <div style={{ fontSize: '11px', color: '#15803d', marginTop: '1px' }}>
                      ¿Vas a recolectar en la tarde? Inicia el segundo turno.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => abrirModalCrearTicket(undefined, 'TARDE')}
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      fontSize: '11.5px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 3px 8px rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <i className="fa-solid fa-plus-circle"></i>
                    <span>+ Iniciar 2do Viaje (Tarde)</span>
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
                        <i className="fa-solid fa-ticket mr-1 text-emerald-600"></i>{' '}
                        {viajeActivo.id < 0 ? 'Ticket nuevo (sin número aún)' : `Ticket #${viajeActivo.codigoTicket || viajeActivo.id}`}
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
                    {/* Fecha operativa y fecha/hora de creación del ticket */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <i className="fa-solid fa-calendar-day text-emerald-600"></i>
                      <span>
                        Fecha: <strong style={{ color: '#0f172a' }}>{viajeActivo.fecha ? String(viajeActivo.fecha).split('T')[0].split('-').reverse().join('/') : '—'}</strong>
                        {(viajeActivo as any).createdAt
                          ? ` • Creado ${new Date((viajeActivo as any).createdAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                      </span>
                    </div>
                  </div>

                  {/* Aviso de ticket creado sin conexión que aún no llega a la central */}
                  {viajeActivo.id < 0 && (() => {
                    const pend = ticketsLocales.listarPendientes().find((t) => t.localId === viajeActivo.id);
                    return (
                      <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '12px', padding: '10px 12px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 900, color: '#92400e' }}>
                          ⏳ Pendiente de enviar a la central
                        </div>
                        <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px', lineHeight: 1.4 }}>
                          Este turno y sus cargas están guardados en tu teléfono. El número de ticket se asigna cuando la central lo recibe; luego aparecerá en la web.
                        </div>
                        {pend?.ultimoError && (
                          <div style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 700, marginTop: '4px' }}>
                            Último intento ({pend.intentos}): {pend.ultimoError}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => sincronizarCargas()}
                          disabled={sincronizando || !isOnline}
                          style={{
                            marginTop: '8px',
                            background: isOnline ? '#d97706' : '#cbd5e1',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: isOnline ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <i className={`fa-solid fa-cloud-arrow-up ${sincronizando ? 'fa-beat' : ''}`}></i>{' '}
                          {isOnline ? 'Sincronizar ahora' : 'Sin conexión: se enviará solo'}
                        </button>
                      </div>
                    );
                  })()}

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
                  <div>
                    {viajeBloqueadoPorReceptoria ? (
                      <div
                        style={{
                          background: '#fffbeb',
                          border: '1.5px solid #fde68a',
                          borderRadius: '14px',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: '#fef3c7',
                            color: '#b45309',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            flexShrink: 0,
                          }}
                        >
                          <i className="fa-solid fa-lock"></i>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: '13px', color: '#92400e' }}>
                            Ticket en Receptoría (Solo Lectura)
                          </div>
                          <div style={{ fontSize: '11px', color: '#a16207', marginTop: '2px', lineHeight: '1.3' }}>
                            Las fincas están protegidas. Solo Receptoría puede devolver el ticket para permitir registrar o editar cargas.
                          </div>
                        </div>
                      </div>
                    ) : todasFincasRecolectadas ? (
                      <div>
                        <div
                          style={{
                            background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                            border: '1.5px solid #86efac',
                            borderRadius: '16px',
                            padding: '12px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)',
                          }}
                        >
                          <div
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '10px',
                              background: '#dcfce7',
                              color: '#15803d',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '18px',
                              flexShrink: 0,
                            }}
                          >
                            <i className="fa-solid fa-circle-check"></i>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>Fincas de la Ruta Completadas</span>
                              <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '8px', fontWeight: 800, border: '1px solid #86efac' }}>
                                {todasLasParadas.length} Fincas Recolectadas
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#15803d', marginTop: '2px', lineHeight: '1.3' }}>
                              Has recogido las fincas programadas. Procede a <strong>Receptoría</strong> o agrega fincas adicionales si requieres continuar recolectando.
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (viajeActivo?.fecha) {
                              setFormCarga((prev) => ({ ...prev, fecha: viajeActivo.fecha.split('T')[0] }));
                            }
                            setFincaFijadaParaModal(null);
                            setModalRegistro(true);
                          }}
                          style={{
                            width: '100%',
                            marginTop: '10px',
                            background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '14px',
                            padding: '12px 16px',
                            fontSize: '13.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                          }}
                        >
                          <i className="fa-solid fa-circle-plus"></i>
                          <span>+ Agregar Finca / Parada Extra a este Viaje</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (viajeActivo?.fecha) {
                            setFormCarga((prev) => ({ ...prev, fecha: viajeActivo.fecha.split('T')[0] }));
                          }
                          setFincaFijadaParaModal(null);
                          setModalRegistro(true);
                        }}
                        style={{
                          width: '100%',
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '14px',
                          padding: '12px 16px',
                          fontSize: '14px',
                          fontWeight: 900,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.28)',
                        }}
                      >
                        <i className="fa-solid fa-plus text-sm"></i>
                        <span>+ Registrar Parada Libre en Finca</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : !despachoActivo ? (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    padding: '24px 18px',
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
                      background: '#eff6ff',
                      color: '#2563eb',
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
                    Inicia un nuevo turno o recorrido (en circuito asignado o en modo libre) para comenzar a recolectar leche.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '320px', margin: '0 auto' }}>
                    <button
                      type="button"
                      onClick={() => abrirModalCrearTicket()}
                      style={{
                        background: 'linear-gradient(135deg, #059669, #10b981)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '11px 18px',
                        fontSize: '13.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
                      }}
                    >
                      <i className="fa-solid fa-truck-fast"></i>
                      <span>Inicio de Nuevo Turno</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => cargarViajeActivo()}
                      style={{
                        background: 'transparent',
                        color: '#64748b',
                        border: 'none',
                        padding: '6px 12px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                      }}
                    >
                      <i className={`fa-solid fa-rotate ${cargandoViaje ? 'fa-spin' : ''}`}></i>
                      <span>Consultar asignaciones del Admin</span>
                    </button>
                  </div>
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
                      <i className="fa-solid fa-cow text-emerald-600"></i>
                      <span>Fincas a Recolectar ({fincasDeMiRuta.length})</span>
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
                  <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: `${fincasDeMiRuta.length > 0 ? Math.round((recCount / fincasDeMiRuta.length) * 100) : 0}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

                  {/* Filtro segmentado: Todas | Pendientes | Hechas */}
                  {fincasDeMiRuta.length > 0 && (
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
                  )}

                  {/* Lista de Fincas con Detalle y Botón de Cargar Litros */}
                  {fincasDeMiRuta.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px', background: '#f8fafc', borderRadius: '12px' }}>
                      No hay fincas asignadas específicamente. Usa el botón superior <strong>+ Registrar Parada Libre</strong> para registrar paradas de leche.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {fincasDeMiRuta
                        .filter((f) => {
                          if (filtroCircuito === 'pendientes') return !f.recolectada;
                          if (filtroCircuito === 'recolectadas') return f.recolectada;
                          return true;
                        })
                        .map((f, idx) => {
                        const estaTitilando = fincaRecienActualizadaId === f.id;
                        return (
                        <div
                          key={f.id}
                          style={{
                            background: f.recolectada ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)' : '#f8fafc',
                            borderRadius: '14px',
                            padding: '12px 14px',
                            border: f.recolectada ? '1.5px solid #86efac' : '1.5px solid #cbd5e1',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            animation: estaTitilando ? 'titilarFincaVerde 1.2s infinite ease-in-out' : 'none',
                            transition: 'all 0.3s ease',
                            boxShadow: f.recolectada ? '0 2px 6px rgba(16, 185, 129, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '6px',
                                  background: f.recolectada ? '#dcfce7' : '#e2e8f0',
                                  color: f.recolectada ? '#15803d' : '#475569',
                                  fontSize: '11px',
                                  fontWeight: 900,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {idx + 1}
                              </span>
                              <span style={{ fontSize: '13.5px', fontWeight: 800, color: f.recolectada ? '#15803d' : '#1e293b' }}>
                                {f.recolectada ? '✓ ' : ''}{f.nombre}
                              </span>

                              {estaTitilando && (
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    fontWeight: 900,
                                    background: '#10b981',
                                    color: '#ffffff',
                                    padding: '1px 6px',
                                    borderRadius: '6px',
                                    animation: 'titilarPuntoPulso 1s infinite',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  ⚡ ¡LITROS INGRESADOS!
                                </span>
                              )}

                              {f.recogidaPorOtro ? (
                                <>
                                  <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde047', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '5px' }}>
                                    🚛 Recogida por {f.otroCamionPlaca || f.otroConductorNombre || 'otro camión'}
                                  </span>
                                  {f.solicPendiente && (
                                    <span style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #f59e0b', fontSize: '9.5px', fontWeight: 900, padding: '1px 6px', borderRadius: '5px' }}>
                                      ⏳ Emergencia Solicitada
                                    </span>
                                  )}
                                  {f.solicAprobada && (
                                    <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: '9.5px', fontWeight: 900, padding: '1px 6px', borderRadius: '5px' }}>
                                      ⚡ 2da Recogida Aprobada
                                    </span>
                                  )}
                                </>
                              ) : f.recolectada ? (
                                <>
                                  <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '5px', border: '1px solid #bbf7d0' }}>
                                    Recolectada
                                  </span>
                                  <span style={{ background: '#eff6ff', color: '#1e40af', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '5px', border: '1px solid #bfdbfe' }}>
                                    {f.tipoLeche === 'BUFALA' ? '🐃 BÚFALA' : '🥛 VACA'}
                                  </span>
                                  {f.esAcida && (
                                    <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '10px', fontWeight: 900, padding: '1px 6px', borderRadius: '5px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      ⚠️ ÁCIDA
                                    </span>
                                  )}
                                  {f.esDiferido && (
                                    <span style={{ background: '#fff7ed', color: '#c2410c', fontSize: '10px', fontWeight: 900, padding: '1px 6px', borderRadius: '5px', border: '1px solid #fed7aa', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      <i className="fa-solid fa-clock-rotate-left"></i> Diferido ({f.litrosDiferidos || f.litrosRecolectados} L)
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '5px', border: '1px solid #cbd5e1' }}>
                                  ⏳ Pendiente
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', paddingLeft: '28px' }}>
                              {f.propietarioNombre || f.propietario || f.codigo || 'Finca productora'}
                              {f.recolectada && f.horaRecogida ? ` • Recogida ${f.horaRecogida}` : ''}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            {f.recolectada ? (
                              <>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '15px', fontWeight: 900, color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    +{f.litrosRecolectados.toLocaleString()} L
                                  </div>
                                  {viajeBloqueadoPorReceptoria && (
                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                                      <i className="fa-solid fa-lock text-[9.5px] mr-1"></i>Bloqueado
                                    </div>
                                  )}
                                </div>
                                {!viajeBloqueadoPorReceptoria && (
                                  f.soloLectura ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
                                      <button
                                        type="button"
                                        onClick={() => abrirCargaParaFinca(f)}
                                        style={{
                                          background: '#f8fafc',
                                          border: '1px solid #cbd5e1',
                                          color: '#475569',
                                          borderRadius: '8px',
                                          padding: '5px 8px',
                                          fontSize: '11px',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                        title="Ver comprobante y litros (Solo Lectura)"
                                      >
                                        <i className="fa-solid fa-eye"></i>
                                        <span>Ver Litros</span>
                                      </button>
                                      {!f.solicPendiente && (
                                        <button
                                          type="button"
                                          onClick={() => solicitarEmergenciaFinca(f, f.recOtro)}
                                          style={{
                                            background: '#fffbeb',
                                            border: '1px solid #f59e0b',
                                            color: '#b45309',
                                            borderRadius: '6px',
                                            padding: '2px 6px',
                                            fontSize: '9.5px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                          }}
                                          title="Solicitar segunda recolección extraordinaria"
                                        >
                                          🚨 Emergencia
                                        </button>
                                      )}
                                    </div>
                                  ) : (
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
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                      }}
                                    >
                                      <i className="fa-solid fa-pen"></i>
                                      <span>Modificar</span>
                                    </button>
                                  )
                                )}
                              </>
                            ) : viajeBloqueadoPorReceptoria ? (
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', fontWeight: 600 }}>
                                Sin recolectar
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => abrirCargaParaFinca(f)}
                                style={{
                                  background: 'linear-gradient(135deg, #10b981, #059669)',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '10px',
                                  padding: '8px 14px',
                                  fontSize: '12.5px',
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  boxShadow: '0 3px 10px rgba(16, 185, 129, 0.35)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <i className="fa-solid fa-faucet-drip text-[12px]"></i>
                                <span>Cargar Leche</span>
                              </button>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Botones de Acción Móvil: Receptoría/Compañía y Traspaso */}
                  {(() => {
                    const litrosYaEntregados = Number(
                      (viajeActivo as any)?._litrosEntregados ||
                      (viajeActivo as any)?.litrosEntregadosCompania ||
                      viajeActivo?.totalLitrosEntregados ||
                      viajeActivo?.totalLitrosReceptoria ||
                      0
                    );
                    const litrosRestantes = Math.max(0, totalLitrosCargados - litrosYaEntregados);
                    const puedeDespachar = viajeActivo && totalLitrosCargados > 0 && !viajeBloqueadoPorReceptoria && litrosRestantes > 0;

                    if (puedeDespachar) {
                      return (
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button
                              type="button"
                              onClick={handleAbrirEntregaDirecta}
                              style={{
                                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '14px',
                                padding: '12px 10px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                boxShadow: '0 6px 16px rgba(16, 185, 129, 0.35)',
                                transition: 'transform 0.15s ease',
                              }}
                            >
                              <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                <i className="fa-solid fa-building-circle-check"></i>
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 900, marginTop: '2px' }}>Receptoría / Planta</span>
                              <span style={{ fontSize: '10.5px', color: '#d1fae5', fontWeight: 600 }}>Entregar o Distribuir</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleAbrirTraspasoMovil}
                              style={{
                                background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '14px',
                                padding: '12px 10px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                boxShadow: '0 6px 16px rgba(13, 148, 136, 0.35)',
                                transition: 'transform 0.15s ease',
                              }}
                            >
                              <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                <i className="fa-solid fa-right-left"></i>
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 900, marginTop: '2px' }}>Traspaso</span>
                              <span style={{ fontSize: '10.5px', color: '#ccfbf1', fontWeight: 600 }}>Transferir Carga</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (viajeActivo && (viajeBloqueadoPorReceptoria || (totalLitrosCargados > 0 && litrosRestantes <= 0))) {
                      return (
                        <div
                          style={{
                            marginTop: '16px',
                            background: '#f8fafc',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '16px',
                            padding: '14px 16px',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <i className="fa-solid fa-circle-check text-emerald-600"></i>
                            <span>Carga Despachada / En Receptoría</span>
                          </div>
                          <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: '#64748b' }}>
                            El volumen del camión ya fue entregado a Planta / Compañías. Opciones de despacho finalizadas.
                          </p>
                        </div>
                      );
                    }

                    return null;
                  })()}
                </div>
              )}
            </div>
          );
        })()}

        {/* ===================================================================
            PESTAÑA 2: RECOLECCIÓN (SOLO SUS VIAJES Y CARGAS EN FINCAS)
           =================================================================== */}
        {tabActiva === 'recoleccion' && (
          <div>
            {/* SELECTOR RÁPIDO DE TURNOS EN RECOLECCIÓN (MAÑANA / TARDE) */}
            {viajesChofer.length > 1 && (() => {
              const viajesOrdenados = [...viajesChofer].sort((a, b) => a.id - b.id);
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {viajesOrdenados.map((v, idx) => {
                    const esSel = viajeActivo?.id === v.id;
                    const info = getTurnoInfo(v, idx);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => seleccionarViaje(v)}
                        style={{
                          background: esSel ? 'linear-gradient(135deg, #10b981, #059669)' : '#ffffff',
                          color: esSel ? '#ffffff' : '#334155',
                          border: esSel ? 'none' : '1.5px solid #cbd5e1',
                          borderRadius: '12px',
                          padding: '8px 10px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          boxShadow: esSel ? '0 4px 10px rgba(16, 185, 129, 0.3)' : 'none',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ fontSize: '11.5px', fontWeight: 900 }}>
                          {info.tituloTurno}
                        </div>
                        <div style={{ fontSize: '10.5px', opacity: esSel ? 0.95 : 0.8, marginTop: '2px' }}>
                          Ticket #{v.codigoTicket || v.id} • {(v.totalLitrosFinca || 0).toLocaleString()} L
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

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
              const ticketEnReceptoria = Boolean(viajeActivo && (
                (viajeActivo.procesoActualId != null && viajeActivo.procesoActualId >= 2) ||
                (viajeActivo.litrosEntregadosCompania != null && Number(viajeActivo.litrosEntregadosCompania) > 0) ||
                (viajeActivo.totalLitrosReceptoria != null && Number(viajeActivo.totalLitrosReceptoria) > 0) ||
                viajeActivo.estado === 'EN_RECEPTORIA' ||
                viajeActivo.estado === 'RECEPCIONADO' ||
                viajeActivo.estado === 'CAMINO A COMPAÑIA' ||
                viajeActivo.estado === 'POR VERIFICACIÓN' ||
                viajeActivo.estado === 'FINALIZADO'
              ));

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
                    <div style={{ fontSize: '14.5px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <i className="fa-solid fa-cow" style={{ color: '#059669' }}></i>
                      <span>Fincas a Recolectar ({fincasDeMiRuta.length})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {!ticketEnReceptoria && (
                        <button
                          type="button"
                          onClick={() => {
                            if (viajeActivo?.fecha) {
                              setFormCarga((prev) => ({ ...prev, fecha: viajeActivo.fecha.split('T')[0] }));
                            }
                            setFincaFijadaParaModal(null);
                            setModalRegistro(true);
                          }}
                          style={{
                            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                            border: '1.5px solid #86efac',
                            color: '#065f46',
                            borderRadius: '8px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Agregar finca extra o fuera de ruta a este viaje"
                        >
                          <i className="fa-solid fa-plus text-xs"></i>
                          <span>+ Finca Extra</span>
                        </button>
                      )}
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
                      fincasAMostrar.map((f) => {
                        const estaTitilando = fincaRecienActualizadaId === f.id;
                        return (
                        <div
                          key={f.id}
                          style={{
                            borderRadius: '14px',
                            padding: '11px 13px',
                            border: f.recolectada ? '1.5px solid #86efac' : '1.5px solid #cbd5e1',
                            background: f.recolectada ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)' : '#f8fafc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            animation: estaTitilando ? 'titilarFincaVerde 1.2s infinite ease-in-out' : 'none',
                            transition: 'all 0.3s ease',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 800, color: f.recolectada ? '#166534' : '#1e293b' }}>
                                {f.recolectada ? '✓ ' : ''}{f.nombre}
                              </span>
                              {estaTitilando && (
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    fontWeight: 900,
                                    background: '#10b981',
                                    color: '#ffffff',
                                    padding: '1px 6px',
                                    borderRadius: '6px',
                                    animation: 'titilarPuntoPulso 1s infinite',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  ⚡ ¡LITROS INGRESADOS!
                                </span>
                              )}
                              {f.recogidaPorOtro ? (
                                <>
                                  <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde047', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '5px' }}>
                                    🚛 Recogida por {f.otroCamionPlaca || f.otroConductorNombre || 'otro camión'}
                                  </span>
                                  {f.solicPendiente && (
                                    <span style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #f59e0b', fontSize: '9.5px', fontWeight: 900, padding: '1px 6px', borderRadius: '5px' }}>
                                      ⏳ Emergencia Solicitada
                                    </span>
                                  )}
                                  {f.solicAprobada && (
                                    <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: '9.5px', fontWeight: 900, padding: '1px 6px', borderRadius: '5px' }}>
                                      ⚡ 2da Recogida Aprobada
                                    </span>
                                  )}
                                </>
                              ) : f.recolectada ? (
                                <>
                                  <span
                                    style={{
                                      background: '#dcfce7',
                                      color: '#15803d',
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      padding: '1px 6px',
                                      borderRadius: '5px',
                                      border: '1px solid #bbf7d0',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'titilarPuntoPulso 1.5s infinite' }}></span>
                                    Recolectada
                                  </span>
                                  <span style={{ background: '#eff6ff', color: '#1e40af', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '5px', border: '1px solid #bfdbfe' }}>
                                    {f.tipoLeche === 'BUFALA' ? '🐃 BÚFALA' : '🥛 VACA'}
                                  </span>
                                  {f.esAcida && (
                                    <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '10px', fontWeight: 900, padding: '1px 6px', borderRadius: '5px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      ⚠️ ÁCIDA
                                    </span>
                                  )}
                                  {f.esDiferido && (
                                    <span style={{ background: '#fff7ed', color: '#c2410c', fontSize: '10px', fontWeight: 900, padding: '1px 6px', borderRadius: '5px', border: '1px solid #fed7aa', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      <i className="fa-solid fa-clock-rotate-left"></i> Diferido ({f.litrosDiferidos || f.litrosRecolectados} L)
                                    </span>
                                  )}
                                </>
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
                              {f.recolectada && f.horaRecogida ? ` • Recogida ${f.horaRecogida}` : ''}
                            </div>
                          </div>

                          <div>
                            {f.recolectada ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontSize: '15px', fontWeight: 900, color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', animation: 'titilarPuntoPulso 1.5s infinite' }}></span>
                                    +{f.litrosRecolectados.toLocaleString()} L
                                  </span>
                                  {ticketEnReceptoria && (
                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textAlign: 'right' }}>
                                      <i className="fa-solid fa-lock text-[9px] mr-1"></i>Bloqueado
                                    </div>
                                  )}
                                </div>
                                {!ticketEnReceptoria && (
                                  f.soloLectura ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
                                      <button
                                        type="button"
                                        onClick={() => abrirCargaParaFinca(f)}
                                        style={{
                                          background: '#f8fafc',
                                          border: '1px solid #cbd5e1',
                                          color: '#475569',
                                          borderRadius: '8px',
                                          padding: '5px 8px',
                                          fontSize: '11px',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                        title="Ver datos (Solo Lectura)"
                                      >
                                        <i className="fa-solid fa-eye"></i>
                                        <span>Ver</span>
                                      </button>
                                      {!f.solicPendiente && (
                                        <button
                                          type="button"
                                          onClick={() => solicitarEmergenciaFinca(f, f.recOtro)}
                                          style={{
                                            background: '#fffbeb',
                                            border: '1px solid #f59e0b',
                                            color: '#b45309',
                                            borderRadius: '6px',
                                            padding: '2px 6px',
                                            fontSize: '9.5px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                          }}
                                          title="Solicitar segunda recolección extraordinaria"
                                        >
                                          🚨 Emergencia
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => abrirCargaParaFinca(f)}
                                      style={{
                                        background: '#ffffff',
                                        border: '1px solid #86efac',
                                        color: '#16a34a',
                                        borderRadius: '8px',
                                        padding: '5px 8px',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                      }}
                                      title="Modificar litros"
                                    >
                                      <i className="fa-solid fa-pen"></i>
                                    </button>
                                  )
                                )}
                              </div>
                            ) : ticketEnReceptoria ? (
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', fontWeight: 600 }}>
                                Sin recolectar
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => abrirCargaParaFinca(f)}
                                style={{
                                  background: 'linear-gradient(135deg, #10b981, #059669)',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '10px',
                                  padding: '8px 14px',
                                  fontSize: '12.5px',
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: '0 3px 10px rgba(16, 185, 129, 0.35)',
                                }}
                              >
                                <i className="fa-solid fa-faucet-drip text-[12px]"></i>
                                <span>Cargar Leche</span>
                              </button>
                            )}
                          </div>
                        </div>
                        );
                      })
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
              const dFecha = despachoActivo.fecha ? String(despachoActivo.fecha).split('T')[0] : '';
              if (!dFecha || !filtroFechaEntregas || dFecha === filtroFechaEntregas) {
                list.unshift(despachoActivo);
              }
            }
            return list;
          })();

          return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
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

            {/* BARRA DE FILTRO POR DÍA PARA EL CHOFER (REQUERIMIENTO 3) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '8px 12px',
                marginBottom: '12px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => cambiarDiaEntregas(-1)}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#334155',
                  }}
                  title="Día anterior"
                >
                  <i className="fa-solid fa-chevron-left" style={{ fontSize: '11px' }}></i>
                </button>
                <input
                  type="date"
                  value={filtroFechaEntregas}
                  onChange={(e) => {
                    const nueva = e.target.value;
                    setFiltroFechaEntregas(nueva);
                    cargarEntregasChofer(undefined, nueva);
                  }}
                  style={{
                    height: '32px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    padding: '0 8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                />
                <button
                  type="button"
                  onClick={() => cambiarDiaEntregas(1)}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#334155',
                  }}
                  title="Día siguiente"
                >
                  <i className="fa-solid fa-chevron-right" style={{ fontSize: '11px' }}></i>
                </button>
              </div>

              {filtroFechaEntregas !== hoyStr ? (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroFechaEntregas(hoyStr);
                    cargarEntregasChofer(undefined, hoyStr);
                  }}
                  style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#1d4ed8',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Ir a Hoy
                </button>
              ) : (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#16a34a',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    padding: '4px 8px',
                    borderRadius: '6px',
                  }}
                >
                  Hoy ({listaEntregasEfectiva.length})
                </span>
              )}
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

                      {/* Botones de Acción de Entrega (Chofer y Opciones Admin) */}
                      {est !== 'FINALIZADO' && est !== 'CERRADO' ? (
                        esDestinoReceptoria(d) ? (
                          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div
                              style={{
                                background: '#ecfdf5',
                                border: '1.5px solid #a7f3d0',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                              }}
                            >
                              <i className="fa-solid fa-hourglass-half text-emerald-600 text-lg"></i>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '12.5px', color: '#065f46' }}>
                                  ⏳ Pendiente por Recepcionar en Planta
                                </div>
                                <div style={{ fontSize: '11px', color: '#047857' }}>
                                  La comprobación y descarga de este ticket la gestiona el personal de Receptoría.
                                </div>
                              </div>
                            </div>

                            {/* Opciones avanzadas de Receptoría exclusivas para Rol Admin en Vista Chofer */}
                            {esAdminReal && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const ticketObj =
                                      viajesEnVivo.find((v) => v.id === d.controlRutaId || v.id === d.id) ||
                                      (viajeActivo?.id === d.controlRutaId ? viajeActivo : null);
                                    if (ticketObj) {
                                      abrirTimelapseMovil(ticketObj);
                                    } else {
                                      toast.info(`Cargando paradas del ticket #${d.id}...`);
                                    }
                                  }}
                                  style={{
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #bfdbfe',
                                    borderRadius: '10px',
                                    padding: '8px 6px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <i className="fa-solid fa-clock-rotate-left"></i>
                                  <span>Timelapse</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const ticketObj =
                                      viajesEnVivo.find((v) => v.id === d.controlRutaId || v.id === d.id) ||
                                      (viajeActivo?.id === d.controlRutaId ? viajeActivo : null);
                                    setModalVerificarLitros({
                                      open: true,
                                      ticket: (ticketObj || {
                                        id: d.controlRutaId || d.id,
                                        totalLitrosFinca: desp,
                                        camionPlaca: d.camionPlaca,
                                        nombreConductor: d.conductorNombre || choferEfectivoNombre,
                                      }) as any,
                                      litrosRecibidos: rec > 0 ? rec : desp,
                                      observacion: '',
                                    });
                                  }}
                                  style={{
                                    background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    padding: '8px 6px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <i className="fa-solid fa-scale-balanced"></i>
                                  <span>Recepcionar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalDevolverTicket({
                                      open: true,
                                      ticketId: d.controlRutaId || d.id,
                                      motivo: '',
                                    });
                                  }}
                                  style={{
                                    background: '#fff1f2',
                                    color: '#e11d48',
                                    border: '1px solid #fecdd3',
                                    borderRadius: '10px',
                                    padding: '8px 6px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <i className="fa-solid fa-arrow-rotate-left"></i>
                                  <span>Devolver</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: '12px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setModalConfirmarDespachoChofer(d);
                                setFormConfirmacionDespacho({
                                  litrosRecibidos: d.litrosDespachados || '',
                                  observacion: '',
                                  fotoReciboUrl: d.fotoReciboUrl || '',
                                });
                              }}
                              style={{
                                width: '100%',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '11px 16px',
                                fontWeight: 800,
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 3px 10px rgba(16,185,129,0.25)',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="fa-solid fa-clipboard-check"></i>
                              Confirmar Entrega en Planta & Subir Recibo
                            </button>
                          </div>
                        )
                      ) : (
                        d.fotoReciboUrl && (
                          <div style={{ marginTop: '10px' }}>
                            <button
                              type="button"
                              onClick={() => setFotoReciboVerModal(d.fotoReciboUrl)}
                              style={{
                                width: '100%',
                                background: '#f5f3ff',
                                color: '#7e22ce',
                                border: '1px solid #d8b4fe',
                                borderRadius: '10px',
                                padding: '8px 12px',
                                fontWeight: 700,
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="fa-solid fa-camera"></i> Ver Recibo de Báscula / Planta
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* MODAL MÓVIL: CHOFER CONFIRMA LITROS Y SUBE FOTO DE RECIBO */}
            {modalConfirmarDespachoChofer && (() => {
              const desp = Number(modalConfirmarDespachoChofer.litrosDespachados || 0);
              const rec = Number(formConfirmacionDespacho.litrosRecibidos || 0);
              const dif = rec > 0 ? rec - desp : 0;
              const pct = desp > 0 && rec > 0 ? ((Math.abs(dif) / desp) * 100).toFixed(2) : '0.00';

              return (
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      background: '#ffffff',
                      width: '100%',
                      maxWidth: '480px',
                      borderTopLeftRadius: '24px',
                      borderTopRightRadius: '24px',
                      maxHeight: '92vh',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 -10px 25px rgba(0,0,0,0.2)',
                      animation: 'slideUp 0.25s ease-out',
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
                        background: 'linear-gradient(135deg, #059669, #10b981)',
                        borderTopLeftRadius: '24px',
                        borderTopRightRadius: '24px',
                        color: '#ffffff',
                      }}
                    >
                      <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>
                          Confirmar Entrega en Planta
                        </h3>
                        <p style={{ fontSize: '11.5px', margin: '2px 0 0 0', opacity: 0.9 }}>
                          Ticket #{modalConfirmarDespachoChofer.id} • {modalConfirmarDespachoChofer.nombreCompania || 'Planta Destino'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalConfirmarDespachoChofer(null)}
                        style={{
                          background: 'rgba(255,255,255,0.2)',
                          border: 'none',
                          borderRadius: '50%',
                          width: '32px',
                          height: '32px',
                          color: '#ffffff',
                          fontSize: '16px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>

                    {/* Form Body */}
                    <form
                      onSubmit={handleConfirmarEntregaChofer}
                      style={{
                        padding: '20px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                      }}
                    >
                      {/* Resumen Salida */}
                      <div
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '14px',
                          padding: '12px 14px',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '10px',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 600 }}>
                            Litros Despachados:
                          </span>
                          <strong style={{ fontSize: '16px', color: '#0369a1', fontFamily: 'monospace' }}>
                            {desp.toLocaleString()} L
                          </strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 600 }}>
                            Destino:
                          </span>
                          <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                            {modalConfirmarDespachoChofer.nombreCompania || 'Receptoría'}
                          </strong>
                        </div>
                      </div>

                      {/* Input Litros Recibidos */}
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                          Litros Recibidos en Planta / Báscula *
                        </label>
                        <input
                          type="number"
                          required
                          step="any"
                          placeholder="Ej: 5000"
                          value={formConfirmacionDespacho.litrosRecibidos}
                          onChange={(e) =>
                            setFormConfirmacionDespacho((prev) => ({
                              ...prev,
                              litrosRecibidos: e.target.value,
                            }))
                          }
                          style={{
                            width: '100%',
                            height: '46px',
                            fontSize: '18px',
                            fontWeight: 800,
                            color: '#047857',
                            background: '#f0fdf4',
                            border: '2px solid #86efac',
                            borderRadius: '12px',
                            padding: '0 14px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      {/* Indicador de Merma / Diferencia en Tiempo Real */}
                      {rec > 0 && (
                        <div
                          style={{
                            background: dif === 0 ? '#f0fdf4' : dif < 0 ? '#fef2f2' : '#eff6ff',
                            border: `1.5px solid ${dif === 0 ? '#86efac' : dif < 0 ? '#fca5a5' : '#93c5fd'}`,
                            borderRadius: '12px',
                            padding: '10px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 600 }}>
                              Diferencia / Merma:
                            </span>
                            <strong
                              style={{
                                fontSize: '14px',
                                color: dif === 0 ? '#15803d' : dif < 0 ? '#dc2626' : '#1d4ed8',
                              }}
                            >
                              {dif === 0 ? 'Sin Merma (Exacto)' : dif < 0 ? `${dif.toLocaleString()} L` : `+${dif.toLocaleString()} L`}
                            </strong>
                          </div>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 800,
                              padding: '4px 10px',
                              borderRadius: '8px',
                              background: dif === 0 ? '#dcfce7' : dif < 0 ? '#fee2e2' : '#dbeafe',
                              color: dif === 0 ? '#15803d' : dif < 0 ? '#dc2626' : '#1d4ed8',
                            }}
                          >
                            {pct}% Merma
                          </span>
                        </div>
                      )}

                      {/* Subir / Tomar Foto del Recibo de Planta */}
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                          Foto del Recibo / Ticket de Báscula
                        </label>
                        <input
                          ref={inputFotoReciboDespachoRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: 'none' }}
                          onChange={handleSubirFotoReciboDespacho}
                        />

                        {formConfirmacionDespacho.fotoReciboUrl ? (
                          <div
                            style={{
                              border: '2px solid #86efac',
                              borderRadius: '12px',
                              padding: '10px',
                              background: '#f0fdf4',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                            }}
                          >
                            <img
                              src={formConfirmacionDespacho.fotoReciboUrl}
                              alt="Recibo"
                              style={{
                                width: '60px',
                                height: '60px',
                                objectFit: 'cover',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>
                                <i className="fa-solid fa-circle-check mr-1"></i> Foto de recibo cargada
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Listo para enviar</div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => inputFotoReciboDespachoRef.current?.click()}
                                style={{
                                  background: '#ffffff',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  padding: '6px 10px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Cambiar
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormConfirmacionDespacho((prev) => ({ ...prev, fotoReciboUrl: '' }))}
                                style={{
                                  background: '#fee2e2',
                                  border: '1px solid #fca5a5',
                                  borderRadius: '8px',
                                  padding: '6px 10px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                }}
                              >
                                Quitar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => inputFotoReciboDespachoRef.current?.click()}
                            style={{
                              width: '100%',
                              background: '#f8fafc',
                              border: '2px dashed #94a3b8',
                              borderRadius: '12px',
                              padding: '16px',
                              color: '#475569',
                              fontWeight: 700,
                              fontSize: '13px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            <i className="fa-solid fa-camera text-2xl text-emerald-600"></i>
                            <span>Tomar Foto del Recibo de Báscula</span>
                            <small style={{ fontSize: '11px', color: '#94a3b8' }}>o seleccionar desde la galería</small>
                          </button>
                        )}
                      </div>

                      {/* Observaciones */}
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                          Observaciones / Comentarios (Opcional)
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: Recibido por Ing. Pérez en silo 3..."
                          value={formConfirmacionDespacho.observacion}
                          onChange={(e) =>
                            setFormConfirmacionDespacho((prev) => ({ ...prev, observacion: e.target.value }))
                          }
                          style={{
                            width: '100%',
                            height: '40px',
                            borderRadius: '10px',
                            border: '1px solid #cbd5e1',
                            padding: '0 12px',
                            fontSize: '13px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      {/* Botones de Acción */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginTop: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setModalConfirmarDespachoChofer(null)}
                          disabled={guardandoConfirmacionDespacho}
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            border: 'none',
                            borderRadius: '12px',
                            height: '46px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={guardandoConfirmacionDespacho}
                          style={{
                            background: 'linear-gradient(135deg, #059669, #10b981)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '12px',
                            height: '46px',
                            fontWeight: 800,
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                            cursor: guardandoConfirmacionDespacho ? 'not-allowed' : 'pointer',
                            opacity: guardandoConfirmacionDespacho ? 0.7 : 1,
                          }}
                        >
                          {guardandoConfirmacionDespacho ? (
                            <>
                              <i className="fa-solid fa-spinner fa-spin"></i> Guardando...
                            </>
                          ) : (
                            <>
                              <i className="fa-solid fa-circle-check"></i> Finalizar y Confirmar
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })()}
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
                background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
                borderRadius: '18px',
                padding: '20px',
                color: '#0f172a',
                boxShadow: '0 4px 16px rgba(2, 132, 199, 0.08)',
                border: '1.5px solid #bae6fd',
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
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    {dispositivo.nombreCompleto}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '2px', fontWeight: 700 }}>
                    @{dispositivo.username} • <span style={{ textTransform: 'uppercase' }}>{dispositivo.rol}</span>
                  </div>
                  {dispositivo.placaCamion && (
                    <div style={{ fontSize: '12px', color: '#059669', marginTop: '2px', fontWeight: 700 }}>
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
                  background: '#ffffff',
                  borderRadius: '18px',
                  padding: '20px',
                  color: '#0f172a',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
                  border: '1.5px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: '#e0f2fe',
                        color: '#0284c7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                      }}
                    >
                      <i className="fa-solid fa-layer-group"></i>
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                        Modo de la Aplicación Móvil
                      </h4>
                      <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                        Acceso SuperAdmin: Alterna libremente entre los 3 entornos
                      </p>
                    </div>
                  </div>
                  <span
                    style={{
                      background:
                        modoActivo === 'ADMIN'
                          ? '#eff6ff'
                          : modoActivo === 'TALLER'
                          ? '#fff7ed'
                          : '#ecfdf5',
                      color:
                        modoActivo === 'ADMIN'
                          ? '#2563eb'
                          : modoActivo === 'TALLER'
                          ? '#ea580c'
                          : '#059669',
                      border: `1px solid ${
                        modoActivo === 'ADMIN'
                          ? '#93c5fd'
                          : modoActivo === 'TALLER'
                          ? '#fdba74'
                          : '#86efac'
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
                      border: modoActivo === 'CHOFER' ? '2px solid #10b981' : '1px solid #e2e8f0',
                      background: modoActivo === 'CHOFER' ? '#ecfdf5' : '#ffffff',
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
                        background: modoActivo === 'CHOFER' ? '#10b981' : '#f1f5f9',
                        color: modoActivo === 'CHOFER' ? '#ffffff' : '#64748b',
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
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                          1. Módulo Chofer / Conductor
                        </span>
                        {modoActivo === 'CHOFER' && (
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#059669' }}>✓ ACTIVO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
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
                      border: modoActivo === 'ADMIN' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: modoActivo === 'ADMIN' ? '#eff6ff' : '#ffffff',
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
                        background: modoActivo === 'ADMIN' ? '#2563eb' : '#f1f5f9',
                        color: modoActivo === 'ADMIN' ? '#ffffff' : '#64748b',
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
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                          2. Módulo Administrador
                        </span>
                        {modoActivo === 'ADMIN' && (
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#2563eb' }}>✓ ACTIVO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
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
                      border: modoActivo === 'TALLER' ? '2px solid #ea580c' : '1px solid #e2e8f0',
                      background: modoActivo === 'TALLER' ? '#fff7ed' : '#ffffff',
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
                        background: modoActivo === 'TALLER' ? '#ea580c' : '#f1f5f9',
                        color: modoActivo === 'TALLER' ? '#ffffff' : '#64748b',
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
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                          3. Módulo Taller & Flota
                        </span>
                        {modoActivo === 'TALLER' && (
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#ea580c' }}>✓ ACTIVO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
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
                      border: modoActivo === 'RECEPTORIA' ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                      background: modoActivo === 'RECEPTORIA' ? '#eef2ff' : '#ffffff',
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
                        background: modoActivo === 'RECEPTORIA' ? '#4f46e5' : '#f1f5f9',
                        color: modoActivo === 'RECEPTORIA' ? '#ffffff' : '#64748b',
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
                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                          4. Módulo Receptoría
                        </span>
                        {modoActivo === 'RECEPTORIA' && (
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#4f46e5' }}>✓ ACTIVO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
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
                Registro de Combustible ({formCombustible.tipoCombustible === 'GASOLINA' ? 'Gasolina' : 'Gasoil'})
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

              {/* Selector Tipo de Combustible: Gasoil vs Gasolina */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                  Tipo de Combustible *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setFormCombustible((prev) => ({ ...prev, tipoCombustible: 'GASOIL' }))}
                    style={{
                      padding: '12px 10px',
                      borderRadius: '12px',
                      border: formCombustible.tipoCombustible === 'GASOIL' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      background: formCombustible.tipoCombustible === 'GASOIL' ? '#f0f9ff' : '#f8fafc',
                      color: formCombustible.tipoCombustible === 'GASOIL' ? '#0369a1' : '#475569',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fa-solid fa-oil-well text-base"></i>
                    <span>Gasoil (Diésel)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormCombustible((prev) => ({ ...prev, tipoCombustible: 'GASOLINA' }))}
                    style={{
                      padding: '12px 10px',
                      borderRadius: '12px',
                      border: formCombustible.tipoCombustible === 'GASOLINA' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                      background: formCombustible.tipoCombustible === 'GASOLINA' ? '#fff7ed' : '#f8fafc',
                      color: formCombustible.tipoCombustible === 'GASOLINA' ? '#c2410c' : '#475569',
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
                    <span>Gasolina</span>
                  </button>
                </div>
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
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>⛽ {h.litros || (h as any).Litros || 0} Lts</span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 900,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: (h.tipoCombustible || (h as any).TipoCombustible || 'GASOIL').toUpperCase().includes('GASOLINA') ? '#fff7ed' : '#eff6ff',
                              color: (h.tipoCombustible || (h as any).TipoCombustible || 'GASOIL').toUpperCase().includes('GASOLINA') ? '#c2410c' : '#1d4ed8',
                              border: (h.tipoCombustible || (h as any).TipoCombustible || 'GASOIL').toUpperCase().includes('GASOLINA') ? '1px solid #fed7aa' : '1px solid #bfdbfe',
                            }}
                          >
                            {(h.tipoCombustible || (h as any).TipoCombustible || 'GASOIL').toUpperCase().includes('GASOLINA') ? 'GASOLINA' : 'GASOIL'}
                          </span>
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
                    const enviadoARecep = viajeEstaEnviadoAReceptoria(t);

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
                                  background: enviadoARecep ? '#dcfce7' : '#fef3c7',
                                  color: enviadoARecep ? '#15803d' : '#b45309',
                                  padding: '2px 6px',
                                  borderRadius: '5px',
                                  border: enviadoARecep ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                }}
                              >
                                {enviadoARecep ? '🏭 EN PLANTA' : '⏳ EN RECOLECCIÓN'}
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
                            <span>
                              {paradas.filter((p: any) => Number(p.litros || p.litrosLeche || p.litrosCargados || 0) > 0).length > 0
                                ? `${paradas.filter((p: any) => Number(p.litros || p.litrosLeche || p.litrosCargados || 0) > 0).length} Fincas Recolectadas`
                                : '⏳ Chofer en ruta (0 Lts)'}
                            </span>
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

                        {/* Botones de Acción: Timelapse, Verificar Litros vs Devolver Ticket */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => abrirTimelapseMovil(t)}
                            style={{
                              background: '#f8fafc',
                              color: '#0f172a',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: '10px',
                              padding: '9px 10px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                            }}
                            title="Ver trazabilidad completa de paradas del ticket"
                          >
                            <i className="fa-solid fa-clock-rotate-left text-sky-600"></i>
                            <span>Timelapse</span>
                          </button>

                          {enviadoARecep ? (
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
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                Swal.fire({
                                  icon: 'warning',
                                  title: 'Ruta aún en Recolección',
                                  html: `<div style="text-align: left; font-size: 13px; line-height: 1.5;">
                                    <p>El chofer <b>${chofNom}</b> aún <b>no ha finalizado su recolección en fincas ni ha enviado la carga a Receptoría</b>.</p>
                                    <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 3px solid #f59e0b; padding: 8px 10px; border-radius: 6px; margin: 10px 0; color: #92400e;">
                                      ⚠️ <b>Respeto Obligatorio del Proceso:</b><br/>
                                      Aunque tenga rol de Administrador, los procesos operativos deben respetarse. La cisterna debe ser finalizada y despachada por el chofer a receptoría para poder verificar litros en planta.
                                    </div>
                                    <p style="color: #64748b; font-size: 11.5px; margin: 0;">
                                      Una vez el chofer finalice su ruta de fincas y la envíe a Receptoría, este botón se activará automáticamente para registrar la descarga en planta.
                                    </p>
                                  </div>`,
                                  confirmButtonColor: '#0284c7',
                                  confirmButtonText: 'Entendido',
                                });
                              }}
                              style={{
                                flex: 1,
                                background: '#fffbeb',
                                color: '#b45309',
                                border: '1.5px solid #fde68a',
                                borderRadius: '10px',
                                padding: '9px 8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                              }}
                              title="El chofer no ha finalizado la recolección ni ha enviado la cisterna a receptoría"
                            >
                              <i className="fa-solid fa-lock"></i>
                              <span>Chofer en Ruta (Pendiente Envío)</span>
                            </button>
                          )}

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
        {tabActiva === 'admin_envivo' && (() => {
          const viajesHoy = viajesEnVivo.filter((v) => (v.fecha || '').split('T')[0] === hoyStr);
          const viajesActivosTotales = viajesEnVivo.filter((v) => {
            const est = String(v.estado || '').toUpperCase();
            return (v.procesoActualId || 1) < 4 && est !== 'FINALIZADO' && est !== 'CERRADO' && est !== 'AUDITADO' && est !== 'CUADRADO';
          });
          const viajesActivosAnteriores = viajesActivosTotales.filter((v) => (v.fecha || '').split('T')[0] !== hoyStr);
          const viajesActivosHoy = viajesActivosTotales.filter((v) => (v.fecha || '').split('T')[0] === hoyStr);

          const litrosHoy = viajesHoy.reduce((acc, v) => acc + (v.totalLitrosFinca || v.totalLitrosRecogidos || 0), 0);
          const litrosActivosAnteriores = viajesActivosAnteriores.reduce((acc, v) => acc + (v.totalLitrosFinca || v.totalLitrosRecogidos || 0), 0);
          const litrosTotalesActivos = viajesActivosTotales.reduce((acc, v) => acc + (v.totalLitrosFinca || v.totalLitrosRecogidos || 0), 0);
          const paradasTotalesActivas = viajesActivosTotales.reduce((acc, v) => acc + (v.fincasDetalle?.length || (v as any).paradas?.length || (v as any).totalParadas || 0), 0);

          let viajesAMostrar = viajesActivosTotales;
          if (filtroEnVivo === 'hoy') {
            viajesAMostrar = viajesHoy;
          } else if (filtroEnVivo === 'anteriores') {
            viajesAMostrar = viajesActivosAnteriores;
          } else if (filtroEnVivo === 'todos') {
            viajesAMostrar = viajesEnVivo;
          }

          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header En Vivo con Distinción Clara de Fechas */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                borderRadius: '18px',
                padding: '18px 20px',
                color: '#ffffff',
                boxShadow: '0 8px 25px rgba(2, 132, 199, 0.25)',
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
                  onClick={() => cargarDatosAdminEnVivo(false)}
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

              {/* KPIs Rápidos con Distinción Exacta de Hoy vs Días Anteriores */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '16px' }}>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#38bdf8' }}>{viajesActivosTotales.length}</div>
                  <div style={{ fontSize: '10px', color: '#bae6fd', fontWeight: 800 }}>CISTERNAS ACTIVAS</div>
                  <div style={{ fontSize: '9px', color: '#bfdbfe', marginTop: '3px', fontWeight: 700 }}>
                    {viajesActivosHoy.length} Hoy • {viajesActivosAnteriores.length} Ant.
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '17px', fontWeight: 900, color: '#4ade80' }}>
                    {litrosTotalesActivos.toLocaleString()} L
                  </div>
                  <div style={{ fontSize: '10px', color: '#bbf7d0', fontWeight: 800 }}>LITROS EN RUTA</div>
                  <div style={{ fontSize: '9px', color: '#86efac', marginTop: '3px', fontWeight: 700 }}>
                    {litrosHoy > 0 ? `${litrosHoy.toLocaleString()} L Hoy` : '0 L Hoy'}
                    {litrosActivosAnteriores > 0 && ` • ${litrosActivosAnteriores.toLocaleString()} L Ant.`}
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#facc15' }}>
                    {paradasTotalesActivas}
                  </div>
                  <div style={{ fontSize: '10px', color: '#fef08a', fontWeight: 800 }}>PARADAS EN RUTA</div>
                  <div style={{ fontSize: '9px', color: '#fde047', marginTop: '3px', fontWeight: 700 }}>
                    En Recolección
                  </div>
                </div>
              </div>

              {/* Banner Informativo si hay viajes activos de días anteriores */}
              {viajesActivosAnteriores.length > 0 && (
                <div
                  style={{
                    marginTop: '12px',
                    background: 'rgba(254, 240, 138, 0.18)',
                    border: '1px solid rgba(250, 204, 21, 0.4)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    color: '#fef9c3',
                  }}
                >
                  <i className="fa-solid fa-clock-rotate-left text-yellow-300"></i>
                  <span>
                    Hay <strong>{viajesActivosAnteriores.length} viaje(s) activo(s)</strong> de fechas anteriores ({litrosActivosAnteriores.toLocaleString()} L en ruta).
                  </span>
                </div>
              )}
            </div>

            {/* SECCIÓN DE APROBACIÓN DE SOLICITUDES EXTRAORDINARIAS DE RECOGIDA */}
            {solicitudesExtraordinarias.filter((s: any) => s.estado === 'PENDIENTE').length > 0 && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1.5px solid #f59e0b',
                  borderRadius: '16px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: '0 4px 15px rgba(245, 158, 11, 0.15)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
                      <i className="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 900, color: '#92400e' }}>
                        Solicitudes de Recogida Extraordinaria ({solicitudesExtraordinarias.filter((s: any) => s.estado === 'PENDIENTE').length})
                      </div>
                      <div style={{ fontSize: '11px', color: '#b45309' }}>
                        Fincas que requieren segunda recolección autorizada
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {solicitudesExtraordinarias.filter((s: any) => s.estado === 'PENDIENTE').map((sol: any) => (
                    <div
                      key={sol.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #fde047',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                          {sol.fincaNombre || `Finca #${sol.fincaId}`}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          Chofer: <strong>{sol.choferSolicitanteNombre || 'Chofer'}</strong> • Motivo: <em>"{sol.motivo}"</em>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => responderEmergencia(sol.id, true)}
                          style={{
                            background: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '7px 12px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => responderEmergencia(sol.id, false)}
                          style={{
                            background: '#ef4444',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '7px 10px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de Camiones Cisterna En Ruta */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                  Cisternas en Operación ({viajesAMostrar.length})
                </h4>
              </div>

              {/* Filtros de Pestaña para Admin En Vivo */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                <button
                  type="button"
                  onClick={() => setFiltroEnVivo('activos')}
                  style={{
                    background: filtroEnVivo === 'activos' ? '#0284c7' : '#f1f5f9',
                    color: filtroEnVivo === 'activos' ? '#ffffff' : '#64748b',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ⚡ Activos Totales ({viajesActivosTotales.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEnVivo('hoy')}
                  style={{
                    background: filtroEnVivo === 'hoy' ? '#0284c7' : '#f1f5f9',
                    color: filtroEnVivo === 'hoy' ? '#ffffff' : '#64748b',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📅 De Hoy ({viajesHoy.length})
                </button>
                {viajesActivosAnteriores.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFiltroEnVivo('anteriores')}
                    style={{
                      background: filtroEnVivo === 'anteriores' ? '#d97706' : '#fef3c7',
                      color: filtroEnVivo === 'anteriores' ? '#ffffff' : '#b45309',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ⚠️ Días Anteriores ({viajesActivosAnteriores.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFiltroEnVivo('todos')}
                  style={{
                    background: filtroEnVivo === 'todos' ? '#475569' : '#f1f5f9',
                    color: filtroEnVivo === 'todos' ? '#ffffff' : '#64748b',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Histórico ({viajesEnVivo.length})
                </button>
              </div>

              {cargandoViajesEnVivo && viajesEnVivo.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando viajes en vivo...
                </div>
              ) : viajesAMostrar.length === 0 ? (
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
                  No se encontraron viajes o cisternas para el filtro seleccionado.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {viajesAMostrar.map((viaje) => {
                    const lts = viaje.totalLitrosFinca || viaje.totalLitrosRecogidos || 0;
                    const cap = viaje.capacidadCamionLitros || 6000;
                    const pct = Math.min(100, Math.round((lts / cap) * 100));
                    const fechaViajeStr = (viaje.fecha || '').split('T')[0];
                    const esHoy = fechaViajeStr === hoyStr;

                    return (
                      <div
                        key={viaje.id}
                        style={{
                          background: !esHoy && (viaje.procesoActualId || 1) < 4 ? '#fffdf7' : '#ffffff',
                          borderRadius: '16px',
                          padding: '16px',
                          border: !esHoy && (viaje.procesoActualId || 1) < 4 ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                          boxShadow: !esHoy && (viaje.procesoActualId || 1) < 4 ? '0 4px 16px rgba(245, 158, 11, 0.18)' : '0 4px 12px rgba(0,0,0,0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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

                              {/* Distinción destacada de Fecha (Requisito 2) */}
                              {esHoy ? (
                                <span
                                  style={{
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    fontSize: '9.5px',
                                    fontWeight: 900,
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                  }}
                                >
                                  🟢 TICKET DE HOY
                                </span>
                              ) : (
                                <span
                                  style={{
                                    background: '#fef3c7',
                                    color: '#b45309',
                                    border: '1.5px solid #f59e0b',
                                    fontSize: '9.5px',
                                    fontWeight: 900,
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  <i className="fa-solid fa-clock-rotate-left"></i>
                                  ⚠️ DÍA ANTERIOR ({fechaViajeStr})
                                </span>
                              )}
                            </div>
                            {!esHoy && (viaje.procesoActualId || 1) < 4 && (
                              <div style={{ fontSize: '10.5px', color: '#b45309', fontWeight: 800, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <i className="fa-solid fa-triangle-exclamation text-amber-600"></i>
                                <span>Ticket abierto en fecha anterior — Pendiente de cierre/liquidación</span>
                              </div>
                            )}
                            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>
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

                        {/* Botonera Operativa para el Administrador: Timelapse, Cargar Litros y Supervisar */}
                        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => abrirTimelapseMovil(viaje)}
                            style={{
                              flex: 1,
                              minWidth: '95px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1.5px solid #bfdbfe',
                              borderRadius: '10px',
                              padding: '8px 8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px',
                            }}
                          >
                            <i className="fa-solid fa-clock-rotate-left"></i>
                            <span>Timelapse</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => abrirModalAdminCargarLitros(viaje)}
                            style={{
                              flex: 1.2,
                              minWidth: '110px',
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '10px',
                              padding: '8px 8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px',
                              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                            }}
                          >
                            <i className="fa-solid fa-plus-circle"></i>
                            <span>+ Cargar Litros</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const chofId = viaje.usuarioId;
                              if (chofId) {
                                setChoferSimuladoId(chofId);
                                localStorage.setItem('movil_chofer_simulado_id', String(chofId));
                                setModoActivo('CHOFER');
                                localStorage.setItem('movil_modo_activo', 'CHOFER');
                                setTabActiva('principal');
                                cargarViajeActivo(chofId, viaje.id);
                                cargarDespachoActivo(chofId);
                                cargarEntregasChofer(chofId);
                                toast.info(`Supervisando a ${viaje.nombreConductor || 'chofer'} (Ticket #${viaje.id})`);
                              }
                            }}
                            style={{
                              background: '#f8fafc',
                              color: '#475569',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: '10px',
                              padding: '8px 10px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                            }}
                            title="Ver en Vista Chofer"
                          >
                            <i className="fa-solid fa-eye text-slate-500"></i>
                            <span>Ver Chofer</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          );
        })()}

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

            {/* Aviso y Distinción si la Fecha de Logística no es Hoy */}
            {fechaLogistica !== hoyStr && (
              <div
                style={{
                  background: '#fef3c7',
                  border: '1.5px solid #fde047',
                  borderRadius: '14px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-clock-rotate-left text-amber-600 text-sm"></i>
                  <div>
                    <div style={{ fontSize: '11.5px', color: '#92400e', fontWeight: 800 }}>
                      Viendo Asignaciones de Fecha Anterior
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#b45309' }}>
                      Fecha seleccionada: <strong>{fechaLogistica}</strong>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFechaLogistica(hoyStr);
                    cargarDatosLogisticaAdmin(hoyStr);
                  }}
                  style={{
                    background: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(217, 119, 6, 0.25)',
                  }}
                >
                  Volver a Hoy
                </button>
              </div>
            )}

            {/* Alerta de Viajes Activos de Fechas Anteriores (ej. Ticket #21303) */}
            {(() => {
              const activasAnteriores = viajesEnVivo.filter((v) => {
                const est = String(v.estado || '').toUpperCase();
                const esActivo = (v.procesoActualId || 1) < 4 && est !== 'FINALIZADO' && est !== 'CERRADO' && est !== 'AUDITADO' && est !== 'CUADRADO';
                const fechaV = (v.fecha || '').split('T')[0];
                return esActivo && fechaV !== hoyStr;
              });

              if (fechaLogistica === hoyStr && activasAnteriores.length > 0) {
                const fechasUnicas = Array.from(new Set(activasAnteriores.map((v) => (v.fecha || '').split('T')[0]))).filter(Boolean);
                return (
                  <div
                    style={{
                      background: '#eff6ff',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: '14px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="fa-solid fa-triangle-exclamation text-blue-600 text-sm"></i>
                      <div>
                        <div style={{ fontSize: '11.5px', color: '#1e40af', fontWeight: 800 }}>
                          {activasAnteriores.length} viaje(s) activo(s) de fecha anterior
                        </div>
                        <div style={{ fontSize: '10px', color: '#2563eb' }}>
                          Ticket {activasAnteriores[0].codigoTicket || `#${activasAnteriores[0].id}`} ({fechasUnicas.join(', ')})
                        </div>
                      </div>
                    </div>
                    {fechasUnicas[0] && (
                      <button
                        type="button"
                        onClick={() => {
                          setFechaLogistica(fechasUnicas[0]);
                          cargarDatosLogisticaAdmin(fechasUnicas[0]);
                        }}
                        style={{
                          background: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '5px 10px',
                          fontSize: '11px',
                          fontWeight: 900,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Ver {fechasUnicas[0]}
                      </button>
                    )}
                  </div>
                );
              }
              return null;
            })()}

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
                    {(() => {
                    const planificacionesUnicas = (() => {
                      const map = new Map<string, PlanificacionRutaChoferDto>();
                      planificaciones.forEach((p) => {
                        const k = p.controlRutaId
                          ? `ticket_${p.controlRutaId}`
                          : `cam_${p.camionId}_chof_${p.conductorId}_${(p.fecha || '').split('T')[0]}`;
                        if (!map.has(k)) {
                          map.set(k, p);
                        }
                      });
                      return Array.from(map.values());
                    })();

                    return planificacionesUnicas.map((plan) => {
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
                          {(() => {
                            const fechaPlanStr = (plan.fecha || fechaLogistica || '').split('T')[0];
                            const esHoyPlan = fechaPlanStr === hoyStr;

                            return (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px' }}>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                                      🚛 {plan.camionPlaca || 'S/P'}
                                    </span>
                                    {plan.rutaLogisticaNombre && (
                                      <span style={{ fontSize: '10.5px', background: '#eff6ff', color: '#2563eb', padding: '2px 7px', borderRadius: '6px', fontWeight: 800 }}>
                                        {plan.rutaLogisticaNombre}
                                      </span>
                                    )}
                                    {esHoyPlan ? (
                                      <span style={{ fontSize: '9.5px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '6px', fontWeight: 800 }}>
                                        📅 HOY
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '9.5px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde047', padding: '2px 6px', borderRadius: '6px', fontWeight: 900 }}>
                                        📅 {fechaPlanStr}
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
                            );
                          })()}

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
                                setBusquedaFincaRapida('');
                                const idsYaAsignadas = getFincasIdsDePlan(plan);
                                const primerFincaDisponible = fincas.find((f) => !idsYaAsignadas.includes(f.id));
                                setModalAgregarFincaRapida({
                                  open: true,
                                  plan,
                                  fincaId: primerFincaDisponible ? primerFincaDisponible.id : 0,
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
                    });
                  })()}
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
                    setBusquedaFincasNuevoCircuito('');
                    setModalCircuito({
                      open: true,
                      esEdicion: false,
                      nombre: '',
                      codigo: '',
                      color: '#2563eb',
                      descripcion: '',
                      fincasIds: [],
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
                                setBusquedaFincasNuevoCircuito('');
                                const fIds = Array.isArray(ruta.fincas) ? ruta.fincas.map((f: any) => f.fincaId || f.id) : [];
                                setModalCircuito({
                                  open: true,
                                  esEdicion: true,
                                  id: ruta.id,
                                  nombre: ruta.nombre,
                                  codigo: ruta.codigo || '',
                                  color: '#2563eb',
                                  descripcion: ruta.descripcion || '',
                                  fincasIds: fIds,
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
                onClick={() => {
                  setModalRegistro(false);
                  setFincaFijadaParaModal(null);
                }}
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
              {/* Finca: Si viene fijada desde la lista, NO se puede editar ni buscar */}
              {fincaFijadaParaModal ? (
                <>
                <div
                  style={{
                    marginBottom: '16px',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: '#ecfdf5',
                        color: '#059669',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-cow"></i>
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                        {fincaFijadaParaModal.nombre}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                        {fincaFijadaParaModal.propietarioNombre || fincaFijadaParaModal.propietario || 'Finca Asignada'}
                        {fincaFijadaParaModal.codigo ? ` • Cód: ${fincaFijadaParaModal.codigo}` : ''}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: '#e2e8f0',
                      color: '#475569',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      flexShrink: 0,
                    }}
                  >
                    <i className="fa-solid fa-lock text-[10px]"></i> Finca Fija
                  </span>
                </div>
                {fincaFijadaParaModal?.soloLectura && (
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1.5px solid #f59e0b',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      marginBottom: '16px',
                      fontSize: '12px',
                      color: '#92400e',
                    }}
                  >
                    <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                      <i className="fa-solid fa-triangle-exclamation text-amber-600"></i>
                      <span>Finca ya recolectada por {fincaFijadaParaModal.otroCamionPlaca || fincaFijadaParaModal.otroConductorNombre || 'otro camión'}</span>
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '11.5px', lineHeight: 1.4 }}>
                      Esta finca pertenece a la ruta y ya fue recolectada hoy en su recorrido ({formCarga.litros || 0} Lts). La información se muestra en <strong>modo solo lectura</strong>. Si necesitas hacer una segunda recolección extraordinaria (corte eléctrico, emergencia), solicita autorización con el botón inferior.
                    </p>
                  </div>
                )}
              </>
              ) : (
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
                    <option value={0}>-- Selecciona la Finca ({fincasFiltradas.length} disponibles) --</option>
                    {fincasFiltradas.map((f) => {
                      const enRuta = fincasDeMiRuta.some((r) => r.id === f.id) || (f.rutaId && rutasActivasIds.includes(f.rutaId));
                      return (
                        <option key={f.id} value={f.id}>
                          {enRuta ? '⭐ [De la Ruta] ' : '+ [Finca Extra] '}{f.nombre} {f.codigo ? `(${f.codigo})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

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
                    disabled={Boolean(fincaFijadaParaModal?.soloLectura)}
                    readOnly={Boolean(fincaFijadaParaModal?.soloLectura)}
                    value={formCarga.litros}
                    onChange={(e) => setFormCarga({ ...formCarga, litros: e.target.value })}
                    placeholder="0"
                    required
                    style={{
                      width: '100%',
                      height: '56px',
                      borderRadius: '12px',
                      border: fincaFijadaParaModal?.soloLectura ? '2px solid #cbd5e1' : '2px solid #3b82f6',
                      padding: '0 60px 0 16px',
                      fontSize: '24px',
                      fontWeight: 900,
                      color: fincaFijadaParaModal?.soloLectura ? '#64748b' : '#1e3a8a',
                      background: fincaFijadaParaModal?.soloLectura ? '#f1f5f9' : '#f8fafc',
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
                {!fincaFijadaParaModal?.soloLectura && (
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
                )}
              </div>

              {/* Tipo de Leche */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>
                  Tipo de Leche
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: tieneModuloBufala ? '1fr 1fr' : '1fr', gap: '8px' }}>
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
                  {tieneModuloBufala && (
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
                  )}
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

              {/* OPCIÓN DIFERIR LITROS (Siguiente Ciclo Operativo) */}
              <div
                style={{
                  marginBottom: '16px',
                  borderRadius: '12px',
                  border: formCarga.esDiferido ? '1.5px solid #fdba74' : '1.5px solid #e2e8f0',
                  background: formCarga.esDiferido ? 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' : '#f8fafc',
                  padding: '12px 14px',
                  transition: 'all 0.2s ease',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i
                      className="fa-solid fa-clock-rotate-left"
                      style={{
                        color: formCarga.esDiferido ? '#ea580c' : '#64748b',
                        fontSize: '15px',
                      }}
                    ></i>
                    <div>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 800,
                          color: formCarga.esDiferido ? '#9a3412' : '#1e293b',
                        }}
                      >
                        Diferir Litros (Próxima Semana)
                      </span>
                      <span style={{ fontSize: '11px', color: formCarga.esDiferido ? '#c2410c' : '#64748b' }}>
                        Suma al tanque hoy, se liquida la siguiente semana
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formCarga.esDiferido}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormCarga((prev) => ({
                        ...prev,
                        esDiferido: checked,
                        litrosDiferir: checked ? (prev.litrosDiferir || prev.litros) : '',
                      }));
                    }}
                    style={{
                      width: '20px',
                      height: '20px',
                      accentColor: '#ea580c',
                      cursor: 'pointer',
                    }}
                  />
                </label>

                {formCarga.esDiferido && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #fed7aa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#9a3412' }}>
                        Litros a Diferir para Próxima Semana:
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormCarga((prev) => ({ ...prev, litrosDiferir: prev.litros }))}
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: '#c2410c',
                          background: '#ffffff',
                          border: '1px solid #fdba74',
                          borderRadius: '6px',
                          padding: '2px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        Diferir Todo ({formCarga.litros || 0} L)
                      </button>
                    </div>

                    <input
                      type="number"
                      min="1"
                      max={formCarga.litros || undefined}
                      placeholder={`Ej. ${formCarga.litros || 100}`}
                      value={formCarga.litrosDiferir}
                      onChange={(e) => setFormCarga((prev) => ({ ...prev, litrosDiferir: e.target.value }))}
                      style={{
                        width: '100%',
                        height: '42px',
                        borderRadius: '8px',
                        border: '2px solid #fdba74',
                        background: '#ffffff',
                        color: '#ea580c',
                        fontWeight: 900,
                        fontSize: '16px',
                        textAlign: 'center',
                        boxSizing: 'border-box',
                      }}
                    />

                    <div
                      style={{
                        marginTop: '8px',
                        background: 'rgba(255, 255, 255, 0.7)',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontSize: '11.5px',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#475569' }}>
                        Esta semana:{' '}
                        <strong style={{ color: '#16a34a' }}>
                          {Math.max(0, Number(formCarga.litros || 0) - Number(formCarga.litrosDiferir || 0))} L
                        </strong>
                      </span>
                      <span style={{ color: '#475569' }}>
                        Próxima semana:{' '}
                        <strong style={{ color: '#ea580c' }}>
                          {Number(formCarga.litrosDiferir || 0)} L
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
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
                  onClick={() => {
                    setModalRegistro(false);
                    setFincaFijadaParaModal(null);
                  }}
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
                {fincaFijadaParaModal?.soloLectura ? (
                  <button
                    type="button"
                    onClick={() => {
                      const fItem = fincaFijadaParaModal;
                      setModalRegistro(false);
                      setFincaFijadaParaModal(null);
                      solicitarEmergenciaFinca(fItem, fItem.recOtro);
                    }}
                    style={{
                      flex: 2,
                      height: '48px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: 900,
                      fontSize: '14px',
                      boxShadow: '0 4px 15px rgba(217, 119, 6, 0.4)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    🚨 Solicitar Emergencia
                  </button>
                ) : (
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
                )}
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
                {/* Selectores de Camión y Chofer en Grid Compacto */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
                  {/* Selector de Camión */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px' }}>
                      1. Cisterna / Camión *
                    </label>
                    <select
                      value={modalPlanificar.camionId}
                      onChange={(e) => setModalPlanificar((prev) => prev ? { ...prev, camionId: Number(e.target.value) } : null)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '12px',
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
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px' }}>
                      2. Chofer / Conductor *
                    </label>
                    <select
                      value={modalPlanificar.conductorId}
                      onChange={(e) => setModalPlanificar((prev) => prev ? { ...prev, conductorId: Number(e.target.value) } : null)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '12px',
                        background: '#ffffff',
                        fontWeight: 700,
                      }}
                    >
                      <option value={0}>-- Selecciona Chofer --</option>
                      {choferesLista
                        .filter((ch) => ch.activo === true || (ch as any).activo === 1)
                        .map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.nombreCompleto} {ch.cedula ? `(C.I. ${ch.cedula})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selector de Circuito Maestro (Opcional) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#334155' }}>
                      3. Circuito Base (Opcional)
                    </label>
                    {modalPlanificar.rutaLogisticaId && (
                      <button
                        type="button"
                        onClick={async () => {
                          const rId = modalPlanificar.rutaLogisticaId!;
                          let idsFincasRuta = fincas
                            .filter((f) => f.rutaId === rId || (f as any).rutasAsignadasIds?.includes?.(rId))
                            .map((f) => f.id);

                          const rutaObj = rutasLogisticas.find((r) => r.id === rId);
                          if (rutaObj && Array.isArray((rutaObj as any).fincas)) {
                            const deObj = (rutaObj as any).fincas.map((x: any) => x.fincaId || x.id).filter(Boolean);
                            idsFincasRuta = Array.from(new Set([...idsFincasRuta, ...deObj]));
                          }

                          if (idsFincasRuta.length === 0) {
                            try {
                              const deApi = await operacionesApi.getFincasDeRutaLogistica(rId);
                              if (Array.isArray(deApi) && deApi.length > 0) {
                                idsFincasRuta = deApi.map((x: any) => x.fincaId || x.id).filter(Boolean);
                              }
                            } catch (err) {
                              console.warn('Error consultando fincas de ruta:', err);
                            }
                          }

                          if (idsFincasRuta.length > 0) {
                            setModalPlanificar((prev) =>
                              prev ? { ...prev, fincasIds: Array.from(new Set([...prev.fincasIds, ...idsFincasRuta])) } : null
                            );
                            toast.success(`Cargadas ${idsFincasRuta.length} fincas del circuito`);
                          } else {
                            toast.info('No se encontraron fincas asignadas a esta ruta');
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
                    onChange={async (e) => {
                      const rId = Number(e.target.value) || undefined;
                      if (!rId) {
                        setModalPlanificar((prev) => (prev ? { ...prev, rutaLogisticaId: undefined } : null));
                        return;
                      }

                      // Preseleccionar automáticamente las fincas asociadas al circuito
                      let idsFincasRuta = fincas
                        .filter((f) => f.rutaId === rId || (f as any).rutasAsignadasIds?.includes?.(rId))
                        .map((f) => f.id);

                      const rutaObj = rutasLogisticas.find((r) => r.id === rId);
                      if (rutaObj && Array.isArray((rutaObj as any).fincas)) {
                        const deObj = (rutaObj as any).fincas.map((x: any) => x.fincaId || x.id).filter(Boolean);
                        idsFincasRuta = Array.from(new Set([...idsFincasRuta, ...deObj]));
                      }

                      if (idsFincasRuta.length === 0) {
                        try {
                          const deApi = await operacionesApi.getFincasDeRutaLogistica(rId);
                          if (Array.isArray(deApi) && deApi.length > 0) {
                            idsFincasRuta = deApi.map((x: any) => x.fincaId || x.id).filter(Boolean);
                          }
                        } catch (err) {
                          console.warn('Error consultando fincas de ruta:', err);
                        }
                      }

                      setModalPlanificar((prev) => {
                        if (!prev) return null;
                        const merged = Array.from(new Set([...prev.fincasIds, ...idsFincasRuta]));
                        return { ...prev, rutaLogisticaId: rId, fincasIds: merged };
                      });

                      if (idsFincasRuta.length > 0) {
                        toast.success(`Se seleccionaron automáticamente ${idsFincasRuta.length} fincas de la ruta`);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '12px',
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

                  {/* Lista de Fincas con Checkboxes con Mayor Altura y Espacio Visible */}
                  <div
                    style={{
                      minHeight: '260px',
                      maxHeight: '44vh',
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
                        : viajesEnVivo.find((v) => v.camionId === modalPlanificar.camionId && (v.procesoActualId || 1) < 4);
                      const paradasConLeche = (controlAsociado as any)?.paradas || (controlAsociado as any)?.fincasDetalle || [];

                      // Mapear fincas que ya tienen leche recolectada (bloqueadas)
                      const paradasLlenasMap = new Map<number, number>();
                      paradasConLeche.forEach((p: any) => {
                        const fId = Number(p.fincaId || p.FincaId);
                        const lts = Number(p.litros || p.litrosLeche || p.litrosCargados || 0);
                        if (lts > 0 && fId > 0) {
                          paradasLlenasMap.set(fId, lts);
                        }
                      });
                      if (planActual?.fincasRecolectadasIds) {
                        planActual.fincasRecolectadasIds.forEach((fId) => {
                          if (!paradasLlenasMap.has(fId)) {
                            paradasLlenasMap.set(fId, 1);
                          }
                        });
                      }

                      // Filtrar por término de búsqueda
                      const fincasFiltradas = fincas.filter(
                        (f) =>
                          !busquedaFincaPlanificar.trim() ||
                          f.nombre.toLowerCase().includes(busquedaFincaPlanificar.toLowerCase()) ||
                          (f.codigo && f.codigo.toLowerCase().includes(busquedaFincaPlanificar.toLowerCase())) ||
                          (f.propietarioNombre && f.propietarioNombre.toLowerCase().includes(busquedaFincaPlanificar.toLowerCase()))
                      );

                      // ORDEN ESTABLE: 1) Con leche recolectada, 2) De la ruta seleccionada, 3) Alfabético
                      // IMPORTANTE: NO reordenar dinámicamente según checkbox para evitar que el scroll salte al tocar una finca en móviles
                      const fincasOrdenadas = [...fincasFiltradas].sort((a, b) => {
                        const llenaA = paradasLlenasMap.has(a.id);
                        const llenaB = paradasLlenasMap.has(b.id);

                        // 1. Con leche recolectada arriba de todo
                        if (llenaA && !llenaB) return -1;
                        if (!llenaA && llenaB) return 1;

                        // 2. Fincas que pertenecen a la ruta seleccionada arriba
                        if (modalPlanificar.rutaLogisticaId) {
                          const rId = modalPlanificar.rutaLogisticaId;
                          const inRutaA = a.rutaId === rId || (a as any).rutasAsignadasIds?.includes?.(rId);
                          const inRutaB = b.rutaId === rId || (b as any).rutasAsignadasIds?.includes?.(rId);
                          if (inRutaA && !inRutaB) return -1;
                          if (!inRutaA && inRutaB) return 1;
                        }

                        // 3. Alfabético por nombre estable
                        return a.nombre.localeCompare(b.nombre);
                      });

                      return fincasOrdenadas.map((f) => {
                        const estaLlena = paradasLlenasMap.has(f.id);
                        const ltsRecolectados = paradasLlenasMap.get(f.id) || 0;
                        const seleccionada = modalPlanificar.fincasIds.includes(f.id) || estaLlena;
                        const promedio = fincasPromedio.find((p) => p.fincaId === f.id)?.promedioLitros;

                        return (
                          <div
                            key={f.id}
                            onClick={() => {
                              if (estaLlena) {
                                toast.warning(
                                  `La finca "${f.nombre}" ya tiene ${ltsRecolectados > 1 ? `${ltsRecolectados} L recolectados` : 'leche recolectada'} en ruta. No se puede desasignar.`
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
      {modalAgregarFincaRapida?.open && (() => {
        const plan = modalAgregarFincaRapida.plan;
        const currentIds = getFincasIdsDePlan(plan);
        const fincasDisponibles = fincas.filter((f) => !currentIds.includes(f.id));
        const fincasFiltradas = fincasDisponibles.filter((f) => {
          if (!busquedaFincaRapida.trim()) return true;
          const q = busquedaFincaRapida.toLowerCase().trim();
          return (
            f.nombre.toLowerCase().includes(q) ||
            (f.codigo && f.codigo.toLowerCase().includes(q)) ||
            (f.propietarioNombre && f.propietarioNombre.toLowerCase().includes(q))
          );
        });

        const fincaSeleccionadaObj = fincas.find((f) => f.id === modalAgregarFincaRapida.fincaId);
        const promSel = fincaSeleccionadaObj
          ? fincasPromedio.find((p) => p.fincaId === fincaSeleccionadaObj.id)?.promedioLitros
          : undefined;

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(6px)',
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '460px',
                background: '#ffffff',
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh',
                border: '1px solid #e2e8f0',
              }}
            >
              {/* Header con gradiente profesional */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  padding: '16px 20px',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Gestión Rápida de Campo
                  </div>
                  <h3 style={{ margin: '2px 0 0 0', fontSize: '17px', fontWeight: 900 }}>
                    + Agregar Finca a la Ruta
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBusquedaFincaRapida('');
                    setModalAgregarFincaRapida(null);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    borderRadius: '10px',
                    width: '32px',
                    height: '32px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '15px',
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                {/* Resumen del Camión y Conductor */}
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '14px',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>
                      🚛 {plan.camionPlaca || 'S/P'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                      <i className="fa-solid fa-user text-slate-400 mr-1"></i> {plan.conductorNombre || 'Chofer'}
                    </div>
                  </div>
                  <span
                    style={{
                      background: '#ecfdf5',
                      color: '#059669',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '4px 8px',
                      borderRadius: '8px',
                      border: '1px solid #a7f3d0',
                    }}
                  >
                    {currentIds.length} fincas en ruta
                  </span>
                </div>

                {/* Input Buscador con Escritura para filtrar */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    Escribe para buscar finca a incorporar ({fincasFiltradas.length} disponibles):
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      autoFocus
                      placeholder="🔍 Escribe nombre de finca, código o ganadero..."
                      value={busquedaFincaRapida}
                      onChange={(e) => setBusquedaFincaRapida(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '11px 36px 11px 36px',
                        borderRadius: '12px',
                        border: '1.5px solid #059669',
                        fontSize: '13px',
                        outline: 'none',
                        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.1)',
                      }}
                    />
                    <i
                      className="fa-solid fa-magnifying-glass"
                      style={{ position: 'absolute', left: '12px', top: '14px', color: '#059669', fontSize: '13px' }}
                    ></i>
                    {busquedaFincaRapida && (
                      <button
                        type="button"
                        onClick={() => setBusquedaFincaRapida('')}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '10px',
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Lista de Fincas Filtradas para Selección Táctil */}
                <div
                  style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '6px',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {fincasFiltradas.length === 0 ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b' }}>
                      <i className="fa-solid fa-magnifying-glass text-slate-300" style={{ fontSize: '28px', marginBottom: '6px', display: 'block' }}></i>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>No se encontró ninguna finca</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Intenta con otro término o revisa que no esté ya asignada.</div>
                    </div>
                  ) : (
                    fincasFiltradas.map((f) => {
                      const esSeleccionada = modalAgregarFincaRapida.fincaId === f.id;
                      const prom = fincasPromedio.find((p) => p.fincaId === f.id)?.promedioLitros;

                      return (
                        <div
                          key={f.id}
                          onClick={() => setModalAgregarFincaRapida((prev) => (prev ? { ...prev, fincaId: f.id } : null))}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            background: esSeleccionada ? '#ecfdf5' : '#ffffff',
                            border: esSeleccionada ? '1.5px solid #10b981' : '1px solid #f1f5f9',
                            cursor: 'pointer',
                            boxShadow: esSeleccionada ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                border: esSeleccionada ? '5px solid #059669' : '2px solid #cbd5e1',
                                background: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            />
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: esSeleccionada ? '#065f46' : '#1e293b' }}>
                                {f.nombre}
                              </div>
                              <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                {f.codigo ? `${f.codigo} • ` : ''}
                                {f.propietarioNombre || 'Productor'}
                              </div>
                            </div>
                          </div>

                          {prom !== undefined && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 800,
                                color: esSeleccionada ? '#047857' : '#0284c7',
                                background: esSeleccionada ? 'rgba(5, 150, 105, 0.1)' : '#f0f9ff',
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              ~{Math.round(prom)} L
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Previsualización de Finca Seleccionada */}
                {fincaSeleccionadaObj && (
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1.5px solid #86efac',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#166534', fontWeight: 800, textTransform: 'uppercase' }}>
                        Finca Lista para Añadir:
                      </div>
                      <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#14532d' }}>
                        {fincaSeleccionadaObj.nombre}
                      </div>
                    </div>
                    {promSel !== undefined && (
                      <span style={{ fontSize: '12px', fontWeight: 900, color: '#15803d' }}>
                        +~{Math.round(promSel)} Lts
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Botonera Inferior */}
              <div
                style={{
                  padding: '14px 20px',
                  background: '#ffffff',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  gap: '10px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setBusquedaFincaRapida('');
                    setModalAgregarFincaRapida(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#64748b',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!modalAgregarFincaRapida.fincaId || modalAgregarFincaRapida.fincaId === 0}
                  onClick={() => handleAgregarFincaRapidaMovil(modalAgregarFincaRapida.plan, modalAgregarFincaRapida.fincaId)}
                  style={{
                    flex: 1.5,
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: !modalAgregarFincaRapida.fincaId || modalAgregarFincaRapida.fincaId === 0
                      ? '#94a3b8'
                      : 'linear-gradient(135deg, #059669, #16a34a)',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: !modalAgregarFincaRapida.fincaId || modalAgregarFincaRapida.fincaId === 0 ? 'not-allowed' : 'pointer',
                    boxShadow: !modalAgregarFincaRapida.fincaId || modalAgregarFincaRapida.fincaId === 0
                      ? 'none'
                      : '0 4px 14px rgba(5, 150, 105, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-plus-circle"></i>
                  Añadir a la Ruta
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL CREAR / EDITAR CIRCUITO LOGÍSTICO (CON ASIGNACIÓN DE FINCAS) */}
      {modalCircuito?.open && (() => {
        const totalLtsEst = (modalCircuito.fincasIds || []).reduce((acc, fid) => {
          const p = fincasPromedio.find((fp) => fp.fincaId === fid);
          return acc + (p?.promedioLitros || 0);
        }, 0);

        const qFinca = busquedaFincasNuevoCircuito.trim().toLowerCase();
        const fincasFiltradas = fincas
          .filter((f) => {
            if (!qFinca) return true;
            const n = (f.nombre || '').toLowerCase();
            const c = (f.codigo || '').toLowerCase();
            const p = (f.propietarioNombre || '').toLowerCase();
            return n.includes(qFinca) || c.includes(qFinca) || p.includes(qFinca);
          })
          .sort((a, b) => {
            const selA = (modalCircuito.fincasIds || []).includes(a.id) ? 1 : 0;
            const selB = (modalCircuito.fincasIds || []).includes(b.id) ? 1 : 0;
            if (selA !== selB) return selB - selA;
            return (a.nombre || '').localeCompare(b.nombre || '');
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
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(5px)',
              padding: '12px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '480px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                borderRadius: '22px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                overflow: 'hidden',
              }}
            >
              {/* Header Modal */}
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
                  <span style={{ fontSize: '10.5px', fontWeight: 900, color: '#0d9488', textTransform: 'uppercase' }}>
                    {modalCircuito.esEdicion ? 'Modificar Circuito' : 'Nueva Ruta Logística'}
                  </span>
                  <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                    {modalCircuito.esEdicion ? 'Editar Circuito Logístico' : 'Crear Circuito con Fincas'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalCircuito(null)}
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

              {/* Formulario con Scroll */}
              <form
                onSubmit={handleGuardarCircuitoMovil}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px 20px',
                  gap: '12px',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Nombre del Circuito / Ruta *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Ruta 1 - Sur, Circuito Carora..."
                    value={modalCircuito.nombre}
                    onChange={(e) => setModalCircuito((prev) => (prev ? { ...prev, nombre: e.target.value } : null))}
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
                      Código / Abreviatura
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: RUTA-01"
                      value={modalCircuito.codigo}
                      onChange={(e) => setModalCircuito((prev) => (prev ? { ...prev, codigo: e.target.value } : null))}
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
                      Descripción Breve
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Fincas zona baja"
                      value={modalCircuito.descripcion}
                      onChange={(e) => setModalCircuito((prev) => (prev ? { ...prev, descripcion: e.target.value } : null))}
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

                {/* SECCIÓN DE FINCAS DEL CIRCUITO */}
                <div style={{ borderTop: '1.5px solid #e2e8f0', paddingTop: '12px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-cow text-teal-600"></i>
                      <span style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>
                        Fincas del Circuito
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        {modalCircuito.fincasIds?.length || 0} Fincas
                      </span>
                      {totalLtsEst > 0 && (
                        <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                          ~{totalLtsEst.toLocaleString()} L
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Buscador de fincas */}
                  <div style={{ position: 'relative', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="Buscar finca por nombre o productor..."
                      value={busquedaFincasNuevoCircuito}
                      onChange={(e) => setBusquedaFincasNuevoCircuito(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 32px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '12px',
                        outline: 'none',
                      }}
                    />
                    <i
                      className="fa-solid fa-magnifying-glass"
                      style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontSize: '12px' }}
                    ></i>
                  </div>

                  {/* Botones de selección rápida */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const idsVisibles = fincasFiltradas.map((f) => f.id);
                        setModalCircuito((prev) =>
                          prev
                            ? { ...prev, fincasIds: Array.from(new Set([...(prev.fincasIds || []), ...idsVisibles])) }
                            : null
                        );
                      }}
                      style={{
                        background: '#f0fdf4',
                        color: '#16a34a',
                        border: '1px solid #bbf7d0',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Marcar Visibles
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalCircuito((prev) => (prev ? { ...prev, fincasIds: [] } : null))}
                      style={{
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ✕ Desmarcar Todas
                    </button>
                  </div>

                  {/* Lista de Fincas con Checkbox */}
                  <div
                    style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {fincasFiltradas.length > 0 ? (
                      fincasFiltradas.map((f) => {
                        const sel = (modalCircuito.fincasIds || []).includes(f.id);
                        const promedio = fincasPromedio.find((p) => p.fincaId === f.id)?.promedioLitros;
                        return (
                          <div
                            key={f.id}
                            onClick={() => {
                              setModalCircuito((prev) => {
                                if (!prev) return null;
                                const cur = prev.fincasIds || [];
                                const exists = cur.includes(f.id);
                                return {
                                  ...prev,
                                  fincasIds: exists ? cur.filter((id) => id !== f.id) : [...cur, f.id],
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <input
                                type="checkbox"
                                checked={sel}
                                onChange={() => {}}
                                style={{ width: '16px', height: '16px', accentColor: '#0d9488' }}
                              />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '12.5px', fontWeight: 800, color: sel ? '#115e59' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {f.nombre}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                  {f.codigo ? `${f.codigo} • ` : ''}{f.propietarioNombre || 'Productor'}
                                </div>
                              </div>
                            </div>
                            {promedio && promedio > 0 ? (
                              <span style={{ fontSize: '11px', fontWeight: 800, color: '#0d9488', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                                ~{promedio.toLocaleString()} L
                              </span>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                        No se encontraron fincas con "{busquedaFincasNuevoCircuito}".
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Modal con Botones */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    onClick={() => setModalCircuito(null)}
                    style={{
                      flex: 1,
                      padding: '11px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#64748b',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: '11px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                      color: '#ffffff',
                      fontWeight: 900,
                      cursor: 'pointer',
                      fontSize: '13px',
                      boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
                    }}
                  >
                    {modalCircuito.esEdicion ? 'Guardar Cambios' : 'Crear Circuito con Fincas'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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

            {/* Estado de Notificaciones Nativas en Pantalla Bloqueada y Prueba (Requisito 3) */}
            <div
              style={{
                background: permisoNotificaciones === 'granted' ? '#f0fdf4' : '#eff6ff',
                border: permisoNotificaciones === 'granted' ? '1.5px solid #86efac' : '1.5px solid #93c5fd',
                borderRadius: '14px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: permisoNotificaciones === 'granted' ? '#16a34a' : '#2563eb',
                      boxShadow: permisoNotificaciones === 'granted' ? '0 0 8px #16a34a' : 'none',
                    }}
                  ></span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: permisoNotificaciones === 'granted' ? '#166534' : '#1e40af' }}>
                    {permisoNotificaciones === 'granted'
                      ? 'Avisos en Teléfono Activos (Pantalla Bloqueada + Sonido)'
                      : 'Avisos en Teléfono Pendientes de Autorizar'}
                  </span>
                </div>
                {permisoNotificaciones !== 'granted' ? (
                  <button
                    type="button"
                    onClick={solicitarPermisoNotificaciones}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '5px 12px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Permitir Avisos
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={probarNotificacionPantallaApagada}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '5px 12px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                    title="Programa un push en 5 segundos para que apagues tu pantalla y verifiques que suena y vibra"
                  >
                    <i className="fa-solid fa-mobile-screen"></i> Probar en Bloqueo (5s)
                  </button>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: permisoNotificaciones === 'granted' ? '#15803d' : '#1d4ed8' }}>
                {permisoNotificaciones === 'granted'
                  ? 'Tu teléfono vibrará y sonará automáticamente cuando haya cambios en tu ruta o despachos, incluso si tienes la pantalla apagada o la app cerrada.'
                  : 'Autoriza los permisos en tu navegador para que tu teléfono te avise al momento ante cualquier cambio o despacho.'}
              </p>
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
                              setTabActiva('principal');
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

                {/* VERIFICACIÓN DE FINCAS Y COMPROBANTES / FOTOS */}
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '14px', border: '1.5px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>
                      📋 Fincas a Verificar ({fincasVerificadasMovilIds.size}/{fincasVerificarMovil.length})
                    </div>
                    {fincasVerificarMovil.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (fincasVerificadasMovilIds.size === fincasVerificarMovil.length) {
                            setFincasVerificadasMovilIds(new Set());
                          } else {
                            setFincasVerificadasMovilIds(new Set(fincasVerificarMovil.map((f, i) => Number(f.id || f.fincaId || i))));
                          }
                        }}
                        style={{
                          background: fincasVerificadasMovilIds.size === fincasVerificarMovil.length ? '#f0fdf4' : '#eff6ff',
                          color: fincasVerificadasMovilIds.size === fincasVerificarMovil.length ? '#16a34a' : '#2563eb',
                          border: fincasVerificadasMovilIds.size === fincasVerificarMovil.length ? '1px solid #86efac' : '1px solid #bfdbfe',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {fincasVerificadasMovilIds.size === fincasVerificarMovil.length ? 'Deseleccionar' : 'Verificar TODAS'}
                      </button>
                    )}
                  </div>

                  {cargandoFincasMovil ? (
                    <div style={{ textAlign: 'center', padding: '12px', fontSize: '11.5px', color: '#64748b' }}>
                      <i className="fa-solid fa-spinner fa-spin"></i> Cargando fincas del ticket...
                    </div>
                  ) : fincasVerificarMovil.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '10px', fontSize: '11px', color: '#94a3b8' }}>
                      Sin desglose de fincas para este ticket.
                    </div>
                  ) : (
                    <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {fincasVerificarMovil.map((f, idx) => {
                        const fid = Number(f.id || f.fincaId || idx);
                        const verificado = fincasVerificadasMovilIds.has(fid);
                        const foto = f.fotoComprobante || f.fotoReciboUrl;
                        const lts = Number(f.litros || f.litrosLeche || 0);
                        const nomFinca = f.fincaNombre || f.nombre || `Finca #${f.fincaId || fid}`;

                        return (
                          <div
                            key={fid}
                            onClick={() => {
                              setFincasVerificadasMovilIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(fid)) next.delete(fid);
                                else next.add(fid);
                                return next;
                              });
                            }}
                            style={{
                              background: verificado ? '#f0fdf4' : '#ffffff',
                              border: verificado ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                              borderRadius: '10px',
                              padding: '8px 10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              gap: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                              <input
                                type="checkbox"
                                checked={verificado}
                                onChange={(e) => {
                                  setFincasVerificadasMovilIds((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(fid);
                                    else next.delete(fid);
                                    return next;
                                  });
                                }}
                                style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {nomFinca}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                  {f.propietarioNombre || f.propietario || ''}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <span style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>
                                {lts.toLocaleString()} L
                              </span>
                              {foto ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFotoZoomMovil(foto);
                                  }}
                                  style={{
                                    background: '#ecfdf5',
                                    border: '1px solid #a7f3d0',
                                    color: '#059669',
                                    borderRadius: '6px',
                                    padding: '4px 7px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  <i className="fa-solid fa-camera"></i>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

      {/* LIGHTBOX / ZOOM DE FOTO DE COMPROBANTE O RECIBO EN MÓVIL */}
      {fotoZoomMovil && (
        <div
          onClick={() => setFotoZoomMovil(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ alignSelf: 'flex-end', marginBottom: '8px' }}>
            <button
              type="button"
              onClick={() => setFotoZoomMovil(null)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#ffffff',
                fontSize: '20px',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <img
            src={fotoZoomMovil}
            alt="Comprobante Recibo Finca"
            style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
          />
        </div>
      )}

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

              {/* Conductor */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  Conductor Asignado
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
                  <option value={0}>-- Sin Conductor Específico --</option>
                  {(choferesLista || [])
                    .filter((c: any) => c.activo === true || c.activo === 1)
                    .map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.nombreCompleto || c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Litros & Tipo Leche */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
                    {tieneModuloBufala && <option value="BUFALA">🐃 Búfala</option>}
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

      {/* ========================================================================= */}
      {/* MODAL MÓVIL: ENTREGA DIRECTA A COMPAÑÍAS / RECEPTORÍA (MOBILE-FIRST)       */}
      {/* ========================================================================= */}
      {modalEntregaDirecta && viajeActivo && (() => {
        const fincasT = paradasViajeActivo || [];
        const totalCamion = ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosFinca || viajeActivo.totalLitrosRecogidos || 0) > 0
          ? ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosFinca || viajeActivo.totalLitrosRecogidos)
          : fincasT.reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
        const yaAsignado = (viajeActivo as any)._litrosEntregados || (viajeActivo as any).litrosEntregadosCompania || viajeActivo.totalLitrosEntregados || 0;
        const faltante = Math.max(0, totalCamion - yaAsignado);
        const sumaFilas = filasEntregaDirecta.reduce((acc, f) => acc + (Number(f.litros) || 0), 0);
        const ltsDisponibles = faltante > 0 ? faltante : totalCamion;
        const diferencia = ltsDisponibles - sumaFilas;
        const pctProgreso = ltsDisponibles > 0 ? Math.min(100, Math.round((sumaFilas / ltsDisponibles) * 100)) : 0;

        const unificarLitros = () => {
          setFilasEntregaDirecta([
            {
              companiaId: filasEntregaDirecta[0]?.companiaId || (listaCompaniasMovil[0]?.id || 0),
              litros: ltsDisponibles,
              tipoLeche: 'VACA',
            },
          ]);
        };

        const agregarFila = () => {
          setFilasEntregaDirecta([
            ...filasEntregaDirecta,
            { companiaId: listaCompaniasMovil[0]?.id || 0, litros: '', tipoLeche: 'VACA' },
          ]);
        };

        const removerFila = (index: number) => {
          if (filasEntregaDirecta.length > 1) {
            setFilasEntregaDirecta(filasEntregaDirecta.filter((_, i) => i !== index));
          }
        };

        const actualizarFila = (index: number, campo: keyof FilaEntregaDirectaMovil, valor: any) => {
          const nuevas = [...filasEntregaDirecta];
          nuevas[index] = { ...nuevas[index], [campo]: valor };
          setFilasEntregaDirecta(nuevas);
        };

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'center',
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(6px)',
              padding: '0',
            }}
          >
            <div
              style={{
                maxWidth: '560px',
                width: '100%',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                background: '#f8fafc',
                color: '#0f172a',
                borderRadius: '24px 24px 0 0',
                border: '1px solid #e2e8f0',
                borderBottom: 'none',
                boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.35)',
                overflow: 'hidden',
              }}
            >
              {/* Header gradiente móvil con indicador de arrastre */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #065f46 0%, #059669 50%, #10b981 100%)',
                  color: '#ffffff',
                  padding: '12px 18px 16px 18px',
                  flexShrink: 0,
                }}
              >
                <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.4)', borderRadius: '99px', margin: '0 auto 10px auto' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-building-circle-check"></i>
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
                        Entrega Directa / Receptoría
                      </h2>
                      <p style={{ margin: '1px 0 0 0', fontSize: '11.5px', color: '#d1fae5', fontWeight: 500 }}>
                        Despacho a queseras o receptoría
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalEntregaDirecta(false)}
                    style={{
                      color: '#ffffff',
                      background: 'rgba(255,255,255,0.18)',
                      border: 'none',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      fontSize: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    &times;
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleSubmitEntregaDirecta}
                style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
              >
                <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
                  {/* Tarjeta Resumen Móvil del Camión y KPIs */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      border: '1.5px solid #e2e8f0',
                      marginBottom: '12px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa-solid fa-truck text-emerald-600"></i>
                        Ticket #{viajeActivo.codigoTicket || viajeActivo.id}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>
                        {viajeActivo.camionPlaca || dispositivo?.placaCamion || 'Cisterna'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                      <div style={{ background: '#ecfdf5', borderRadius: '8px', padding: '6px 4px', border: '1px solid #a7f3d0' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#065f46', textTransform: 'uppercase', display: 'block' }}>Total Camión</span>
                        <strong style={{ fontSize: '14.5px', fontWeight: 900, color: '#059669', display: 'block' }}>{totalCamion.toLocaleString()} L</strong>
                      </div>
                      <div style={{ background: '#faf5ff', borderRadius: '8px', padding: '6px 4px', border: '1px solid #e9d5ff' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#6b21a8', textTransform: 'uppercase', display: 'block' }}>Asignado</span>
                        <strong style={{ fontSize: '14.5px', fontWeight: 900, color: '#7e22ce', display: 'block' }}>{sumaFilas.toLocaleString()} L</strong>
                      </div>
                      <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '6px 4px', border: '1px solid #bfdbfe' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', display: 'block' }}>Falta</span>
                        <strong style={{ fontSize: '14.5px', fontWeight: 900, color: '#2563eb', display: 'block' }}>{Math.max(0, ltsDisponibles - sumaFilas).toLocaleString()} L</strong>
                      </div>
                    </div>

                    {/* Barra de progreso de asignación */}
                    <div style={{ marginTop: '8px', height: '6px', width: '100%', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pctProgreso}%`,
                          background: diferencia === 0 ? '#10b981' : diferencia > 0 ? '#3b82f6' : '#ef4444',
                          transition: 'width 0.3s ease',
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Acciones Superiores de Destinos */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                      Destinos ({filasEntregaDirecta.length})
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={unificarLitros}
                        style={{
                          fontSize: '11.5px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1.5px solid #c084fc',
                          background: '#faf5ff',
                          color: '#6b21a8',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <i className="fa-solid fa-arrows-to-circle text-purple-600"></i> Unificar
                      </button>
                      <button
                        type="button"
                        onClick={agregarFila}
                        style={{
                          fontSize: '11.5px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1.5px solid #a7f3d0',
                          background: '#ecfdf5',
                          color: '#065f46',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <i className="fa-solid fa-plus-circle text-emerald-600"></i> + Destino
                      </button>
                    </div>
                  </div>

                  {/* TARJETAS MÓVILES DE DESTINO (Formulario Apilado Mobile-First, sin scroll horizontal) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                    {filasEntregaDirecta.map((fila, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#ffffff',
                          borderRadius: '14px',
                          padding: '12px 14px',
                          border: '1.5px solid #e2e8f0',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        }}
                      >
                        {/* Cabecera de la Tarjeta de Destino */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div>
                            {fila.origenServicio === 'RUTA' && (
                              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <i className="fa-solid fa-road"></i> SERVICIO RUTA {fila.origenFincasCount ? `(${fila.origenFincasCount} finca${fila.origenFincasCount > 1 ? 's' : ''})` : ''}
                              </span>
                            )}
                            {fila.origenServicio === 'ACIDA' && (
                              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <i className="fa-solid fa-flask"></i> LECHE ÁCIDA SEPARADA
                              </span>
                            )}
                            {fila.origenServicio === 'TRANSPORTE' && (
                              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#7e22ce', background: '#faf5ff', border: '1px solid #d8b4fe', padding: '2px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <i className="fa-solid fa-truck"></i> SERVICIO TRANSPORTE {fila.origenFincasCount ? `(${fila.origenFincasCount} finca${fila.origenFincasCount > 1 ? 's' : ''})` : ''}
                              </span>
                            )}
                            {!fila.origenServicio && (
                              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>
                                📍 Destino #{idx + 1}
                              </span>
                            )}
                          </div>

                          {filasEntregaDirecta.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removerFila(idx)}
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '8px',
                                border: '1px solid #fee2e2',
                                background: '#fef2f2',
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                              title="Eliminar este destino"
                            >
                              <i className="fa-solid fa-trash-can text-[11px]"></i>
                            </button>
                          )}
                        </div>

                        {/* Campo Compañía (Ancho Completo) */}
                        <div style={{ marginBottom: '8px' }}>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                            Quesera / Receptoría Destino *
                          </label>
                          <CompaniaSelect
                            value={fila.companiaId}
                            onChange={(val) => actualizarFila(idx, 'companiaId', val)}
                            placeholder="-- Seleccionar Compañía o Planta --"
                          />
                        </div>

                        {/* Fila 2: Tipo de Leche y Litros lado a lado */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '8px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                              Tipo de Leche
                            </label>
                            <select
                              value={fila.tipoLeche}
                              onChange={(e) => actualizarFila(idx, 'tipoLeche', e.target.value)}
                              style={{
                                width: '100%',
                                height: '42px',
                                fontSize: '13px',
                                fontWeight: 700,
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                padding: '0 8px',
                                background: '#ffffff',
                                color: '#0f172a',
                              }}
                            >
                              <option value="VACA">🥛 Vaca</option>
                              {tieneModuloBufala && <option value="BUFALA">🐃 Búfala</option>}
                              <option value="ACIDA">🍋 Ácida</option>
                              {tieneModuloBufala && <option value="BUFALA_ACIDA">🍋🐃 Búfala Ácida</option>}
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                              Litros a Entregar *
                            </label>
                            <div style={{ position: 'relative' }}>
                              <input
                                type="number"
                                inputMode="numeric"
                                value={fila.litros}
                                onChange={(e) => actualizarFila(idx, 'litros', e.target.value === '' ? '' : Number(e.target.value))}
                                placeholder="0"
                                min="1"
                                step="1"
                                required
                                style={{
                                  width: '100%',
                                  height: '42px',
                                  fontSize: '15px',
                                  fontWeight: 800,
                                  textAlign: 'right',
                                  paddingRight: '36px',
                                  paddingLeft: '8px',
                                  color: '#059669',
                                  borderRadius: '10px',
                                  border: '1.5px solid #cbd5e1',
                                  background: '#ffffff',
                                }}
                              />
                              <span style={{ position: 'absolute', right: '10px', top: '12px', fontSize: '11.5px', fontWeight: 800, color: '#64748b', pointerEvents: 'none' }}>
                                Lts
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Semáforo de Balance Volumétrico */}
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      marginBottom: '12px',
                      textAlign: 'center',
                      background: diferencia === 0 ? '#f0fdf4' : diferencia > 0 ? '#eff6ff' : '#fef2f2',
                      border: `1.5px solid ${diferencia === 0 ? '#86efac' : diferencia > 0 ? '#93c5fd' : '#fca5a5'}`,
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 800, color: diferencia === 0 ? '#15803d' : diferencia > 0 ? '#1d4ed8' : '#b91c1c' }}>
                      {diferencia === 0
                        ? '✅ Total Distribuido con Precisión Exacta'
                        : diferencia > 0
                        ? `ℹ️ Faltan ${diferencia.toLocaleString()} Lts por asignar`
                        : `⚠️ Exceso de ${Math.abs(diferencia).toLocaleString()} Lts sobre el tanque`}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginTop: '2px' }}>
                      Asignando {sumaFilas.toLocaleString()} Lts de {ltsDisponibles.toLocaleString()} Lts disponibles
                    </span>
                  </div>

                  {/* Campo de Observación / Pesaje */}
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px', display: 'block' }}>
                      <i className="fa-solid fa-receipt text-slate-500 mr-1"></i> Comprobante Planta / Observación
                    </label>
                    <input
                      type="text"
                      value={obsEntregaDirecta}
                      onChange={(e) => setObsEntregaDirecta(e.target.value)}
                      placeholder="Ej: Ticket #5829, recibido por Ing. Romero..."
                      style={{ height: '42px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px', background: '#ffffff', color: '#0f172a', width: '100%', padding: '0 12px' }}
                    />
                  </div>
                </div>

                {/* Footer flotante para móvil */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2fr',
                    gap: '10px',
                    padding: '12px 16px',
                    background: '#ffffff',
                    borderTop: '1px solid #e2e8f0',
                    flexShrink: 0,
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.04)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setModalEntregaDirecta(false)}
                    style={{
                      height: '46px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      border: '1.5px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#475569',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoEntregaDirecta}
                    style={{
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      border: 'none',
                      fontWeight: 900,
                      height: '46px',
                      borderRadius: '12px',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    <i className="fa-solid fa-check-circle"></i>
                    {guardandoEntregaDirecta ? 'Registrando...' : 'Registrar Entrega'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL MÓVIL: TRASPASO DE LECHE A OTRO CHOFER (MOBILE-FIRST)               */}
      {/* ========================================================================= */}
      {modalTraspasoMovil && viajeActivo && (() => {
        const fincasT = paradasViajeActivo || [];
        const totalCamion = ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosFinca || viajeActivo.totalLitrosRecogidos || 0) > 0
          ? ((viajeActivo as any)._litrosRecogidos || viajeActivo.totalLitrosFinca || viajeActivo.totalLitrosRecogidos)
          : fincasT.reduce((a: number, f: any) => a + Number(f.litros || f.Litros || 0), 0);
        const yaAsignado = (viajeActivo as any)._litrosEntregados || (viajeActivo as any).litrosEntregadosCompania || viajeActivo.totalLitrosEntregados || 0;
        const ltsDisponibles = Math.max(0, totalCamion - yaAsignado);

        const previewDestinoNombre = (() => {
          if (modoTraspasoMovil === 'EXISTENTE') {
            const dest = viajesDisponiblesTraspaso.find((t) => t.id === Number(formTraspasoMovil.ticketDestinoId));
            return dest ? `Ticket #${dest.codigoTicket || dest.id} - ${dest.choferNombre || dest.nombreConductor}` : 'Seleccionar Ticket Destino';
          } else {
            return traspasoChoferDestinoId ? `Chofer ID #${traspasoChoferDestinoId}` : 'Seleccionar Conductor';
          }
        })();

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'center',
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(6px)',
              padding: '0',
            }}
          >
            <div
              style={{
                maxWidth: '560px',
                width: '100%',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '24px 24px 0 0',
                border: '1px solid #ccfbf1',
                borderBottom: 'none',
                boxShadow: '0 -10px 40px rgba(13, 148, 136, 0.25)',
                overflow: 'hidden',
                background: '#f8fafc',
              }}
            >
              {/* Header gradiente teal móvil con indicador de arrastre */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #115e59 0%, #0d9488 60%, #14b8a6 100%)',
                  padding: '12px 18px 16px 18px',
                  color: '#ffffff',
                  flexShrink: 0,
                }}
              >
                <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.4)', borderRadius: '99px', margin: '0 auto 10px auto' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        color: '#ffffff',
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '17px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-right-left"></i>
                    </div>
                    <div>
                      <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                        Traspaso de Leche a Otro Chofer
                      </h2>
                      <p style={{ fontSize: '11.5px', color: '#ccfbf1', margin: '1px 0 0 0' }}>
                        Transferir volumen recolectado
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalTraspasoMovil(false)}
                    style={{
                      color: '#ffffff',
                      background: 'rgba(255,255,255,0.18)',
                      border: 'none',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      fontSize: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    &times;
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleSubmitTraspasoMovil}
                style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
              >
                <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
                  {/* Resumen Ticket Origen */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      marginBottom: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Ticket Origen:</span>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
                        #{viajeActivo.codigoTicket || viajeActivo.id} - {viajeActivo.choferNombre || viajeActivo.nombreConductor || dispositivo?.nombreCompleto || 'Chofer'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Disponible:</span>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#0d9488', marginTop: '1px' }}>
                        {(ltsDisponibles > 0 ? ltsDisponibles : totalCamion).toLocaleString()} L
                      </div>
                    </div>
                  </div>

                  {/* Selector de Modo: Existente vs Nuevo */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '5px', display: 'block' }}>
                      Modo de Traspaso:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: '#e2e8f0', padding: '3px', borderRadius: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setModoTraspasoMovil('EXISTENTE')}
                        style={{
                          height: '36px',
                          fontSize: '12px',
                          fontWeight: 800,
                          borderRadius: '10px',
                          background: modoTraspasoMovil === 'EXISTENTE' ? '#0d9488' : 'transparent',
                          color: modoTraspasoMovil === 'EXISTENTE' ? '#ffffff' : '#475569',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: modoTraspasoMovil === 'EXISTENTE' ? '0 2px 6px rgba(13,148,136,0.3)' : 'none',
                        }}
                      >
                        <i className="fa-solid fa-ticket"></i> Ticket Existente
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoTraspasoMovil('NUEVO')}
                        style={{
                          height: '36px',
                          fontSize: '12px',
                          fontWeight: 800,
                          borderRadius: '10px',
                          background: modoTraspasoMovil === 'NUEVO' ? '#0d9488' : 'transparent',
                          color: modoTraspasoMovil === 'NUEVO' ? '#ffffff' : '#475569',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: modoTraspasoMovil === 'NUEVO' ? '0 2px 6px rgba(13,148,136,0.3)' : 'none',
                        }}
                      >
                        <i className="fa-solid fa-plus-circle"></i> Nuevo Ticket
                      </button>
                    </div>
                  </div>

                  {/* Sección Destino */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      marginBottom: '12px',
                    }}
                  >
                    {modoTraspasoMovil === 'EXISTENTE' ? (
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '4px', display: 'block' }}>
                          Ticket Destino de la Flota *
                        </label>
                        <select
                          value={formTraspasoMovil.ticketDestinoId}
                          onChange={(e) => setFormTraspasoMovil({ ...formTraspasoMovil, ticketDestinoId: Number(e.target.value) })}
                          style={{
                            width: '100%',
                            height: '42px',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#0f172a',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            padding: '0 10px',
                            background: '#ffffff',
                          }}
                          required
                        >
                          <option value="0">-- Seleccionar Viaje / Cisterna Destino --</option>
                          {viajesDisponiblesTraspaso.map((t) => (
                            <option key={t.id} value={t.id}>
                              Ticket #{t.codigoTicket || t.id} — {t.choferNombre || t.nombreConductor} ({t.camionPlaca || 'Cisterna'})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '4px', display: 'block' }}>
                            Chofer Receptor *
                          </label>
                          <ChoferSelect
                            value={traspasoChoferDestinoId}
                            onChange={(val) => setTraspasoChoferDestinoId(val)}
                            placeholder="-- Seleccionar Chofer Destino --"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '4px', display: 'block' }}>
                            Fecha del Ticket
                          </label>
                          <input
                            type="date"
                            value={traspasoFechaDestino}
                            onChange={(e) => setTraspasoFechaDestino(e.target.value)}
                            style={{ width: '100%', height: '42px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: '1.5px solid #cbd5e1', padding: '0 10px', background: '#ffffff' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Volumen a Traspasar */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', margin: 0 }}>
                        Litros a Traspasar *
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormTraspasoMovil({ ...formTraspasoMovil, litrosTraspaso: ltsDisponibles > 0 ? ltsDisponibles : totalCamion })}
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: '#0d9488',
                          background: '#f0fdfa',
                          border: '1px solid #99f6e4',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        ⚡ Todo el Tanque
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={formTraspasoMovil.litrosTraspaso}
                        onChange={(e) => setFormTraspasoMovil({ ...formTraspasoMovil, litrosTraspaso: e.target.value === '' ? '' : Number(e.target.value) })}
                        min="1"
                        step="1"
                        required
                        style={{
                          width: '100%',
                          height: '44px',
                          fontSize: '16px',
                          fontWeight: 800,
                          color: '#0d9488',
                          background: '#f0fdfa',
                          border: '2px solid #5eead4',
                          paddingRight: '46px',
                          paddingLeft: '12px',
                          borderRadius: '10px',
                        }}
                      />
                      <span style={{ position: 'absolute', right: '14px', top: '12px', fontSize: '12.5px', fontWeight: 800, color: '#0d9488', pointerEvents: 'none' }}>
                        Lts
                      </span>
                    </div>
                  </div>

                  {/* Observación */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '4px', display: 'block' }}>
                      Motivo / Observación del Traspaso
                    </label>
                    <input
                      type="text"
                      value={formTraspasoMovil.observacion}
                      onChange={(e) => setFormTraspasoMovil({ ...formTraspasoMovil, observacion: e.target.value })}
                      placeholder="Ej: Traspaso para completar viaje a planta..."
                      style={{ width: '100%', height: '42px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #cbd5e1', padding: '0 12px', background: '#ffffff' }}
                    />
                  </div>

                  {/* Diagrama de Trazabilidad */}
                  <div style={{ background: '#f0fdfa', border: '1.5px dashed #5eead4', borderRadius: '12px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', marginBottom: '4px' }}>
                      <i className="fa-solid fa-route mr-1"></i> Flujo del Traspaso:
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ flex: 1, background: '#ffffff', padding: '6px 8px', borderRadius: '8px', border: '1px solid #ccfbf1', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>ORIGEN</span>
                        <strong style={{ color: '#0f172a', fontSize: '11.5px' }}>
                          {viajeActivo.choferNombre || viajeActivo.nombreConductor || dispositivo?.nombreCompleto || 'Chofer'}
                        </strong>
                      </div>
                      <div style={{ color: '#0d9488', fontSize: '15px', fontWeight: 900 }}>
                        <i className="fa-solid fa-arrow-right-long"></i>
                      </div>
                      <div style={{ flex: 1, background: '#ffffff', padding: '6px 8px', borderRadius: '8px', border: '1px solid #ccfbf1', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>DESTINO</span>
                        <strong style={{ color: '#0d9488', fontSize: '11.5px' }}>
                          {previewDestinoNombre}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer flotante */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2fr',
                    gap: '10px',
                    padding: '12px 16px',
                    background: '#ffffff',
                    borderTop: '1px solid #e2e8f0',
                    flexShrink: 0,
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.04)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setModalTraspasoMovil(false)}
                    style={{
                      height: '46px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      border: '1.5px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#475569',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoTraspaso}
                    style={{
                      background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                      border: 'none',
                      fontWeight: 900,
                      height: '46px',
                      color: '#fff',
                      borderRadius: '12px',
                      boxShadow: '0 4px 14px rgba(13,148,136,0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    <i className="fa-solid fa-right-left"></i>
                    {guardandoTraspaso ? 'Traspasando...' : 'Confirmar Traspaso'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ===================================================================
          MODAL: INICIAR NUEVO VIAJE / CREAR TICKET CHOFER CON FECHA
         =================================================================== */}
      {modalNuevoViajeChofer && (() => {
        const turnoNum = viajesChofer.length + 1;
        const nombreSugerido =
          turnoSeleccionado === 'MANANA'
            ? 'Turno 1 (Mañana)'
            : turnoSeleccionado === 'TARDE'
            ? 'Turno 2 (Tarde)'
            : `Turno ${turnoNum}`;

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '480px',
                background: '#ffffff',
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '92vh',
              }}
            >
              {/* Cabecera Verde */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  padding: '16px 20px',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                    }}
                  >
                    <i className="fa-solid fa-truck-fast"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, lineHeight: 1.2 }}>
                      Inicio de Nuevo Turno
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#d1fae5', fontWeight: 600 }}>
                      {isOnline ? 'Fecha, turno, cisterna y circuito' : 'Sin conexión: se guarda en el teléfono y se envía solo al tener señal'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalNuevoViajeChofer(false)}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: '#ffffff',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              {/* Formulario */}
              <form onSubmit={handleIniciarNuevoViajeChofer} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Conductor Responsable */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <span style={{ color: '#64748b', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase' }}>Conductor Responsable</span>
                      <div style={{ fontWeight: 800, color: '#0f172a', marginTop: '1px', fontSize: '13px' }}>
                        👤 {choferEfectivoNombre || 'Chofer Asignado'}
                      </div>
                    </div>
                    <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                      Conductor Activo
                    </span>
                  </div>

                  {/* Campo: FECHA OPERATIVA DEL TICKET */}
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '14px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 900, color: '#166534', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <i className="fa-solid fa-calendar-day text-emerald-600"></i>
                        <span>Fecha Operativa del Ticket *</span>
                      </label>
                      {/* Accesos rápidos de fecha */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setFechaNuevoViaje(hoyStr)}
                          style={{
                            background: fechaNuevoViaje === hoyStr ? '#10b981' : '#ffffff',
                            color: fechaNuevoViaje === hoyStr ? '#ffffff' : '#15803d',
                            border: '1px solid #86efac',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          Hoy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() - 1);
                            setFechaNuevoViaje(d.toISOString().split('T')[0]);
                          }}
                          style={{
                            background: fechaNuevoViaje !== hoyStr ? '#10b981' : '#ffffff',
                            color: fechaNuevoViaje !== hoyStr ? '#ffffff' : '#64748b',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          Ayer
                        </button>
                      </div>
                    </div>
                    <input
                      type="date"
                      value={fechaNuevoViaje}
                      onChange={(e) => setFechaNuevoViaje(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        height: '42px',
                        borderRadius: '10px',
                        border: '1.5px solid #86efac',
                        padding: '0 12px',
                        fontSize: '13.5px',
                        fontWeight: 800,
                        background: '#ffffff',
                        color: '#0f172a',
                      }}
                    />
                    {(() => {
                      const sem = verificarSemanaOperativa(fechaNuevoViaje || hoyStr);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11px', fontWeight: 700, color: sem.esOperativa ? '#15803d' : '#b91c1c' }}>
                          <i className={`fa-solid ${sem.esOperativa ? 'fa-calendar-check' : 'fa-triangle-exclamation'}`}></i>
                          <span>{sem.texto} • {sem.esOperativa ? 'Ciclo Operativo Vigente' : 'Semana protegida / fuera de rango'}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Selector de Turno */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      Turno del Recorrido *
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setTurnoSeleccionado('MANANA')}
                        style={{
                          background: turnoSeleccionado === 'MANANA' ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : '#f8fafc',
                          border: turnoSeleccionado === 'MANANA' ? '2px solid #10b981' : '1.5px solid #e2e8f0',
                          color: turnoSeleccionado === 'MANANA' ? '#065f46' : '#64748b',
                          borderRadius: '12px',
                          padding: '10px',
                          fontWeight: 800,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: turnoSeleccionado === 'MANANA' ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
                        }}
                      >
                        <i className="fa-solid fa-sun text-amber-500"></i>
                        <span>Turno 1 (Mañana)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTurnoSeleccionado('TARDE')}
                        style={{
                          background: turnoSeleccionado === 'TARDE' ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : '#f8fafc',
                          border: turnoSeleccionado === 'TARDE' ? '2px solid #10b981' : '1.5px solid #e2e8f0',
                          color: turnoSeleccionado === 'TARDE' ? '#065f46' : '#64748b',
                          borderRadius: '12px',
                          padding: '10px',
                          fontWeight: 800,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: turnoSeleccionado === 'TARDE' ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
                        }}
                      >
                        <i className="fa-solid fa-cloud-sun text-indigo-500"></i>
                        <span>Turno 2 (Tarde)</span>
                      </button>
                    </div>
                  </div>

                  {/* Camión / Cisterna */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      Camión Cisterna
                    </label>
                    <select
                      value={camionNuevoViajeId || ''}
                      onChange={(e) => setCamionNuevoViajeId(e.target.value ? Number(e.target.value) : null)}
                      style={{
                        width: '100%',
                        height: '42px',
                        borderRadius: '12px',
                        border: '1.5px solid #cbd5e1',
                        padding: '0 12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        background: '#ffffff',
                        color: '#0f172a',
                      }}
                    >
                      {camionesLista.length > 0 ? (
                        camionesLista.map((c) => (
                          <option key={c.id} value={c.id}>
                            🚛 {c.placa} {c.capacidadLitros ? `(${c.capacidadLitros.toLocaleString()} Lts)` : ''} {c.modelo ? `- ${c.modelo}` : ''}
                          </option>
                        ))
                      ) : (
                        <option value="">{dispositivo?.placaCamion ? `🚛 ${dispositivo.placaCamion}` : '🚛 Cisterna Predeterminada'}</option>
                      )}
                    </select>
                  </div>

                  {/* Circuito / Ruta Logística */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      Circuito o Ruta Logística (Opcional)
                    </label>
                    <select
                      value={rutaNuevoViajeId || ''}
                      onChange={(e) => setRutaNuevoViajeId(e.target.value ? Number(e.target.value) : null)}
                      style={{
                        width: '100%',
                        height: '42px',
                        borderRadius: '12px',
                        border: '1.5px solid #cbd5e1',
                        padding: '0 12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        background: '#ffffff',
                        color: '#0f172a',
                      }}
                    >
                      <option value="">🛣️ Modo Libre (Sin Circuito Fijo / Cargas Flexibles)</option>
                      {rutasLogisticas.map((r) => (
                        <option key={r.id} value={r.id}>
                          📍 {r.nombre} {r.descripcion ? `(${r.descripcion})` : ''}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: '11px', color: '#059669', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                      💡 <b>Modo Híbrido:</b> Al seleccionar un circuito se precargan sus fincas, pero siempre podrás agregar fincas adicionales durante el recorrido.
                    </span>
                  </div>

                  {/* Observaciones */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      Observación / Nota del Turno (Opcional)
                    </label>
                    <input
                      type="text"
                      value={obsNuevoViaje}
                      onChange={(e) => setObsNuevoViaje(e.target.value)}
                      placeholder="Ej: Inicio temprano, segundo viaje del día..."
                      style={{
                        width: '100%',
                        height: '42px',
                        borderRadius: '12px',
                        border: '1.5px solid #cbd5e1',
                        padding: '0 12px',
                        fontSize: '13px',
                        fontWeight: 600,
                        background: '#ffffff',
                        color: '#0f172a',
                      }}
                    />
                  </div>
                </div>

                {/* Botones Pie */}
                <div
                  style={{
                    padding: '14px 20px',
                    background: '#f8fafc',
                    borderTop: '1px solid #e2e8f0',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1.6fr',
                    gap: '10px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setModalNuevoViajeChofer(false)}
                    style={{
                      height: '46px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      border: '1.5px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#475569',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={iniciandoViajeChofer}
                    style={{
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      border: 'none',
                      fontWeight: 900,
                      height: '46px',
                      color: '#ffffff',
                      borderRadius: '12px',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    <i className={`fa-solid ${iniciandoViajeChofer ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
                    <span>{iniciandoViajeChofer ? 'Creando Ticket...' : `Iniciar ${nombreSugerido}`}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE AUTORIZACIONES PARA CREAR RUTA (SOLO ADMIN Y SUPERADMIN) */}
      {modalAutorizacionesChoferes && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              width: '100%',
              maxWidth: '460px',
              maxHeight: '90vh',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header del modal */}
            <div
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                padding: '18px 20px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  <i className="fa-solid fa-user-shield"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                    Autorizar Creación de Rutas
                  </h3>
                  <div style={{ fontSize: '11px', color: '#d1fae5', marginTop: '1px' }}>
                    Permiso temporal (1 solo uso) para Choferes
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAutorizacionesChoferes(false)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: '#ffffff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Aviso normativo */}
            <div
              style={{
                background: '#f0fdf4',
                borderBottom: '1px solid #bbf7d0',
                padding: '10px 16px',
                fontSize: '11px',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fa-solid fa-circle-info text-emerald-600"></i>
              <span>
                Los choferes no se auto-asignan rutas. Al otorgar permiso, podrán iniciar 1 ruta y al terminarla se revoca automáticamente.
              </span>
            </div>

            {/* Buscador de chofer */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ position: 'relative' }}>
                <i
                  className="fa-solid fa-magnifying-glass"
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                    fontSize: '12px',
                  }}
                ></i>
                <input
                  type="text"
                  placeholder="Buscar chofer por nombre o cédula..."
                  value={busquedaChoferPermiso}
                  onChange={(e) => setBusquedaChoferPermiso(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    fontSize: '12.5px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Lista de Choferes */}
            <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cargandoPermisosChoferes ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando choferes...
                </div>
              ) : (() => {
                const filtrados = (usuariosChoferesPermisos || []).filter((u: any) => {
                  const q = busquedaChoferPermiso.toLowerCase();
                  return (
                    (u.nombreCompleto || '').toLowerCase().includes(q) ||
                    (u.nombreUsuario || u.username || '').toLowerCase().includes(q) ||
                    (u.cedula || '').toLowerCase().includes(q) ||
                    (u.camion?.placa || '').toLowerCase().includes(q)
                  );
                });

                if (filtrados.length === 0) {
                  return (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '12.5px' }}>
                      No se encontraron choferes registrados o que coincidan con la búsqueda.
                    </div>
                  );
                }

                return filtrados.map((u: any) => {
                  const tienePermiso = !!u.permisoCrearViaje;
                  const procesando = modificandoPermisoChoferId === u.id;
                  const camionStr = u.camion?.placa ? ` • Camión ${u.camion.placa}` : '';

                  return (
                    <div
                      key={u.id}
                      style={{
                        background: tienePermiso ? '#f0fdf4' : '#ffffff',
                        border: `1.5px solid ${tienePermiso ? '#86efac' : '#e2e8f0'}`,
                        borderRadius: '14px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        boxShadow: tienePermiso ? '0 2px 8px rgba(16, 185, 129, 0.12)' : 'none',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>
                            {u.nombreCompleto}
                          </span>
                          {tienePermiso ? (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                background: '#dcfce7',
                                color: '#15803d',
                                padding: '1px 6px',
                                borderRadius: '5px',
                              }}
                            >
                              🟢 Autorizado (1 Ruta)
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: '#f1f5f9',
                                color: '#64748b',
                                padding: '1px 6px',
                                borderRadius: '5px',
                              }}
                            >
                              🔒 Sin Permiso
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          @{u.nombreUsuario || u.username} {u.cedula ? `• C.I. ${u.cedula}` : ''}{camionStr}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTogglePermisoChofer(u.id, tienePermiso)}
                        disabled={procesando}
                        style={{
                          background: tienePermiso ? '#fee2e2' : 'linear-gradient(135deg, #10b981, #059669)',
                          color: tienePermiso ? '#b91c1c' : '#ffffff',
                          border: tienePermiso ? '1px solid #fca5a5' : 'none',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          whiteSpace: 'nowrap',
                          boxShadow: tienePermiso ? 'none' : '0 2px 6px rgba(16, 185, 129, 0.25)',
                        }}
                      >
                        <i className={`fa-solid ${procesando ? 'fa-spinner fa-spin' : tienePermiso ? 'fa-lock' : 'fa-key'}`}></i>
                        <span>{procesando ? 'Guardando...' : tienePermiso ? 'Revocar' : 'Autorizar 1 Ruta'}</span>
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer del modal */}
            <div
              style={{
                padding: '12px 16px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={cargarChoferesPermisos}
                disabled={cargandoPermisosChoferes}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <i className={`fa-solid fa-rotate ${cargandoPermisosChoferes ? 'fa-spin' : ''}`}></i>
                <span>Actualizar Lista</span>
              </button>

              <button
                type="button"
                onClick={() => setModalAutorizacionesChoferes(false)}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 16px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL MOVIL 1: TIMELAPSE DE PARADAS EN VIVO (SECUENCIA & TRAZABILIDAD)
         =================================================================== */}
      {modalTimelapseMovil && viajeTimelapseMovil && (() => {
        const v = viajeTimelapseMovil;
        const totalLts = paradasTimelapseMovil.reduce(
          (sum, p) => sum + Number(p.litros || p.litrosLeche || p.litrosCargados || 0),
          0
        );
        const ltsFinal = totalLts > 0 ? totalLts : (v.totalLitrosFinca || v.totalLitrosRecogidos || 0);
        const cap = v.capacidadCamionLitros || 6000;
        const pct = Math.min(100, Math.round((ltsFinal / cap) * 100));

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
                maxHeight: '92vh',
                background: '#ffffff',
                borderTopLeftRadius: '24px',
                borderTopRightRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
                animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                overflow: 'hidden',
              }}
            >
              {/* Header Timelapse */}
              <div
                style={{
                  padding: '16px 18px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '17px', fontWeight: 900 }}>
                      ⏱️ Timelapse Ticket #{v.codigoTicket || v.id}
                    </span>
                    <span
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontSize: '10.5px',
                        fontWeight: 800,
                      }}
                    >
                      {v.estado || 'EN RUTA'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#e0f2fe', marginTop: '3px', fontWeight: 700 }}>
                    🚛 {v.camionPlaca || 'S/P'} • Conductor: {v.nombreConductor || 'Chofer'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#bae6fd', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span>Ruta: {v.rutaLogisticaNombre || 'Modo Libre'} • Fecha: {(v.fecha || '').split('T')[0]}</span>
                    {(() => {
                      const sem = verificarSemanaOperativa(v.fecha);
                      return (
                        <span
                          style={{
                            padding: '1px 6px',
                            borderRadius: '5px',
                            fontSize: '9.5px',
                            fontWeight: 800,
                            background: sem.esOperativa ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.35)',
                            color: sem.esOperativa ? '#dcfce7' : '#fee2e2',
                            border: `1px solid ${sem.esOperativa ? '#86efac' : '#fca5a5'}`,
                          }}
                        >
                          {sem.esOperativa ? '✓' : '⚠️'} {sem.texto}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalTimelapseMovil(false)}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    color: '#ffffff',
                    fontSize: '18px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Barra de KPIs Rápida */}
              <div style={{ background: '#f0f9ff', padding: '10px 18px', borderBottom: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#0369a1', fontWeight: 800 }}>VOLUMEN CARGADO</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#0284c7' }}>
                    {ltsFinal.toLocaleString()} L <span style={{ fontSize: '11.5px', color: '#64748b' }}>/ {cap.toLocaleString()} L ({pct}%)</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', color: '#0369a1', fontWeight: 800 }}>PROGRESO RECOLECCIÓN</div>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                    {paradasTimelapseMovil.filter(p => Number(p.litros || p.litrosLeche || p.litrosCargados || 0) > 0 && !p.esPlanificada).length} / {paradasTimelapseMovil.length} Fincas
                  </div>
                </div>
              </div>

              {/* Contenido / Timeline Secuencial de Paradas */}
              <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {cargandoTimelapseMovil ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 text-sky-600"></i>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>Cargando recorrido y paradas...</div>
                  </div>
                ) : paradasTimelapseMovil.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '16px', border: '1.5px dashed #cbd5e1' }}>
                    <i className="fa-solid fa-map-location-dot text-3xl mb-2 text-slate-300"></i>
                    <div style={{ fontWeight: 800, color: '#1e293b' }}>Sin paradas planificadas ni registradas</div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                      El chofer aún no tiene fincas asignadas o registradas en este ticket. Puedes agregar paradas con el botón inferior.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {paradasTimelapseMovil.map((p, idx) => {
                      const ltsParada = Number(p.litros || p.litrosLeche || p.litrosCargados || 0);
                      const esRecolectada = ltsParada > 0 && !p.esPlanificada;
                      const fNom = p.fincaNombre || p.nombreFinca || fincas.find((f) => f.id === (p.fincaId || p.FincaId))?.nombre || `Finca #${p.fincaId || p.FincaId}`;
                      const horaP = esRecolectada 
                        ? (formatFechaHoraParada(p, true) || p.hora || `Parada #${idx + 1}`)
                        : (formatFechaHoraParada(p, true) ? `Planificada (${formatFechaHoraParada(p, true)}) • ⏳ Pendiente` : 'En ruta • ⏳ Pendiente');
                      const esBufala = (p.tipoLeche || '').toUpperCase() === 'BUFALA';
                      const esAcida = Boolean(p.esAcida);
                      const foto = p.fotoComprobante || p.fotoRecibo;

                      return (
                        <div
                          key={p.id || idx}
                          onClick={() => esAdminReal && abrirFincaDesdeTimelapse(v, p)}
                          style={{
                            background: esRecolectada ? '#ffffff' : '#fffdf7',
                            borderRadius: '14px',
                            border: esRecolectada ? '1.5px solid #e2e8f0' : '1.5px dashed #fde047',
                            padding: '12px 14px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            cursor: esAdminReal ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '10px',
                                background: esRecolectada ? '#e0f2fe' : '#fef3c7',
                                color: esRecolectada ? '#0369a1' : '#b45309',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 900,
                                fontSize: '13px',
                                flexShrink: 0,
                              }}
                            >
                              {idx + 1}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>
                                {fNom}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                <span><i className="fa-regular fa-clock mr-1 text-slate-400"></i>{horaP}</span>
                                {esBufala && (
                                  <span style={{ background: '#fed7aa', color: '#9a3412', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, fontSize: '9.5px' }}>
                                    BÚFALA
                                  </span>
                                )}
                                {esAcida && (
                                  <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, fontSize: '9.5px' }}>
                                    ⚠️ ÁCIDA
                                  </span>
                                )}
                                {p.temperatura && (
                                  <span>• {p.temperatura}°C</span>
                                )}
                              </div>
                              {p.observacion && (
                                <div style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>
                                  "{p.observacion}"
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <div>
                              <div style={{ fontSize: '15px', fontWeight: 900, color: esRecolectada ? '#0284c7' : '#94a3b8' }}>
                                {ltsParada > 0 ? `${ltsParada.toLocaleString()} L` : '0 L'}
                              </div>
                              {esRecolectada ? (
                                <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 800 }}>
                                  ✓ Recolectada
                                </div>
                              ) : (
                                <div style={{ fontSize: '10px', color: '#d97706', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <i className="fa-solid fa-clock text-[9px]"></i> ⏳ Pendiente
                                </div>
                              )}
                            </div>

                            {foto && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFotoReciboVerModal(foto);
                                }}
                                style={{
                                  background: '#f8fafc',
                                  color: '#0284c7',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  width: '32px',
                                  height: '32px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                }}
                                title="Ver comprobante de finca"
                              >
                                <i className="fa-solid fa-receipt"></i>
                              </button>
                            )}

                            {esAdminReal && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirFincaDesdeTimelapse(v, p);
                                }}
                                style={{
                                  background: '#f1f5f9',
                                  color: '#334155',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  width: '32px',
                                  height: '32px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                }}
                                title="Ver / registrar datos de esta parada"
                              >
                                <i className="fa-solid fa-pen text-xs"></i>
                              </button>
                            )}

                            {esAdminReal && ltsParada > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLimpiarRecoleccionMovil(v, p);
                                }}
                                style={{
                                  background: '#eff6ff',
                                  color: '#2563eb',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: '8px',
                                  width: '32px',
                                  height: '32px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                }}
                                title="Limpiar datos y marcar como NO RECOGIDA (0 Lts) en el ticket"
                              >
                                <i className="fa-solid fa-eraser text-xs"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer con Botón para Agregar Finca/Parada */}
              {esAdminReal && (
                <div style={{ padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      abrirModalAdminCargarLitros(v);
                    }}
                    style={{
                      flex: 1,
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '12px',
                      fontWeight: 900,
                      fontSize: '13.5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      boxShadow: '0 3px 10px rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    <i className="fa-solid fa-plus-circle"></i>
                    <span>+ Agregar Litros a este Ticket</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ===================================================================
          MODAL MOVIL 2: ADMINISTRADOR REGISTRAR / CARGAR LITROS EN TICKET
         =================================================================== */}
      {modalAdminCargarLitros.open && modalAdminCargarLitros.ticket && (() => {
        const ticket = modalAdminCargarLitros.ticket;
        const esEdicion = !!modalAdminCargarLitros.paradaExistente;

        const fIdActual = Number(formAdminLitros.fincaId || (modalAdminCargarLitros.paradaExistente?.fincaId || (modalAdminCargarLitros.paradaExistente as any)?.FincaId || 0));
        const fincaFijada = fIdActual > 0
          ? fincas.find((f) => f.id === fIdActual) || (modalAdminCargarLitros.paradaExistente ? {
              id: fIdActual,
              nombre: modalAdminCargarLitros.paradaExistente.fincaNombre || modalAdminCargarLitros.paradaExistente.nombreFinca || `Finca #${fIdActual}`,
              propietario: modalAdminCargarLitros.paradaExistente.propietario,
              codigo: modalAdminCargarLitros.paradaExistente.codigo,
            } : null)
          : null;
        const esFincaBloqueada = Boolean(modalAdminCargarLitros.paradaExistente && fincaFijada);

        const fincasFiltradas = fincas.filter((f) => {
          if (!busquedaFincaAdmin.trim()) return true;
          const q = busquedaFincaAdmin.toLowerCase();
          return (
            f.nombre.toLowerCase().includes(q) ||
            String(f.id).includes(q) ||
            (f.codigo && f.codigo.toLowerCase().includes(q))
          );
        });

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
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
                maxHeight: '94vh',
                background: '#ffffff',
                borderTopLeftRadius: '24px',
                borderTopRightRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
                animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: '16px 18px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                    {esEdicion ? '✏️ Detalle / Registro de Parada' : '📝 Registrar Carga de Leche (Admin)'}
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#d1fae5', marginTop: '2px' }}>
                    Ticket #{ticket.codigoTicket || ticket.id} • {ticket.nombreConductor || 'Chofer'} ({ticket.camionPlaca || 'S/P'})
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAdminCargarLitros({ open: false, ticket: null, paradaExistente: null })}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    color: '#ffffff',
                    fontSize: '18px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Formulario */}
              <form
                onSubmit={handleGuardarLitrosAdmin}
                style={{ padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                {/* Cabecera / Identificación de la Finca (Vista Establecida 1:1) */}
                {esFincaBloqueada && fincaFijada ? (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      marginBottom: '2px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: '#e0f2fe',
                          color: '#0284c7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '18px',
                          flexShrink: 0,
                        }}
                      >
                        <i className="fa-solid fa-cow"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '14.5px', fontWeight: 900, color: '#0f172a' }}>
                          {fincaFijada.nombre}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                          {(fincaFijada as any).propietarioNombre || (fincaFijada as any).propietario || 'Finca Asignada'}
                          {fincaFijada.codigo ? ` • Cód: ${fincaFijada.codigo}` : ''}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: '#e2e8f0',
                        color: '#475569',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                      }}
                    >
                      <i className="fa-solid fa-lock text-[10px]"></i> Finca Fija
                    </span>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                      Finca Ganadera *
                    </label>
                    <input
                      type="text"
                      placeholder="Filtrar finca por nombre o código..."
                      value={busquedaFincaAdmin}
                      onChange={(e) => setBusquedaFincaAdmin(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '12.5px',
                        marginBottom: '6px',
                      }}
                    />
                    <select
                      required
                      value={formAdminLitros.fincaId}
                      onChange={(e) => setFormAdminLitros((prev) => ({ ...prev, fincaId: Number(e.target.value) }))}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #10b981',
                        fontSize: '13px',
                        fontWeight: 700,
                        background: '#ffffff',
                      }}
                    >
                      <option value={0}>-- Selecciona la Finca Ganadera --</option>
                      {fincasFiltradas.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nombre} {f.codigo ? `(${f.codigo})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Litros de Leche */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                      Litros Recolectados *
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[50, 100, 200, 500, 1000].map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => {
                            const actual = Number(formAdminLitros.litros) || 0;
                            setFormAdminLitros((prev) => ({ ...prev, litros: String(actual + inc) }));
                          }}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '2px 6px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          +{inc}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    required
                    placeholder="Ej: 1500"
                    value={formAdminLitros.litros}
                    onChange={(e) => setFormAdminLitros((prev) => ({ ...prev, litros: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #10b981',
                      fontSize: '17px',
                      fontWeight: 900,
                      color: '#065f46',
                    }}
                  />
                </div>

                {/* Tipo de Leche (Vaca vs Búfala) */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                    Tipo de Leche
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: tieneModuloBufala ? '1fr 1fr' : '1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setFormAdminLitros((prev) => ({ ...prev, tipoLeche: 'VACA' }))}
                      style={{
                        padding: '9px',
                        borderRadius: '10px',
                        border: formAdminLitros.tipoLeche === 'VACA' ? '2px solid #0284c7' : '1.5px solid #cbd5e1',
                        background: formAdminLitros.tipoLeche === 'VACA' ? '#f0f9ff' : '#ffffff',
                        color: formAdminLitros.tipoLeche === 'VACA' ? '#0369a1' : '#64748b',
                        fontWeight: 800,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                      }}
                    >
                      🥛 Leche de Vaca
                    </button>
                    {tieneModuloBufala && (
                      <button
                        type="button"
                        onClick={() => setFormAdminLitros((prev) => ({ ...prev, tipoLeche: 'BUFALA' }))}
                        style={{
                          padding: '9px',
                          borderRadius: '10px',
                          border: formAdminLitros.tipoLeche === 'BUFALA' ? '2px solid #ea580c' : '1.5px solid #cbd5e1',
                          background: formAdminLitros.tipoLeche === 'BUFALA' ? '#fff7ed' : '#ffffff',
                          color: formAdminLitros.tipoLeche === 'BUFALA' ? '#c2410c' : '#64748b',
                          fontWeight: 800,
                          fontSize: '12.5px',
                          cursor: 'pointer',
                        }}
                      >
                        🐃 Leche de Búfala
                      </button>
                    )}
                  </div>
                </div>

                {/* Checkboxes: Leche Ácida y Diferir */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#b91c1c', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formAdminLitros.esAcida}
                      onChange={(e) => setFormAdminLitros((prev) => ({ ...prev, esAcida: e.target.checked }))}
                    />
                    <span>⚠️ Leche Ácida</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#b45309', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formAdminLitros.esDiferido}
                      onChange={(e) => setFormAdminLitros((prev) => ({ ...prev, esDiferido: e.target.checked }))}
                    />
                    <span>⏳ Diferir Litros</span>
                  </label>
                </div>

                {/* Temperatura y Observación */}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px' }}>
                      Temp (°C)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="4.0"
                      value={formAdminLitros.temperatura}
                      onChange={(e) => setFormAdminLitros((prev) => ({ ...prev, temperatura: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px' }}>
                      Observación
                    </label>
                    <input
                      type="text"
                      placeholder="Nota de recolección..."
                      value={formAdminLitros.observacion}
                      onChange={(e) => setFormAdminLitros((prev) => ({ ...prev, observacion: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                {/* Foto Comprobante / Recibo de Finca (Requisito 2) */}
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    <span><i className="fa-solid fa-camera mr-1 text-sky-600"></i> Foto / Comprobante de Recibo</span>
                    {formAdminLitros.fotoComprobante ? (
                      <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 800 }}>
                        <i className="fa-solid fa-check mr-1"></i> Foto adjunta
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Opcional</span>
                    )}
                  </label>

                  <input
                    ref={inputFotoReciboAdminRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleSubirFotoReciboAdmin}
                  />

                  {formAdminLitros.fotoComprobante ? (
                    <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid #93c5fd', background: '#000' }}>
                      <img
                        src={formAdminLitros.fotoComprobante}
                        alt="Comprobante Finca"
                        style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', display: 'block' }}
                      />
                      <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setFotoReciboVerModal(formAdminLitros.fotoComprobante)}
                          style={{
                            background: 'rgba(2, 132, 199, 0.9)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                          title="Ver ampliada"
                        >
                          <i className="fa-solid fa-expand text-xs"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormAdminLitros((prev) => ({ ...prev, fotoComprobante: '' }))}
                          style={{
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
                          }}
                          title="Quitar foto"
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => inputFotoReciboAdminRef.current?.click()}
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
                      <span>Tomar Foto / Adjuntar Comprobante</span>
                    </button>
                  )}
                </div>

                {/* Botones de Acción */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setModalAdminCargarLitros({ open: false, ticket: null, paradaExistente: null })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#475569',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  {esEdicion && modalAdminCargarLitros.paradaExistente && (
                    <button
                      type="button"
                      onClick={() => handleLimpiarRecoleccionMovil(ticket, modalAdminCargarLitros.paradaExistente)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1.5px solid #bfdbfe',
                        background: '#eff6ff',
                        color: '#2563eb',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                      title="Reiniciar datos y marcar como No Recogida (0 Lts) en el ticket"
                    >
                      <i className="fa-solid fa-eraser"></i> Limpiar (0 L)
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={guardandoLitrosAdmin}
                    style={{
                      flex: 2,
                      padding: '12px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      fontWeight: 900,
                      fontSize: '13.5px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    {guardandoLitrosAdmin ? (
                      <span><i className="fa-solid fa-spinner fa-spin mr-2"></i>Guardando...</span>
                    ) : (
                      <span>💾 {esEdicion ? 'Actualizar Parada' : 'Guardar y Notificar'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AppMovilPage;