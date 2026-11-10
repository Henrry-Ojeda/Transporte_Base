import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, LogIn, AlertTriangle, Loader2, Building2, Hash, Smartphone, KeyRound } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/api/auth.api';
import { isTokenExpired, AUTH_TOKEN_KEY } from '@/api/client';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, sessionExpiredMessage, clearExpiredMessage, isAuthenticated } = useAuthStore();

  const defaultNombre = typeof window !== 'undefined' && window.location.hostname.includes('campoverde')
    ? 'Productos Lácteos Campo Verde, C.A.'
    : (typeof window !== 'undefined' && window.location.hostname.includes('vergel') ? 'Transporte Vergel & Carrillo' : 'Sistema de Transporte');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empresaNombre, setEmpresaNombre] = useState<string>(defaultNombre);
  const [modoAcceso, setModoAcceso] = useState<'credenciales' | 'codigo'>('credenciales');
  const [codigoInput, setCodigoInput] = useState('');
  const [vinculando, setVinculando] = useState(false);

  // Resolución 100% dinámica de la empresa desde SaaS Master (cero datos duros)
  useEffect(() => {
    let mounted = true;
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host && !host.includes('localhost') && host !== '127.0.0.1') {
        const stored = localStorage.getItem('movil_tenant_domain');
        if (stored && stored !== host) {
          localStorage.removeItem('movil_tenant_domain');
          localStorage.removeItem('movil_tenant_empresa');
        }
      }
    }

    authApi.getTenantInfo()
      .then((info) => {
        if (mounted && info?.nombre) {
          setEmpresaNombre(info.nombre);
        }
      })
      .catch(() => {
        // En caso de que no haya conexión inicial, conserva el título base
      });
    return () => { mounted = false; };
  }, []);

  // Si ya está autenticado con credencial válida, redirigir al inicio; de lo contrario, limpiar estado
  useEffect(() => {
    const activeToken = typeof window !== 'undefined'
      ? (localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem('token'))
      : null;

    if (isAuthenticated && activeToken && !isTokenExpired(activeToken)) {
      // Comprobar consistencia estricta de empresa para evitar contaminación cruzada entre tenants
      const user = useAuthStore.getState().user;
      const userCod = ((user as any)?.empresaCodigo || '').toUpperCase();
      const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
      const isCampoVerde = host.includes('campoverde');
      const isVergel = host.includes('vergel');

      if ((isCampoVerde && userCod.includes('VERGEL')) || (isVergel && userCod.includes('CAMPO'))) {
        console.warn('Sesión de otra empresa detectada. Limpiando para permitir login limpio en la empresa actual.');
        useAuthStore.getState().logout();
        return;
      }

      navigate('/', { replace: true });
    } else if (isAuthenticated && (!activeToken || isTokenExpired(activeToken))) {
      // Estado desfasado: corregir inmediatamente a no autenticado para permitir login
      useAuthStore.getState().logout();
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor ingresa usuario y contraseña.');
      return;
    }

    setLoading(true);
    setError(null);
    clearExpiredMessage();

    try {
      const response = await authApi.login({
        username: username.trim(),
        password: password.trim(),
      });

      login(response.token, {
        id: response.id,
        username: response.username,
        nombreCompleto: response.nombreCompleto,
        rol: response.rol,
        permisos: Array.isArray(response.permisos) ? response.permisos : [],
        modulosHabilitados: response.modulosHabilitados,
        empresaCodigo: response.empresaCodigo,
        empresaNombre: response.empresaNombre,
      });

      // Redirigir a la ruta original o al dashboard
      const from = (location.state as any)?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Error al iniciar sesión:', err);
      setError(err.message || 'Usuario o contraseña incorrectos. Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  const handleVincularCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codigoInput.replace(/\D/g, '').trim();
    if (clean.length < 6) {
      setError('El código de verificación debe contener 6 dígitos numéricos');
      return;
    }

    setVinculando(true);
    setError(null);
    clearExpiredMessage();

    try {
      const res = await authApi.vincularDispositivo({
        codigo: clean,
        deviceInfo: `${navigator.userAgent} (${navigator.platform})`,
      });

      const nuevoNombreEmpresa = res.empresaNombre || empresaNombre;
      const dispData = {
        token: res.token,
        empresaCodigo: res.empresaCodigo,
        empresaNombre: nuevoNombreEmpresa,
        id: res.id,
        username: res.username,
        nombreCompleto: res.nombreCompleto,
        rol: res.rol,
        permisos: res.permisos || [],
        camionId: res.camionId,
        placaCamion: res.placaCamion,
        modulosHabilitados: res.modulosHabilitados || [],
      };

      localStorage.setItem('movil_device_info', JSON.stringify(dispData));
      localStorage.setItem(AUTH_TOKEN_KEY, res.token);
      localStorage.setItem('token', res.token);

      login(res.token, {
        id: res.id,
        username: res.username,
        nombreCompleto: res.nombreCompleto,
        rol: res.rol,
        permisos: Array.isArray(res.permisos) ? res.permisos : [],
        modulosHabilitados: res.modulosHabilitados,
        empresaCodigo: res.empresaCodigo,
        empresaNombre: nuevoNombreEmpresa,
      });

      navigate('/movil', { replace: true });
    } catch (err: any) {
      console.error('Error al vincular con código:', err);
      setError(err.response?.data?.message || err.message || 'Código de verificación inválido o expirado. Consulta con tu supervisor.');
    } finally {
      setVinculando(false);
    }
  };

  return (
    <div 
      className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none"
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Fondo decorativo fijo */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
      </div>

      <div 
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 relative z-10"
        style={{ maxWidth: '440px', padding: '2.5rem', margin: 'auto' }}
      >
        {/* Cabecera / Logo */}
        <div className="text-center mb-8" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div 
            className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg shadow-blue-500/30"
            style={{ width: '4rem', height: '4rem', margin: '0 auto 1rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            🥛
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={{ fontSize: '1.5rem', fontWeight: 900 }}>
            Iniciar Sesión
          </h1>
          <div 
            className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.75rem', marginTop: '0.5rem', borderRadius: '9999px' }}
          >
            <Building2 className="w-3.5 h-3.5" style={{ width: '0.875rem', height: '0.875rem' }} />
            <span>{empresaNombre}</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 font-medium" style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
            Sistema de Transporte y Liquidación de Leche
          </p>

          {/* Alerta de sesión expirada */}
          {sessionExpiredMessage && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2 text-left" style={{ marginTop: '1rem', padding: '0.75rem' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <span>{sessionExpiredMessage}</span>
            </div>
          )}

          {/* Alerta de error de autenticación */}
          {error && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2 text-left" style={{ marginTop: '1rem', padding: '0.75rem' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* SELECTOR DE PESTAÑAS: USUARIO/CLAVE VS CÓDIGO 6 DÍGITOS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '14px',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            onClick={() => { setModoAcceso('credenciales'); setError(null); }}
            style={{
              padding: '9px 6px',
              borderRadius: '10px',
              border: 'none',
              background: modoAcceso === 'credenciales' ? '#ffffff' : 'transparent',
              color: modoAcceso === 'credenciales' ? '#2563eb' : '#64748b',
              fontWeight: 800,
              fontSize: '12.5px',
              cursor: 'pointer',
              boxShadow: modoAcceso === 'credenciales' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <User className="w-4 h-4" />
            <span>Usuario y Clave</span>
          </button>

          <button
            type="button"
            onClick={() => { setModoAcceso('codigo'); setError(null); }}
            style={{
              padding: '9px 6px',
              borderRadius: '10px',
              border: 'none',
              background: modoAcceso === 'codigo' ? '#ffffff' : 'transparent',
              color: modoAcceso === 'codigo' ? '#059669' : '#64748b',
              fontWeight: 800,
              fontSize: '12.5px',
              cursor: 'pointer',
              boxShadow: modoAcceso === 'codigo' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <Hash className="w-4 h-4" />
            <span>Código 6 Dígitos</span>
          </button>
        </div>

        {modoAcceso === 'codigo' ? (
          /* FORMULARIO DE ACCESO POR CÓDIGO DE 6 DÍGITOS */
          <form onSubmit={handleVincularCodigo} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
              <div style={{ fontSize: '11px', color: '#059669', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px', marginBottom: '4px' }}>
                Acceso Móvil / Terminal
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Ingresa el código numérico de 6 dígitos para acceder al sistema.
              </p>
            </div>

            <div>
              <label 
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2"
                style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: '0.5rem', textAlign: 'center' }}
              >
                Código de Verificación
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={7}
                value={codigoInput}
                onChange={(e) => setCodigoInput(e.target.value.replace(/\D/g, ''))}
                placeholder="000 000"
                autoFocus
                disabled={vinculando}
                required
                style={{
                  width: '100%',
                  height: '56px',
                  borderRadius: '0.75rem',
                  border: '2px solid #059669',
                  backgroundColor: '#f0fdf4',
                  fontSize: '1.75rem',
                  fontWeight: 900,
                  letterSpacing: '8px',
                  textAlign: 'center',
                  color: '#059669',
                  outline: 'none',
                  boxShadow: '0 4px 15px rgba(5, 150, 105, 0.15)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={vinculando || codigoInput.trim().length < 6}
              style={{
                width: '100%',
                marginTop: '0.5rem',
                padding: '0.875rem 1rem',
                borderRadius: '0.75rem',
                border: 'none',
                background: codigoInput.trim().length >= 6 ? 'linear-gradient(to right, #10b981, #059669)' : '#cbd5e1',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: codigoInput.trim().length >= 6 ? 'pointer' : 'not-allowed',
                boxShadow: codigoInput.trim().length >= 6 ? '0 10px 15px -3px rgba(16, 185, 129, 0.3)' : 'none',
              }}
            >
              {vinculando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verificando código...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-5 h-5" />
                  <span>Vincular y Entrar</span>
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={() => navigate('/movil')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'underline',
                }}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>¿Estás en un teléfono? Ir a la App Móvil de Rutas</span>
              </button>
            </div>
          </form>
        ) : (
          /* FORMULARIO DE ACCESO POR CREDENCIALES (USUARIO Y CONTRASEÑA) */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Campo Usuario */}
            <div>
              <label 
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2"
                style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '0.5rem' }}
              >
                Usuario
              </label>
              <div className="relative flex items-center" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div 
                  className="absolute left-4 flex items-center pointer-events-none text-slate-400"
                  style={{ position: 'absolute', left: '1rem', display: 'flex', alignItems: 'center', pointerEvents: 'none', color: '#94a3b8' }}
                >
                  <User className="w-5 h-5" style={{ width: '1.25rem', height: '1.25rem' }} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nombre de usuario exacto (ej: alfredy.4)"
                  autoComplete="username"
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    paddingLeft: '3.25rem',
                    paddingRight: '1rem',
                    paddingTop: '0.85rem',
                    paddingBottom: '0.85rem',
                    borderRadius: '0.75rem',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    fontSize: '0.875rem',
                    color: '#1e293b',
                    outline: 'none'
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-60 font-medium"
                />
              </div>
            </div>

            {/* Campo Contraseña */}
            <div>
              <label 
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2"
                style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '0.5rem' }}
              >
                Contraseña
              </label>
              <div className="relative flex items-center" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div 
                  className="absolute left-4 flex items-center pointer-events-none text-slate-400"
                  style={{ position: 'absolute', left: '1rem', display: 'flex', alignItems: 'center', pointerEvents: 'none', color: '#94a3b8' }}
                >
                  <Lock className="w-5 h-5" style={{ width: '1.25rem', height: '1.25rem' }} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    paddingLeft: '3.25rem',
                    paddingRight: '3rem',
                    paddingTop: '0.85rem',
                    paddingBottom: '0.85rem',
                    borderRadius: '0.75rem',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    fontSize: '0.875rem',
                    color: '#1e293b',
                    outline: 'none'
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-60 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-4 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer p-1"
                  style={{ position: 'absolute', right: '1rem', display: 'flex', alignItems: 'center', cursor: 'pointer', background: 'none', border: 'none', color: '#94a3b8' }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" style={{ width: '1.25rem', height: '1.25rem' }} /> : <Eye className="w-5 h-5" style={{ width: '1.25rem', height: '1.25rem' }} />}
                </button>
              </div>
            </div>

            {/* Botón de Acceso */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                marginTop: '0.75rem',
                padding: '0.875rem 1rem',
                borderRadius: '0.75rem',
                border: 'none',
                background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)'
              }}
              className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando credenciales...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" style={{ width: '1.25rem', height: '1.25rem' }} />
                  <span>Entrar al Sistema</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <div className="relative z-10 mt-6 text-center" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <p className="text-xs text-slate-500 font-medium" style={{ fontSize: '0.75rem', color: '#64748b' }}>
          &copy; {new Date().getFullYear()} Sistema de Transporte &bull; Plataforma Multiempresa SaaS
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
