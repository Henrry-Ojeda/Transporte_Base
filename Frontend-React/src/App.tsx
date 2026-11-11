import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import apiClient from '@/api/client';
import { updateAppIcon } from '@/utils/pwaIcons';

import { LoginPage } from '@/modules/auth/LoginPage';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { SessionMonitor } from '@/components/common/SessionMonitor';
import { TenantModuleMonitor } from '@/components/common/TenantModuleMonitor';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// Dashboard
import { DashboardPage } from '@/modules/dashboard/DashboardPage';

// Operaciones
import { RutasLogisticaPage } from '@/modules/operaciones/RutasLogisticaPage';
import { PlanificacionRutasChoferesPage } from '@/modules/operaciones/PlanificacionRutasChoferesPage';
import { RecoleccionRutasPage } from '@/modules/operaciones/RecoleccionRutasPage';
import { ViajesTicketsPage } from '@/modules/operaciones/ViajesTicketsPage';
import { ReceptoriaPage } from '@/modules/operaciones/ReceptoriaPage';
import { BalanceLechePage } from '@/modules/operaciones/BalanceLechePage';
import { PlanificacionRutasPage } from '@/modules/operaciones/PlanificacionRutasPage';
import { BufalaPage } from '@/modules/operaciones/BufalaPage';
import { EvolucionFincasPage } from '@/modules/operaciones/EvolucionFincasPage';
import { ControlTanquesPage } from '@/modules/operaciones/ControlTanquesPage';

// Catálogos
import { FincasPage } from '@/modules/catalogos/FincasPage';
import { PropietariosPage } from '@/modules/catalogos/PropietariosPage';
import { ConductoresPage } from '@/modules/catalogos/ConductoresPage';
import { CamionesPage } from '@/modules/catalogos/CamionesPage';
import { CompaniasPage } from '@/modules/catalogos/CompaniasPage';
import { BancosPage } from '@/modules/catalogos/BancosPage';
import { EmpresaPage } from '@/modules/catalogos/EmpresaPage';

// Flota & Mantenimiento
import { CombustiblePage } from '@/modules/combustible/CombustiblePage';
import { MantenimientoPage } from '@/modules/mantenimiento/MantenimientoPage';
import { RepuestosPage } from '@/modules/repuestos/RepuestosPage';

// Liquidación & Finanzas
import { SemanasPage } from '@/modules/finanzas/SemanasPage';
import { LiquidacionesPage } from '@/modules/finanzas/LiquidacionesPage';
import { PagosPersonalPage } from '@/modules/finanzas/PagosPersonalPage';
import { HistorialPagosPage } from '@/modules/finanzas/HistorialPagosPage';
import { AdministracionGeneralPage } from '@/modules/finanzas/AdministracionGeneralPage';

// Adelantos
import { AdelantosFincasPage } from '@/modules/finanzas/AdelantosFincasPage';
import { AdelantosPersonalPage } from '@/modules/finanzas/AdelantosPersonalPage';
import { AbonosCompaniasPage } from '@/modules/finanzas/AbonosCompaniasPage';
import { AdelantosReceptoriaPage } from '@/modules/finanzas/AdelantosReceptoriaPage';
import { AbonosAmortizacionesPage } from '@/modules/finanzas/AbonosAmortizacionesPage';
import { HistorialAdelantosPage } from '@/modules/finanzas/HistorialAdelantosPage';

// Sistema & Reportes
import { ReportesPage } from '@/modules/sistema/ReportesPage';
import { HistorialBcvPage } from '@/modules/sistema/HistorialBcvPage';
import { GestionDataPage } from '@/modules/data/GestionDataPage';
import { UsuariosPage } from '@/modules/sistema/UsuariosPage';
import { PerfilPage } from '@/modules/sistema/PerfilPage';
import { DatosBancariosPage } from '@/modules/sistema/DatosBancariosPage';
import { PermisosPage } from '@/modules/sistema/PermisosPage';
import { ConfiguracionPage } from '@/modules/sistema/ConfiguracionPage';
import { TiempoSesionPage } from '@/modules/sistema/TiempoSesionPage';
import { AppMovilPage } from '@/modules/movil/AppMovilPage';
import { setOnLogoutListener, useAuthStore } from '@/stores/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

// Limpiar todas las consultas en vuelo y caché al cerrar sesión
setOnLogoutListener(() => {
  queryClient.clear();
});

// Redirección de seguridad si se accede a la UI desde un dominio de backend DuckDNS
if (typeof window !== 'undefined') {
  const currentHost = window.location.hostname.toLowerCase();
  if (currentHost.includes('queseracampoverde.duckdns.org')) {
    window.location.replace(`https://lacteos-campoverde.vercel.app${window.location.pathname}${window.location.search}`);
  } else if (currentHost.includes('transportevc.duckdns.org')) {
    window.location.replace(`https://transporte-vergel-carrillo.vercel.app${window.location.pathname}${window.location.search}`);
  }
}

// Redirección inteligente de raíz: choferes y móviles siempre a /app directamente sin pasar por login
const HomeRedirect: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const rol = (user?.rol || '').toUpperCase();

  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const isCampoVerde = host.includes('campoverde');
  const isVergel = host.includes('vergel');

  let tieneDispositivoValido = false;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('movil_device_info');
      if (raw) {
        const d = JSON.parse(raw);
        const dIsVergel = (d.empresaCodigo || '').includes('VERGEL') || (d.empresaNombre || '').toLowerCase().includes('vergel');
        const dIsCampo = (d.empresaCodigo || '').includes('CAMPO') || (d.empresaNombre || '').toLowerCase().includes('campo');
        if (isCampoVerde && dIsVergel) {
          tieneDispositivoValido = false;
        } else if (isVergel && dIsCampo) {
          tieneDispositivoValido = false;
        } else {
          tieneDispositivoValido = true;
        }
      }
    } catch {
      tieneDispositivoValido = false;
    }
  }

  // Si el usuario en sesión es de otra empresa, forzar logout inmediato para no mezclar datos
  if (isAuthenticated && user) {
    const userCod = ((user as any)?.empresaCodigo || '').toUpperCase();
    if ((isCampoVerde && userCod.includes('VERGEL')) || (isVergel && userCod.includes('CAMPO'))) {
      useAuthStore.getState().logout();
      return <Navigate to="/login" replace />;
    }
  }

  const isMobileDevice = typeof window !== 'undefined' && (
    window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );

  if (rol === 'CHOFER' || tieneDispositivoValido || (!isAuthenticated && isMobileDevice)) {
    return <Navigate to="/movil" replace />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

// Componente global para sincronizar el logo de la empresa como icono de la app (PWA, Favicon y Móvil)
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
          <Routes>
          {/* Redirección raíz autónoma: choferes y móviles van a /movil directamente (resiliente offline) */}
          <Route index element={<HomeRedirect />} />

          {/* Ruta Pública de Login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Terminal / App Móvil Offline para Conductores y Dispositivos Vinculados */}
          <Route path="/movil" element={<AppMovilPage />} />
          <Route path="/app" element={<AppMovilPage />} />

          {/* Rutas Protegidas dentro de MainLayout */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Operaciones */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/rutas" element={<RecoleccionRutasPage />} />
            <Route path="/viajes" element={<ViajesTicketsPage />} />
            <Route path="/receptoria" element={<ReceptoriaPage />} />
            <Route path="/balance" element={<BalanceLechePage />} />
            <Route path="/evolucion-fincas" element={<EvolucionFincasPage />} />
            <Route path="/control-tanques" element={<ProtectedRoute requiredTenantModule="MOD_CONTROL_TANQUES"><ControlTanquesPage /></ProtectedRoute>} />
            <Route path="/planificacion-rutas" element={<ProtectedRoute requiredTenantModule="MOD_LOGISTICA_RUTAS"><RutasLogisticaPage /></ProtectedRoute>} />
            <Route path="/planificacion-rutas-choferes" element={<ProtectedRoute requiredTenantModule="MOD_LOGISTICA_RUTAS"><PlanificacionRutasChoferesPage /></ProtectedRoute>} />
            <Route path="/bufala" element={<ProtectedRoute requiredTenantModule="MOD_LECHE_BUFALA"><BufalaPage /></ProtectedRoute>} />

            {/* Catálogos */}
            <Route path="/fincas" element={<FincasPage />} />
            <Route path="/propietarios" element={<PropietariosPage />} />
            <Route path="/conductores" element={<ConductoresPage />} />
            <Route path="/camiones" element={<CamionesPage />} />
            <Route path="/companias" element={<CompaniasPage />} />
            <Route path="/bancos" element={<BancosPage />} />
            <Route path="/empresa" element={<EmpresaPage />} />

            {/* Flota & Mantenimiento */}
            <Route path="/combustible" element={<ProtectedRoute requiredTenantModule="MOD_COMBUSTIBLE"><CombustiblePage /></ProtectedRoute>} />
            <Route path="/mantenimiento" element={<ProtectedRoute requiredTenantModule="MOD_MANTENIMIENTO"><MantenimientoPage /></ProtectedRoute>} />
            <Route path="/repuestos" element={<ProtectedRoute requiredTenantModule="MOD_REPUESTOS"><RepuestosPage /></ProtectedRoute>} />

            {/* Liquidación & Finanzas */}
            <Route path="/semanas" element={<ProtectedRoute requiredTenantModule="MOD_LIQUIDACIONES"><SemanasPage /></ProtectedRoute>} />
            <Route path="/liquidaciones" element={<ProtectedRoute requiredTenantModule="MOD_LIQUIDACIONES"><LiquidacionesPage /></ProtectedRoute>} />
            <Route path="/pagos-personal" element={<ProtectedRoute requiredTenantModule="MOD_PAGOS_PERSONAL"><PagosPersonalPage /></ProtectedRoute>} />
            <Route path="/historial-pagos" element={<ProtectedRoute requiredTenantModule="MOD_LIQUIDACIONES"><HistorialPagosPage /></ProtectedRoute>} />
            <Route path="/administracion" element={<AdministracionGeneralPage />} />

            {/* Adelantos */}
            <Route path="/adelantos-fincas" element={<ProtectedRoute requiredTenantModule="MOD_LIQUIDACIONES"><AdelantosFincasPage /></ProtectedRoute>} />
            <Route path="/adelantos-personal" element={<ProtectedRoute requiredTenantModule="MOD_LIQUIDACIONES"><AdelantosPersonalPage /></ProtectedRoute>} />
            <Route path="/abonos-companias" element={<AbonosCompaniasPage />} />
            <Route path="/adelantos-receptoria" element={<AdelantosReceptoriaPage />} />
            <Route path="/abonos-amortizaciones" element={<AbonosAmortizacionesPage />} />
            <Route path="/historial-adelantos" element={<ProtectedRoute requiredTenantModule="MOD_LIQUIDACIONES"><HistorialAdelantosPage /></ProtectedRoute>} />

            {/* Reportes */}
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/historial-bcv" element={<ProtectedRoute requiredTenantModule="MOD_HISTORIAL_BCV"><HistorialBcvPage /></ProtectedRoute>} />

            {/* Sistema */}
            <Route path="/perfil" element={<PerfilPage />} />
            <Route path="/datos-bancarios" element={<DatosBancariosPage />} />
            <Route path="/perfil/banco" element={<DatosBancariosPage />} />
            <Route path="/data" element={<GestionDataPage />} />
            <Route path="/gestion-data" element={<GestionDataPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/permisos" element={<PermisosPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
            <Route path="/tiempo-sesion" element={<TiempoSesionPage />} />
          </Route>

          {/* Ruta no encontrada */}
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;
