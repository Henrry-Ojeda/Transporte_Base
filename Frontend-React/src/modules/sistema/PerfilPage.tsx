import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/authStore';
import type { PerfilUsuarioDto, ActualizarPerfilDto } from '@/types';

export const PerfilPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, updateUser, isAppHijo } = useAuthStore();
  const esHijo = isAppHijo();

  const [cambiarPassword, setCambiarPassword] = useState(false);
  const [mostrarPassActual, setMostrarPassActual] = useState(false);
  const [mostrarPassNuevo, setMostrarPassNuevo] = useState(false);
  const [mostrarPassConfirm, setMostrarPassConfirm] = useState(false);

  const [formData, setFormData] = useState<ActualizarPerfilDto>({
    nombreCompleto: '',
    cedula: '',
    telefono: '',
    fotoUrl: '',
    passwordActual: '',
    nuevoPassword: '',
  });

  const [confirmPassword, setConfirmPassword] = useState('');

  // Cargar datos actuales del perfil desde el backend
  const { data: perfil, isLoading } = useQuery<PerfilUsuarioDto>({
    queryKey: ['perfil-usuario'],
    queryFn: authApi.getPerfil,
  });

  useEffect(() => {
    if (perfil) {
      setFormData({
        nombreCompleto: perfil.nombreCompleto || '',
        cedula: perfil.cedula || '',
        telefono: perfil.telefono || '',
        fotoUrl: perfil.fotoUrl || '',
        passwordActual: '',
        nuevoPassword: '',
      });
      setConfirmPassword('');
      setCambiarPassword(false);
    }
  }, [perfil]);

  // Manejo de carga de foto de perfil (Base64)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona un archivo de imagen válido (JPG, PNG o WEBP)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 2 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      setFormData((prev) => ({ ...prev, fotoUrl: result }));
      toast.info('Foto cargada. Recuerda hacer clic en "Guardar Cambios" para confirmar.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoverFoto = () => {
    setFormData((prev) => ({ ...prev, fotoUrl: '' }));
    toast.info('Foto removida. Recuerda hacer clic en "Guardar Cambios".');
  };

  const mutationActualizar = useMutation({
    mutationFn: authApi.updatePerfil,
    onSuccess: (data) => {
      toast.success(data.message || 'Perfil actualizado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['perfil-usuario'] });
      // Sincronizar store global para el header
      updateUser({
        nombreCompleto: formData.nombreCompleto,
        fotoUrl: formData.fotoUrl,
      });
      setFormData((prev) => ({
        ...prev,
        passwordActual: '',
        nuevoPassword: '',
      }));
      setConfirmPassword('');
      setCambiarPassword(false);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Error al actualizar el perfil';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombreCompleto.trim()) {
      toast.error('El nombre completo es obligatorio');
      return;
    }

    if (cambiarPassword) {
      if (!formData.passwordActual) {
        toast.error('Debes ingresar tu contraseña actual para confirmar el cambio');
        return;
      }
      if (!formData.nuevoPassword || formData.nuevoPassword.length < 4) {
        toast.error('La nueva contraseña debe tener al menos 4 caracteres');
        return;
      }
      if (formData.nuevoPassword !== confirmPassword) {
        toast.error('La nueva contraseña y su confirmación no coinciden');
        return;
      }
    }

    const payload: ActualizarPerfilDto = {
      ...formData,
      passwordActual: cambiarPassword ? formData.passwordActual : undefined,
      nuevoPassword: cambiarPassword ? formData.nuevoPassword : undefined,
    };

    mutationActualizar.mutate(payload);
  };

  const userInitials = (formData.nombreCompleto || perfil?.username || 'US')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '28px', color: '#0284c7', marginBottom: '12px' }}></i>
        <p style={{ fontWeight: 600 }}>Cargando información del perfil...</p>
      </div>
    );
  }

  return (
    <section id="tab-perfil" className="tab-content active" style={{ display: 'block' }}>
      {/* CABECERA & INDICADOR DE MÓDULO */}
      <div className="view-header" style={{ marginBottom: '18px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Módulo Sistema &amp; Configuración / Cuenta de Usuario
            </span>
          </div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-id-badge" style={{ color: '#0284c7' }}></i>
            Mi Perfil de Usuario
          </h1>
          <p className="view-subtitle">
            Actualiza tus datos personales, foto de perfil y credenciales de seguridad institucional
          </p>
        </div>
      </div>

      {/* TABS DE NAVEGACIÓN PROFESIONAL */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: '24px',
          paddingBottom: '2px',
        }}
      >
        <button
          type="button"
          style={{
            padding: '10px 18px',
            border: 'none',
            background: '#ffffff',
            color: '#0284c7',
            fontWeight: 800,
            fontSize: '13.5px',
            cursor: 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '10px 10px 0 0',
            borderBottom: '3px solid #0284c7',
            boxShadow: '0 -2px 6px rgba(0,0,0,0.03)',
          }}
        >
          <i className="fa-solid fa-user-shield"></i>
          Mi Perfil &amp; Seguridad
        </button>

        <button
          type="button"
          onClick={() => navigate('/datos-bancarios')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            color: '#64748b',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '10px 10px 0 0',
            transition: 'all 0.2s',
          }}
        >
          <i className="fa-solid fa-building-columns"></i>
          Datos Bancarios &amp; Pago Móvil
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '22px' }}>
          
          {/* TARJETA IDENTIDAD & HERO AVATAR */}
          <div
            style={{
              gridColumn: '1 / -1',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderRadius: '20px',
              padding: '28px',
              color: '#ffffff',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap' }}>
              {/* Contenedor Avatar */}
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                    fontWeight: 900,
                    color: '#ffffff',
                    border: '4px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                  }}
                >
                  {formData.fotoUrl ? (
                    <img
                      src={formData.fotoUrl}
                      alt="Foto de perfil"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span>{userInitials || 'US'}</span>
                  )}
                </div>

                {/* Botón flotante para seleccionar foto */}
                <label
                  htmlFor="input-foto-perfil"
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    right: '0',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#0284c7',
                    border: '2px solid #ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  }}
                  title="Cambiar Foto"
                >
                  <i className="fa-solid fa-camera"></i>
                  <input
                    id="input-foto-perfil"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Información de Identidad */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f8fafc' }}>
                    {formData.nombreCompleto || perfil?.nombreCompleto || 'Usuario'}
                  </h2>
                  <span
                    style={{
                      background: 'rgba(56, 189, 248, 0.18)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      padding: '3px 10px',
                      borderRadius: '20px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <i className="fa-solid fa-shield-halved"></i> {esHijo && ((perfil?.rol || user?.rol || '').toUpperCase() === 'SUPERADMIN') ? 'ADMIN' : (perfil?.rol || user?.rol || 'USUARIO')}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: '#94a3b8' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-lock" style={{ color: '#64748b' }}></i>
                    Usuario: <strong style={{ color: '#e2e8f0' }}>@{perfil?.username || user?.username}</strong> (No editable)
                  </span>
                  {user?.empresaNombre && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-building" style={{ color: '#64748b' }}></i>
                      {user.empresaNombre}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {formData.fotoUrl && (
              <button
                type="button"
                onClick={handleRemoverFoto}
                className="btn btn-outline"
                style={{
                  color: '#f87171',
                  borderColor: 'rgba(248, 113, 113, 0.4)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <i className="fa-solid fa-trash-can" style={{ marginRight: '6px' }}></i> Quitar Foto
              </button>
            )}
          </div>

          {/* TARJETA 1: INFORMACIÓN PERSONAL */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                <i className="fa-solid fa-user-pen"></i>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  Información Personal
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Datos de identidad y contacto</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={formData.nombreCompleto}
                  onChange={(e) => setFormData({ ...formData, nombreCompleto: e.target.value })}
                  className="form-input"
                  placeholder="Tu nombre y apellido"
                  style={{ width: '100%', height: '42px', fontWeight: 600 }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Usuario de Acceso (Login)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={perfil?.username || ''}
                      disabled
                      className="form-input"
                      style={{
                        width: '100%',
                        height: '42px',
                        background: '#f8fafc',
                        color: '#64748b',
                        fontWeight: 700,
                        cursor: 'not-allowed',
                      }}
                    />
                    <i
                      className="fa-solid fa-lock"
                      style={{ position: 'absolute', right: '12px', top: '14px', color: '#94a3b8' }}
                      title="El nombre de usuario no es editable"
                    ></i>
                  </div>
                  <small style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '3px' }}>
                    🔒 No editable por trazabilidad
                  </small>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Rol Asignado
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={perfil?.rol || ''}
                      disabled
                      className="form-input"
                      style={{
                        width: '100%',
                        height: '42px',
                        background: '#f8fafc',
                        color: '#64748b',
                        fontWeight: 700,
                        cursor: 'not-allowed',
                      }}
                    />
                    <i
                      className="fa-solid fa-shield"
                      style={{ position: 'absolute', right: '12px', top: '14px', color: '#94a3b8' }}
                    ></i>
                  </div>
                  <small style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '3px' }}>
                    🔒 Asignado por administrador
                  </small>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Cédula / Documento
                  </label>
                  <input
                    type="text"
                    value={formData.cedula || ''}
                    onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                    className="form-input"
                    placeholder="Ej: 18408156"
                    style={{ width: '100%', height: '42px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Teléfono Móvil
                  </label>
                  <input
                    type="text"
                    value={formData.telefono || ''}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className="form-input"
                    placeholder="Ej: 0412-7869868"
                    style={{ width: '100%', height: '42px' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TARJETA 2: SEGURIDAD & CAMBIO DE CONTRASEÑA */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                  <i className="fa-solid fa-key"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    Seguridad &amp; Contraseña
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Credenciales de acceso</span>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, color: '#0284c7' }}>
                <input
                  type="checkbox"
                  checked={cambiarPassword}
                  onChange={(e) => setCambiarPassword(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#0284c7' }}
                />
                <span>Cambiar Contraseña</span>
              </label>
            </div>

            {!cambiarPassword ? (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '12px',
                  padding: '28px',
                  textAlign: 'center',
                  color: '#64748b',
                }}
              >
                <i className="fa-solid fa-shield-check" style={{ fontSize: '28px', color: '#10b981', marginBottom: '8px', display: 'block' }}></i>
                <div style={{ fontWeight: 700, color: '#334155', fontSize: '14px', marginBottom: '4px' }}>
                  Contraseña Protegida
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Tu contraseña actual se mantiene activa. Marca la casilla "Cambiar Contraseña" para modificarla.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Contraseña Actual *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={mostrarPassActual ? 'text' : 'password'}
                      value={formData.passwordActual}
                      onChange={(e) => setFormData({ ...formData, passwordActual: e.target.value })}
                      className="form-input"
                      placeholder="Ingresa tu contraseña actual"
                      style={{ width: '100%', height: '42px', paddingRight: '40px' }}
                      required={cambiarPassword}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarPassActual(!mostrarPassActual)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '12px',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                      }}
                    >
                      <i className={`fa-solid ${mostrarPassActual ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Nueva Contraseña *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={mostrarPassNuevo ? 'text' : 'password'}
                        value={formData.nuevoPassword}
                        onChange={(e) => setFormData({ ...formData, nuevoPassword: e.target.value })}
                        className="form-input"
                        placeholder="Mín. 4 caracteres"
                        style={{ width: '100%', height: '42px', paddingRight: '40px' }}
                        required={cambiarPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarPassNuevo(!mostrarPassNuevo)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '12px',
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                        }}
                      >
                        <i className={`fa-solid ${mostrarPassNuevo ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Confirmar Contraseña *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={mostrarPassConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="form-input"
                        placeholder="Repite la nueva contraseña"
                        style={{ width: '100%', height: '42px', paddingRight: '40px' }}
                        required={cambiarPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarPassConfirm(!mostrarPassConfirm)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '12px',
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                        }}
                      >
                        <i className={`fa-solid ${mostrarPassConfirm ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BARRA DE ACCIÓN Y GUARDADO */}
        <div
          style={{
            marginTop: '24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '14px',
            background: '#ffffff',
            padding: '16px 24px',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            Los cambios se aplicarán inmediatamente a tu sesión y en la base de datos.
          </span>
          <button
            type="submit"
            disabled={mutationActualizar.isPending}
            className="btn btn-primary"
            style={{
              padding: '10px 28px',
              fontSize: '14px',
              fontWeight: 800,
              background: '#0284c7',
              borderColor: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {mutationActualizar.isPending ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Guardando Perfil...
              </>
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk"></i> Guardar Cambios
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
};

export default PerfilPage;
