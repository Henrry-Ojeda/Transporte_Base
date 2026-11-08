import { useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { useAuthStore } from '@/stores/authStore';

/**
 * Monitor de inactividad de sesión (réplica de iniciarMonitorInactividad de V2_3_11_26).
 * - Lee la configuración guardada en "Tiempo de Sesión" (minutos y aviso previo).
 * - Persiste la última actividad en localStorage: si el navegador se cierra y se
 *   reabre horas después, la sesión se cierra igualmente.
 * - Sincroniza entre pestañas (la actividad en una pestaña mantiene viva las demás).
 * - Cierra la sesión si el token JWT expiró.
 * - Aviso previo 30 segundos antes del cierre.
 */
export const SESSION_TIMEOUT_KEY = 'inactivity_timeout_minutes';
export const SESSION_WARNING_KEY = 'inactivity_warning_enabled';
export const SESSION_LAST_ACTIVITY_KEY = 'transporte_last_activity';

const DEFAULT_MINUTES = 10;
const WARNING_MS = 30_000;

export const getSessionTimeoutMinutes = (): number => {
  const raw = localStorage.getItem(SESSION_TIMEOUT_KEY) ?? localStorage.getItem('app_session_timeout');
  const n = raw !== null ? Number(raw) : DEFAULT_MINUTES;
  return Number.isFinite(n) ? n : DEFAULT_MINUTES;
};

const isWarningEnabled = (): boolean => {
  const raw = localStorage.getItem(SESSION_WARNING_KEY) ?? localStorage.getItem('app_session_warning');
  return raw === null ? true : raw === 'true';
};

const getLastActivity = (): number => {
  const raw = Number(localStorage.getItem(SESSION_LAST_ACTIVITY_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : Date.now();
};

export const touchSessionActivity = () => {
  localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(Date.now()));
};

const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return false;
  }
};

export const SessionMonitor: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const warningOpenRef = useRef(false);
  const lastWriteRef = useRef(0);

  // La terminal móvil de campo para choferes es permanente y resiliente offline:
  // jamás debe cerrar sesión por inactividad si está en la app móvil o es un chofer en ruta
  const esRutaMovil = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/app') ||
    window.location.pathname.startsWith('/movil') ||
    (user?.rol || '').toUpperCase() === 'CHOFER' ||
    Boolean(localStorage.getItem('movil_device_info'))
  );

  useEffect(() => {
    if (!isAuthenticated || esRutaMovil) return;

    const cerrarSesion = (msg: string) => {
      warningOpenRef.current = false;
      if (Swal.isVisible()) Swal.close();
      localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
      logout(msg);
    };

    // Verificación inmediata al montar (p. ej. al reabrir el navegador horas después)
    const minutosInicio = getSessionTimeoutMinutes();
    if (isTokenExpired(token)) {
      cerrarSesion('Tu credencial de sesión ha expirado. Inicia sesión nuevamente.');
      return;
    }
    if (
      minutosInicio > 0 &&
      localStorage.getItem(SESSION_LAST_ACTIVITY_KEY) &&
      Date.now() - getLastActivity() >= minutosInicio * 60_000
    ) {
      cerrarSesion(`Tu sesión se ha cerrado automáticamente por inactividad (${minutosInicio} minutos sin uso).`);
      return;
    }
    touchSessionActivity();

    const registrarActividad = () => {
      if (warningOpenRef.current) return; // durante el aviso solo cuenta el botón "Continuar"
      const now = Date.now();
      if (now - lastWriteRef.current > 1000) {
        lastWriteRef.current = now;
        touchSessionActivity();
      }
    };

    const eventos: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    eventos.forEach((evt) => window.addEventListener(evt, registrarActividad, { passive: true }));

    const mostrarAviso = (segundos: number) => {
      warningOpenRef.current = true;
      let tick: ReturnType<typeof setInterval> | undefined;
      Swal.fire({
        title: '¿Sigues ahí?',
        html: `Tu sesión se cerrará en <strong id="swalSegundosInactividad" style="color:#f87171;font-size:18px;">${segundos}</strong> segundos por inactividad.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Continuar Sesión',
        cancelButtonText: 'Cerrar Sesión Ahora',
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#64748b',
        background: '#1e293b',
        color: '#fff',
        allowOutsideClick: false,
        timer: segundos * 1000,
        timerProgressBar: true,
        didOpen: () => {
          const b = document.getElementById('swalSegundosInactividad');
          tick = setInterval(() => {
            const ms = Swal.getTimerLeft();
            if (b && ms) b.textContent = String(Math.ceil(ms / 1000));
          }, 500);
        },
        willClose: () => {
          if (tick) clearInterval(tick);
        },
      }).then((result) => {
        warningOpenRef.current = false;
        if (result.isConfirmed) {
          touchSessionActivity();
        } else if (result.dismiss === Swal.DismissReason.cancel) {
          cerrarSesion('Sesión cerrada manualmente.');
        }
      });
    };

    const interval = setInterval(() => {
      const state = useAuthStore.getState();
      if (!state.isAuthenticated) return;

      if (isTokenExpired(state.token)) {
        cerrarSesion('Tu credencial de sesión ha expirado. Inicia sesión nuevamente.');
        return;
      }

      const minutos = getSessionTimeoutMinutes();
      if (minutos <= 0) return; // desactivado

      const restante = minutos * 60_000 - (Date.now() - getLastActivity());

      if (restante <= 0) {
        cerrarSesion(`Tu sesión se ha cerrado automáticamente por inactividad (${minutos} minutos sin uso).`);
        return;
      }

      if (warningOpenRef.current && restante > WARNING_MS) {
        // Otra pestaña registró actividad: cerrar el aviso
        warningOpenRef.current = false;
        Swal.close();
        return;
      }

      if (isWarningEnabled() && restante <= WARNING_MS && !warningOpenRef.current) {
        mostrarAviso(Math.ceil(restante / 1000));
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      eventos.forEach((evt) => window.removeEventListener(evt, registrarActividad));
    };
  }, [isAuthenticated, token, logout]);

  return null;
};

export default SessionMonitor;

