import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import apiClient from '@/api/client';
import { updateAppIcon } from '@/utils/pwaIcons';

import { LoginPage } from '@/modules/auth/LoginPage';
import { DescargarAppPage } from '@/modules/auth/DescargarAppPage';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { SessionMonitor } from '@/components/common/SessionMonitor';
import { TenantModuleMonitor } from '@/components/common/TenantModuleMonitor';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { setOnLogoutListener, useAuthStore } from '@/stores/authStore';

// Helper para lazy-loading limpio de exportaciones nombradas o default
const lazyNamed = <T extends Record<string, any>>(
  loader: () => Promise<T>,
  exportName: keyof T
) =>
  lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] as React.ComponentType<any> };
  });

// Dashboard & Operaciones (Code-Splitting por ruta)
const DashboardPage = lazyNamed(() => import('@/modules/dashboard/DashboardPage'), 'DashboardPage');
const RutasLogisticaPage = lazyNamed(() => import('@/modules/operaciones/RutasLogisticaPage'), 'RutasLogisticaPage');
const PlanificacionRutasChoferesPage = lazyNamed(() => import('@/modules/operaciones/PlanificacionRutasChoferesPage'), 'PlanificacionRutasChoferesPage');
const LogisticaRutasPage = lazyNamed(() => import('@/modules/operaciones/LogisticaRutasPage'), 'LogisticaRutasPage');
const RecoleccionRutasPage = lazyNamed(() => import('@/modules/operaciones/RecoleccionRutasPage'), 'RecoleccionRutasPage');
const ViajesTicketsPage = lazyNamed(() => import('@/modules/operaciones/ViajesTicketsPage'), 'ViajesTicketsPage');
const ReceptoriaPage = lazyNamed(() => import('@/modules/operaciones/ReceptoriaPage'), 'ReceptoriaPage');
const BalanceLechePage = lazyNamed(() => import('@/modules/operaciones/BalanceLechePage'), 'BalanceLechePage');
const BufalaPage = lazyNamed(() => import('@/modules/operaciones/BufalaPage'), 'BufalaPage');
const EvolucionFincasPage = lazyNamed(() => import('@/modules/operaciones/EvolucionFincasPage'), 'EvolucionFincasPage');
const ControlTanquesPage = lazyNamed(() => import('@/modules/operaciones/ControlTanquesPage'), 'ControlTanquesPage');
const MapaRutasPage = lazyNamed(() => import('@/modules/operaciones/MapaRutasPage'), 'MapaRutasPage');

// Catálogos
const FincasPage = lazyNamed(() => import('@/modules/catalogos/FincasPage'), 'FincasPage');
const PropietariosPage = lazyNamed(() => import('@/modules/catalogos/PropietariosPage'), 'PropietariosPage');
const ConductoresPage = lazyNamed(() => import('@/modules/catalogos/ConductoresPage'), 'ConductoresPage');
const CamionesPage = lazyNamed(() => import('@/modules/catalogos/CamionesPage'), 'CamionesPage');
const CompaniasPage = lazyNamed(() => import('@/modules/catalogos/CompaniasPage'), 'CompaniasPage');
const BancosPage = lazyNamed(() => import('@/modules/catalogos/BancosPage'), 'BancosPage');
const EmpresaPage = lazyNamed(() => import('@/modules/catalogos/EmpresaPage'), 'EmpresaPage');

// Flota & Mantenimiento
const CombustiblePage = lazyNamed(() => import('@/modules/combustible/CombustiblePage'), 'CombustiblePage');
const MantenimientoPage = lazyNamed(() => import('@/modules/mantenimiento/MantenimientoPage'), 'MantenimientoPage');
const RepuestosPage = lazyNamed(() => import('@/modules/repuestos/RepuestosPage'), 'RepuestosPage');

// Liquidación & Finanzas
const SemanasPage = lazyNamed(() => import('@/modules/finanzas/SemanasPage'), 'SemanasPage');
const LiquidacionesPage = lazyNamed(() => import('@/modules/finanzas/LiquidacionesPage'), 'LiquidacionesPage');
const PagosPersonalPage = lazyNamed(() => import('@/modules/finanzas/PagosPersonalPage'), 'PagosPersonalPage');
const HistorialPagosPage = lazyNamed(() => import('@/modules/finanzas/HistorialPagosPage'), 'HistorialPagosPage');
const PagosNominaPage = lazyNamed(() => import('@/modules/finanzas/PagosNominaPage'), 'PagosNominaPage');
const AdministracionGeneralPage = lazyNamed(() => import('@/modules/finanzas/AdministracionGeneralPage'), 'AdministracionGeneralPage');

// Adelantos
const AdelantosFincasPage = lazyNamed(() => import('@/modules/finanzas/AdelantosFincasPage'), 'AdelantosFincasPage');
const AbonosCompaniasPage = lazyNamed(() => import('@/modules/finanzas/AbonosCompaniasPage'), 'AbonosCompaniasPage');
const OtrosAdelantosPage = lazyNamed(() => import('@/modules/finanzas/OtrosAdelantosPage'), 'OtrosAdelantosPage');
const AdelantosUnificadoPage = lazyNamed(() => import('@/modules/finanzas/AdelantosUnificadoPage'), 'AdelantosUnificadoPage');

// Sistema & Reportes
const ReportesPage = lazyNamed(() => import('@/modules/sistema/ReportesPage'), 'ReportesPage');
const HistorialBcvPage = lazyNamed(() => import('@/modules/sistema/HistorialBcvPage'), 'HistorialBcvPage');
const GestionDataPage = lazyNamed(() => import('@/modules/data/GestionDataPage'), 'GestionDataPage');
const UsuariosPage = lazyNamed(() => import('@/modules/sistema/UsuariosPage'), 'UsuariosPage');
const MiCuentaPage = lazyNamed(() => import('@/modules/sistema/MiCuentaPage'), 'MiCuentaPage');
const PermisosPage = lazyNamed(() => import('@/modules/sistema/PermisosPage'), 'PermisosPage');
const ConfiguracionPage = lazyNamed(() => import('@/modules/sistema/ConfiguracionPage'), 'ConfiguracionPage');
const AppMovilPage = lazyNamed(() => import('@/modules/movil/AppMovilPage'), 'AppMovilPage');

const RouteFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[55vh]">
    <div className="flex flex-col items-center gap-3 text-slate-500">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      <span className="text-xs font-semibold tracking-wide uppercase">Cargando módulo...</span>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

setOnLogoutListener(() => {
  queryClient.clear();
});

if (typeof window !== 'undefined') {
  const currentHost = window.location.hostname.toLowerCase();
  if (currentHost.includes('queseracampoverde.duckdns.org')) {
    window.location.replace(`https://lacteos-campoverde.vercel.app${window.location.pathname}${window.location.search}`);
  } else if (currentHost.includes('transportevc.duckdns.org')) {
    window.location.replace(`https://transporte-vergel-carrillo.vercel.app${window.location.pathname}${window.location.search}`);
  }
}

const HomeRedirect: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const rol = (user?.rol || '').toUpperCase();

  let tieneDispositivoValido = false;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('movil_device_info');
      if (raw) {
        const d = JSON.parse(raw);
        const userCod = String((user as any)?.empresaCodigo || '').toUpperCase().trim();
        const devCod = String(d.empresaCodigo || '').toUpperCase().trim();
        tieneDispositivoValido = !userCod || !devCod || userCod === devCod;
      }
    } catch {
      tieneDispositivoValido = false;
    }
  }

  const isMobileDevice = typeof window !== 'undefined' && (
    window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );

  if (rol === 'CHOFER') {
    return <Navigate to="/movil" replace />;
  }
  if (!isAuthenticated) {
    if (tieneDispositivoValido || isMobileDevice) {
      return <Navigate to="/movil" replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

const DynamicAppIconSync: React.FC = () => {
  React.useEffect(() => {
    try {
      const savedLogo = localStorage.getItem('app_empresa_logo') || localStorage.getItem('movil_tenant_logo');
      if (savedLogo) {
        updateAppIcon(savedLogo);
      }

      apiClient.get<any>('/catalogos/empresa')
        .then((res) => {
          const logo = res.data?.logoUrl || res.data?.LogoUrl;
          if (logo) {
            localStorage.setItem('app_empresa_logo', logo);
            localStorage.setItem('movil_tenant_logo', logo);
            updateAppIcon(logo);
          }
        })
        .catch(() => {});
    } catch {}
  }, []);

  return null;
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <DynamicAppIconSync />
        <BrowserRouter>
          <SessionMonitor />
          <TenantModuleMonitor />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route index element={<HomeRedirect />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/descargar-app" element={<DescargarAppPage />} />
              <Route path="/movil" element={<AppMovilPage />} />
              <Route path="/app" element={<AppMovilPage />} />

              <Route
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                {/* Operaciones */}
                <Route path="/dashboard" element={<ProtectedRoute requiredTabId="dashboard"><DashboardPage /></ProtectedRoute>} />
                <Route path="/rutas" element={<ProtectedRoute requiredTabId="rutas"><RecoleccionRutasPage /></ProtectedRoute>} />
                <Route path="/viajes" element={<ProtectedRoute requiredTabId="viajes"><ViajesTicketsPage /></ProtectedRoute>} />
                <Route path="/receptoria" element={<ProtectedRoute requiredTabId="receptoria" requiredTenantModule="MOD_RECEPTORIA"><ReceptoriaPage /></ProtectedRoute>} />
                <Route path="/balance" element={<ProtectedRoute requiredTabId="balance"><BalanceLechePage /></ProtectedRoute>} />
                <Route path="/evolucion-fincas" element={<ProtectedRoute requiredTabId="evolucion-fincas"><EvolucionFincasPage /></ProtectedRoute>} />
                <Route path="/control-tanques" element={<ProtectedRoute requiredTabId="control-tanques" requiredTenantModule="MOD_CONTROL_TANQUES"><ControlTanquesPage /></ProtectedRoute>} />
                <Route path="/logistica" element={<ProtectedRoute requiredTabId="rutas-planificacion" requiredTenantModule="MOD_LOGISTICA_RUTAS"><LogisticaRutasPage /></ProtectedRoute>} />
                <Route path="/planificacion-rutas" element={<Navigate to="/logistica?tab=circuitos" replace />} />
                <Route path="/planificacion-rutas-choferes" element={<Navigate to="/logistica?tab=planificacion" replace />} />
                <Route path="/mapa-rutas" element={<Navigate to="/logistica?tab=mapa" replace />} />
                <Route path="/bufala" element={<ProtectedRoute requiredTabId="bufala" requiredTenantModule="MOD_LECHE_BUFALA"><BufalaPage /></ProtectedRoute>} />

                {/* Catálogos */}
                <Route path="/fincas" element={<ProtectedRoute requiredTabId="fincas"><FincasPage /></ProtectedRoute>} />
                <Route path="/propietarios" element={<ProtectedRoute requiredTabId="propietarios"><PropietariosPage /></ProtectedRoute>} />
                <Route path="/conductores" element={<ProtectedRoute requiredTabId="conductores"><ConductoresPage /></ProtectedRoute>} />
                <Route path="/camiones" element={<ProtectedRoute requiredTabId="camiones"><CamionesPage /></ProtectedRoute>} />
                <Route path="/companias" element={<ProtectedRoute requiredTabId="companias"><CompaniasPage /></ProtectedRoute>} />
                <Route path="/bancos" element={<ProtectedRoute requiredTabId="bancos"><BancosPage /></ProtectedRoute>} />
                <Route path="/empresa" element={<ProtectedRoute requiredTabId="empresa"><EmpresaPage /></ProtectedRoute>} />

                {/* Flota & Taller */}
                <Route path="/combustible" element={<ProtectedRoute requiredTabId="combustible" requiredTenantModule="MOD_COMBUSTIBLE"><CombustiblePage /></ProtectedRoute>} />
                <Route path="/mantenimiento" element={<ProtectedRoute requiredTabId="mantenimiento" requiredTenantModule="MOD_MANTENIMIENTO"><MantenimientoPage /></ProtectedRoute>} />
                <Route path="/repuestos" element={<ProtectedRoute requiredTabId="repuestos" requiredTenantModule="MOD_REPUESTOS"><RepuestosPage /></ProtectedRoute>} />

                {/* Liquidación & Pagos */}
                <Route path="/semanas" element={<ProtectedRoute requiredTabId="semanas" requiredTenantModule="MOD_LIQUIDACIONES"><SemanasPage /></ProtectedRoute>} />
                <Route path="/liquidaciones" element={<ProtectedRoute requiredTabId="liquidaciones" requiredTenantModule="MOD_LIQUIDACIONES"><LiquidacionesPage /></ProtectedRoute>} />
                <Route path="/pagos-nomina" element={<ProtectedRoute requiredTabId="pagos-personal" requiredTenantModule="MOD_PAGOS_PERSONAL"><PagosNominaPage /></ProtectedRoute>} />
                <Route path="/pagos-personal" element={<Navigate to="/pagos-nomina?tab=nomina" replace />} />
                <Route path="/historial-pagos" element={<Navigate to="/pagos-nomina?tab=historial" replace />} />
                <Route path="/administracion" element={<ProtectedRoute requiredTabId="administracion"><AdministracionGeneralPage /></ProtectedRoute>} />

                {/* Adelantos & Cobranzas */}
                <Route path="/adelantos" element={<ProtectedRoute requiredTabId="adelantos" requiredTenantModule="MOD_LIQUIDACIONES"><AdelantosUnificadoPage /></ProtectedRoute>} />
                <Route path="/adelantos-fincas" element={<Navigate to="/adelantos?tab=fincas" replace />} />
                <Route path="/abonos-companias" element={<ProtectedRoute requiredTabId="abonos-companias"><AbonosCompaniasPage /></ProtectedRoute>} />
                <Route path="/otros-adelantos" element={<Navigate to="/adelantos?tab=personal" replace />} />
                <Route path="/adelantos-personal" element={<Navigate to="/adelantos?tab=personal" replace />} />
                <Route path="/adelantos-receptoria" element={<Navigate to="/adelantos?tab=receptoria" replace />} />
                <Route path="/abonos-amortizaciones" element={<Navigate to="/adelantos?tab=amortizaciones" replace />} />
                <Route path="/historial-adelantos" element={<Navigate to="/adelantos?tab=historial" replace />} />

                {/* Reportes */}
                <Route path="/reportes" element={<ProtectedRoute requiredTabId="reportes"><ReportesPage /></ProtectedRoute>} />
                <Route path="/historial-bcv" element={<ProtectedRoute requiredTabId="historial-bcv" requiredTenantModule="MOD_HISTORIAL_BCV"><HistorialBcvPage /></ProtectedRoute>} />

                {/* Sistema & Mi Cuenta */}
                <Route path="/mi-cuenta" element={<ProtectedRoute requiredTabId="perfil"><MiCuentaPage /></ProtectedRoute>} />
                <Route path="/perfil" element={<ProtectedRoute requiredTabId="perfil"><MiCuentaPage defaultTab="perfil" /></ProtectedRoute>} />
                <Route path="/datos-bancarios" element={<ProtectedRoute requiredTabId="datos-bancarios"><MiCuentaPage defaultTab="banco" /></ProtectedRoute>} />
                <Route path="/perfil/banco" element={<ProtectedRoute requiredTabId="datos-bancarios"><MiCuentaPage defaultTab="banco" /></ProtectedRoute>} />
                <Route path="/tiempo-sesion" element={<ProtectedRoute requiredTabId="configuracion-sesion"><MiCuentaPage defaultTab="sesion" /></ProtectedRoute>} />
                <Route path="/data" element={<ProtectedRoute requiredTabId="data"><GestionDataPage /></ProtectedRoute>} />
                <Route path="/gestion-data" element={<ProtectedRoute requiredTabId="data"><GestionDataPage /></ProtectedRoute>} />
                <Route path="/usuarios" element={<ProtectedRoute requiredTabId="usuarios"><UsuariosPage /></ProtectedRoute>} />
                <Route path="/permisos" element={<ProtectedRoute requiredTabId="permisos"><PermisosPage /></ProtectedRoute>} />
                <Route path="/configuracion" element={<ProtectedRoute requiredTabId="configuracion-sistema"><ConfiguracionPage /></ProtectedRoute>} />
              </Route>

              <Route path="*" element={<HomeRedirect />} />
            </Routes>
          </Suspense>
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
