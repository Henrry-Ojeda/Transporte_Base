import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sistemaApi } from '@/api/sistema.api';
import { authApi } from '@/api/auth.api';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { useAuthStore } from '@/stores/authStore';
import type { UsuarioDto, GuardarUsuarioDto, CamionDto } from '@/types';

export const UsuariosPage: React.FC = () => {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin());
  const esHijo = useAuthStore((state) => state.isAppHijo());
  const currentUser = useAuthStore((state) => state.user);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);
  const [modalPassword, setModalPassword] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<UsuarioDto | null>(null);

  // Modal de Vinculación Móvil (Código Seguro para Chofer / Usuario)
  const [modalVinculacion, setModalVinculacion] = useState(false);
  const [cargandoVinculacion, setCargandoVinculacion] = useState(false);
  const [datosVinculacion, setDatosVinculacion] = useState<{
    codigo: string;
    fechaExpiracion: string;
    nombreCompleto: string;
    username: string;
    rol: string;
    empresaCodigo: string;
    empresaNombre: string;
    camionInfo?: string;
    telefono?: string;
  } | null>(null);

  const abrirModalVinculacion = async (item: UsuarioDto) => {
    setCargandoVinculacion(true);
    setUsuarioSeleccionado(item);
    try {
      const res = await authApi.generarVinculacion(item.id);
      const camionInfo = item.camion?.placa
        ? `${item.camion.placa} (${(item.camion.capacidadLitros || 0).toLocaleString()} L)`
        : undefined;
      setDatosVinculacion({
        ...res,
        camionInfo,
        telefono: item.telefono || item.telefonoPagoMovil || '',
      });
      setModalVinculacion(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al generar código de vinculación móvil.');
    } finally {
      setCargandoVinculacion(false);
    }
  };

  // Formulario de Usuario
  const initialForm: GuardarUsuarioDto = {
    nombreUsuario: '',
    password: '',
    nombreCompleto: '',
    email: '',
    rol: 'OPERADOR',
    telefono: '',
    cedula: '',
    activo: true,
    bancoNombre: '',
    numeroCuenta: '',
    cedulaPagoMovil: '',
    telefonoPagoMovil: '',
    tarifaPorLitro: undefined,
    sueldoBase: undefined,
    frecuenciaPago: 'Semanal',
    tipoPago: 'Variado',
    camionId: undefined,
    permisoCrearViaje: false,
  };
  const [form, setForm] = useState<GuardarUsuarioDto>(initialForm);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  // Formulario de Contraseña Directa (1:1 V2_3_11_26)
  const [nuevaPassModal, setNuevaPassModal] = useState('');
  const [confirmarPassModal, setConfirmarPassModal] = useState('');
  const [showEyePass1, setShowEyePass1] = useState(false);
  const [showEyePass2, setShowEyePass2] = useState(false);

  const { data: usuarios = [], isLoading } = useQuery<UsuarioDto[]>({
    queryKey: ['usuarios'],
    queryFn: () => sistemaApi.getUsuarios(),
  });

  const { data: camiones = [] } = useQuery<CamionDto[]>({
    queryKey: ['camiones'],
    queryFn: () => catalogosApi.getCamiones(false),
  });

  const guardarMutation = useMutation({
    mutationFn: (dto: GuardarUsuarioDto) => {
      const payload: any = {
        ...dto,
        username: dto.nombreUsuario.trim(),
        Username: dto.nombreUsuario.trim(),
        nombreUsuario: dto.nombreUsuario.trim(),
        nombreCompleto: dto.nombreCompleto.trim(),
      };
      return modoEdicionId ? sistemaApi.actualizarUsuario(modoEdicionId, payload) : sistemaApi.crearUsuario(payload);
    },
    onSuccess: (data: any) => {
      toast.success(data.message || (modoEdicionId ? 'Usuario actualizado exitosamente' : 'Usuario registrado exitosamente'));
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      cerrarModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Error al guardar usuario');
    },
  });

  const cambiarPassMutation = useMutation({
    mutationFn: (pass: string) =>
      usuarioSeleccionado
        ? sistemaApi.actualizarPassword(usuarioSeleccionado.id, pass)
        : Promise.reject(new Error('Sin usuario seleccionado')),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Contraseña modificada exitosamente');
      setModalPassword(false);
      setNuevaPassModal('');
      setConfirmarPassModal('');
      setShowEyePass1(false);
      setShowEyePass2(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Error al cambiar contraseña');
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => sistemaApi.eliminarUsuario(id),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Usuario desactivado');
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al desactivar usuario');
    },
  });

  const togglePermisoMutation = useMutation({
    mutationFn: ({ id, habilitar }: { id: number; habilitar: boolean }) =>
      sistemaApi.actualizarPermisoCrearViaje(id, habilitar),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Permiso actualizado correctamente.');
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar permiso.');
    },
  });

  const abrirModalCrear = () => {
    setModoEdicionId(null);
    setForm(initialForm);
    setPasswordConfirm('');
    setShowPass1(false);
    setShowPass2(false);
    setModalAbierto(true);
  };

  const abrirModalEditar = (item: any) => {
    const rolItem = (item.rol || '').toUpperCase();
    if (rolItem === 'SUPERADMIN' && !isSuperAdmin) {
      toast.error('Acceso denegado: Solo el SuperAdmin puede modificar los datos del usuario principal.');
      return;
    }
    setModoEdicionId(item.id);
    setForm({
      nombreUsuario: item.nombreUsuario || item.username || '',
      password: '',
      nombreCompleto: item.nombreCompleto || item.nombre || '',
      email: item.email || '',
      rol: item.rol || 'OPERADOR',
      telefono: item.telefono || '',
      cedula: item.cedula || item.cedulaRIF || '',
      activo: item.activo !== false,
      bancoNombre: item.bancoNombre || '',
      numeroCuenta: item.numeroCuenta || '',
      cedulaPagoMovil: item.cedulaPagoMovil || '',
      telefonoPagoMovil: item.telefonoPagoMovil || '',
      tarifaPorLitro: item.tarifaPorLitro,
      sueldoBase: item.sueldoBase,
      frecuenciaPago: item.frecuenciaPago || 'Semanal',
      tipoPago: item.tipoPago || 'Variado',
      camionId: item.camionId || (item.camion?.id ?? undefined),
      permisoCrearViaje: item.permisoCrearViaje ?? false,
    });
    setPasswordConfirm('');
    setShowPass1(false);
    setShowPass2(false);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setModoEdicionId(null);
    setPasswordConfirm('');
  };

  const handleSubmitUsuario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombreUsuario.trim()) {
      toast.error('El usuario de acceso es obligatorio');
      return;
    }
    if (!form.nombreCompleto.trim()) {
      toast.error('El nombre completo es obligatorio');
      return;
    }
    if (!modoEdicionId) {
      if (!form.password || form.password.trim().length < 4) {
        toast.error('La contraseña debe tener al menos 4 caracteres');
        return;
      }
      if (form.password !== passwordConfirm) {
        toast.error('Las contraseñas no coinciden. Por favor verifícalas');
        return;
      }
    } else {
      if (form.password && form.password.trim().length > 0) {
        if (form.password.trim().length < 4) {
          toast.error('La nueva contraseña debe tener al menos 4 caracteres');
          return;
        }
        if (form.password !== passwordConfirm) {
          toast.error('Las contraseñas no coinciden');
          return;
        }
      }
    }
    guardarMutation.mutate(form);
  };

  const columns: ColumnDef<UsuarioDto>[] = [
    {
      header: 'Usuario & Nombre',
      accessorKey: 'nombreCompleto',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '13px',
              border: '1px solid #bfdbfe',
              flexShrink: 0,
            }}
          >
            {(row.nombreCompleto || row.nombreUsuario || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13.5px' }}>
              {row.nombreCompleto || row.nombreUsuario}
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748b', fontFamily: 'monospace' }}>
              @{row.nombreUsuario} {row.cedula ? `• C.I: ${row.cedula}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Rol / Nivel',
      accessorKey: 'rol',
      sortable: true,
      cell: (row) => {
        let rol = (row.rol || '').toUpperCase();
        if (esHijo && rol === 'SUPERADMIN') {
          rol = 'ADMIN';
        }
        if (rol === 'SUPERADMIN') {
          return (
            <span
              className="badge"
              style={{
                background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
                color: '#ffffff',
                border: '1px solid #4338ca',
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.04em',
                padding: '4px 9px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(49, 46, 129, 0.25)',
              }}
            >
              <i className="fa-solid fa-crown" style={{ color: '#fbbf24', fontSize: '10px' }}></i> SUPERADMIN
            </span>
          );
        }

        let bg = '#f1f5f9';
        let color = '#475569';
        let border = '#e2e8f0';

        if (rol.includes('ADMIN')) {
          bg = '#eff6ff';
          color = '#1d4ed8';
          border = '#bfdbfe';
        } else if (rol === 'CHOFER') {
          bg = '#fef3c7';
          color = '#b45309';
          border = '#fde68a';
        } else if (rol === 'SUPERVISOR') {
          bg = '#f3e8ff';
          color = '#7e22ce';
          border = '#e9d5ff';
        } else if (rol === 'FINANZAS') {
          bg = '#ecfdf5';
          color = '#047857';
          border = '#a7f3d0';
        }

        return (
          <span
            className="badge"
            style={{
              background: bg,
              color: color,
              border: `1px solid ${border}`,
              fontWeight: 800,
              fontSize: '11px',
              letterSpacing: '0.02em',
            }}
          >
            {rol}
          </span>
        );
      },
    },
    {
      header: 'Contacto',
      cell: (row) => (
        <div style={{ fontSize: '12px' }}>
          {row.telefono && (
            <div style={{ color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-phone" style={{ color: '#94a3b8', fontSize: '10px' }}></i>
              <span>{row.telefono}</span>
            </div>
          )}
          {row.email && (
            <div style={{ color: '#64748b', marginTop: '2px' }}>{row.email}</div>
          )}
          {!row.telefono && !row.email && (
            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin contacto</span>
          )}
        </div>
      ),
    },
    {
      header: 'Permiso Crear Ruta',
      cell: (row) => {
        if ((row.rol || '').toUpperCase() !== 'CHOFER') {
          return <span style={{ color: '#94a3b8', fontSize: '11px', fontStyle: 'italic' }}>Asigna Supervisor</span>;
        }
        const tienePermiso = !!row.permisoCrearViaje;
        return (
          <button
            type="button"
            onClick={() => togglePermisoMutation.mutate({ id: row.id, habilitar: !tienePermiso })}
            disabled={togglePermisoMutation.isPending}
            className="btn btn-sm"
            style={{
              background: tienePermiso ? '#ecfdf5' : '#f8fafc',
              color: tienePermiso ? '#047857' : '#64748b',
              border: `1.5px solid ${tienePermiso ? '#86efac' : '#cbd5e1'}`,
              borderRadius: '8px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={
              tienePermiso
                ? 'Autorización activa para 1 viaje/ruta. Clic para revocar.'
                : 'Sin permiso para iniciar rutas. Clic para conceder 1 viaje.'
            }
          >
            <i className={`fa-solid ${tienePermiso ? 'fa-circle-check text-emerald-600' : 'fa-lock text-slate-400'}`}></i>
            <span>{tienePermiso ? '🟢 Autorizado (1 Ruta)' : '🔒 Sin Permiso'}</span>
          </button>
        );
      },
    },
    {
      header: 'Estado',
      accessorKey: 'activo',
      sortable: true,
      cell: (row) => (
        <span
          className="badge"
          style={{
            background: row.activo ? '#ecfdf5' : '#fef2f2',
            color: row.activo ? '#047857' : '#b91c1c',
            border: `1px solid ${row.activo ? '#a7f3d0' : '#fecaca'}`,
            fontWeight: 700,
          }}
        >
          {row.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (row) => {
        const esRowSuperAdmin = (row.rol || '').toUpperCase() === 'SUPERADMIN';

        // Si el usuario en la fila es SuperAdmin y quien consulta NO es SuperAdmin: protegido
        if (esRowSuperAdmin && !isSuperAdmin) {
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span
                className="badge"
                style={{
                  background: '#f8fafc',
                  color: '#475569',
                  border: '1.5px solid #cbd5e1',
                  fontWeight: 700,
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
                title="Usuario SuperAdmin / Dueño del Sistema. Inmune a modificaciones por otros roles."
              >
                <i className="fa-solid fa-shield-halved" style={{ color: '#6366f1' }}></i> Protegido
              </span>
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button
              type="button"
              onClick={() => abrirModalVinculacion(row)}
              className="btn btn-sm btn-outline"
              style={{
                height: '30px',
                padding: '0 8px',
                color: '#059669',
                borderColor: '#a7f3d0',
                background: '#ecfdf5',
              }}
              title="Vincular Dispositivo Móvil (Generar Código de Acceso Chofer)"
            >
              <i className="fa-solid fa-mobile-screen-button"></i>
            </button>
            <button
              type="button"
              onClick={() => {
                setUsuarioSeleccionado(row);
                setNuevaPassModal('');
                setConfirmarPassModal('');
                setShowEyePass1(false);
                setShowEyePass2(false);
                setModalPassword(true);
              }}
              className="btn btn-sm btn-outline"
              style={{ height: '30px', padding: '0 8px', color: '#f59e0b', borderColor: '#fde68a' }}
              title="Cambiar Contraseña"
            >
              <i className="fa-solid fa-key"></i>
            </button>
            <button
              type="button"
              onClick={() => abrirModalEditar(row)}
              className="btn btn-sm btn-outline"
              style={{ height: '30px', padding: '0 8px', color: '#2563eb', borderColor: '#bfdbfe' }}
              title="Editar Usuario"
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
            {/* El usuario SuperAdmin nunca puede ser desactivado ni eliminado */}
            {!esRowSuperAdmin && (
              <button
                type="button"
                onClick={async () => {
                  if (await confirmDeleteOrDeactivate('Desactivar al usuario', row.nombreCompleto || row.nombreUsuario)) {
                    eliminarMutation.mutate(row.id);
                  }
                }}
                className="btn btn-sm btn-outline"
                style={{ height: '30px', padding: '0 8px', color: '#dc2626', borderColor: '#fecaca' }}
                title="Desactivar Usuario"
              >
                <i className="fa-solid fa-user-slash"></i>
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-users-gear text-blue-600"></i>
            Gestión de Usuarios y Accesos
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Administración de credenciales, roles y asignación operativa del personal
          </p>
        </div>
        <button
          type="button"
          onClick={abrirModalCrear}
          className="btn btn-primary"
          style={{
            background: 'linear-gradient(135deg, #0284c7, #2563eb)',
            border: 'none',
            color: '#ffffff',
            fontWeight: 800,
            padding: '8px 18px',
            borderRadius: '8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
          }}
        >
          <i className="fa-solid fa-user-plus"></i>
          Nuevo Usuario
        </button>
      </div>

      {/* Tabla Principal */}
      <DataTable
        data={usuarios}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por usuario, nombre, rol o cédula..."
        exportFileName="usuarios_sistema"
        searchFilter={(row, term) =>
          Boolean(
            (row.nombreCompleto && row.nombreCompleto.toLowerCase().includes(term)) ||
            (row.nombreUsuario && row.nombreUsuario.toLowerCase().includes(term)) ||
            (row.rol && row.rol.toLowerCase().includes(term)) ||
            (row.cedula && row.cedula.toLowerCase().includes(term))
          )
        }
      />

      {/* MODAL USUARIO Y ROLES (CREAR / EDITAR) - PARIDAD EXACTA 1:1 CON V2_3_11_26 #modalUsuarioCustom */}
      {modalAbierto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '640px',
              padding: '0',
              overflow: 'hidden',
              borderRadius: '16px',
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '92vh',
            }}
          >
            {/* CABECERA OSCURA 1:1 CON V2_3_11_26 */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                padding: '18px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(37, 99, 235, 0.25)',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}
                >
                  <i className="fa-solid fa-users-gear"></i>
                </div>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                    {modoEdicionId ? 'Editar Usuario' : 'Registrar Nuevo Usuario'}
                  </h2>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Credenciales de acceso, rol asignado y configuración de perfil
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                title="Cerrar"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '26px',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: '4px 8px',
                }}
              >
                &times;
              </button>
            </div>

            {/* FORMULARIO BODY CON FONDO #f8fafc Y SCROLL */}
            <form onSubmit={handleSubmitUsuario} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '22px 24px',
                  background: '#f8fafc',
                  overflowY: 'auto',
                  maxHeight: 'calc(92vh - 145px)',
                }}
              >
                {/* FILA 1: USERNAME Y NOMBRE COMPLETO */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                      Usuario de Acceso <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nombreUsuario}
                      onChange={(e) => setForm({ ...form, nombreUsuario: e.target.value })}
                      placeholder="Ej: jperez"
                      required
                      style={{
                        height: '42px',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        color: '#0f172a',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                      Nombre Completo <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nombreCompleto}
                      onChange={(e) => setForm({ ...form, nombreCompleto: e.target.value })}
                      placeholder="Ej: Juan Pérez González"
                      required
                      style={{
                        height: '42px',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: '#0f172a',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>
                </div>

                {/* FILA 2: CONTRASEÑA Y CONFIRMAR CONTRASEÑA (DOBLE VERIFICACIÓN) */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginBottom: '16px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-key" style={{ color: '#3b82f6' }}></i>
                      Seguridad &amp; Contraseña (Doble Verificación)
                    </span>
                    {modoEdicionId && (
                      <small style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, marginLeft: 'auto' }}>
                        (Dejar vacío para no modificar)
                      </small>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                        Contraseña {!modoEdicionId && <span style={{ color: '#e11d48' }}>*</span>}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showPass1 ? 'text' : 'password'}
                          value={form.password || ''}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          placeholder={modoEdicionId ? 'Nueva contraseña (opcional)' : 'Mín. 4 caracteres'}
                          required={!modoEdicionId}
                          style={{
                            height: '42px',
                            fontSize: '13.5px',
                            color: '#0f172a',
                            paddingRight: '40px',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            background: '#ffffff',
                            width: '100%',
                            paddingLeft: '12px',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass1(!showPass1)}
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          title="Ver/Ocultar contraseña"
                        >
                          <i className={`fa-solid ${showPass1 ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                        Confirmar Contraseña {!modoEdicionId && <span style={{ color: '#e11d48' }}>*</span>}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showPass2 ? 'text' : 'password'}
                          value={passwordConfirm}
                          onChange={(e) => setPasswordConfirm(e.target.value)}
                          placeholder="Repite la contraseña"
                          required={!modoEdicionId && Boolean(form.password)}
                          style={{
                            height: '42px',
                            fontSize: '13.5px',
                            color: '#0f172a',
                            paddingRight: '40px',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            background: '#ffffff',
                            width: '100%',
                            paddingLeft: '12px',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass2(!showPass2)}
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          title="Ver/Ocultar contraseña"
                        >
                          <i className={`fa-solid ${showPass2 ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                        </button>
                      </div>
                    </div>
                  </div>

                  {Boolean(form.password && passwordConfirm) && (
                    <div
                      style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: form.password === passwordConfirm ? '#15803d' : '#b91c1c',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className={`fa-solid ${form.password === passwordConfirm ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
                      <span>{form.password === passwordConfirm ? 'Las contraseñas coinciden perfectamente' : 'Las contraseñas no coinciden'}</span>
                    </div>
                  )}
                </div>

                {/* FILA 3: ROL Y CÉDULA */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                      Rol / Nivel en Sistema <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <select
                      value={form.rol}
                      onChange={(e) => setForm({ ...form, rol: e.target.value })}
                      required
                      style={{
                        height: '42px',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        color: '#1e293b',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    >
                      {!esHijo && isSuperAdmin && (
                        <option value="SUPERADMIN">SUPERADMIN (Super Administrador / Propietario)</option>
                      )}
                      <option value="ADMIN">ADMIN (Administrador)</option>
                      <option value="SUPERVISOR">SUPERVISOR (Supervisor)</option>
                      <option value="OPERADOR">OPERADOR (Operador)</option>
                      <option value="FINANZAS">FINANZAS (Finanzas)</option>
                      <option value="CHOFER">CONDUCTOR / CHOFER</option>
                      <option value="RECEPTOR">RECEPTOR (Operador Planta)</option>
                      <option value="MATERA">MATERA (Matera / Encargado Finca)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                      Cédula / Documento
                    </label>
                    <input
                      type="text"
                      value={form.cedula || ''}
                      onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                      placeholder="Ej: V-12345678"
                      style={{
                        height: '42px',
                        fontSize: '13.5px',
                        fontFamily: 'monospace',
                        color: '#0f172a',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>
                </div>

                {/* FILA 4: TELÉFONO Y EMAIL */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                      Teléfono de Contacto
                    </label>
                    <input
                      type="text"
                      value={form.telefono || ''}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      placeholder="Ej: 0414-1234567"
                      style={{
                        height: '42px',
                        fontSize: '13.5px',
                        color: '#0f172a',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={form.email || ''}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="Ej: usuario@empresa.com"
                      style={{
                        height: '42px',
                        fontSize: '13.5px',
                        color: '#0f172a',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>
                </div>

                {/* SUBPANEL DATOS BANCARIOS (OPCIONAL) */}
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #bbf7d0',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-building-columns" style={{ color: '#15803d' }}></i>
                      Información Bancaria para Pagos y Transferencias (Opcional)
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#14532d', display: 'block', marginBottom: '4px' }}>
                        Banco
                      </label>
                      <input
                        type="text"
                        value={form.bancoNombre || ''}
                        onChange={(e) => setForm({ ...form, bancoNombre: e.target.value })}
                        placeholder="Ej: Banesco, Venezuela"
                        style={{
                          height: '38px',
                          fontSize: '13px',
                          border: '1.5px solid #86efac',
                          borderRadius: '8px',
                          background: '#ffffff',
                          width: '100%',
                          padding: '0 10px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#14532d', display: 'block', marginBottom: '4px' }}>
                        Número de Cuenta (20 dígitos)
                      </label>
                      <input
                        type="text"
                        value={form.numeroCuenta || ''}
                        onChange={(e) => setForm({ ...form, numeroCuenta: e.target.value })}
                        placeholder="01340000000000000000"
                        maxLength={20}
                        style={{
                          height: '38px',
                          fontSize: '13px',
                          fontFamily: 'monospace',
                          border: '1.5px solid #86efac',
                          borderRadius: '8px',
                          background: '#ffffff',
                          width: '100%',
                          padding: '0 10px',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#14532d', display: 'block', marginBottom: '4px' }}>
                        Cédula Pago Móvil
                      </label>
                      <input
                        type="text"
                        value={form.cedulaPagoMovil || ''}
                        onChange={(e) => setForm({ ...form, cedulaPagoMovil: e.target.value })}
                        placeholder="Ej: V-12345678"
                        style={{
                          height: '38px',
                          fontSize: '13px',
                          border: '1.5px solid #86efac',
                          borderRadius: '8px',
                          background: '#ffffff',
                          width: '100%',
                          padding: '0 10px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#14532d', display: 'block', marginBottom: '4px' }}>
                        Teléfono Pago Móvil
                      </label>
                      <input
                        type="text"
                        value={form.telefonoPagoMovil || ''}
                        onChange={(e) => setForm({ ...form, telefonoPagoMovil: e.target.value })}
                        placeholder="Ej: 0414-1234567"
                        style={{
                          height: '38px',
                          fontSize: '13px',
                          border: '1.5px solid #86efac',
                          borderRadius: '8px',
                          background: '#ffffff',
                          width: '100%',
                          padding: '0 10px',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* SUBPANEL CONDUCTOR / CHOFER (SI EL ROL ES CHOFER) */}
                {form.rol === 'CHOFER' && (
                  <div
                    style={{
                      background: '#eff6ff',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa-solid fa-truck" style={{ color: '#2563eb' }}></i>
                        Configuración de Conductor / Cisterna y Régimen de Liquidación
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', display: 'block', marginBottom: '4px' }}>
                          Camión / Cisterna Asignada
                        </label>
                        <select
                          value={form.camionId || ''}
                          onChange={(e) => setForm({ ...form, camionId: e.target.value ? Number(e.target.value) : undefined })}
                          style={{
                            height: '38px',
                            fontSize: '13px',
                            fontWeight: 600,
                            border: '1.5px solid #93c5fd',
                            borderRadius: '8px',
                            background: '#ffffff',
                            width: '100%',
                            padding: '0 10px',
                          }}
                        >
                          <option value="">-- Sin Camión Asignado --</option>
                          {camiones.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.placa} ({c.marca || ''} {c.modelo || ''}) - {c.capacidadLitros?.toLocaleString()} L
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', display: 'block', marginBottom: '4px' }}>
                          Tarifa por Litro ($/Lt)
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={form.tarifaPorLitro ?? ''}
                          onChange={(e) => setForm({ ...form, tarifaPorLitro: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="Ej: 0.0050"
                          style={{
                            height: '38px',
                            fontSize: '13px',
                            fontWeight: 700,
                            border: '1.5px solid #93c5fd',
                            borderRadius: '8px',
                            background: '#ffffff',
                            width: '100%',
                            padding: '0 10px',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', display: 'block', marginBottom: '4px' }}>
                          Sueldo Base ($ USD)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.sueldoBase ?? ''}
                          onChange={(e) => setForm({ ...form, sueldoBase: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="0.00"
                          style={{
                            height: '38px',
                            fontSize: '13px',
                            border: '1.5px solid #93c5fd',
                            borderRadius: '8px',
                            background: '#ffffff',
                            width: '100%',
                            padding: '0 10px',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', display: 'block', marginBottom: '4px' }}>
                          Frecuencia de Pago
                        </label>
                        <select
                          value={form.frecuenciaPago || 'Semanal'}
                          onChange={(e) => setForm({ ...form, frecuenciaPago: e.target.value })}
                          style={{
                            height: '38px',
                            fontSize: '13px',
                            fontWeight: 600,
                            border: '1.5px solid #93c5fd',
                            borderRadius: '8px',
                            background: '#ffffff',
                            width: '100%',
                            padding: '0 10px',
                          }}
                        >
                          <option value="Semanal">Semanal</option>
                          <option value="Quincenal">Quincenal</option>
                          <option value="Mensual">Mensual</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* CHECKBOX USUARIO ACTIVO & PERMISO CREAR VIAJE */}
                <div style={{ display: 'grid', gridTemplateColumns: form.rol === 'CHOFER' ? '1fr 1fr' : '1fr', gap: '12px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      color: '#1e293b',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      height: '44px',
                      padding: '0 14px',
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '8px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                      style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                    />
                    <span>Usuario Activo en el Sistema</span>
                  </label>

                  {form.rol === 'CHOFER' && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        color: form.permisoCrearViaje ? '#047857' : '#1e293b',
                        fontSize: '13px',
                        fontWeight: 700,
                        height: '44px',
                        padding: '0 14px',
                        background: form.permisoCrearViaje ? '#ecfdf5' : '#ffffff',
                        border: `1.5px solid ${form.permisoCrearViaje ? '#86efac' : '#cbd5e1'}`,
                        borderRadius: '8px',
                      }}
                      title="Permite que el chofer inicie 1 ruta desde la app móvil. Se revocará automáticamente al entregar."
                    >
                      <input
                        type="checkbox"
                        checked={!!form.permisoCrearViaje}
                        onChange={(e) => setForm({ ...form, permisoCrearViaje: e.target.checked })}
                        style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
                      />
                      <span>🛡️ Permitir Crear 1 Ruta (Temporal)</span>
                    </label>
                  )}
                </div>
              </div>

              {/* FOOTER 1:1 CON V2_3_11_26 */}
              <div
                style={{
                  padding: '16px 24px',
                  background: '#ffffff',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="btn btn-outline"
                  style={{ height: '42px', padding: '0 18px', borderRadius: '8px', fontWeight: 700 }}
                >
                  <i className="fa-solid fa-xmark"></i> Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarMutation.isPending}
                  className="btn btn-primary"
                  style={{
                    height: '42px',
                    padding: '0 24px',
                    borderRadius: '8px',
                    background: '#2563eb',
                    border: 'none',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  {guardarMutation.isPending ? 'Guardando...' : 'Guardar Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CAMBIAR CONTRASEÑA - RÉPLICA EXACTA 1:1 CON V2_3_11_26 */}
      {modalPassword && usuarioSeleccionado && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '0',
              overflow: 'hidden',
              borderRadius: '16px',
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            }}
          >
            {/* Header Oscuro con degradado 1:1 */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                padding: '18px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(245, 158, 11, 0.25)',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                  }}
                >
                  <i className="fa-solid fa-key"></i>
                </div>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                    Actualizar Contraseña
                  </h2>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Cambiar clave de acceso del usuario
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalPassword(false)}
                title="Cerrar"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '22px',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: '4px 8px',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!nuevaPassModal || nuevaPassModal.length < 6) {
                  toast.error('La nueva contraseña debe contener al menos 6 caracteres.');
                  return;
                }
                if (nuevaPassModal !== confirmarPassModal) {
                  toast.error('La contraseña y la confirmación no son iguales. Por favor verifíquelas.');
                  return;
                }
                cambiarPassMutation.mutate(nuevaPassModal);
              }}
            >
              <div style={{ padding: '22px 24px', background: '#ffffff' }}>
                {/* INFO USUARIO */}
                <div
                  style={{
                    background: '#eff6ff',
                    border: '1.5px solid #bfdbfe',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#2563eb',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Usuario de Acceso
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '13.5px',
                        fontWeight: 800,
                        color: '#1d4ed8',
                      }}
                    >
                      @{usuarioSeleccionado.nombreUsuario}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#0f172a',
                      marginTop: '3px',
                    }}
                  >
                    {usuarioSeleccionado.nombreCompleto || usuarioSeleccionado.nombreUsuario}
                  </div>
                </div>

                {/* NUEVA CONTRASEÑA */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#1e293b',
                      marginBottom: '6px',
                      display: 'block',
                    }}
                  >
                    Nueva Contraseña <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showEyePass1 ? 'text' : 'password'}
                      value={nuevaPassModal}
                      onChange={(e) => setNuevaPassModal(e.target.value)}
                      required
                      placeholder="Mínimo 6 caracteres"
                      style={{
                        width: '100%',
                        height: '42px',
                        fontSize: '13.5px',
                        color: '#0f172a',
                        padding: '0 40px 0 12px',
                        borderRadius: '8px',
                        border: `1.5px solid ${
                          nuevaPassModal && confirmarPassModal
                            ? nuevaPassModal === confirmarPassModal
                              ? '#10b981'
                              : '#ef4444'
                            : '#cbd5e1'
                        }`,
                        background: '#ffffff',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEyePass1(!showEyePass1)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                      title="Ver/Ocultar contraseña"
                    >
                      <i className={`fa-solid ${showEyePass1 ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>

                {/* CONFIRMAR NUEVA CONTRASEÑA */}
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label
                    style={{
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#1e293b',
                      marginBottom: '6px',
                      display: 'block',
                    }}
                  >
                    Confirmar Nueva Contraseña <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showEyePass2 ? 'text' : 'password'}
                      value={confirmarPassModal}
                      onChange={(e) => setConfirmarPassModal(e.target.value)}
                      required
                      placeholder="Repite la nueva contraseña"
                      style={{
                        width: '100%',
                        height: '42px',
                        fontSize: '13.5px',
                        color: '#0f172a',
                        padding: '0 40px 0 12px',
                        borderRadius: '8px',
                        border: `1.5px solid ${
                          nuevaPassModal && confirmarPassModal
                            ? nuevaPassModal === confirmarPassModal
                              ? '#10b981'
                              : '#ef4444'
                            : '#cbd5e1'
                        }`,
                        background: '#ffffff',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEyePass2(!showEyePass2)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                      title="Ver/Ocultar contraseña"
                    >
                      <i className={`fa-solid ${showEyePass2 ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>

                {/* FEEDBACK COINCIDENCIA */}
                {nuevaPassModal && confirmarPassModal && (
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '8px',
                      color: nuevaPassModal === confirmarPassModal ? '#10b981' : '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {nuevaPassModal === confirmarPassModal ? (
                      <>
                        <i className="fa-solid fa-circle-check"></i>
                        <span>Las contraseñas coinciden correctamente</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-circle-xmark"></i>
                        <span>Las contraseñas no coinciden</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* FOOTER */}
              <div
                style={{
                  padding: '16px 24px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setModalPassword(false)}
                  className="btn btn-outline"
                  style={{
                    height: '42px',
                    padding: '0 18px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    background: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    color: '#475569',
                  }}
                >
                  <i className="fa-solid fa-xmark"></i> Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cambiarPassMutation.isPending}
                  className="btn btn-primary"
                  style={{
                    height: '42px',
                    padding: '0 24px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
                    fontWeight: 800,
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-key"></i>
                  {cambiarPassMutation.isPending ? 'Actualizando...' : 'Actualizar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VINCULACIÓN MÓVIL SEGURA (CÓDIGO DE DISPOSITIVO) */}
      {modalVinculacion && datosVinculacion && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: '0',
              overflow: 'hidden',
              borderRadius: '20px',
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(226, 232, 240, 0.8)',
            }}
          >
            {/* Header Oscuro Profesional */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                padding: '18px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <i className="fa-solid fa-mobile-screen-button"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                    Vinculación Móvil Segura
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                    Código de acceso rápido para app móvil offline
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalVinculacion(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '26px',
                  lineHeight: '1',
                }}
              >
                &times;
              </button>
            </div>

            {/* Contenido */}
            <div style={{ padding: '22px', background: '#f8fafc' }}>
              {/* Tarjeta de Destinatario */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>
                    {datosVinculacion.nombreCompleto}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Usuario: <span style={{ fontWeight: 600, color: '#0284c7' }}>@{datosVinculacion.username}</span>
                  </div>
                  {datosVinculacion.camionInfo && (
                    <div style={{ fontSize: '12px', color: '#059669', marginTop: '3px', fontWeight: 700 }}>
                      <i className="fa-solid fa-truck-moving mr-1"></i> Cisterna: {datosVinculacion.camionInfo}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    background: '#f1f5f9',
                    color: '#334155',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    border: '1px solid #cbd5e1',
                  }}
                >
                  {datosVinculacion.rol}
                </span>
              </div>

              {/* Tarjeta del Código de 6 Dígitos */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #1e293b 0%, #090d16 100%)',
                  borderRadius: '16px',
                  padding: '20px',
                  textAlign: 'center',
                  color: '#ffffff',
                  marginBottom: '16px',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div style={{ fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8', fontWeight: 700 }}>
                  Código de Activación Único
                </div>
                <div
                  style={{
                    fontFamily: 'monospace, ui-monospace, sans-serif',
                    fontSize: '38px',
                    fontWeight: 900,
                    letterSpacing: '8px',
                    color: '#38bdf8',
                    textShadow: '0 0 20px rgba(56, 189, 248, 0.4)',
                    margin: '10px 0',
                  }}
                >
                  {datosVinculacion.codigo.slice(0, 3)} - {datosVinculacion.codigo.slice(3)}
                </div>
                <div style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                  <i className="fa-regular fa-clock mr-1 text-amber-400"></i> Válido por 48 horas (un solo uso)
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(datosVinculacion.codigo);
                      toast.success('Código copiado al portapapeles');
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fa-regular fa-copy"></i> Copiar Código
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const empCod = currentUser?.empresaCodigo || (window.location.hostname.includes('campoverde') ? 'CAMPO_VERDE' : 'VERGEL_CARRILLO');
                      const linkApp = `${window.location.origin}/movil?empresa=${encodeURIComponent(empCod)}`;
                      navigator.clipboard.writeText(linkApp);
                      toast.success('Enlace de la app copiado');
                    }}
                    style={{
                      background: 'rgba(56, 189, 248, 0.2)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#7dd3fc',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fa-solid fa-link"></i> Copiar Link App
                  </button>
                </div>
              </div>

              {/* Botón Compartir por WhatsApp */}
              <button
                type="button"
                onClick={() => {
                  const empCod = currentUser?.empresaCodigo || (window.location.hostname.includes('campoverde') ? 'CAMPO_VERDE' : 'VERGEL_CARRILLO');
                  const empNombre = currentUser?.empresaNombre || (window.location.hostname.includes('campoverde') ? 'Productos Lácteos Campo Verde' : 'Transporte Vergel & Carrillo');
                  const linkApp = `${window.location.origin}/movil?empresa=${encodeURIComponent(empCod)}`;
                  const msg = `🚚 *Acceso Móvil - ${empNombre}*\n\nHola *${datosVinculacion.nombreCompleto}*, para ingresar a la App Móvil desde tu teléfono:\n\n1️⃣ Abre este enlace en el navegador de tu teléfono:\n👉 ${linkApp}\n\n2️⃣ Escribe tu Código de Activación:\n🔑 *${datosVinculacion.codigo}*\n\n_Tu teléfono quedará vinculado exclusivamente a ${empNombre} para trabajar con o sin señal (Offline)._`;
                  const cleanTel = (datosVinculacion.telefono || '').replace(/\D/g, '');
                  const waUrl = cleanTel
                    ? `https://wa.me/${cleanTel.startsWith('58') ? cleanTel : '58' + cleanTel.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`
                    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                  window.open(waUrl, '_blank');
                }}
                style={{
                  width: '100%',
                  background: '#25D366',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)',
                  marginBottom: '14px',
                }}
              >
                <i className="fa-brands fa-whatsapp text-lg"></i>
                Enviar Instrucciones y Código por WhatsApp
              </button>

              {/* Guía Rápida */}
              <div
                style={{
                  background: '#eff6ff',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  border: '1px solid #bfdbfe',
                  fontSize: '12px',
                  color: '#1e40af',
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-circle-info"></i> ¿Cómo funciona el acceso móvil?
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: '1.5' }}>
                  <li>El chofer no necesita escribir correos, contraseñas ni elegir la empresa.</li>
                  <li>Al pegar este código, la app descarga las fincas y el camión automáticamente.</li>
                  <li>Funciona 100% sin internet durante los recorridos por el campo.</li>
                </ul>
              </div>

              {/* Botón Cerrar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
                <button
                  type="button"
                  onClick={() => setModalVinculacion(false)}
                  className="btn btn-outline"
                  style={{ height: '38px', padding: '0 20px', borderRadius: '8px', fontWeight: 700 }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsuariosPage;
