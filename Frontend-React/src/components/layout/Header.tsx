import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import apiClient from '@/api/client';
import { bcvApi } from '@/api/bcv.api';
import { notificacionesApi, type NotificacionMovil } from '@/api/notificaciones.api';
import Swal from 'sweetalert2';

interface HeaderProps {
  onToggleSidebar: () => void;
}

interface BcvResponse {
  tieneTasaHoy: boolean;
  tasaDolarBs: number;
  fecha?: string;
  fuente?: string;
}

interface CicloActivoResponse {
  id?: number;
  codigo?: string;
  numeroSemana?: number;
  semana?: number;
  año?: number;
  fechaInicio?: string;
  fechaFin?: string;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const navigate = useNavigate();
  const { user, logout, isAppHijo } = useAuthStore();
  const esHijo = isAppHijo();
  const rolVisible = esHijo && (user?.rol === 'SUPERADMIN' || user?.esSuperAdmin) ? 'ADMIN' : (user?.rol || 'ADMIN');
  const queryClient = useQueryClient();
  const [sincronizandoBcv, setSincronizandoBcv] = useState(false);
  const userRol = String(user?.rol || '').toUpperCase();
  const puedeVerYGestionarBcv = !['CHOFER', 'RECEPTOR'].includes(userRol);

  // Query Tasa BCV (Solo para usuarios autorizados; Chofer y Receptor no gestionan montos ni tasas)
  const { data: bcvData, isLoading: loadingBcv, refetch: refetchBcv } = useQuery<BcvResponse>({
    queryKey: ['bcv-hoy'],
    queryFn: async () => {
      const res = await apiClient.get<BcvResponse>('/bcv/hoy');
      return res.data;
    },
    enabled: !!user && puedeVerYGestionarBcv,
    staleTime: 1000 * 60 * 10,
    refetchInterval: 1000 * 60 * 15,
  });

  // Query Ciclo Activo
  const { data: cicloData, isLoading: loadingCiclo } = useQuery<CicloActivoResponse>({
    queryKey: ['ciclo-activo'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<CicloActivoResponse>('/ciclos/activo');
        return res.data;
      } catch {
        const fallback = await apiClient.get<CicloActivoResponse>('/catalogos/ciclo-activo');
        return fallback.data;
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30,
  });

  // Query Empresa Config (100% dinámico desde BD)
  const { data: empresaConfig } = useQuery({
    queryKey: ['empresa-config'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<any>('/catalogos/empresa');
        return res.data;
      } catch {
        return null;
      }
    },
    enabled: !!user,
  });

  // Notificaciones en Vivo del Sistema
  const [openNotif, setOpenNotif] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Cerrar panel de notificaciones al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setOpenNotif(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Roles autorizados para supervisión y administración
  const esAdminOSupervisor = 
    userRol.includes('ADMIN') || 
    userRol.includes('SUPERVISOR') ||
    userRol.includes('GERENTE') ||
    Boolean(user?.permisos?.some((p: string) => ['TODOS', 'ADMIN_TOTAL', 'RUTAS_CREAR', 'RUTAS_EDITAR'].includes(p)));

  // IDs de notificaciones marcadas como leídas localmente
  const [leidasIds, setLeidasIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('transporte_notif_leidas_ids') || '[]');
    } catch {
      return [];
    }
  });

  // Escuchar eventos de sincronización móvil entre pestañas / ventanas
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'transporte_evento_finca_movil' || e.key === 'transporte_notif_leidas_ids') {
        if (e.key === 'transporte_notif_leidas_ids' && e.newValue) {
          try {
            setLeidasIds(JSON.parse(e.newValue));
          } catch { /* tolerante */ }
        }
        queryClient.invalidateQueries({ queryKey: ['mis-notificaciones'] });
        queryClient.invalidateQueries({ queryKey: ['header-paradas-hoy'] });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [queryClient]);

  // 1. Query Backend Directo (BD)
  const { data: serverNotificaciones = [] } = useQuery<NotificacionMovil[]>({
    queryKey: ['mis-notificaciones'],
    queryFn: () => notificacionesApi.getMisNotificaciones(30),
    enabled: !!user,
    refetchInterval: 3500,
  });

  // 2. Query Paradas en Vivo para Administradores y Supervisores
  const hoyStr = new Date().toISOString().split('T')[0];
  const { data: paradasEnVivo = [] } = useQuery<any[]>({
    queryKey: ['header-paradas-hoy'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<any[]>('/rutas?limite=40');
        if (Array.isArray(res.data) && res.data.length > 0) return res.data;
        const fallback = await apiClient.get<any[]>(`/rutas/hoy?fecha=${hoyStr}`);
        return Array.isArray(fallback.data) ? fallback.data : [];
      } catch {
        return [];
      }
    },
    enabled: !!user && esAdminOSupervisor,
    refetchInterval: 3500,
  });

  // Consolidación reactiva de notificaciones
  const notificaciones = useMemo(() => {
    const leidasSet = new Set(leidasIds);
    const resultado: (NotificacionMovil & { keyId: string })[] = [];
    const keysRegistradas = new Set<string>();

    // 1. Notificaciones directas del servidor
    serverNotificaciones.forEach((n) => {
      const keyId = `srv_${n.id}`;
      keysRegistradas.add(keyId);
      const estaLeida = Boolean(n.leido || leidasSet.has(keyId) || leidasSet.has(String(n.id)));
      resultado.push({
        ...n,
        keyId,
        leido: estaLeida,
      });
    });

    // 2. Paradas en vivo para roles Supervisor y Admin
    if (esAdminOSupervisor && Array.isArray(paradasEnVivo)) {
      const ordenadas = [...paradasEnVivo].sort((a, b) => (b.id || 0) - (a.id || 0));

      ordenadas.slice(0, 20).forEach((p) => {
        const keyId = `parada_${p.id}`;
        if (keysRegistradas.has(keyId)) return;
        keysRegistradas.add(keyId);

        const ticketNum = p.ticketCodigo || p.controlRutaId || p.ControlRutaId || '';
        const chofer = p.conductorNombre || p.conductor || p.ConductorNombre || 'Conductor';
        const finca = p.fincaNombre || p.nombreFinca || p.FincaNombre || `Finca #${p.fincaId || ''}`;
        const litros = Number(p.litros || p.Litros || 0).toLocaleString('es-VE');
        const estaLeida = leidasSet.has(keyId);

        resultado.push({
          id: p.id,
          keyId,
          usuarioId: user?.id || 0,
          tipo: 'FINCA_AGREGADA',
          titulo: `🥛 Finca en Ticket #${ticketNum}`,
          mensaje: `${chofer} agregó ${finca} (${litros} Lts) al Ticket #${ticketNum}.`,
          fechaOperativa: p.fecha || hoyStr,
          referenciaId: p.controlRutaId || (typeof ticketNum === 'number' ? ticketNum : undefined),
          leido: estaLeida,
          createdAt: p.createdAt || p.fecha || new Date().toISOString(),
        });
      });
    }

    // Ordenar todas por fecha / ID descendente
    resultado.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return resultado;
  }, [serverNotificaciones, paradasEnVivo, esAdminOSupervisor, leidasIds, user?.id, hoyStr]);

  const unreadCount = notificaciones.filter((n) => !n.leido).length;

  const handleMarcarTodasLeidas = async () => {
    try {
      await notificacionesApi.marcarTodasLeidas();
    } catch { /* tolerante */ }

    const nuevoSet = new Set(leidasIds);
    notificaciones.forEach((n) => {
      nuevoSet.add(n.keyId);
      nuevoSet.add(String(n.id));
    });
    const nuevoArr = Array.from(nuevoSet);
    setLeidasIds(nuevoArr);
    try {
      localStorage.setItem('transporte_notif_leidas_ids', JSON.stringify(nuevoArr));
    } catch { /* tolerante */ }

    queryClient.invalidateQueries({ queryKey: ['mis-notificaciones'] });
    queryClient.invalidateQueries({ queryKey: ['header-paradas-hoy'] });
  };

  const handleIrARecoleccion = async (notif: NotificacionMovil & { keyId?: string }) => {
    try {
      if (typeof notif.id === 'number' && !notif.keyId?.startsWith('parada_')) {
        await notificacionesApi.marcarLeida(notif.id);
      }
    } catch { /* tolerante */ }

    const nuevoSet = new Set(leidasIds);
    if (notif.keyId) nuevoSet.add(notif.keyId);
    nuevoSet.add(String(notif.id));
    const nuevoArr = Array.from(nuevoSet);
    setLeidasIds(nuevoArr);
    try {
      localStorage.setItem('transporte_notif_leidas_ids', JSON.stringify(nuevoArr));
    } catch { /* tolerante */ }

    queryClient.invalidateQueries({ queryKey: ['mis-notificaciones'] });
    queryClient.invalidateQueries({ queryKey: ['header-paradas-hoy'] });

    setOpenNotif(false);

    // Extraer número de ticket
    const matchTicket = (notif.titulo || notif.mensaje || '').match(/Ticket\s*#?(\d+)/i);
    const ticketId = notif.referenciaId || (matchTicket ? matchTicket[1] : undefined);

    // Extraer fecha operativa del ticket
    let fechaTarget = '';
    if (notif.fechaOperativa) {
      fechaTarget = String(notif.fechaOperativa).split('T')[0];
    } else if (notif.createdAt) {
      fechaTarget = String(notif.createdAt).split('T')[0];
    }

    const params = new URLSearchParams();
    if (fechaTarget) params.set('fecha', fechaTarget);
    if (ticketId) params.set('ticket', String(ticketId));

    navigate(`/rutas?${params.toString()}`);
  };

  const calcularTiempo = (fechaIso?: string) => {
    if (!fechaIso) return '';
    const diff = (Date.now() - new Date(fechaIso).getTime()) / 1000;
    if (diff < 60) return 'Hace un momento';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    return new Date(fechaIso).toLocaleDateString('es-VE');
  };

  const handleSyncBcv = async () => {
    if (!puedeVerYGestionarBcv) return;
    if (sincronizandoBcv) return;
    setSincronizandoBcv(true);
    try {
      const res = await bcvApi.sincronizarTasaBcvLive();
      await queryClient.invalidateQueries({ queryKey: ['bcv-hoy'] });
      await queryClient.invalidateQueries({ queryKey: ['historial-bcv'] });
      await refetchBcv();
      Swal.fire({
        icon: 'success',
        title: '¡Tasa BCV Sincronizada!',
        html: `<strong>Tasa oficial:</strong> Bs. ${res.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}<br/><small style="color: #64748b;">Fuente: ${res.fuente} (${res.fecha})</small>`,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'Entendido',
      });
    } catch (err: any) {
      let mensajeError = err?.response?.data?.message || err?.message || '';
      if (typeof err?.response?.data === 'string' && err.response.data.includes('<html')) {
        mensajeError = 'El servidor no pudo procesar la sincronización en este momento (Servidor ocupado o respuesta 502). Intente nuevamente en unos instantes.';
      } else if (typeof mensajeError === 'string' && (mensajeError.includes('<html') || mensajeError.includes('<!DOCTYPE') || mensajeError.includes('502 Bad Gateway'))) {
        mensajeError = 'Servicio de sincronización no disponible temporalmente. Intente nuevamente en unos minutos.';
      } else if (!mensajeError) {
        mensajeError = 'No se pudo conectar a los servicios de tasa BCV en vivo.';
      }

      Swal.fire({
        icon: 'error',
        title: 'Error de sincronización',
        text: mensajeError,
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setSincronizandoBcv(false);
    }
  };

  const tasa = bcvData?.tasaDolarBs ?? 0;

  // Cálculo ISO 8601 robusto de semana
  let computedWeek = 0;
  let computedYear = 0;
  const fechaRef = cicloData?.fechaInicio;
  if (fechaRef) {
    const d = new Date(fechaRef);
    if (!isNaN(d.getTime())) {
      const target = new Date(d.valueOf());
      const dayNr = (d.getDay() + 6) % 7;
      target.setDate(target.getDate() - dayNr + 3);
      const firstThursday = target.valueOf();
      target.setMonth(0, 1);
      if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
      }
      computedWeek = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
      computedYear = new Date(firstThursday).getFullYear();
    }
  }

  const match = cicloData?.codigo?.match(/Semana\s*#?\s*(\d+)/i) || cicloData?.codigo?.match(/(\d+)/);
  const numSemana = cicloData?.numeroSemana || cicloData?.semana || (match ? parseInt(match[1]) : 0) || computedWeek || cicloData?.id || 0;
  const fechaIniStr = cicloData?.fechaInicio ? new Date(cicloData.fechaInicio).toLocaleDateString('es-VE') : '';
  const fechaFinStr = cicloData?.fechaFin ? new Date(cicloData.fechaFin).toLocaleDateString('es-VE') : '';
  
  const rawCode = (cicloData?.codigo || '').trim();
  const esCodigoInvalido = !rawCode || rawCode.includes('# ()') || rawCode.endsWith('()') || !/\d+/.test(rawCode);
  const nombreSemana = esCodigoInvalido ? `Semana #${numSemana}` : rawCode.split('(')[0].trim();

  const textoCiclo = (cicloData?.id || numSemana > 0)
    ? `${nombreSemana}${fechaIniStr ? ` (${fechaIniStr} al ${fechaFinStr})` : ''}`
    : 'No hay semana activa';

  const userInitials = (user?.nombreCompleto || user?.username || 'AD')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <header className="top-nav">
      <div className="nav-left" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          className="mobile-menu-toggle"
          id="btnToggleMobileSidebar"
          onClick={onToggleSidebar}
          aria-label="Abrir Menú"
          title="Menú"
          style={{ cursor: 'pointer' }}
        >
          <i className="fa-solid fa-bars"></i>
        </button>
        <div className="brand-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {empresaConfig?.logoUrl ? (
            <img
              src={empresaConfig.logoUrl}
              alt="Logo"
              style={{ maxHeight: '28px', maxWidth: '40px', objectFit: 'contain', borderRadius: '4px' }}
            />
          ) : (
            <i className="fa-solid fa-cow brand-icon"></i>
          )}
          <div>
            <span className="brand-title">
              {empresaConfig?.nombre || empresaConfig?.nombreEmpresa || 'RUTAS DE LECHE'}
            </span>
          </div>
        </div>
      </div>

      <div className="nav-center">
        {/* WIDGET TASA BCV HOY (Exclusivo Administradores, Supervisores y Finanzas - Chofer y Receptor no gestionan montos ni tasas) */}
        {puedeVerYGestionarBcv && (
          <div
            className="bcv-widget"
            id="bcvWidget"
            title="Consultar y registrar tasa oficial en vivo"
            style={{ cursor: 'pointer' }}
            onClick={handleSyncBcv}
          >
            <div className="bcv-icon">
              <i className={`fa-solid ${sincronizandoBcv ? 'fa-spinner fa-spin' : 'fa-dollar-sign'}`}></i>
            </div>
            <div className="bcv-info">
              <span className="bcv-label">TASA BCV HOY</span>
              <span className="bcv-value" id="bcvHoyTexto">
                {loadingBcv || sincronizandoBcv ? (
                  'Sincronizando...'
                ) : tasa > 0 ? (
                  `Bs. ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                ) : (
                  'Por definir'
                )}
              </span>
            </div>
            <button
              className="btn-icon"
              id="btnSyncBcvApi"
              title="Sincronizar tasa en vivo desde BCV"
              disabled={sincronizandoBcv}
              style={{ color: '#34d399', marginLeft: '4px', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                handleSyncBcv();
              }}
            >
              <i className={`fa-solid fa-arrows-rotate ${loadingBcv || sincronizandoBcv ? 'fa-spin' : ''}`}></i>
            </button>
          </div>
        )}

        {/* WIDGET SEMANA OPERATIVA */}
        <div className="ciclo-widget" id="cicloWidget">
          <i className="fa-regular fa-calendar-check ciclo-icon"></i>
          <div>
            <span className="ciclo-label">SEMANA OPERATIVA ACTIVA</span>
            <span className="ciclo-value" id="cicloActivoTexto">
              {loadingCiclo ? (
                'Cargando...'
              ) : (
                <>
                  <span className="ciclo-semana-title" style={{ fontWeight: 800 }}>{nombreSemana}</span>
                  {fechaIniStr && (
                    <span className="ciclo-fechas-rango text-slate-500 font-normal">
                      {' '}({fechaIniStr} al {fechaFinStr})
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* CAMPANA DE NOTIFICACIONES */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            type="button"
            id="btnNotificationBell"
            onClick={() => setOpenNotif(!openNotif)}
            style={{
              position: 'relative',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: openNotif ? '#eff6ff' : '#ffffff',
              border: `1.5px solid ${unreadCount > 0 ? '#3b82f6' : '#e2e8f0'}`,
              color: unreadCount > 0 ? '#2563eb' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.05)',
              transition: 'all 0.2s ease',
            }}
            title="Notificaciones del Sistema"
          >
            <i className={`fa-solid fa-bell ${unreadCount > 0 ? 'fa-shake' : ''}`} style={{ fontSize: '15px' }}></i>
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 900,
                  minWidth: '18px',
                  height: '18px',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)',
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* MENÚ DESPLEGABLE DE NOTIFICACIONES */}
          {openNotif && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: 0,
                width: '370px',
                maxWidth: '90vw',
                background: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)',
                zIndex: 1050,
                overflow: 'hidden',
              }}
            >
              {/* Cabecera del Panel */}
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-bell" style={{ color: '#2563eb' }}></i>
                  <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                    Notificaciones
                  </span>
                  {unreadCount > 0 && (
                    <span
                      style={{
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        padding: '1px 7px',
                        borderRadius: '999px',
                      }}
                    >
                      {unreadCount} nuevas
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarcarTodasLeidas}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Marcar todas leídas
                  </button>
                )}
              </div>

              {/* Lista de Notificaciones */}
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {notificaciones.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="fa-regular fa-bell-slash" style={{ fontSize: '28px', marginBottom: '8px', display: 'block', color: '#cbd5e1' }}></i>
                    <span style={{ fontSize: '12.5px', fontWeight: 600 }}>No hay notificaciones</span>
                  </div>
                ) : (
                  notificaciones.slice(0, 15).map((n) => {
                    const esFinca = n.tipo === 'FINCA_AGREGADA';
                    const esRuta = n.tipo === 'RUTA_ASIGNADA';

                    return (
                      <div
                        key={(n as any).keyId || n.id}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid #f1f5f9',
                          background: n.leido ? '#ffffff' : '#f0fdf4',
                          transition: 'background 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: esFinca ? '#dcfce7' : esRuta ? '#eff6ff' : '#faf5ff',
                              color: esFinca ? '#16a34a' : esRuta ? '#2563eb' : '#9333ea',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '13px',
                              flexShrink: 0,
                              marginTop: '2px',
                            }}
                          >
                            <i className={esFinca ? 'fa-solid fa-cow' : esRuta ? 'fa-solid fa-truck' : 'fa-solid fa-building'}></i>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                              <strong style={{ fontSize: '12.5px', color: '#0f172a' }}>{n.titulo}</strong>
                              <span style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: '6px' }}>
                                {calcularTiempo(n.createdAt)}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: 1.35 }}>
                              {n.mensaje}
                            </p>

                            {/* BOTÓN IR A RECOLECCIÓN (SI ESTOY FUERA DE RECOLECCIÓN) */}
                            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                onClick={() => handleIrARecoleccion(n)}
                                style={{
                                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '5px 12px',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)',
                                }}
                              >
                                <span>Ir a Recolección</span>
                                <i className="fa-solid fa-arrow-right" style={{ fontSize: '9.5px' }}></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* WIDGET PERFIL USUARIO PROFESIONAL (ESTILO EXECUTIVE SAAS) */}
        <div
          id="userProfileWidget"
          className="header-user-widget"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '999px',
            padding: '4px 6px 4px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            transition: 'all 0.2s ease',
          }}
        >
          {/* Zona clickeable hacia el Perfil */}
          <div
            onClick={() => navigate('/perfil')}
            title="Ir a Mi Perfil de Usuario"
            className="header-user-trigger"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '999px',
              userSelect: 'none',
            }}
          >
            {/* Avatar con anillo y badge en línea */}
            <div className="header-user-avatar-wrap" style={{ position: 'relative' }}>
              <div
                id="userAvatar"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                  border: '2px solid #ffffff',
                }}
              >
                {user?.fotoUrl ? (
                  <img
                    src={user.fotoUrl}
                    alt={user.nombreCompleto}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  userInitials || 'AD'
                )}
              </div>
              {/* Punto de estado En Línea */}
              <span
                style={{
                  position: 'absolute',
                  bottom: '1px',
                  right: '1px',
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: '#10b981',
                  border: '2px solid #ffffff',
                }}
                title="Sesión Activa"
              />
            </div>

            {/* Detalles de Usuario Tipografía Ejecutiva (se ocultan en móvil para no desbordar) */}
            <div className="header-user-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
              <span
                id="userNameLabel"
                className="header-user-name"
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#0f172a',
                  maxWidth: '160px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.25,
                }}
                title={user?.nombreCompleto || user?.username || 'Usuario'}
              >
                {user?.nombreCompleto || user?.username || 'Administrador'}
              </span>
              <div className="header-user-badge-wrap" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                <span
                  id="userRoleBadge"
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 800,
                    color: '#0284c7',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    padding: '1px 6px',
                    borderRadius: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    lineHeight: 1.2,
                  }}
                >
                  <i className="fa-solid fa-shield-halved" style={{ fontSize: '8.5px', marginRight: '3px' }}></i>
                  {rolVisible}
                </span>
              </div>
            </div>

            <i className="fa-solid fa-angle-right header-user-arrow" style={{ fontSize: '11px', color: '#94a3b8', margin: '0 2px' }}></i>
          </div>

          {/* Separador vertical sutil */}
          <div className="header-user-divider" style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />

          {/* Botón Salir / Logout Ejecutivo */}
          <button
            type="button"
            id="btnLogout"
            className="header-user-logout"
            title="Cerrar Sesión Segura"
            onClick={(e) => {
              e.stopPropagation();
              logout();
            }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#fef2f2',
              color: '#ef4444',
              border: '1px solid #fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontSize: '12.5px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = '#ef4444';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fef2f2';
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.borderColor = '#fee2e2';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
