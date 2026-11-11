import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

// Clave usada para persistir el token de sesión
export const AUTH_TOKEN_KEY = 'transporte_jwt_token';

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return false;
  }
};

/**
 * Detecta si un mensaje o respuesta indica que la sesión se cerró o expiró
 */
export const isSessionExpiredString = (text?: string | null): boolean => {
  if (!text) return false;
  const s = text.toLowerCase();
  return (
    s.includes('cerró la sesión') ||
    s.includes('cerro la sesion') ||
    s.includes('sesión se cerró') ||
    s.includes('sesion se cerro') ||
    s.includes('sesión se ha cerrado') ||
    s.includes('sesion se ha cerrado') ||
    s.includes('sesion cerrada') ||
    s.includes('sesión cerrada') ||
    s.includes('sesion expirada') ||
    s.includes('sesión expirada') ||
    s.includes('sesión vencida') ||
    s.includes('sesion vencida') ||
    s.includes('sesión no válida') ||
    s.includes('sesion no valida') ||
    s.includes('sesión terminada') ||
    s.includes('sesion terminada') ||
    s.includes('session expired') ||
    s.includes('session closed') ||
    s.includes('session terminated') ||
    s.includes('token expirado') ||
    s.includes('token expired') ||
    s.includes('token inválido') ||
    s.includes('token invalido') ||
    s.includes('invalid token') ||
    s.includes('token vencido') ||
    s.includes('token no proporcionado') ||
    s.includes('unauthorized') ||
    s.includes('no autorizado') ||
    s.includes('debe iniciar sesión') ||
    s.includes('debe iniciar sesion') ||
    s.includes('inicia sesión nuevamente') ||
    s.includes('inicia sesion nuevamente') ||
    s.includes('tiempo de sesión agotado') ||
    s.includes('tiempo de sesion agotado') ||
    s.includes('idx10223') ||
    s.includes('lifetime validation failed') ||
    s.includes('securitytokenexpiredexception') ||
    s.includes('securitytokeninvalidlifetimeexception')
  );
};

// Callbacks para eventos de sesión expirada
type SessionExpiredHandler = (message: string) => void;
let onSessionExpiredHandler: SessionExpiredHandler | null = null;

export const setSessionExpiredHandler = (handler: SessionExpiredHandler) => {
  onSessionExpiredHandler = handler;
};

/**
 * Forzar cierre de sesión inmediato y cambio de página a /login
 */
export const forceRedirectToLogin = (message?: string) => {
  if (typeof window === 'undefined') return;

  // 1. Limpiar credenciales y almacenamiento local
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('transporte_auth_store');
    localStorage.removeItem('transporte_last_activity');
    sessionStorage.clear();
  } catch {}

  // 2. Notificar al store de autenticación para resetear estado global
  try {
    if (onSessionExpiredHandler) {
      onSessionExpiredHandler(message || 'Tu sesión ha finalizado. Por favor inicia sesión nuevamente.');
    }
  } catch {}

  // 3. Forzar cambio de página a /login inmediatamente
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
};

// Interceptor de Solicitudes: Adjuntar Token JWT y Header Multi-Inquilino
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = typeof window !== 'undefined' ? (localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem('token')) : null;
    const url = config.url || '';
    const isPublic = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/vincular-dispositivo') || url.includes('/public');
    const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';

    // OFFLINE-FIRST: en la terminal móvil (/movil, /app) o sin conexión, JAMÁS se cierra la sesión por
    // token vencido o ausente en el cliente. El chofer debe poder seguir registrando aunque no haya señal;
    // el servidor es quien decide (401) cuando realmente hay conexión.
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    const esTerminalMovil = typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/movil') || window.location.pathname.startsWith('/app'));
    const protegerSesionOffline = sinRed || esTerminalMovil;

    // Si el token ya expiró en el cliente, cerrar sesión proactivamente y redirigir a /login
    if (token && isTokenExpired(token) && !isPublic && !protegerSesionOffline) {
      forceRedirectToLogin('Tu sesión ha expirado por límite de tiempo. Inicia sesión nuevamente.');
      const controller = new AbortController();
      config.signal = controller.signal;
      controller.abort('Sesión expirada');
      return config;
    }

    // Si no hay token de sesión y no es endpoint público, redirigir a /login
    if (!token && !isPublic && !protegerSesionOffline) {
      if (!isLoginPage) {
        forceRedirectToLogin('No se detectó una sesión activa. Por favor inicia sesión.');
      }
      const controller = new AbortController();
      config.signal = controller.signal;
      controller.abort('Sesión no iniciada');
      return config;
    }

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (typeof window !== 'undefined' && config.headers) {
      const host = window.location.hostname.toLowerCase();
      // AISLAMIENTO ESTRICTO DE TENANTS: Garantizar que jamás se mezclen Vergel y Campo Verde
      if (host.includes('vergel') || host.includes('transportevc')) {
        config.headers['X-Tenant-Domain'] = 'transporte-vergel-carrillo.vercel.app';
        config.headers['X-Tenant-Code'] = 'VERGEL_CARRILLO';
      } else if (host.includes('campoverde') || host.includes('queseracampoverde')) {
        config.headers['X-Tenant-Domain'] = 'lacteos-campoverde.vercel.app';
        config.headers['X-Tenant-Code'] = 'CAMPO_VERDE';
      } else if (host.includes('base') || host.includes('tusoftware')) {
        config.headers['X-Tenant-Domain'] = 'transporte-base.vercel.app';
        config.headers['X-Tenant-Code'] = 'PRODUCTO_BASE';
      } else {
        // En entorno local de pruebas (localhost / IP) o app móvil con selector
        const storedTenant = localStorage.getItem('movil_tenant_domain') || '';
        if (storedTenant.includes('campoverde')) {
          config.headers['X-Tenant-Domain'] = 'lacteos-campoverde.vercel.app';
          config.headers['X-Tenant-Code'] = 'CAMPO_VERDE';
        } else if (storedTenant.includes('base')) {
          config.headers['X-Tenant-Domain'] = 'transporte-base.vercel.app';
          config.headers['X-Tenant-Code'] = 'PRODUCTO_BASE';
        } else {
          // Por defecto estricto: Transporte Vergel & Carrillo
          config.headers['X-Tenant-Domain'] = 'transporte-vergel-carrillo.vercel.app';
          config.headers['X-Tenant-Code'] = 'VERGEL_CARRILLO';
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor de Respuestas: Manejo global de 401/403 y normalización de errores
apiClient.interceptors.response.use(
  (response) => {
    // Si el backend devolvió HTTP 200 pero el cuerpo indica que la sesión se cerró
    const data = response?.data;
    if (data && !response.config?.url?.includes('/auth/login')) {
      const dataStr = typeof data === 'string'
        ? data.toLowerCase()
        : JSON.stringify(data).toLowerCase();

      if (isSessionExpiredString(dataStr)) {
        forceRedirectToLogin('Tu sesión ha finalizado. Por favor inicia sesión nuevamente.');
        return new Promise(() => {});
      }
    }
    return response;
  },
  (error: AxiosError<any>) => {
    // Si la solicitud fue cancelada deliberadamente
    if (axios.isCancel(error) || error.name === 'CanceledError' || error.message === 'Sesión no iniciada' || error.message === 'Sesión expirada') {
      if ((error.message === 'Sesión no iniciada' || error.message === 'Sesión expirada') && typeof window !== 'undefined' && window.location.pathname !== '/login') {
        forceRedirectToLogin('Tu sesión ha finalizado. Por favor inicia sesión nuevamente.');
      }
      return new Promise(() => {});
    }

    const status = error.response?.status;
    const url = error.config?.url || '';

    const serverData: any = error.response?.data;
    const dataStr = (
      (typeof serverData === 'string' ? serverData : JSON.stringify(serverData || {})) +
      ' ' +
      (error.message || '') +
      ' ' +
      (error.response?.headers?.['www-authenticate'] || '')
    ).toLowerCase();

    // Manejo global de MÓDULO NO CONTRATADO (SaaS Modular)
    if (status === 403 && (serverData?.error === 'MODULO_NO_CONTRATADO' || dataStr.includes('modulo_no_contratado'))) {
      const msg = serverData?.message || `El módulo '${serverData?.modulo || ''}' no está activo para su empresa en la plataforma SaaS.`;
      console.warn('[SaaS Modular Block]', msg);
      if (typeof window !== 'undefined') {
        import('sonner').then(({ toast }) => {
          toast.warning(msg, { duration: 5000, id: 'saas-modulo-bloqueado' });
        });
      }
      return Promise.reject(error);
    }

    // Manejo global estricto: si cualquier API devuelve 401 o sesión expirada, pasar a /login
    const isSessionClosed =
      status === 401 ||
      (status === 403 && !url.includes('/auth/login') && !url.includes('/fincas')) ||
      isSessionExpiredString(dataStr);

    // Sin conexión real jamás se cierra la sesión (puede ser un 503 sintético del Service Worker)
    const sinRedAhora = typeof navigator !== 'undefined' && navigator.onLine === false;
    const esRespuestaOffline = Boolean((serverData as any)?.offline) || status === 503;

    if (isSessionClosed && !url.includes('/auth/login') && !sinRedAhora && !esRespuestaOffline) {
      forceRedirectToLogin('Tu sesión ha finalizado. Por favor inicia sesión nuevamente.');
      return new Promise(() => {});
    }

    // Normalizar mensaje de error legible y prevenir volcado de código HTML (ej. 502 Bad Gateway)
    let errorMessage = 'Ocurrió un error inesperado al comunicarse con el servidor.';

    if (status === 502 || status === 503 || status === 504) {
      errorMessage = 'El servidor backend se está reiniciando o no está disponible temporalmente (502 Gateway). Por favor espere unos segundos e intente de nuevo.';
    } else if (serverData) {
      if (typeof serverData === 'string') {
        if (serverData.includes('<html') || serverData.includes('<!DOCTYPE')) {
          errorMessage = 'El servidor devolvió una respuesta no válida o se encuentra reiniciándose. Por favor intente nuevamente en unos instantes.';
        } else {
          errorMessage = serverData;
        }
      } else if (serverData.message) {
        errorMessage = serverData.message;
      } else if (serverData.title) {
        errorMessage = serverData.title;
        if (serverData.errors) {
          const detailList = Object.values(serverData.errors).flat().join(', ');
          if (detailList) errorMessage += `: ${detailList}`;
        }
      }
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Adjuntar mensaje amigable al error
    error.message = errorMessage;
    return Promise.reject(error);
  }
);

export default apiClient;

