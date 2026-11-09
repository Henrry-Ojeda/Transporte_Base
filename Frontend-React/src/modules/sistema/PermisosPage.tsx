import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { sistemaApi } from '@/api/sistema.api';
import { useAuthStore } from '@/stores/authStore';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import type { PermisoModuloDto, RolDto, CrearRolDto } from '@/types';

export const PermisosPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin, isAppHijo } = useAuthStore();
  const esSuperAdmin = isSuperAdmin();
  const esHijo = isAppHijo();

  // Pestaña activa: 'matriz' | 'roles'
  const [tabActiva, setTabActiva] = useState<'matriz' | 'roles'>('matriz');

  // Rol activo para la matriz de permisos
  const [rolActivo, setRolActivo] = useState<string>('OPERADOR');

  // Estados modal Rol (Crear / Editar)
  const [modalRolAbierto, setModalRolAbierto] = useState(false);
  const [rolEditarId, setRolEditarId] = useState<number | null>(null);
  const [formRol, setFormRol] = useState<CrearRolDto>({
    codigo: '',
    nombre: '',
    descripcion: '',
    activo: true,
  });

  // Query: Roles del sistema
  const { data: roles = [], isLoading: cargandoRoles, refetch: refetchRoles } = useQuery<RolDto[]>({
    queryKey: ['roles-sistema'],
    queryFn: () => sistemaApi.getRoles(),
  });

  // Query: Matriz de permisos
  const { data: permisos = [], isLoading: cargandoPermisos, refetch: refetchPermisos } = useQuery<PermisoModuloDto[]>({
    queryKey: ['permisos-matriz'],
    queryFn: () => sistemaApi.getMatrizPermisos(),
  });

  // Mutación: Actualizar un permiso específico en la matriz
  const toggleMutation = useMutation({
    mutationFn: ({
      rol,
      modulo,
      acciones,
    }: {
      rol: string;
      modulo: string;
      acciones: { puedeVer: boolean; puedeEditar: boolean; puedeAgregar: boolean; puedeEliminar: boolean };
    }) => sistemaApi.actualizarPermisoRol(rol, modulo, acciones),
    onSuccess: () => {
      toast.success('Permiso actualizado correctamente');
      queryClient.invalidateQueries({ queryKey: ['permisos-matriz'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar permiso');
    },
  });

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
    const rolesCore = ['ADMIN', 'SUPERADMIN', 'CHOFER', 'TALLER'];
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
      text: 'Esta acción no se puede deshacer.',
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

  // Módulos estándar para la matriz
  const modulosEstandar = [
    { codigo: 'DASHBOARD', nombre: 'Dashboard Principal', icono: 'fa-chart-pie' },
    { codigo: 'RUTAS', nombre: 'Recolección en Ruta & Tickets', icono: 'fa-truck' },
    { codigo: 'RECEPTORIA', nombre: 'Entregas & Receptoría', icono: 'fa-building-wheat' },
    { codigo: 'BALANCE', nombre: 'Balance Volumétrico & Merma', icono: 'fa-scale-balanced' },
    { codigo: 'FINCAS', nombre: 'Catálogo de Fincas', icono: 'fa-cow' },
    { codigo: 'PROPIETARIOS', nombre: 'Catálogo de Propietarios', icono: 'fa-user-tie' },
    { codigo: 'COMPANIAS', nombre: 'Compañías & Queseras', icono: 'fa-industry' },
    { codigo: 'CAMIONES', nombre: 'Flota de Camiones', icono: 'fa-truck-front' },
    { codigo: 'CONDUCTORES', nombre: 'Conductores & Choferes', icono: 'fa-id-card' },
    { codigo: 'COMBUSTIBLE', nombre: 'Gestión de Combustible', icono: 'fa-gas-pump' },
    { codigo: 'MANTENIMIENTO', nombre: 'Mantenimiento & Taller', icono: 'fa-wrench' },
    { codigo: 'REPUESTOS', nombre: 'Inventario de Repuestos', icono: 'fa-gears' },
    { codigo: 'LIQUIDACION', nombre: 'Liquidación & Semanas', icono: 'fa-file-invoice-dollar' },
    { codigo: 'ADELANTOS', nombre: 'Adelantos & Amortizaciones', icono: 'fa-hand-holding-dollar' },
    { codigo: 'PAGOS', nombre: 'Nómina & Pagos Personal', icono: 'fa-money-check-dollar' },
    { codigo: 'REPORTES', nombre: 'Reportes Ejecutivos', icono: 'fa-chart-line' },
    { codigo: 'DATA', nombre: 'Gestión de Data Masiva', icono: 'fa-database' },
    { codigo: 'USUARIOS', nombre: 'Usuarios & Seguridad', icono: 'fa-shield-halved' },
  ];

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
                : row.codigo === 'TALLER'
                ? 'fa-wrench text-orange-500'
                : row.codigo === 'CHOFER'
                ? 'fa-truck text-emerald-600'
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
        const esCore = ['SUPERADMIN', 'ADMIN'].includes(row.codigo.toUpperCase());
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
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

  // Lista de roles filtrados (en app hijos nunca se expone SUPERADMIN)
  const rolesDisponibles = esHijo ? roles.filter((r) => r.codigo !== 'SUPERADMIN') : roles;
  const listaRolesPills = rolesDisponibles.length > 0 ? rolesDisponibles.map((r) => r.codigo.toUpperCase()) : ['ADMIN', 'OPERADOR', 'CHOFER', 'TALLER'];

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
            Control de accesos por rol y administración de perfiles de usuario del sistema
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', gap: '10px' }}>
          {tabActiva === 'roles' && esSuperAdmin && (
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

      {/* PESTAÑAS PRINCIPALES: MATRIZ vs GESTIÓN DE ROLES */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1.5px solid #e2e8f0', marginBottom: '20px' }}>
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

        {esSuperAdmin && (
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
            <i className="fa-solid fa-users-gear text-amber-500"></i> Gestión de Roles
            <span
              style={{
                fontSize: '10px',
                fontWeight: 900,
                color: '#b45309',
                background: '#fef3c7',
                padding: '2px 6px',
                borderRadius: '6px',
                border: '1px solid #fde68a',
              }}
            >
              SUPERADMIN
            </span>
          </button>
        )}
      </div>

      {/* CONTENIDO 1: MATRIZ DE PERMISOS */}
      {tabActiva === 'matriz' && (
        <>
          {/* SELECTOR DE ROL (PILLS DINÁMICOS) */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {listaRolesPills.map((rol) => (
              <button
                key={rol}
                type="button"
                onClick={() => setRolActivo(rol)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '20px',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  border: rolActivo === rol ? 'none' : '1.5px solid #cbd5e1',
                  background: rolActivo === rol ? 'linear-gradient(135deg, #0284c7, #2563eb)' : '#ffffff',
                  color: rolActivo === rol ? '#ffffff' : '#475569',
                  boxShadow: rolActivo === rol ? '0 4px 12px rgba(37,99,235,0.3)' : 'none',
                  transition: 'all 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i
                  className={`fa-solid ${
                    rol === 'SUPERADMIN'
                      ? 'fa-crown'
                      : rol === 'ADMIN'
                      ? 'fa-user-shield'
                      : rol === 'TALLER'
                      ? 'fa-wrench'
                      : rol === 'CHOFER'
                      ? 'fa-truck'
                      : 'fa-user-gear'
                  }`}
                ></i>
                Rol: {rol}
              </button>
            ))}
          </div>

          {/* TABLA MATRIZ */}
          <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Módulo del Sistema</th>
                    <th style={{ textAlign: 'center', width: '130px' }}>Puede Ver</th>
                    <th style={{ textAlign: 'center', width: '130px' }}>Puede Crear</th>
                    <th style={{ textAlign: 'center', width: '130px' }}>Puede Editar</th>
                    <th style={{ textAlign: 'center', width: '130px' }}>Puede Eliminar</th>
                  </tr>
                </thead>
                <tbody>
                  {modulosEstandar.map((m) => {
                    const perm = permisos.find((p) => p.rol === rolActivo && p.moduloCodigo === m.codigo) || {
                      puedeVer: rolActivo === 'ADMIN' || rolActivo === 'SUPERADMIN' || rolActivo === 'OPERADOR',
                      puedeAgregar: rolActivo === 'ADMIN' || rolActivo === 'SUPERADMIN' || (rolActivo === 'OPERADOR' && m.codigo !== 'USUARIOS'),
                      puedeEditar: rolActivo === 'ADMIN' || rolActivo === 'SUPERADMIN',
                      puedeEliminar: rolActivo === 'ADMIN' || rolActivo === 'SUPERADMIN',
                    };

                    const disabled = rolActivo === 'ADMIN' || rolActivo === 'SUPERADMIN';

                    return (
                      <tr key={m.codigo}>
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
                              }}
                            >
                              <i className={`fa-solid ${m.icono}`}></i>
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{m.nombre}</div>
                              <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                                COD: {m.codigo}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={perm.puedeVer}
                            disabled={disabled}
                            onChange={(e) =>
                              toggleMutation.mutate({
                                rol: rolActivo,
                                modulo: m.codigo,
                                acciones: { ...perm, puedeVer: e.target.checked },
                              })
                            }
                            style={{ width: '18px', height: '18px', cursor: disabled ? 'not-allowed' : 'pointer' }}
                          />
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={perm.puedeAgregar}
                            disabled={disabled}
                            onChange={(e) =>
                              toggleMutation.mutate({
                                rol: rolActivo,
                                modulo: m.codigo,
                                acciones: { ...perm, puedeAgregar: e.target.checked },
                              })
                            }
                            style={{ width: '18px', height: '18px', cursor: disabled ? 'not-allowed' : 'pointer' }}
                          />
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={perm.puedeEditar}
                            disabled={disabled}
                            onChange={(e) =>
                              toggleMutation.mutate({
                                rol: rolActivo,
                                modulo: m.codigo,
                                acciones: { ...perm, puedeEditar: e.target.checked },
                              })
                            }
                            style={{ width: '18px', height: '18px', cursor: disabled ? 'not-allowed' : 'pointer' }}
                          />
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={perm.puedeEliminar}
                            disabled={disabled}
                            onChange={(e) =>
                              toggleMutation.mutate({
                                rol: rolActivo,
                                modulo: m.codigo,
                                acciones: { ...perm, puedeEliminar: e.target.checked },
                              })
                            }
                            style={{ width: '18px', height: '18px', cursor: disabled ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* CONTENIDO 2: GESTIÓN DE ROLES CRUD (DataTable - Regla Maestra 2) */}
      {tabActiva === 'roles' && esSuperAdmin && (
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

      {/* MODAL CREAR / EDITAR ROL (SOLO SUPERADMIN) */}
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
                    Gestión de roles y permisos globales
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
                  disabled={Boolean(rolEditarId)} // Código inmutable tras creación para integridad
                  onChange={(e) => setFormRol({ ...formRol, codigo: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                  placeholder="Ej: AUDITOR, TALLER, SUPERVISOR_ZONA"
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
