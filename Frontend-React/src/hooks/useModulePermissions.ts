import { useAuthStore } from '@/stores/authStore';

export interface ModulePermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isReadOnly: boolean;
}

/**
 * Hook RBAC 100% dinámico por módulo.
 * Evalúa contra TB_ROL_PERMISOS (user.permisos) las acciones VER, CREAR, EDITAR y ELIMINAR.
 */
export function useModulePermissions(modulo: string): ModulePermissions {
  const { hasActionPermission, isAdmin } = useAuthStore();
  const admin = isAdmin();
  const canView = admin || hasActionPermission(modulo, 'VER');
  const canCreate = admin || hasActionPermission(modulo, 'CREAR');
  const canEdit = admin || hasActionPermission(modulo, 'EDITAR');
  const canDelete = admin || hasActionPermission(modulo, 'ELIMINAR');

  return {
    canView,
    canCreate,
    canEdit,
    canDelete,
    isReadOnly: !canCreate && !canEdit && !canDelete,
  };
}
