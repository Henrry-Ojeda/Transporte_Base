import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { sistemaApi } from '@/api/sistema.api';
import { useAuthStore } from '@/stores/authStore';

export const ConfiguracionPage: React.FC = () => {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin());
  const tieneTolerancia = useAuthStore((state) => state.hasTenantModule('MOD_TOLERANCIA_MERMA'));

  const [toleranciaMerma, setToleranciaMerma] = useState<string>('1.50');
  const [diaCorteSemana, setDiaCorteSemana] = useState<string>('DOMINGO');
  const [alertaCombustibleMin, setAlertaCombustibleMin] = useState<string>('500');
  const [alertaKmSugerido, setAlertaKmSugerido] = useState<string>('500');
  const [balanceIncluirDiferidos, setBalanceIncluirDiferidos] = useState<string>('false');
  const [subTab, setSubTab] = useState<'parametros' | 'tiposLeche' | 'navegacion' | 'licencia'>('parametros');

  // Consulta de parámetros
  const { data: parametros = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['configuracion-parametros'],
    queryFn: () => sistemaApi.getConfiguracion(),
  });

  // Consulta de tipos de leche
  const { data: tiposLeche = [], isLoading: loadingTiposLeche, refetch: refetchTipos } = useQuery<any[]>({
    queryKey: ['configuracion-tipos-leche'],
    queryFn: () => sistemaApi.getTiposLeche(),
    enabled: subTab === 'tiposLeche',
  });

  // Consulta de módulos de navegación
  const { data: modulosAdmin = [], isLoading: loadingModulos, refetch: refetchModulos } = useQuery<any[]>({
    queryKey: ['configuracion-modulos-admin'],
    queryFn: () => sistemaApi.getModulosAdmin(),
    enabled: subTab === 'navegacion',
  });

  // Consulta de información de empresa y licencia
  const { data: empresaConfig, refetch: refetchEmpresa } = useQuery<any>({
    queryKey: ['empresa-config'],
    queryFn: () => sistemaApi.getEmpresaConfig(),
  });

  const [fechaLicencia, setFechaLicencia] = useState<string>('');

  useEffect(() => {
    if (empresaConfig?.fechaVencimientoLicencia) {
      const d = new Date(empresaConfig.fechaVencimientoLicencia);
      if (!isNaN(d.getTime())) {
        setFechaLicencia(d.toISOString().split('T')[0]);
      }
    }
  }, [empresaConfig]);

  const renovarLicenciaMutation = useMutation({
    mutationFn: (nuevaFecha: string) => sistemaApi.actualizarLicencia(nuevaFecha),
    onSuccess: () => {
      Swal.fire({
        icon: 'success',
        title: 'Licencia Actualizada',
        text: 'La fecha de vencimiento de la licencia ha sido renovada exitosamente.',
        confirmButtonColor: '#7c3aed',
      });
      queryClient.invalidateQueries({ queryKey: ['empresa-config'] });
    },
    onError: (err: any) => {
      Swal.fire({
        icon: 'error',
        title: 'Error al Renovar',
        text: err.response?.data?.mensaje || err.response?.data?.message || 'No se pudo actualizar la licencia.',
        confirmButtonColor: '#ef4444',
      });
    },
  });

  // Cargar valores iniciales desde la base de datos
  useEffect(() => {
    if (parametros.length > 0) {
      const getVal = (clave: string, defaultVal: string) => {
        const item = parametros.find((p: any) => (p.clave || p.Clave) === clave);
        return item ? String(item.valor || item.Valor) : defaultVal;
      };

      setToleranciaMerma(getVal('TOLERANCIA_MERMA_PCT', '1.50'));
      setDiaCorteSemana(getVal('DIA_CORTE_SEMANA', 'DOMINGO'));
      setAlertaCombustibleMin(getVal('ALERTA_COMBUSTIBLE_MIN_LITROS', '500'));
      setAlertaKmSugerido(getVal('ALERTA_MANTENIMIENTO_KM', '500'));
      setBalanceIncluirDiferidos(getVal('BALANCE_INCLUIR_DIFERIDOS', 'false'));
    }
  }, [parametros]);

  // Mutación para guardar parámetros
  const guardarMutation = useMutation({
    mutationFn: async () => {
      if (tieneTolerancia) {
        await sistemaApi.guardarParametro('TOLERANCIA_MERMA_PCT', toleranciaMerma);
      }
      await sistemaApi.guardarParametro('DIA_CORTE_SEMANA', diaCorteSemana);
      await sistemaApi.guardarParametro('ALERTA_COMBUSTIBLE_MIN_LITROS', alertaCombustibleMin);
      await sistemaApi.guardarParametro('ALERTA_MANTENIMIENTO_KM', alertaKmSugerido);
      await sistemaApi.guardarParametro('BALANCE_INCLUIR_DIFERIDOS', balanceIncluirDiferidos);
    },
    onSuccess: () => {
      Swal.fire({
        icon: 'success',
        title: 'Parámetros Actualizados',
        text: 'Se han guardado las reglas de negocio y semáforo operativo.',
        confirmButtonColor: '#7c3aed',
        timer: 2000,
        showConfirmButton: false,
      });
      queryClient.invalidateQueries({ queryKey: ['configuracion-parametros'] });
    },
    onError: (err: any) => {
      Swal.fire({
        icon: 'error',
        title: 'Error al Guardar',
        text: err.response?.data?.message || 'No se pudieron actualizar los parámetros.',
        confirmButtonColor: '#ef4444',
      });
    },
  });

  // Mutación para activar/desactivar tipo de leche
  const toggleTipoMutation = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      sistemaApi.toggleTipoLeche(id, activo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion-tipos-leche'] });
    },
  });

  // Mutación para activar/desactivar módulo de menú
  const toggleModuloMutation = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      sistemaApi.toggleModulo(id, activo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion-modulos-admin'] });
    },
  });

  return (
    <div>
      {/* VISTA HEADER */}
      <div className="view-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-sliders" style={{ color: '#a855f7' }}></i>
            Parametrización & Configuración Global
          </h1>
          <p className="view-subtitle">
            Gestión en caliente de parámetros de negocio, catálogo de tipos de leche y activación dinámica de módulos
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              refetch();
              if (subTab === 'tiposLeche') refetchTipos();
              if (subTab === 'navegacion') refetchModulos();
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            <i className="fa-solid fa-arrows-rotate"></i> Recargar
          </button>
          {subTab === 'parametros' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => guardarMutation.mutate()}
              disabled={guardarMutation.isPending}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                border: 'none',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(147, 51, 234, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-floppy-disk"></i>
              {guardarMutation.isPending ? 'Guardando...' : 'Guardar Todo'}
            </button>
          )}
        </div>
      </div>

      {/* BARRA DE PESTAÑAS / SUBMÓDULOS */}
      <div
        className="filter-pills-bar"
        style={{
          marginBottom: '20px',
          background: '#f8fafc',
          border: '1.5px solid #e2e8f0',
          padding: '6px',
          borderRadius: '12px',
          display: 'inline-flex',
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab('parametros')}
          className={`filter-pill ${subTab === 'parametros' ? 'active' : ''}`}
          style={{
            borderRadius: '8px',
            fontWeight: 700,
            padding: '8px 16px',
            fontSize: '13px',
            border: 'none',
            background: subTab === 'parametros' ? '#7c3aed' : 'transparent',
            color: subTab === 'parametros' ? '#ffffff' : '#475569',
            cursor: 'pointer',
          }}
        >
          <i className="fa-solid fa-gears" style={{ marginRight: '6px' }}></i> Parámetros de Negocio
        </button>
        <button
          type="button"
          onClick={() => setSubTab('tiposLeche')}
          className={`filter-pill ${subTab === 'tiposLeche' ? 'active' : ''}`}
          style={{
            borderRadius: '8px',
            fontWeight: 700,
            padding: '8px 16px',
            fontSize: '13px',
            border: 'none',
            background: subTab === 'tiposLeche' ? '#0284c7' : 'transparent',
            color: subTab === 'tiposLeche' ? '#ffffff' : '#475569',
            cursor: 'pointer',
          }}
        >
          <i className="fa-solid fa-bottle-droplet" style={{ marginRight: '6px' }}></i> Tipos de Leche (Vaca & Búfala)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('navegacion')}
          className={`filter-pill ${subTab === 'navegacion' ? 'active' : ''}`}
          style={{
            borderRadius: '8px',
            fontWeight: 700,
            padding: '8px 16px',
            fontSize: '13px',
            border: 'none',
            background: subTab === 'navegacion' ? '#059669' : 'transparent',
            color: subTab === 'navegacion' ? '#ffffff' : '#475569',
            cursor: 'pointer',
          }}
        >
          <i className="fa-solid fa-folder-tree" style={{ marginRight: '6px' }}></i> Módulos de Navegación
        </button>
        <button
          type="button"
          onClick={() => setSubTab('licencia')}
          className={`filter-pill ${subTab === 'licencia' ? 'active' : ''}`}
          style={{
            borderRadius: '8px',
            fontWeight: 700,
            padding: '8px 16px',
            fontSize: '13px',
            border: 'none',
            background: subTab === 'licencia' ? '#4f46e5' : 'transparent',
            color: subTab === 'licencia' ? '#ffffff' : '#475569',
            cursor: 'pointer',
          }}
        >
          <i className="fa-solid fa-certificate" style={{ marginRight: '6px' }}></i> Licencia & Suscripción
        </button>
      </div>

      {/* SUB-TAB 1: PARÁMETROS DE NEGOCIO */}
      {subTab === 'parametros' && (
        <>
          {/* TARJETA ESPECIAL: SEMÁFORO DE TOLERANCIA DE MERMA (solo si MOD_TOLERANCIA_MERMA está activo) */}
          {tieneTolerancia && (
          <div
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderRadius: '14px',
              padding: '20px 24px',
              marginBottom: '22px',
              color: '#ffffff',
              border: '1.5px solid #334155',
              boxShadow: '0 10px 25px rgba(15,23,42,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', maxWidth: '620px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: 'rgba(245, 158, 11, 0.2)',
                    border: '1.5px solid rgba(245, 158, 11, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    color: '#f59e0b',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-traffic-light"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.2px' }}>
                    Semáforo Operativo de Tolerancia de Merma
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.4 }}>
                    Define el porcentaje máximo de pérdida permitido en las rutas. Los tickets se colorean automáticamente en el sistema:
                  </p>
                  <div style={{ display: 'flex', gap: '14px', marginTop: '8px', flexWrap: 'wrap', fontSize: '11.5px', fontWeight: 700 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#34d399' }}>
                      <i className="fa-solid fa-circle" style={{ fontSize: '8px' }}></i> Verde: Sin merma o ganancia (0.00%)
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#fbbf24' }}>
                      <i className="fa-solid fa-circle" style={{ fontSize: '8px' }}></i> Amarillo: Faltante &le; Tolerancia
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#f87171' }}>
                      <i className="fa-solid fa-circle" style={{ fontSize: '8px' }}></i> Rojo: Alerta / Faltante &gt; Tolerancia
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Tolerancia Permitida (%)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="25"
                      value={toleranciaMerma}
                      onChange={(e) => setToleranciaMerma(e.target.value)}
                      style={{
                        width: '95px',
                        height: '38px',
                        textAlign: 'center',
                        fontSize: '17px',
                        fontWeight: 900,
                        background: '#0f172a',
                        color: '#38bdf8',
                        border: '1.5px solid #0284c7',
                        borderRadius: '8px',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8' }}>%</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => guardarMutation.mutate()}
                  disabled={guardarMutation.isPending}
                  style={{
                    height: '40px',
                    padding: '0 16px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    border: 'none',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(2,132,199,0.3)',
                    cursor: 'pointer',
                    color: '#fff',
                  }}
                >
                  <i className="fa-solid fa-floppy-disk"></i> Guardar
                </button>
              </div>
            </div>
          </div>
          )}

          {/* FORMULARIO DE PARÁMETROS GLOBALES */}
          <div className="content-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-gears" style={{ color: '#7c3aed' }}></i> Reglas de Negocio & Parámetros Operativos
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Día de Cierre de Ciclo Semanal
                </label>
                <select
                  value={diaCorteSemana}
                  onChange={(e) => setDiaCorteSemana(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '40px', fontWeight: 700, borderRadius: '8px' }}
                >
                  <option value="DOMINGO">Domingo (Corte Oficial Tradicional)</option>
                  <option value="LUNES">Lunes</option>
                  <option value="SABADO">Sábado</option>
                </select>
                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Día utilizado como límite de agrupación en nóminas y conciliaciones.
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Litros Diferidos en Balance de Silos
                </label>
                <select
                  value={balanceIncluirDiferidos}
                  onChange={(e) => setBalanceIncluirDiferidos(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '40px', fontWeight: 700, borderRadius: '8px' }}
                >
                  <option value="false">No sumar diferidos (solo volumen neto del ciclo)</option>
                  <option value="true">Sí sumar diferidos (volumen físico total)</option>
                </select>
                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Define si los litros diferidos al siguiente ciclo se suman o se excluyen del Balance General de Silos.
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Alerta Combustible Crítico (Litros en Tanque)
                </label>
                <input
                  type="number"
                  value={alertaCombustibleMin}
                  onChange={(e) => setAlertaCombustibleMin(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '40px', fontWeight: 700, borderRadius: '8px' }}
                />
                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Se muestra una advertencia en el módulo de combustible si el stock baja de esta cifra.
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Alerta Preventiva Odómetro Mantenimiento (Km)
                </label>
                <input
                  type="number"
                  value={alertaKmSugerido}
                  onChange={(e) => setAlertaKmSugerido(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '40px', fontWeight: 700, borderRadius: '8px' }}
                />
                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Kilometraje de anticipación para notificar cambios de aceite y filtros.
                </small>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => guardarMutation.mutate()}
                disabled={guardarMutation.isPending}
                style={{
                  padding: '10px 24px',
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(147, 51, 234, 0.3)',
                }}
              >
                <i className="fa-solid fa-floppy-disk" style={{ marginRight: '6px' }}></i>
                {guardarMutation.isPending ? 'Guardando...' : 'Guardar Parámetros'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* SUB-TAB 2: TIPOS DE LECHE & PRECIOS */}
      {subTab === 'tiposLeche' && (
        <div className="content-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-bottle-droplet" style={{ color: '#0284c7' }}></i> Catálogo de Tipos de Leche
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                Habilita o desactiva tipos de leche en el sistema (Vaca y Búfala)
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>CÓDIGO</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>TIPO DE LECHE</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>DESCRIPCIÓN</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>FACTOR PRECIO</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {(tiposLeche.length ? tiposLeche : [
                  { id: 1, codigo: 'VACA', nombre: 'Leche de Vaca', descripcion: 'Leche bovina estándar pasteurizable', factorPrecio: 1.0, activo: true },
                  { id: 2, codigo: 'BUFALA', nombre: 'Leche de Búfala', descripcion: 'Leche bufalina de alto tenor graso', factorPrecio: 1.15, activo: true },
                ]).map((t: any) => (
                  <tr key={t.id || t.codigo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace', color: '#0284c7' }}>
                      {t.codigo || t.Codigo}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>
                      <span style={{ marginRight: '8px' }}>{(t.codigo || t.Codigo) === 'BUFALA' ? '🐃' : '🥛'}</span>
                      {t.nombre || t.Nombre}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '13px' }}>
                      {t.descripcion || t.Descripcion || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                      {Number(t.factorPrecio || t.FactorPrecio || 1).toFixed(2)}x
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {(t.codigo || t.Codigo) === 'BUFALA' && !isSuperAdmin ? (
                        <button
                          type="button"
                          disabled
                          className="badge"
                          style={{
                            cursor: 'not-allowed',
                            border: '1.5px solid #cbd5e1',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            background: '#f1f5f9',
                            color: '#64748b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                          title="El módulo de Búfala está bajo suscripción autorizada por el SuperAdmin."
                        >
                          <i className="fa-solid fa-lock" style={{ fontSize: '10px' }}></i>
                          {t.activo ? '✓ Licenciado' : '✕ Bloqueado'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleTipoMutation.mutate({ id: t.id, activo: !t.activo })}
                          className={`badge ${t.activo ? 'badge-success' : 'badge-danger'}`}
                          style={{
                            cursor: 'pointer',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            background: t.activo ? '#ecfdf5' : '#fef2f2',
                            color: t.activo ? '#059669' : '#dc2626',
                          }}
                        >
                          {t.activo ? '✓ Activo' : '✕ Inactivo'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: MÓDULOS DE NAVEGACIÓN */}
      {subTab === 'navegacion' && (
        <div className="content-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-folder-tree" style={{ color: '#059669' }}></i> Módulos y Navegación del Sistema
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                {isSuperAdmin
                  ? 'Active o desactive los módulos conmutables de la plataforma para este cliente'
                  : 'Visibilidad de los módulos en la barra de menú lateral (Los módulos contratados son gestionados por el SuperAdmin)'}
              </p>
            </div>
            {!isSuperAdmin && (
              <span
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <i className="fa-solid fa-lock text-amber-500"></i> Control Maestro por SuperAdmin
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
            {(modulosAdmin.length ? modulosAdmin : [
              { id: 1, codigo: 'OPERACIONES', nombre: 'Recolección y Rutas', ruta: '/recoleccion', icono: 'fa-truck-droplet', activo: true },
              { id: 2, codigo: 'RECEPTORIA', nombre: 'Receptoría y Silos', ruta: '/receptoria', icono: 'fa-warehouse', activo: true },
              { id: 3, codigo: 'SEMANAS', nombre: 'Semanas Operativas', ruta: '/semanas', icono: 'fa-calendar-week', activo: true },
              { id: 4, codigo: 'FINCAS', nombre: 'Fincas Ganaderas', ruta: '/fincas', icono: 'fa-cow', activo: true },
              { id: 5, codigo: 'CAMIONES', nombre: 'Flota y Camiones', ruta: '/camiones', icono: 'fa-truck', activo: true },
              { id: 6, codigo: 'REPORTES', nombre: 'Reportes y Liquidaciones', ruta: '/reportes', icono: 'fa-chart-pie', activo: true },
            ]).map((mod: any) => (
              <div
                key={mod.id || mod.codigo}
                style={{
                  padding: '14px 18px',
                  borderRadius: '12px',
                  border: '1.5px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: '#e0f2fe',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                    }}
                  >
                    <i className={`fa-solid ${mod.icono || 'fa-folder'}`}></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13.5px' }}>{mod.nombre || mod.Nombre}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{mod.ruta || mod.Ruta}</div>
                  </div>
                </div>

                {!isSuperAdmin ? (
                  <button
                    type="button"
                    disabled
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'not-allowed',
                      border: '1.5px solid #cbd5e1',
                      background: '#f1f5f9',
                      color: '#64748b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                    title="Solo el SuperAdmin puede activar o desactivar módulos del sistema."
                  >
                    <i className="fa-solid fa-lock" style={{ fontSize: '10px' }}></i>
                    {mod.activo ? 'Habilitado' : 'Deshabilitado'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleModuloMutation.mutate({ id: mod.id, activo: !mod.activo })}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      border: 'none',
                      background: mod.activo ? '#ecfdf5' : '#fef2f2',
                      color: mod.activo ? '#059669' : '#dc2626',
                    }}
                  >
                    {mod.activo ? 'Visible' : 'Oculto'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: LICENCIA & SUSCRIPCIÓN DEL SISTEMA */}
      {subTab === 'licencia' && (
        <div className="content-card" style={{ padding: '28px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📜</span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Licencia & Estado de Suscripción del Sistema
                </h3>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Control de vigencia operativa, validez de licencia y parámetros de acceso de este cliente
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  background: '#ecfdf5',
                  color: '#059669',
                  border: '1.5px solid #a7f3d0',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                LICENCIA ACTIVA & AUTORIZADA
              </span>
            </div>
          </div>

          {/* Grid de Estado */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginBottom: '24px' }}>
            {/* Empresa */}
            <div style={{ padding: '18px', borderRadius: '12px', background: '#f8fafc', border: '1.5px solid #e2e8f0' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                Empresa Titular
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                {empresaConfig?.nombre || 'Productos Lácteos Campo Verde, C.A.'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', marginTop: '4px' }}>
                RIF: {empresaConfig?.rif || 'J-12345678-9'}
              </div>
            </div>

            {/* Fecha de Vencimiento */}
            <div style={{ padding: '18px', borderRadius: '12px', background: '#f5f3ff', border: '1.5px solid #ddd6fe' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', marginBottom: '6px' }}>
                Fecha de Vencimiento
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-calendar-check" style={{ color: '#7c3aed' }}></i>
                {empresaConfig?.fechaVencimientoLicencia 
                  ? new Date(empresaConfig.fechaVencimientoLicencia).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
                  : '31 de diciembre de 2027'}
              </div>
              <div style={{ fontSize: '11.5px', color: '#6d28d9', marginTop: '4px' }}>
                {isSuperAdmin ? 'Editable por SuperAdmin' : 'Solo lectura (Consulte a Soporte/SuperAdmin)'}
              </div>
            </div>

            {/* Nivel de Operador Actual */}
            <div style={{ padding: '18px', borderRadius: '12px', background: isSuperAdmin ? '#fdf4ff' : '#eff6ff', border: `1.5px solid ${isSuperAdmin ? '#f5d0fe' : '#bfdbfe'}` }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: isSuperAdmin ? '#c026d3' : '#1d4ed8', textTransform: 'uppercase', marginBottom: '6px' }}>
                Tu Rol Actual en Sistema
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: isSuperAdmin ? '#86198f' : '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className={`fa-solid ${isSuperAdmin ? 'fa-crown text-amber-500' : 'fa-user-shield text-blue-600'}`}></i>
                {isSuperAdmin ? 'Super Administrador (Dueño)' : 'Administrador del Cliente'}
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                {isSuperAdmin ? 'Permiso total de actualización de licencias' : 'Permiso de visualización de vencimiento'}
              </div>
            </div>
          </div>

          {/* Panel de Actualización / Renovación */}
          {isSuperAdmin ? (
            <div style={{ padding: '20px', borderRadius: '12px', background: '#faf5ff', border: '1.5px solid #e9d5ff', marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <i className="fa-solid fa-key" style={{ color: '#7c3aed', fontSize: '16px' }}></i>
                <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#4c1d95' }}>
                  Renovación / Modificación de Licencia (Acceso Exclusivo SuperAdmin)
                </h4>
              </div>
              <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: '#6b21a8' }}>
                Establezca la nueva fecha límite de expiración para la base de datos de este cliente.
              </p>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={fechaLicencia}
                  onChange={(e) => setFechaLicencia(e.target.value)}
                  className="form-input"
                  style={{
                    height: '42px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: '1.5px solid #c084fc',
                    background: '#ffffff',
                    padding: '0 12px',
                    color: '#0f172a',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!fechaLicencia) {
                      Swal.fire('Atención', 'Seleccione una fecha válida.', 'warning');
                      return;
                    }
                    renovarLicenciaMutation.mutate(fechaLicencia);
                  }}
                  disabled={renovarLicenciaMutation.isPending}
                  style={{
                    height: '42px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '13px',
                    background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  {renovarLicenciaMutation.isPending ? 'Actualizando...' : 'Guardar Nueva Fecha de Licencia'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px 20px', borderRadius: '12px', background: '#f8fafc', border: '1.5px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fa-solid fa-circle-info" style={{ color: '#0284c7', fontSize: '20px' }}></i>
              <div style={{ fontSize: '12.5px', color: '#334155' }}>
                <strong>Vigencia Informativa:</strong> Como Administrador puedes consultar la fecha de vencimiento. Para renovar, ampliar cuotas o solicitar nuevos módulos licenciados, contacte a la administración general del servicio.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConfiguracionPage;
