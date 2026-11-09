import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, PermisoAccion } from '@/types';
import { AUTH_TOKEN_KEY, setSessionExpiredHandler } from '@/api/client';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  sessionExpiredMessage: string | null;

  // Acciones
  login: (token: string, user: AuthUser) => void;
  logout: (message?: string) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  clearExpiredMessage: () => void;

  // Verificaciones RBAC y Feature Flags SaaS
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  isAppHijo: () => boolean;
  hasPermission: (codigo: string) => boolean;
  hasActionPermission: (modulo: string, accion: PermisoAccion) => boolean;
  canAccessTab: (tabId: string) => boolean;
  hasTenantModule: (moduloCodigo: string) => boolean;
}

type LogoutListener = () => void;
let onLogoutListener: LogoutListener | null = null;
export const setOnLogoutListener = (fn: LogoutListener) => {
  onLogoutListener = fn;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      sessionExpiredMessage: null,

      login: (token: string, user: AuthUser) => {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.setItem('transporte_last_activity', String(Date.now()));
        set({
          token,
          user,
          isAuthenticated: true,
          sessionExpiredMessage: null,
        });
      },

      logout: (message?: string) => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem('token');
        localStorage.removeItem('transporte_auth_store');
        localStorage.removeItem('transporte_last_activity');
        if (onLogoutListener) {
          try {
            onLogoutListener();
          } catch {
            // ignore
          }
        }
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          sessionExpiredMessage: message || null,
        });
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.replace('/login');
        }
      },

      updateUser: (partial: Partial<AuthUser>) => {
        set((state) => {
          if (!state.user) return state;
          return {
            user: {
              ...state.user,
              ...partial,
            },
          };
        });
      },

      clearExpiredMessage: () => set({ sessionExpiredMessage: null }),

      isAdmin: () => {
        const user = get().user;
        if (!user) return false;
        const rol = (user.rol || '').toUpperCase();
        return rol.includes('ADMIN') || rol === 'ADMINISTRADOR GENERAL';
      },

      isSuperAdmin: () => {
        const user = get().user;
        if (!user) return false;
        if (user.esSuperAdmin === true) return true;
        const rol = (user.rol || '').toUpperCase();
        return rol === 'SUPERADMIN' || rol === 'SUPER_ADMIN';
      },

      isAppHijo: () => {
        const user = get().user;
        const cod = (user?.empresaCodigo || '').toUpperCase();
        if (cod && cod !== 'PRODUCTO_BASE' && cod !== 'BASE') return true;
        if (typeof window !== 'undefined') {
          const host = window.location.hostname.toLowerCase();
          if (host.includes('campoverde') || host.includes('vergel')) return true;
        }
        return false;
      },

      hasPermission: (codigo: string) => {
        const { user, isAdmin } = get();
        if (!user) return false;
        if (isAdmin()) return true;
        const permisos = user.permisos || [];
        return permisos.includes(codigo.toUpperCase());
      },

      hasActionPermission: (modulo: string, accion: PermisoAccion) => {
        const codigo = `${modulo.toUpperCase()}_${accion.toUpperCase()}`;
        return get().hasPermission(codigo);
      },

      hasTenantModule: (moduloCodigo: string) => {
        const user = get().user;
        const code = moduloCodigo.toUpperCase();

        if (user?.modulosHabilitados && Array.isArray(user.modulosHabilitados)) {
          if (code === 'MOD_LECHE_BUFALA' || code === 'MOD_BUFALA' || code === 'BUFALA') {
            return user.modulosHabilitados.some((m: string) => {
              const u = m.toUpperCase();
              return u === 'MOD_LECHE_BUFALA' || u === 'MOD_BUFALA' || u === 'BUFALA' || u === 'LECHE_BUFALA';
            });
          }
          return user.modulosHabilitados.includes(code);
        }

        // Si el usuario pertenece explícitamente a CAMPO_VERDE y no tiene módulos devueltos, búfala está desactivada por defecto
        if (code === 'MOD_LECHE_BUFALA' || code === 'MOD_BUFALA' || code === 'BUFALA') {
          const emp = (user?.empresaCodigo || '').toUpperCase();
          if (emp.includes('CAMPO_VERDE') || emp.includes('CAMPOVERDE')) {
            return false;
          }
        }

        return true;
      },

      canAccessTab: (tabId: string) => {
        const { isAdmin, hasPermission, hasTenantModule } = get();

        // REGLA 4: Si el módulo SaaS no está habilitado para el tenant, ocultar pestaña transversalmente
        if (tabId.toLowerCase() === 'bufala' && !hasTenantModule('MOD_LECHE_BUFALA')) {
          return false;
        }

        const rolUsuario = (get().user?.rol || '').toUpperCase();

        // ROL TALLER: Sólo ve Flota, Mantenimiento, Repuestos, Combustible y Perfil
        if (rolUsuario === 'TALLER' || rolUsuario.includes('MECANICO')) {
          const tabsPermitidosTaller = ['camiones', 'mantenimiento', 'repuestos', 'combustible', 'perfil'];
          return tabsPermitidosTaller.includes(tabId.toLowerCase());
        }

        // ROL CHOFER: No ve Taller ni Repuestos
        if (rolUsuario === 'CHOFER') {
          if (['mantenimiento', 'repuestos'].includes(tabId.toLowerCase())) {
            return false;
          }
        }

        if (isAdmin()) return true;

        const tabPermissionMap: Record<string, string[]> = {
          'dashboard': ['DASHBOARD_VER'],
          'rutas': ['RUTAS_VER'],
          'viajes': ['CONTROL_RUTAS_VER', 'RUTAS_VER'],
          'entregas': ['ENTREGAS_VER'],
          'receptoria': ['ENTREGAS_VER'],
          'balance': ['BALANCE_LECHE_VER'],
          'control-tanques': ['BALANCE_LECHE_VER', 'ENTREGAS_VER'],
          'bufala': ['TRAZABILIDAD_BUFALA_VER'],
          'planificacion-rutas': ['RUTAS_PLANIFICACION_VER', 'RUTAS_VER'],
          'rutas-planificacion': ['RUTAS_PLANIFICACION_VER', 'RUTAS_VER'],
          'planificacion-rutas-choferes': ['RUTAS_PLANIFICACION_VER', 'RUTAS_VER'],
          'evolucion-fincas': ['RUTAS_PLANIFICACION_VER', 'RUTAS_VER'],

          // Catálogos
          'fincas': ['FINCAS_VER'],
          'propietarios': ['PROPIETARIOS_VER'],
          'conductores': ['CONDUCTORES_VER'],
          'camiones': ['CAMIONES_VER', 'CONDUCTORES_VER'],
          'companias': ['COMPANIAS_VER'],
          'bancos': ['BANCOS_VER'],
          'empresa': ['EMPRESA_VER'],

          // Flota & Mantenimiento
          'combustible': ['COMBUSTIBLE_VER', 'CAMIONES_VER'],
          'mantenimiento': ['HISTORIAL_CAMIONES_VER', 'CAMIONES_VER'],
          'repuestos': ['REPUESTOS_VER', 'CAMIONES_VER'],

          // Finanzas & Liquidación
          'semanas': ['CICLOS_VER'],
          'liquidaciones': ['LIQUIDACIONES_VER'],
          'pagos-personal': ['PAGOS_PERSONAL_VER', 'LIQUIDACIONES_VER'],
          'historial-pagos': ['LIQUIDACIONES_VER', 'PAGOS_PERSONAL_VER'],
          'administracion': ['LIQUIDACIONES_VER', 'EMPRESA_VER'],

          // Adelantos
          'adelantos': ['ADELANTOS_VER', 'ADELANTOS_FINCAS_VER'],
          'adelantos-fincas': ['ADELANTOS_FINCAS_VER', 'ADELANTOS_VER'],
          'adelantos-personal': ['ADELANTOS_PERSONAL_VER', 'ADELANTOS_VER'],
          'abonos-companias': ['ABONOS_COMPANIAS_VER', 'ADELANTOS_VER'],
          'adelantos-receptoria': ['ADELANTOS_VER', 'ENTREGAS_VER'],
          'abonos': ['ADELANTOS_VER'],
          'historial-adelantos': ['ADELANTOS_VER'],

          // Gestión de Data
          'data': ['EMPRESA_VER', 'FINCAS_VER', 'PROPIETARIOS_VER'],

          // Reportes
          'reportes': ['REPORTES_VER'],
          'historial-bcv': ['HISTORIAL_BCV_VER'],

          // Seguridad y Sistema
          'usuarios': ['USUARIOS_VER', 'USUARIOS_SEGURIDAD_VER'],
          'permisos': ['PERMISOS_VER'],
          'configuracion': ['CONFIGURACION_VER'],
          'configuracion-sistema': ['CONFIGURACION_VER'],
          'configuracion-sesion': ['CONFIGURACION_VER'],
        };

        const requiredPerms = tabPermissionMap[tabId.toLowerCase()];
        if (!requiredPerms || requiredPerms.length === 0) return true;
        const user = get().user;
        const rol = (user?.rol || '').toUpperCase();
        if (rol === 'SUPERVISOR' || rol.includes('ADMIN')) return true;
        return requiredPerms.some((perm) => hasPermission(perm));
      },
    }),
    {
      name: 'transporte_auth_store',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Conectar el interceptor 401 de Axios con el store de Zustand
setSessionExpiredHandler((msg: string) => {
  useAuthStore.getState().logout(msg);
});
