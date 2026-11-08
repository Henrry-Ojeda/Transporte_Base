import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { LoginPage } from '@/modules/auth/LoginPage';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { SessionMonitor } from '@/components/common/SessionMonitor';
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

// Redirección inteligente de raíz: choferes y móviles siempre a /app
const HomeRedirect: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const rol = (user?.rol || '').toUpperCase();
  const tieneDispositivo = typeof window !== 'undefined' && Boolean(localStorage.getItem('movil_device_info'));
  if (rol === 'CHOFER' || tieneDispositivo) {
    return <Navigate to="/app" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SessionMonitor />
          <Routes>
          {/* Ruta Pública de Login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Terminal / App Móvil Offline para Conductores y Dispositivos Vinculados */}
          <Route path="/app" element={<AppMovilPage />} />
          <Route path="/movil" element={<Navigate to="/app" replace />} />

          {/* Rutas Protegidas dentro de MainLayout */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Redirección raíz según el rol */}
            <Route index element={<HomeRedirect />} />

            {/* Operaciones */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/rutas" element={<RecoleccionRutasPage />} />
            <Route path="/viajes" element={<ViajesTicketsPage />} />
            <Route path="/receptoria" element={<ReceptoriaPage />} />
            <Route path="/balance" element={<BalanceLechePage />} />
            <Route path="/evolucion-fincas" element={<EvolucionFincasPage />} />
            <Route path="/control-tanques" element={<ControlTanquesPage />} />
            <Route path="/planificacion-rutas" element={<RutasLogisticaPage />} />
            <Route path="/planificacion-rutas-choferes" element={<PlanificacionRutasChoferesPage />} />
            <Route path="/bufala" element={<BufalaPage />} />

            {/* Catálogos */}
            <Route path="/fincas" element={<FincasPage />} />
            <Route path="/propietarios" element={<PropietariosPage />} />
            <Route path="/conductores" element={<ConductoresPage />} />
            <Route path="/camiones" element={<CamionesPage />} />
            <Route path="/companias" element={<CompaniasPage />} />
            <Route path="/bancos" element={<BancosPage />} />
            <Route path="/empresa" element={<EmpresaPage />} />

            {/* Flota & Mantenimiento */}
            <Route path="/combustible" element={<CombustiblePage />} />
            <Route path="/mantenimiento" element={<MantenimientoPage />} />
            <Route path="/repuestos" element={<RepuestosPage />} />

            {/* Liquidación & Finanzas */}
            <Route path="/semanas" element={<SemanasPage />} />
            <Route path="/liquidaciones" element={<LiquidacionesPage />} />
            <Route path="/pagos-personal" element={<PagosPersonalPage />} />
            <Route path="/historial-pagos" element={<HistorialPagosPage />} />
            <Route path="/administracion" element={<AdministracionGeneralPage />} />

            {/* Adelantos */}
            <Route path="/adelantos-fincas" element={<AdelantosFincasPage />} />
            <Route path="/adelantos-personal" element={<AdelantosPersonalPage />} />
            <Route path="/abonos-companias" element={<AbonosCompaniasPage />} />
            <Route path="/adelantos-receptoria" element={<AdelantosReceptoriaPage />} />
            <Route path="/abonos-amortizaciones" element={<AbonosAmortizacionesPage />} />
            <Route path="/historial-adelantos" element={<HistorialAdelantosPage />} />

            {/* Reportes */}
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/historial-bcv" element={<HistorialBcvPage />} />

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
