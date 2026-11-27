import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { sistemaApi } from '@/api/sistema.api';
import { useAuthStore } from '@/stores/authStore';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import type {
  MatrizSeguridadCompletaDto,
  PermisoRbacDto,
  RolDto,
  CrearRolDto,
} from '@/types';

const ACCIONES_ESTANDAR = {
  VER: ['VER'],
  CREAR: ['CREAR', 'AGREGAR'],
  EDITAR: ['EDITAR'],
  ELIMINAR: ['ELIMINAR'],
};

const esAccionEnGrupo = (accion: string, grupo: string[]) =>
  grupo.includes(String(accion || '').trim().toUpperCase());

export const PermisosPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin, isAdmin } = useAuthStore();
  const esSuperAdmin = isSuperAdmin();
  const esAdmin = isAdmin();
  const puedeGestionarRoles = esAdmin || esSuperAdmin;

  // Pestaña activa: 'matriz' | 'roles' | 'metricas'
  const [tabActiva, setTabActiva] = useState<'matriz' | 'roles' | 'metricas'>('matriz');

  // Rol activo seleccionado por ID (100% dinámico desde BD)
  const [rolActivoId, setRolActivoId] = useState<number | null>(null);
  const [busquedaModulo, setBusquedaModulo] = useState<string>('');

  // Estados modal Rol (Crear / Editar)
  const [modalRolAbierto, setModalRolAbierto] = useState(false);
  const [rolEditarId, setRolEditarId] = useState<number | null>(null);
  const [formRol, setFormRol] = useState<CrearRolDto>({
    codigo: '',
    nombre: '',
    descripcion: '',
    activo: true,
  });

  // Query: Roles del sistema (TB_ROLES)
  const { data: roles = [], isLoading: cargandoRoles, refetch: refetchRoles } = useQuery<RolDto[]>({
    queryKey: ['roles-sistema'],
    queryFn: () => sistemaApi.getRoles(false),
  });

  // Query: Matriz completa RBAC (TB_ROLES + TB_MODULOS + TB_PERMISOS + TB_ROL_PERMISOS)
  const {
    data: matrizData,
    isLoading: cargandoMatriz,
    refetch: refetchPermisos,
  } = useQuery<MatrizSeguridadCompletaDto>({
    queryKey: ['permisos-matriz'],
    queryFn: () => sistemaApi.getMatrizPermisos(),
  });

  // Query: Widgets / Secciones de Métricas del Dashboard (TB_DASHBOARD_WIDGETS)
  const { data: widgetsDashboard = [], isLoading: cargandoWidgets } = useQuery<any[]>({
    queryKey: ['dashboard-widgets-config'],
    queryFn: () => sistemaApi.getWidgetsDashboard(false),
    enabled: esAdmin,
  });

  // Roles visibles (solo un SUPERADMIN real ve el rol SUPERADMIN; para ADMIN queda oculto)
  const rolesDisponibles = useMemo(() => {
    const base = roles.length > 0 ? roles : matrizData?.roles || [];
    if (!esSuperAdmin) {
      return base.filter((r) => {
        const cod = String(r.codigo || '').toUpperCase();
        return cod !== 'SUPERADMIN' && cod !== 'SUPER_ADMIN';
      });
    }
    return base;
  }, [roles, matrizData?.roles, esSuperAdmin]);

  // Auto-seleccionar un rol editable cuando cargan los roles
  useEffect(() => {
    if (rolesDisponibles.length === 0) return;
    const existeActual = rolesDisponibles.some((r) => r.id === rolActivoId);
    if (!existeActual) {
      const primerEditable = rolesDisponibles.find(
        (r) => !['ADMIN', 'SUPERADMIN', 'SUPER_ADMIN'].includes(String(r.codigo || '').toUpperCase())
      );
      setRolActivoId((primerEditable || rolesDisponibles[0]).id);
    }
  }, [rolesDisponibles, rolActivoId]);

  const rolSeleccionado = useMemo(
    () => rolesDisponibles.find((r) => r.id === rolActivoId) || null,
    [rolesDisponibles, rolActivoId]
  );

  const esRolPrivilegiado = useMemo(() => {
    const cod = String(rolSeleccionado?.codigo || '').toUpperCase();
    return cod === 'ADMIN' || cod === 'SUPERADMIN' || cod === 'SUPER_ADMIN';
  }, [rolSeleccionado]);

  // Set de IDs de permisos concedidos al rol seleccionado
  const permisosConcedidosSet = useMemo(() => {
    if (!rolSeleccionado || !matrizData?.matrizPorRol) return new Set<number>();
    const entrada = matrizData.matrizPorRol.find((m) => m.rolId === rolSeleccionado.id);
    return new Set<number>(entrada?.permisosAsignadosIds || []);
  }, [rolSeleccionado, matrizData?.matrizPorRol]);

  // Agrupar permisos por módulo (100% desde TB_MODULOS y TB_PERMISOS)
  const modulosConPermisos = useMemo(() => {
    const modulos = matrizData?.modulos || [];
    const permisos = matrizData?.permisos || [];
    const termino = busquedaModulo.trim().toLowerCase();

    return modulos
      .map((mod) => {
        const permsMod = permisos.filter((p) => p.moduloId === mod.id);
        const permVer = permsMod.find((p) => esAccionEnGrupo(p.accion, ACCIONES_ESTANDAR.VER));
        const permCrear = permsMod.find((p) => esAccionEnGrupo(p.accion, ACCIONES_ESTANDAR.CREAR));
        const permEditar = permsMod.find((p) => esAccionEnGrupo(p.accion, ACCIONES_ESTANDAR.EDITAR));
        const permEliminar = permsMod.find((p) => esAccionEnGrupo(p.accion, ACCIONES_ESTANDAR.ELIMINAR));
        const usadosIds = new Set(
          [permVer?.id, permCrear?.id, permEditar?.id, permEliminar?.id].filter(Boolean) as number[]
        );
        const otrasAcciones = permsMod.filter((p) => !usadosIds.has(p.id));

        return {
          modulo: mod,
          todosPermisos: permsMod,
          permVer,
          permCrear,
          permEditar,
          permEliminar,
          otrasAcciones,
        };
      })
      .filter((item) => {
        if (item.todosPermisos.length === 0) return false;
        if (!termino) return true;
        return (
          item.modulo.nombre.toLowerCase().includes(termino) ||
          item.modulo.codigo.toLowerCase().includes(termino) ||
          item.todosPermisos.some(
            (p) =>
              p.nombre.toLowerCase().includes(termino) ||
              p.codigo.toLowerCase().includes(termino) ||
              p.accion.toLowerCase().includes(termino)
          )
        );
      });
  }, [matrizData?.modulos, matrizData?.permisos, busquedaModulo]);

  const toggleWidgetMutation = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      sistemaApi.toggleWidgetDashboard(id, activo),
    onSuccess: (res) => {
      toast.success(res?.message || 'Configuración de métricas actualizada');
      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets-config'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets-visibles'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar configuración de métricas');
    },
  });

  // Mutación: Toggle de un permiso atómico real (POST /api/permisos/matriz/toggle) con actualización optimista
  const toggleMutation = useMutation({
    mutationFn: ({
      rolId,
      permisoId,
      concedido,
    }: {
      rolId: number;
      permisoId: number;
      concedido: boolean;
    }) => sistemaApi.toggleRolPermiso(rolId, permisoId, concedido),
    onMutate: async ({ rolId, permisoId, concedido }) => {
      await queryClient.cancelQueries({ queryKey: ['permisos-matriz'] });
      const prev = queryClient.getQueryData<MatrizSeguridadCompletaDto>(['permisos-matriz']);
      if (prev) {
        const nextMatriz = prev.matrizPorRol.map((m) => {
          if (m.rolId !== rolId) return m;
          const set = new Set(m.permisosAsignadosIds);
          if (concedido) set.add(permisoId);
          else set.delete(permisoId);
          return { ...m, permisosAsignadosIds: Array.from(set) };
        });
        queryClient.setQueryData<MatrizSeguridadCompletaDto>(['permisos-matriz'], {
          ...prev,
          matrizPorRol: nextMatriz,
        });
      }
      return { prev };
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Permiso actualizado correctamente');
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['permisos-matriz'], ctx.prev);
      }
      toast.error(err.response?.data?.message || 'Error al actualizar permiso');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['permisos-matriz'] });
    },
  });

  // Mutación: Guardar bloque de permisos para un rol (ej. Todo/Nada por módulo)
  const guardarBloqueMutation = useMutation({
    mutationFn: ({ rolId, permisosIds }: { rolId: number; permisosIds: number[] }) =>
      sistemaApi.guardarRolPermisos(rolId, permisosIds),
    onSuccess: (res) => {
      toast.success(res?.message || 'Permisos del módulo actualizados');
      queryClient.invalidateQueries({ queryKey: ['permisos-matriz'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar permisos del módulo');
    },
  });

  const handleToggleModuloCompleto = (permisosDelModulo: PermisoRbacDto[], activarTodos: boolean) => {
    if (!rolSeleccionado || esRolPrivilegiado) return;
    const nextSet = new Set<number>(permisosConcedidosSet);
    permisosDelModulo.forEach((p) => {
      if (activarTodos) nextSet.add(p.id);
      else nextSet.delete(p.id);
    });
    guardarBloqueMutation.mutate({
      rolId: rolSeleccionado.id,
      permisosIds: Array.from(nextSet),
    });
  };

  // Mutación: Guardar Rol (Crear / Editar)
  const guardarRolMutation = useMutation({
    mutationFn: (data: CrearRolDto) => {
      if (rolEditarId) {
        return sistemaApi.actualizarRol(rolEditarId, data);
      }
      return sistemaApi.crearRol(data);
    },
    onSuccess: () => {
      toast.success(rolEditarId ? 'Rol actualizado exitosamente' : 'Nuevo rol registrado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['roles-sistema'] });
      queryClient.invalidateQueries({ queryKey: ['permisos-matriz'] });
      cerrarModalRol();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar el rol');
    },
  });

  // Mutación: Eliminar Rol
  const eliminarRolMutation = useMutation({
    mutationFn: (id: number) => sistemaApi.eliminarRol(id),
    onSuccess: () => {
      toast.success('Rol eliminado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['roles-sistema'] });
      queryClient.invalidateQueries({ queryKey: ['permisos-matriz'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al eliminar rol');
    },
  });

  // Handlers para el CRUD de Roles
  const abrirModalCrearRol = () => {
    setRolEditarId(null);
    setFormRol({
      codigo: '',
      nombre: '',
      descripcion: '',
      activo: true,
    });
    setModalRolAbierto(true);
  };

  const abrirModalEditarRol = (rol: RolDto) => {
    setRolEditarId(rol.id);
    setFormRol({
      codigo: rol.codigo,
      nombre: rol.nombre,
      descripcion: rol.descripcion || '',
      activo: rol.activo !== false,
    });
    setModalRolAbierto(true);
  };

  const cerrarModalRol = () => {
    setModalRolAbierto(false);
    setRolEditarId(null);
  };

  const handleEliminarRol = (rol: RolDto) => {
    const rolesCore = ['ADMIN', 'SUPERADMIN', 'SUPER_ADMIN', 'CHOFER'];
    if (rolesCore.includes(rol.codigo.toUpperCase())) {
      Swal.fire({
        icon: 'warning',
        title: 'Rol protegido',
        text: `El rol "${rol.codigo}" es vital para el funcionamiento del sistema y no puede ser eliminado.`,
      });
      return;
    }

    if ((rol.usuariosCount || 0) > 0) {
      Swal.fire({
        icon: 'error',
        title: 'No se puede eliminar',
        text: `El rol "${rol.nombre}" tiene ${rol.usuariosCount} usuario(s) asignado(s). Debe reasignar los usuarios antes de eliminarlo.`,
      });
      return;
    }

    Swal.fire({
      title: `¿Eliminar rol ${rol.nombre}?`,
      text: 'Esta acción eliminará también sus permisos asignados y no se puede deshacer.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then((res) => {
      if (res.isConfirmed) {
        eliminarRolMutation.mutate(rol.id);
      }
    });
  };

  const handleSubmitRol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRol.codigo.trim() || !formRol.nombre.trim()) {
      toast.error('El código y el nombre del rol son obligatorios');
      return;
    }
    guardarRolMutation.mutate({
      ...formRol,
      codigo: formRol.codigo.trim().toUpperCase(),
    });
  };

  // Helper para renderizar checkbox de una acción estándar
  const renderCheckboxAccion = (permiso?: PermisoRbacDto) => {
    if (!permiso) {
      return (
        <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }} title="Acción no definida para este módulo">
          —
        </span>
      );
    }

    const checked = esRolPrivilegiado || permisosConcedidosSet.has(permiso.id);
    const disabled = esRolPrivilegiado || !rolSeleccionado;

    return (
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        title={`${permiso.nombre} (${permiso.codigo})`}
        onChange={(e) => {
          if (!rolSeleccionado) return;
          toggleMutation.mutate({
            rolId: rolSeleccionado.id,
            permisoId: permiso.id,
            concedido: e.target.checked,
          });
        }}
        style={{
          width: '18px',
          height: '18px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          accentColor: '#2563eb',
        }}
      />
    );
  };

  // Columnas de la tabla de Roles (DataTable - Regla Maestra 2)
  const columnsRoles: ColumnDef<RolDto>[] = [
    {
      header: 'CÓDIGO',
      accessorKey: 'codigo',
      sortable: true,
      cell: (row) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 800,
            fontSize: '12.5px',
            color: '#1e40af',
            background: '#eff6ff',
            padding: '3px 8px',
            borderRadius: '6px',
            border: '1px solid #bfdbfe',
          }}
        >
          {row.codigo}
        </span>
      ),
    },
    {
      header: 'NOMBRE DEL ROL',
      accessorKey: 'nombre',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i
            className={`fa-solid ${
              row.codigo === 'SUPERADMIN'
                ? 'fa-crown text-amber-500'
                : row.codigo === 'ADMIN'
                ? 'fa-user-shield text-blue-600'
                : 'fa-user-gear text-slate-500'
            }`}
          ></i>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.nombre}</span>
        </div>
      ),
    },
    {
      header: 'DESCRIPCIÓN',
      accessorKey: 'descripcion',
      cell: (row) => (
        <span style={{ color: '#64748b', fontSize: '12px' }}>{row.descripcion || 'Sin descripción'}</span>
      ),
    },
    {
      header: 'USUARIOS',
      accessorKey: 'usuariosCount',
      sortable: true,
      cell: (row) => (
        <span
          style={{
            fontWeight: 700,
            fontSize: '12px',
            color: (row.usuariosCount || 0) > 0 ? '#0f172a' : '#94a3b8',
            background: (row.usuariosCount || 0) > 0 ? '#f1f5f9' : '#fafafa',
            padding: '2px 8px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
          }}
        >
          <i className="fa-regular fa-user" style={{ marginRight: '4px', fontSize: '10px' }}></i>
          {row.usuariosCount || 0} asignado(s)
        </span>
      ),
    },
    {
      header: 'ESTADO',
      accessorKey: 'activo',
      sortable: true,
      cell: (row) =>
        row.activo !== false ? (
          <span
            className="badge"
            style={{
              background: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0',
              fontWeight: 700,
            }}
          >
            <i className="fa-solid fa-check" style={{ marginRight: '4px' }}></i>
            Activo
          </span>
        ) : (
          <span
            className="badge"
            style={{
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              fontWeight: 700,
            }}
          >
            Inactivo
          </span>
        ),
    },
    {
      header: 'ACCIONES',
      cell: (row) => {
        const esCore = ['SUPERADMIN', 'SUPER_ADMIN', 'ADMIN', 'CHOFER'].includes(row.codigo.toUpperCase());
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setRolActivoId(row.id);
                setTabActiva('matriz');
              }}
              className="btn btn-outline"
              title="Configurar permisos de este rol"
              style={{
                padding: '4px 10px',
                height: '30px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#0284c7',
                borderColor: '#bae6fd',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <i className="fa-solid fa-key"></i> Permisos
            </button>
            <button
              type="button"
              onClick={() => abrirModalEditarRol(row)}
              className="btn btn-outline"
              title="Editar rol"
              style={{
                padding: '4px 10px',
                height: '30px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#2563eb',
                borderColor: '#bfdbfe',
              }}
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
            {!esCore && (
              <button
                type="button"
                onClick={() => handleEliminarRol(row)}
                className="btn btn-outline"
                title="Eliminar rol"
                style={{
                  padding: '4px 10px',
                  height: '30px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#dc2626',
                  borderColor: '#fecaca',
                }}
              >
                <i className="fa-solid fa-trash-can"></i>
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* VISTA HEADER 1:1 */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <i className="fa-solid fa-shield-halved" style={{ color: '#0284c7', marginRight: '8px' }}></i>
            Seguridad, Permisos & Perfiles
          </h1>
          <p className="view-subtitle">
            Control dinámico de roles y matriz de permisos por módulo desde base de datos
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', gap: '10px' }}>
          {puedeGestionarRoles && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={abrirModalCrearRol}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
              }}
            >
              <i className="fa-solid fa-plus"></i> Nuevo Rol
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              refetchRoles();
              refetchPermisos();
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
          >
            <i className="fa-solid fa-arrows-rotate"></i> Recargar
          </button>
        </div>
      </div>

      {/* PESTAÑAS PRINCIPALES: MATRIZ vs GESTIÓN DE ROLES vs MÉTRICAS */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1.5px solid #e2e8f0', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setTabActiva('matriz')}
          style={{
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            border: 'none',
            background: 'none',
            borderBottom: tabActiva === 'matriz' ? '3px solid #2563eb' : '3px solid transparent',
            color: tabActiva === 'matriz' ? '#1d4ed8' : '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <i className="fa-solid fa-table-cells"></i> Matriz de Permisos
        </button>

        {puedeGestionarRoles && (
          <button
            type="button"
            onClick={() => setTabActiva('roles')}
            style={{
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              borderBottom: tabActiva === 'roles' ? '3px solid #2563eb' : '3px solid transparent',
              color: tabActiva === 'roles' ? '#1d4ed8' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            <i className="fa-solid fa-users-gear text-blue-600"></i> Gestión de Roles
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#1e40af',
                background: '#dbeafe',
                padding: '1px 7px',
                borderRadius: '999px',
              }}
            >
              {rolesDisponibles.length}
            </span>
          </button>
        )}

        {esAdmin && (
          <button
            type="button"
            onClick={() => setTabActiva('metricas')}
            style={{
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              borderBottom: tabActiva === 'metricas' ? '3px solid #2563eb' : '3px solid transparent',
              color: tabActiva === 'metricas' ? '#1d4ed8' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            <i className="fa-solid fa-chart-column text-emerald-600"></i> Métricas Dashboard
          </button>
        )}
      </div>

      {/* CONTENIDO 1: MATRIZ DE PERMISOS */}
      {tabActiva === 'matriz' && (
        <>
          {/* SELECTOR DE ROL (PILLS 100% DINÁMICOS DESDE TB_ROLES) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {rolesDisponibles.map((rol) => {
                const activo = rolSeleccionado?.id === rol.id;
                const cod = String(rol.codigo || '').toUpperCase();
                return (
                  <button
                    key={rol.id}
                    type="button"
                    onClick={() => setRolActivoId(rol.id)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      border: activo ? 'none' : '1.5px solid #cbd5e1',
                      background: activo ? 'linear-gradient(135deg, #0284c7, #2563eb)' : '#ffffff',
                      color: activo ? '#ffffff' : '#475569',
                      boxShadow: activo ? '0 4px 12px rgba(37,99,235,0.3)' : 'none',
                      transition: 'all 0.2s',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i
                      className={`fa-solid ${
                        cod === 'SUPERADMIN'
                          ? 'fa-crown'
                          : cod === 'ADMIN'
                          ? 'fa-user-shield'
                          : 'fa-user-gear'
                      }`}
                    ></i>
                    {rol.nombre || rol.codigo}
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative', minWidth: '240px' }}>
              <i
                className="fa-solid fa-magnifying-glass"
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  fontSize: '13px',
                }}
              ></i>
              <input
                type="text"
                className="form-input"
                placeholder="Filtrar módulo o permiso..."
                value={busquedaModulo}
                onChange={(e) => setBusquedaModulo(e.target.value)}
                style={{ width: '100%', height: '38px', paddingLeft: '34px', fontSize: '13px' }}
              />
            </div>
          </div>

          {esRolPrivilegiado && rolSeleccionado && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1e40af',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <i className="fa-solid fa-circle-info"></i>
              <span>
                El rol <strong>{rolSeleccionado.nombre} ({rolSeleccionado.codigo})</strong> tiene acceso administrativo completo por defecto. Seleccione otro rol para personalizar permisos.
              </span>
            </div>
          )}

          {/* TABLA MATRIZ DINÁMICA */}
          <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
            {cargandoMatriz || cargandoRoles ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando matriz de seguridad desde base de datos...
              </div>
            ) : modulosConPermisos.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                No se encontraron módulos o permisos coincidentes.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Módulo del Sistema</th>
                      <th style={{ textAlign: 'center', width: '95px' }}>Puede Ver</th>
                      <th style={{ textAlign: 'center', width: '105px' }}>Puede Crear</th>
                      <th style={{ textAlign: 'center', width: '105px' }}>Puede Editar</th>
                      <th style={{ textAlign: 'center', width: '115px' }}>Puede Eliminar</th>
                      <th style={{ minWidth: '210px' }}>Otras Acciones</th>
                      <th style={{ textAlign: 'center', width: '110px' }}>Módulo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modulosConPermisos.map(
                      ({ modulo, todosPermisos, permVer, permCrear, permEditar, permEliminar, otrasAcciones }) => {
                        const todosMarcados =
                          esRolPrivilegiado ||
                          (todosPermisos.length > 0 && todosPermisos.every((p) => permisosConcedidosSet.has(p.id)));

                        return (
                          <tr key={modulo.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '13px',
                                    flexShrink: 0,
                                  }}
                                >
                                  <i className={`fa-solid ${modulo.icono || 'fa-cube'}`}></i>
                                </div>
                                <div>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{modulo.nombre}</div>
                                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                                    COD: {modulo.codigo}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td style={{ textAlign: 'center' }}>{renderCheckboxAccion(permVer)}</td>
                            <td style={{ textAlign: 'center' }}>{renderCheckboxAccion(permCrear)}</td>
                            <td style={{ textAlign: 'center' }}>{renderCheckboxAccion(permEditar)}</td>
                            <td style={{ textAlign: 'center' }}>{renderCheckboxAccion(permEliminar)}</td>

                            <td>
                              {otrasAcciones.length === 0 ? (
                                <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {otrasAcciones.map((p) => {
                                    const activo = esRolPrivilegiado || permisosConcedidosSet.has(p.id);
                                    return (
                                      <label
                                        key={p.id}
                                        title={`${p.nombre} (${p.codigo})`}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '5px',
                                          padding: '3px 8px',
                                          borderRadius: '8px',
                                          fontSize: '11.5px',
                                          fontWeight: 700,
                                          cursor: esRolPrivilegiado ? 'not-allowed' : 'pointer',
                                          background: activo ? '#dbeafe' : '#f1f5f9',
                                          color: activo ? '#1d4ed8' : '#475569',
                                          border: activo ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={activo}
                                          disabled={esRolPrivilegiado || !rolSeleccionado}
                                          onChange={(e) => {
                                            if (!rolSeleccionado) return;
                                            toggleMutation.mutate({
                                              rolId: rolSeleccionado.id,
                                              permisoId: p.id,
                                              concedido: e.target.checked,
                                            });
                                          }}
                                          style={{ width: '13px', height: '13px', accentColor: '#2563eb' }}
                                        />
                                        <span>{p.nombre || p.accion}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                disabled={esRolPrivilegiado || guardarBloqueMutation.isPending}
                                onClick={() => handleToggleModuloCompleto(todosPermisos, !todosMarcados)}
                                className="btn btn-outline"
                                style={{
                                  padding: '3px 9px',
                                  height: '28px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: todosMarcados ? '#dc2626' : '#059669',
                                  borderColor: todosMarcados ? '#fecaca' : '#a7f3d0',
                                  opacity: esRolPrivilegiado ? 0.45 : 1,
                                  cursor: esRolPrivilegiado ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {todosMarcados ? 'Quitar todo' : 'Marcar todo'}
                              </button>
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* CONTENIDO 2: GESTIÓN DE ROLES CRUD (DataTable - Regla Maestra 2) */}
      {tabActiva === 'roles' && puedeGestionarRoles && (
        <div>
          <DataTable
            data={rolesDisponibles}
            columns={columnsRoles}
            isLoading={cargandoRoles}
            searchPlaceholder="Buscar rol por código, nombre o descripción..."
            exportFileName="Catalogo_Roles_Sistema"
          />
        </div>
      )}

      {/* CONTENIDO 3: CONFIGURACIÓN DE MÉTRICAS DEL DASHBOARD (TB_DASHBOARD_WIDGETS) */}
      {tabActiva === 'metricas' && esAdmin && (
        <div className="content-card" style={{ padding: '22px' }}>
          <div style={{ marginBottom: '18px', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-sliders text-blue-600"></i>
              <span>Visibilidad de Bloques en el Dashboard</span>
            </h3>
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              Activa o desactiva cada una de las 4 secciones que se muestran en el Tablero Principal. Los cambios se aplican al instante.
            </p>
          </div>

          {cargandoWidgets ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
              <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando configuración de métricas...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {widgetsDashboard
                .filter((w) => String(w.tipoWidget || '').toUpperCase() === 'SECCION_METRICAS')
                .map((w) => {
                  const activo = w.activo !== false;
                  const textosLimpios: Record<string, { titulo: string; subtitulo: string }> = {
                    DASHBOARD_METRICAS_RUTA: {
                      titulo: '1. Métricas de Servicio de Ruta',
                      subtitulo: 'Recolección en fincas de ruta, entradas a silos, stock, despachos y merma de ruta.',
                    },
                    DASHBOARD_METRICAS_TRANSPORTE: {
                      titulo: '2. Métricas de Servicio de Transporte',
                      subtitulo: 'Recolección transporte, entrega directa a planta, custodia en silos y merma transporte.',
                    },
                    DASHBOARD_METRICAS_CONSOLIDADO: {
                      titulo: '3. Consolidado General (Ruta + Transporte)',
                      subtitulo: 'Total recolectado, entradas a silos, stock en tanques, total despachado y merma consolidada.',
                    },
                    DASHBOARD_GRAFICOS: {
                      titulo: '4. Tablero de Gráficos y Tendencia',
                      subtitulo: 'Tendencia operativa histórica, desempeño por chofer, distribución por servicio, destino y leche ácida.',
                    },
                  };
                  const info = textosLimpios[String(w.codigo || '').toUpperCase()] || {
                    titulo: w.titulo,
                    subtitulo: w.subtitulo || '',
                  };

                  return (
                    <div
                      key={w.id}
                      onClick={() => !toggleWidgetMutation.isPending && toggleWidgetMutation.mutate({ id: w.id, activo: !activo })}
                      style={{
                        border: activo ? '1.5px solid #10b981' : '1.5px solid #cbd5e1',
                        background: activo ? '#f0fdf4' : '#f8fafc',
                        borderRadius: '14px',
                        padding: '16px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '10px',
                              background: activo ? '#dcfce7' : '#e2e8f0',
                              color: activo ? '#15803d' : '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '16px',
                              flexShrink: 0,
                            }}
                          >
                            <i className={`fa-solid ${w.icono || 'fa-chart-pie'}`}></i>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', lineHeight: 1.3 }}>
                            {info.titulo}
                          </div>
                        </div>

                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 11px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 800,
                            letterSpacing: '0.03em',
                            background: activo ? '#10b981' : '#e2e8f0',
                            color: activo ? '#ffffff' : '#475569',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <i className={`fa-solid ${activo ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                          {activo ? 'Visible' : 'Oculto'}
                        </span>
                      </div>

                      {info.subtitulo && (
                        <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', lineHeight: 1.45, paddingLeft: '52px' }}>
                          {info.subtitulo}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* MODAL CREAR / EDITAR ROL */}
      {modalRolAbierto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            {/* Header Modal */}
            <div
              style={{
                padding: '16px 20px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                  }}
                >
                  <i className="fa-solid fa-user-shield"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    {rolEditarId ? 'Editar Perfil / Rol' : 'Crear Nuevo Rol'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b' }}>
                    Gestión dinámica de roles y perfiles de acceso
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={cerrarModalRol}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmitRol} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Código del Rol (Mayúsculas, sin espacios) *
                </label>
                <input
                  type="text"
                  value={formRol.codigo}
                  disabled={Boolean(rolEditarId)}
                  onChange={(e) => setFormRol({ ...formRol, codigo: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                  placeholder="Ej: MECANICO, AUDITOR, SUPERVISOR_ZONA"
                  className="form-input"
                  style={{
                    width: '100%',
                    height: '40px',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    background: rolEditarId ? '#f1f5f9' : '#ffffff',
                    cursor: rolEditarId ? 'not-allowed' : 'text',
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Nombre Descriptivo del Rol *
                </label>
                <input
                  type="text"
                  value={formRol.nombre}
                  onChange={(e) => setFormRol({ ...formRol, nombre: e.target.value })}
                  placeholder="Ej: Encargado de Taller / Mecánico"
                  className="form-input"
                  style={{ width: '100%', height: '40px', fontWeight: 600 }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Descripción de Funciones (Opcional)
                </label>
                <textarea
                  value={formRol.descripcion}
                  onChange={(e) => setFormRol({ ...formRol, descripcion: e.target.value })}
                  placeholder="Describe los accesos y alcance de este rol..."
                  className="form-input"
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="chkRolActivo"
                  checked={formRol.activo}
                  onChange={(e) => setFormRol({ ...formRol, activo: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="chkRolActivo" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  Rol Activo (Habilitado para asignar a usuarios)
                </label>
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={cerrarModalRol}
                  className="btn btn-outline"
                  style={{ height: '38px', padding: '0 16px', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarRolMutation.isPending}
                  className="btn btn-primary"
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                  }}
                >
                  {guardarRolMutation.isPending ? 'Guardando...' : (rolEditarId ? 'Guardar Cambios' : 'Crear Rol')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PermisosPage;
