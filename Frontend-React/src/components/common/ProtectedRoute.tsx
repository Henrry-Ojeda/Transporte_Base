import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  requiredPermission?: string;
  requiredTenantModule?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredTenantModule,
}) => {
  const { isAuthenticated, hasPermission, hasTenantModule } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredTenantModule && !hasTenantModule(requiredTenantModule)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-2xl mb-4 font-bold">
          <i className="fa-solid fa-lock"></i>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Módulo No Contratado</h2>
        <p className="text-sm text-slate-600 max-w-md mb-4 leading-relaxed">
          El módulo <code className="font-mono bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-amber-800 font-semibold">{requiredTenantModule}</code> no está activo en el plan de su empresa.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
        >
          <i className="fa-solid fa-arrow-left"></i>
          Volver al Inicio
        </Link>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-2xl mb-4 font-bold">
          403
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Acceso No Autorizado</h2>
        <p className="text-sm text-slate-500 max-w-md">
          Tu rol no tiene los permisos requeridos (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-rose-600">{requiredPermission}</code>) para acceder a este módulo.
        </p>
      </div>
    );
  }

  return children ? <>{children}</> : null;
};

export default ProtectedRoute;

