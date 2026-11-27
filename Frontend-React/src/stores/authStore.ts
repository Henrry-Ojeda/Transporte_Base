import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, PermisoAccion } from '@/types';
import { AUTH_TOKEN_KEY, isMobileOrPwaContext, setSessionExpiredHandler } from '@/api/client';
import { authApi } from '@/api/auth.api';
import { updateAppIcon } from '@/utils/pwaIcons';

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
  syncModulosTenant: () => Promise<{ updated: boolean; prevMods: string[]; newMods: string[] }>;
  refreshPermissions: () => Promise<void>;

  // Verificaciones RBAC y Feature Flags SaaS
  isAdmin: () => boolean;
  isSupervisor: () => boolean;
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
        if (typeof window !== 'undefined') {
          if (isMobileOrPwaContext()) {
            if (!window.location.pathname.startsWith('/movil') && !window.location.pathname.startsWith('/app')) {
              window.location.replace('/movil');
            }
          } else if (window.location.pathname !== '/login') {
            window.location.replace('/login');
          }
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

      isSupervisor: () => {
        const user = get().user;
        if (!user) return false;
        const rol = (user.rol || '').toUpperCase();
        return rol === 'SUPERVISOR' || rol.includes('SUPERVISOR');
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
          if (host && !host.includes('base') && !host.includes('localhost') && host !== '127.0.0.1') return true;
        }
        return false;
      },

      hasPermission: (codigo: string) => {
        const { user, isAdmin } = get();
        if (!user) return false;
        if (isAdmin()) return true;
        const permisos = (user.permisos || []).map((p) => String(p).toUpperCase());
        return permisos.includes('ADMIN_TOTAL') || permisos.includes(codigo.toUpperCase());
      },

      hasActionPermission: (modulo: string, accion: PermisoAccion) => {
        const { hasPermission } = get();
        const mod = modulo.trim().toUpperCase();
        const acc = accion.trim().toUpperCase();
        // Compatibilidad CALIDAD_LECHE -> CALIDAD_*
        const prefijos = mod === 'CALIDAD_LECHE' ? ['CALIDAD_LECHE', 'CALIDAD'] : [mod];
        const acciones = acc === 'CREAR' || acc === 'AGREGAR' ? ['CREAR', 'AGREGAR'] : [acc];
        for (const p of prefijos) {
          for (const a of acciones) {
            if (hasPermission(`${p}_${a}`)) return true;
          }
        }
        return false;
      },

      refreshPermissions: async () => {
        try {
          const { token, user } = get();
          if (!token || !user) return;
          const profile = await authApi.getMe();
          if (profile && Array.isArray(profile.permisos)) {
            const nextPerms = profile.permisos.map((p: string) => String(p).toUpperCase());
            const prevPerms = (user.permisos || []).map((p: string) => String(p).toUpperCase());
            const changed =
              nextPerms.length !== prevPerms.length ||
              nextPerms.some((p: string) => !prevPerms.includes(p)) ||
              (profile.rol && profile.rol !== user.rol);
            if (changed) {
              set((state) => ({
                user: state.user
                  ? {
                      ...state.user,
                      rol: profile.rol || state.user.rol,
                      esSuperAdmin: typeof profile.esSuperAdmin === 'boolean' ? profile.esSuperAdmin : state.user.esSuperAdmin,
                      permisoCrearViaje: typeof profile.permisoCrearViaje === 'boolean' ? profile.permisoCrearViaje : state.user.permisoCrearViaje,
                      permisos: nextPerms,
                      modulosHabilitados: Array.isArray(profile.modulosHabilitados)
                        ? profile.modulosHabilitados.map((m: string) => String(m).toUpperCase())
                        : state.user.modulosHabilitados,
                    }
                  : null,
              }));
            }
          }
        } catch {
          // Silencioso si no hay red; 401/403 lo maneja el interceptor global
        }
      },

      syncModulosTenant: async () => {
        try {
          const res = await authApi.getTenantInfo();
          if (res) {
            updateAppIcon(res.logoUrl, res.nombre || res.codigo || 'Sistema de Transporte');
          }
          if (res && Array.isArray(res.modulos)) {
            const currentMods = get().user?.modulosHabilitados || [];
            const newMods = res.modulos.map((m) => m.toUpperCase());

            const sonIguales =
              currentMods.length === newMods.length &&
              currentMods.every((m) => newMods.includes(m.toUpperCase()));

            if (!sonIguales) {
              const currentUser = get().user;
              if (currentUser) {
                const updatedUser = {
                  ...currentUser,
                  modulosHabilitados: newMods,
                  empresaCodigo: res.codigo || currentUser.empresaCodigo,
                  empresaNombre: res.nombre || currentUser.empresaNombre,
                };
                set({ user: updatedUser });
                localStorage.setItem('transporte_user', JSON.stringify(updatedUser));
                return { updated: true, prevMods: currentMods, newMods };
              }
            }
          }
        } catch (err) {
          console.warn('Error en syncModulosTenant:', err);
        }
        return { updated: false, prevMods: [], newMods: [] };
      },

      hasTenantModule: (moduloCodigo: string) => {
        const user = get().user;
        const code = moduloCodigo.toUpperCase();

        if (user?.modulosHabilitados && Array.isArray(user.modulosHabilitados)) {
          if (code === 'MOD_LECHE_BUFALA' || code === 'MOD_BUFALA' || code === 'BUFALA' || code === 'LECHE_BUFALA') {
            return user.modulosHabilitados.some((m: string) => {
              const u = m.toUpperCase();
              return u === 'MOD_LECHE_BUFALA' || u === 'MOD_BUFALA' || u === 'BUFALA' || u === 'LECHE_BUFALA';
            });
          }
          if (code === 'MOD_ASISTENTE_IA' || code === 'ASISTENTE' || code === 'ASISTENTE_IA' || code === 'CHATBOT') {
            return user.modulosHabilitados.some((m: string) => {
              const u = m.toUpperCase();
              return u === 'MOD_ASISTENTE_IA' || u === 'ASISTENTE' || u === 'ASISTENTE_IA' || u === 'CHATBOT';
            });
          }
          return user.modulosHabilitados.some((m: string) => m.toUpperCase() === code);
        }

        return false;
      },

      canAccessTab: (tabId: string) => {
        const { isAdmin, hasPermission, hasTenantModule } = get();

        // REGLA 4: Si el módulo SaaS no está habilitado para el tenant, ocultar pestaña transversalmente
        if (tabId.toLowerCase() === 'bufala' && !hasTenantModule('MOD_LECHE_BUFALA')) {
          return false;
        }

        if (isAdmin()) return true;

        const tabPermissionMap: Record<string, string[]> = {
          'dashboard': ['DASHBOARD_VER'],
          'rutas': ['RUTAS_VER'],
          'viajes': ['CONTROL_RUTAS_VER'],
          'control-rutas': ['CONTROL_RUTAS_VER'],
          'mapa-rutas': ['MAPA_RUTAS_VER', 'RUTAS_PLANIFICACION_VER'],
          'entregas': ['ENTREGAS_VER'],
          'receptoria': ['ENTREGAS_VER'],
          'calidad-leche': ['CALIDAD_VER', 'CALIDAD_LECHE_VER'],
          'balance': ['BALANCE_LECHE_VER'],
          'control-tanques': ['BALANCE_LECHE_VER'],
          'bufala': ['TRAZABILIDAD_BUFALA_VER'],
          'planificacion-rutas': ['RUTAS_PLANIFICACION_VER'],
          'rutas-planificacion': ['RUTAS_PLANIFICACION_VER'],
          'planificacion-rutas-choferes': ['RUTAS_PLANIFICACION_VER'],
          'evolucion-fincas': ['RUTAS_PLANIFICACION_VER'],

          // Catálogos
          'fincas': ['FINCAS_VER'],
          'propietarios': ['PROPIETARIOS_VER'],
          'conductores': ['CONDUCTORES_VER'],
          'camiones': ['CAMIONES_VER'],
          'companias': ['COMPANIAS_VER'],
          'bancos': ['BANCOS_VER'],
          'empresa': ['EMPRESA_VER'],

          // Flota & Mantenimiento
          'combustible': ['COMBUSTIBLE_VER'],
          'mantenimiento': ['HISTORIAL_CAMIONES_VER'],
          'historial-camiones': ['HISTORIAL_CAMIONES_VER'],
          'repuestos': ['REPUESTOS_VER'],

          // Finanzas & Liquidación
          'semanas': ['CICLOS_VER'],
          'liquidacion': ['LIQUIDACIONES_VER'],
          'liquidaciones': ['LIQUIDACIONES_VER'],
          'pagos-personal': ['PAGOS_PERSONAL_VER'],
          'pagos-usuarios': ['PAGOS_PERSONAL_VER'],
          'historial-pagos': ['HISTORIAL_PAGOS_VER', 'PAGOS_PERSONAL_VER'],
          'administracion': ['ADMINISTRACION_VER'],

          // Adelantos
          'adelantos': ['ADELANTOS_FINCAS_VER', 'ADELANTOS_PERSONAL_VER', 'ADELANTOS_RECEPTORIA_VER'],
          'adelantos-fincas': ['ADELANTOS_FINCAS_VER'],
          'adelantos-personal': ['ADELANTOS_PERSONAL_VER'],
          'adelantos-usuarios': ['ADELANTOS_PERSONAL_VER'],
          'abonos-companias': ['ABONOS_COMPANIAS_VER'],
          'adelantos-receptoria': ['ADELANTOS_RECEPTORIA_VER'],
          'abonos': ['ABONOS_VER'],
          'historial-adelantos': ['HISTORIAL_ADELANTOS_VER'],

          // Gestión de Data
          'data': ['EMPRESA_VER', 'CONFIGURACION_VER'],
          'gestion-data': ['EMPRESA_VER', 'CONFIGURACION_VER'],

          // Reportes
          'reportes': ['REPORTES_VER'],
          'historial-bcv': ['HISTORIAL_BCV_VER'],

          // Seguridad y Sistema
          'usuarios': ['USUARIOS_SEGURIDAD_VER', 'USUARIOS_VER'],
          'permisos': ['PERMISOS_VER'],
          'configuracion': ['CONFIGURACION_VER'],
          'configuracion-sistema': ['CONFIGURACION_VER'],
          'configuracion-sesion': ['SESION_VER', 'CONFIGURACION_VER'],
        };

        const requiredPerms = tabPermissionMap[tabId.toLowerCase()];
        if (!requiredPerms || requiredPerms.length === 0) {
          // Perfil personal accesible para usuarios autenticados; cualquier otra ruta no registrada es fail-closed
          return ['perfil', 'mi-cuenta', 'configuracion-sesion'].includes(tabId.toLowerCase());
        }
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
