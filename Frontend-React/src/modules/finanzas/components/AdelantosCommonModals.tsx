import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { toast } from 'sonner';
import { finanzasApi } from '@/api/finanzas.api';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import type { CicloSemanalDto } from '@/types';

interface EntityOption {
  value: string;
  label: string;
  sublabel?: string;
}

// -------------------------------------------------------------
// 1. MODAL CREAR ADELANTO (FINCA, COMPANIA, RECEPTORIA)
// -------------------------------------------------------------
interface ModalCrearAdelantoProps {
  isOpen: boolean;
  onClose: () => void;
  tipoEntidad: 'FINCA' | 'COMPANIA' | 'RECEPTORIA';
  entidades: EntityOption[];
  semanas: any[];
  tasaBcvActual: number;
  cicloActivoId?: number;
  onSuccess: () => void;
}

export const ModalCrearAdelanto: React.FC<ModalCrearAdelantoProps> = ({
  isOpen,
  onClose,
  tipoEntidad,
  entidades,
  semanas,
  tasaBcvActual,
  cicloActivoId,
  onSuccess,
}) => {
  const [entidadId, setEntidadId] = useState<string>('');
  const [montoTotalUSD, setMontoTotalUSD] = useState<number>(0);
  const [numeroCuotas, setNumeroCuotas] = useState<number>(1);
  const [tasaBcv, setTasaBcv] = useState<number>(tasaBcvActual || 36.5);
  const [fechaSolicitud, setFechaSolicitud] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [semanaInicioId, setSemanaInicioId] = useState<string>(cicloActivoId ? String(cicloActivoId) : '');
  const [observacion, setObservacion] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEntidadId('');
      setMontoTotalUSD(0);
      setNumeroCuotas(1);
      setTasaBcv(tasaBcvActual || 36.5);
      setFechaSolicitud(new Date().toISOString().split('T')[0]);
      setSemanaInicioId(cicloActivoId ? String(cicloActivoId) : '');
      setObservacion('');
      setCuotasEditables([]);
    }
  }, [isOpen, tasaBcvActual, cicloActivoId]);

  const montoTotalBs = useMemo(() => {
    return Number((montoTotalUSD * tasaBcv).toFixed(2));
  }, [montoTotalUSD, tasaBcv]);

  const cuotaEstimadaUSD = useMemo(() => {
    return numeroCuotas > 0 ? Number((montoTotalUSD / numeroCuotas).toFixed(2)) : 0;
  }, [montoTotalUSD, numeroCuotas]);

  const semanasOrdenadas = useMemo(() => {
    return [...semanas].sort((a: any, b: any) => {
      const fa = String(a.fechaInicio || a.FechaInicio || '').split('T')[0];
      const fb = String(b.fechaInicio || b.FechaInicio || '').split('T')[0];
      if (fa && fb && fa !== fb) return fa.localeCompare(fb);
      return Number(a.id) - Number(b.id);
    });
  }, [semanas]);

  const [cuotasEditables, setCuotasEditables] = useState<
    { numero: number; semanaId: number; semanaCodigo: string; montoUSD: number }[]
  >([]);

  // Recalcular cuotas equitativas en orden cronológico ascendente cuando cambian monto, cuotas o semana inicial
  useEffect(() => {
    if (montoTotalUSD <= 0 || numeroCuotas <= 0 || semanasOrdenadas.length === 0) {
      setCuotasEditables([]);
      return;
    }

    const startIdx = semanasOrdenadas.findIndex((s: any) => String(s.id) === semanaInicioId);
    const baseIdx = startIdx >= 0 ? startIdx : 0;

    const list: { numero: number; semanaId: number; semanaCodigo: string; montoUSD: number }[] = [];
    const baseCuota = Math.floor((montoTotalUSD / numeroCuotas) * 100) / 100;
    let acumulado = 0;

    for (let i = 0; i < numeroCuotas; i++) {
      const sem: any = semanasOrdenadas[baseIdx + i] || null;
      const isLast = i === numeroCuotas - 1;
      const cuotaUSD = isLast ? Number((montoTotalUSD - acumulado).toFixed(2)) : baseCuota;
      acumulado += cuotaUSD;

      list.push({
        numero: i + 1,
        semanaId: sem ? Number(sem.id) : 0,
        semanaCodigo: sem ? (sem.codigo || sem.Codigo || `Semana #${sem.id}`) : `Semana +${i}`,
        montoUSD: cuotaUSD,
      });
    }
    setCuotasEditables(list);
  }, [montoTotalUSD, numeroCuotas, semanaInicioId, semanasOrdenadas]);

  const sumaCuotasUSD = useMemo(() => {
    return Number(cuotasEditables.reduce((acc, c) => acc + (Number(c.montoUSD) || 0), 0).toFixed(2));
  }, [cuotasEditables]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entidadId) {
      toast.error('Debe seleccionar la entidad beneficiaria.');
      return;
    }
    if (montoTotalUSD <= 0) {
      toast.error('El monto en USD debe ser mayor a 0.');
      return;
    }
    if (numeroCuotas < 1) {
      toast.error('Debe asignar al menos 1 cuota.');
      return;
    }
    if (cuotasEditables.length > 0 && Math.abs(sumaCuotasUSD - montoTotalUSD) > 0.05) {
      toast.error(`La suma de las cuotas ($${sumaCuotasUSD.toFixed(2)}) debe coincidir con el monto total ($${montoTotalUSD.toFixed(2)}).`);
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        tipoEntidad,
        entidadId: parseInt(entidadId, 10),
        montoTotalUSD,
        numeroCuotas,
        tasaBcvInicial: tasaBcv,
        fechaSolicitud,
        observacion,
        semanaInicioId: semanaInicioId ? parseInt(semanaInicioId, 10) : undefined,
        cuotasPersonalizadas: cuotasEditables.map((c) => ({
          numeroCuota: c.numero,
          semanaOperativaId: c.semanaId > 0 ? c.semanaId : undefined,
          montoCuotaUSD: Number(c.montoUSD || 0),
          tasaBcvAplicada: tasaBcv,
        })),
      };

      const res = await finanzasApi.crearAdelanto(payload);
      Swal.fire({
        icon: 'success',
        title: '¡Adelanto Registrado!',
        text: res.message || 'El anticipo y su plan de cuotas han sido registrados correctamente.',
        confirmButtonColor: '#10b981',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error al Registrar',
        text: err.response?.data?.message || err.message || 'No se pudo crear el adelanto.',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setLoading(false);
    }
  };

  const getTitulo = () => {
    if (tipoEntidad === 'FINCA') return 'Nuevo Adelanto a Finca Ganadera';
    if (tipoEntidad === 'COMPANIA') return 'Nuevo Abono / Anticipo a Planta';
    return 'Nuevo Adelanto Receptoría';
  };

  const getSubtitulo = () => {
    if (tipoEntidad === 'FINCA') return 'Fijado en USD con cuotas semanales de liquidación en Bs (Tasa BCV)';
    if (tipoEntidad === 'COMPANIA') return 'Registro de préstamo o anticipo a cobrar en cuotas por ciclo';
    return 'Adelanto operativo con amortización por semana';
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '700px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            background: tipoEntidad === 'FINCA'
              ? 'linear-gradient(135deg, #10b981, #059669)'
              : tipoEntidad === 'COMPANIA'
              ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
              : 'linear-gradient(135deg, #0284c7, #0369a1)',
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#ffffff',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
              <i className="fa-solid fa-plus-circle" style={{ marginRight: '8px' }}></i>
              {getTitulo()}
            </h3>
            <span style={{ fontSize: '12px', opacity: 0.9 }}>{getSubtitulo()}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#ffffff',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '22px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* ENTIDAD BENEFICIARIA */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                {tipoEntidad === 'FINCA' ? 'Finca / Productor Beneficiario *' : tipoEntidad === 'COMPANIA' ? 'Compañía / Planta Receptora *' : 'Beneficiario Receptoría *'}
              </label>
              <SearchableSelect
                options={entidades}
                value={entidadId}
                onChange={setEntidadId}
                placeholder={`-- Seleccionar ${tipoEntidad === 'FINCA' ? 'Finca' : tipoEntidad === 'COMPANIA' ? 'Compañía' : 'Receptoría'} --`}
                searchPlaceholder="Escriba para filtrar nombre..."
              />
            </div>

            {/* GRID MONTO, CUOTAS, TASA BCV */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Monto Total ($ USD) *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '9px', fontWeight: 800, color: '#64748b' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={montoTotalUSD || ''}
                    onChange={(e) => setMontoTotalUSD(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="form-input"
                    style={{ paddingLeft: '26px', height: '38px', fontWeight: 800, fontSize: '14px', color: '#0f172a' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Número de Cuotas *
                </label>
                <input
                  type="number"
                  min="1"
                  max="52"
                  required
                  value={numeroCuotas || ''}
                  onChange={(e) => setNumeroCuotas(parseInt(e.target.value, 10) || 1)}
                  className="form-input"
                  style={{ height: '38px', fontWeight: 800, fontSize: '14px', color: '#0f172a' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Tasa BCV Aplicada (Bs/$) *
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  required
                  value={tasaBcv || ''}
                  onChange={(e) => setTasaBcv(parseFloat(e.target.value) || 0)}
                  className="form-input"
                  style={{ height: '38px', fontWeight: 800, fontSize: '14px', color: '#2563eb' }}
                />
              </div>
            </div>

            {/* RESUMEN CONVERSION BS & CUOTA */}
            <div
              style={{
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Equivalente Total en Bs:
                </span>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>
                  Bs. {montoTotalBs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Monto Estimado por Cuota:
                </span>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#2563eb' }}>
                  $ {cuotaEstimadaUSD.toFixed(2)} USD / semana
                </div>
              </div>
            </div>

            {/* FECHA Y SEMANA INICIAL */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Fecha de Solicitud *
                </label>
                <input
                  type="date"
                  required
                  value={fechaSolicitud}
                  onChange={(e) => setFechaSolicitud(e.target.value)}
                  className="form-input"
                  style={{ height: '38px', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Ciclo Inicial de Cobro
                </label>
                <select
                  value={semanaInicioId}
                  onChange={(e) => setSemanaInicioId(e.target.value)}
                  className="form-input"
                  style={{ height: '38px', fontWeight: 700, color: '#0f172a' }}
                >
                  <option value="">-- Ciclo Activo Actual --</option>
                  {semanasOrdenadas.map((s) => {
                    const sId = String(s.id);
                    const cod = s.codigo || `Semana #${sId}`;
                    const fIni = (s.fechaInicio || s.FechaInicio || '').split('T')[0];
                    const fFin = (s.fechaFin || s.FechaFin || '').split('T')[0];
                    const esAct = String(s.estado || '').toUpperCase() === 'ABIERTO';
                    return (
                      <option key={sId} value={sId}>
                        {cod} {fIni && fFin ? `(${fIni} al ${fFin})` : ''} {esAct ? '★ (ACTIVA)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* OBSERVACIONES */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Observaciones / Motivo del Anticipo
              </label>
              <input
                type="text"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Ej: Anticipo para insumos, mantenimiento, compras..."
                className="form-input"
                style={{ height: '38px' }}
              />
            </div>

            {/* PREVIEW DE CUOTAS EDITABLES */}
            {cuotasEditables.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', margin: 0 }}>
                    <i className="fa-solid fa-list-ol" style={{ marginRight: '6px' }}></i>
                    Cronograma de Amortización ({cuotasEditables.length} Cuotas)
                  </label>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: Math.abs(sumaCuotasUSD - montoTotalUSD) <= 0.05 ? '#059669' : '#dc2626',
                    }}
                  >
                    Suma: ${sumaCuotasUSD.toFixed(2)} / ${montoTotalUSD.toFixed(2)}
                  </span>
                </div>
                <div style={{ maxHeight: '190px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 800, position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '6px 10px', width: '50px' }}>Cuota</th>
                        <th style={{ padding: '6px 10px' }}>Semana Cobro</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', width: '115px' }}>Monto ($)</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', width: '120px' }}>Monto (Bs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuotasEditables.map((c, idx) => {
                        const cuotaBs = Number(((Number(c.montoUSD) || 0) * tasaBcv).toFixed(2));
                        return (
                          <tr key={c.numero} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '5px 10px', fontWeight: 800 }}>#{c.numero}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <select
                                value={c.semanaId || ''}
                                onChange={(e) => {
                                  const newSemId = Number(e.target.value);
                                  const match = semanasOrdenadas.find((s: any) => Number(s.id) === newSemId);
                                  setCuotasEditables((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            semanaId: newSemId,
                                            semanaCodigo: match ? (match.codigo || (match as any).Codigo || `Semana #${newSemId}`) : item.semanaCodigo,
                                          }
                                        : item
                                    )
                                  );
                                }}
                                style={{
                                  width: '100%',
                                  height: '28px',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  padding: '0 6px',
                                  background: '#ffffff',
                                }}
                              >
                                {semanasOrdenadas.map((s: any) => (
                                  <option key={s.id} value={s.id}>
                                    {s.codigo || s.Codigo || `Semana #${s.id}`}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={c.montoUSD}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCuotasEditables((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, montoUSD: val } : item))
                                  );
                                }}
                                style={{
                                  width: '96px',
                                  height: '28px',
                                  textAlign: 'right',
                                  fontWeight: 800,
                                  fontSize: '12px',
                                  color: '#2563eb',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: '6px',
                                  padding: '0 6px',
                                  background: '#eff6ff',
                                }}
                              />
                            </td>
                            <td style={{ padding: '5px 10px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                              Bs. {cuotaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-outline"
              style={{ fontWeight: 700, padding: '8px 16px', background: '#fff', border: '1.5px solid #cbd5e1' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                fontWeight: 800,
                padding: '8px 20px',
                background: tipoEntidad === 'FINCA' ? '#10b981' : tipoEntidad === 'COMPANIA' ? '#6366f1' : '#0284c7',
                border: 'none',
              }}
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>
                  Registrando...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i>
                  Confirmar y Guardar Adelanto
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 2. MODAL ACTUALIZAR VALOR DÓLAR (SOLO ACTIVOS)
// -------------------------------------------------------------
interface ModalActualizarValorDolarProps {
  isOpen: boolean;
  onClose: () => void;
  tipoEntidad: 'FINCA' | 'COMPANIA' | 'RECEPTORIA';
  cantActivos: number;
  totalPendienteUSD: number;
  tasaBcvActual: number;
  onSuccess: () => void;
}

export const ModalActualizarValorDolar: React.FC<ModalActualizarValorDolarProps> = ({
  isOpen,
  onClose,
  tipoEntidad,
  cantActivos,
  totalPendienteUSD,
  tasaBcvActual,
  onSuccess,
}) => {
  const [nuevaTasa, setNuevaTasa] = useState<number>(tasaBcvActual || 36.5);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNuevaTasa(tasaBcvActual || 36.5);
    }
  }, [isOpen, tasaBcvActual]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nuevaTasa <= 0) {
      toast.error('La nueva tasa BCV debe ser mayor a 0.');
      return;
    }

    setLoading(true);
    try {
      const res = await finanzasApi.actualizarTasaActivos(tipoEntidad, nuevaTasa);
      Swal.fire({
        icon: 'success',
        title: '¡Tasa BCV Actualizada!',
        text: res.message || `Se ha actualizado la tasa a Bs. ${nuevaTasa} para todos los adelantos activos.`,
        confirmButtonColor: '#0284c7',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.message || err.message || 'No se pudo actualizar la tasa.',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                background: 'rgba(255,255,255,0.18)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              <i className="fa-solid fa-dollar-sign"></i>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Actualizar Valor Dólar</h3>
              <span style={{ fontSize: '11.5px', color: '#bae6fd' }}>
                Adelantos Activos ({tipoEntidad === 'FINCA' ? 'Fincas' : tipoEntidad === 'COMPANIA' ? 'Compañías' : 'Receptoría'})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#ffffff',
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* SUMMARY CARD */}
          <div
            style={{
              background: '#f0f9ff',
              border: '1.5px solid #bae6fd',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>
                Adelantos Activos
              </div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#0c4a6e' }}>
                {cantActivos} {tipoEntidad === 'FINCA' ? 'Fincas' : 'Entidades'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>
                Saldo Pendiente Total
              </div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#0284c7', fontFamily: 'monospace' }}>
                $ {totalPendienteUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '6px' }}>
              Nuevo Valor Dólar BCV (Bs/$) *
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              required
              value={nuevaTasa || ''}
              onChange={(e) => setNuevaTasa(parseFloat(e.target.value) || 0)}
              className="form-input"
              style={{ height: '44px', fontSize: '16px', fontWeight: 800, color: '#0284c7' }}
            />
            <small style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '6px' }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: '4px' }}></i>
              Esta tasa se aplicará inmediatamente sobre todas las cuotas PENDIENTES o ACTIVAS, actualizando el monto en bolívares de liquidación sin alterar cuotas ya cobradas.
            </small>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-outline"
              style={{ fontWeight: 700, padding: '8px 16px', background: '#fff' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ fontWeight: 800, padding: '8px 20px', background: '#0284c7', border: 'none' }}
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>
                  Aplicando...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i>
                  Actualizar Tasa BCV
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 3. MODAL EDITAR CUOTA INDIVIDUAL
// -------------------------------------------------------------
interface ModalEditarCuotaProps {
  isOpen: boolean;
  onClose: () => void;
  cuota: any;
  adelanto: any;
  semanas: any[];
  onSuccess: () => void;
}

export const ModalEditarCuota: React.FC<ModalEditarCuotaProps> = ({
  isOpen,
  onClose,
  cuota,
  adelanto,
  semanas,
  onSuccess,
}) => {
  const [montoUSD, setMontoUSD] = useState<number>(0);
  const [tasaBcv, setTasaBcv] = useState<number>(36.5);
  const [semanaId, setSemanaId] = useState<string>('');
  const [estado, setEstado] = useState<string>('PENDIENTE');
  const [observacion, setObservacion] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cuota && isOpen) {
      const u = Number(cuota.montoCobradoUSD > 0 ? cuota.montoCobradoUSD : (cuota.montoCuotaUSD ?? cuota.MontoCuotaUSD ?? 0));
      const t = Number(cuota.tasaBcvAplicada > 0 ? cuota.tasaBcvAplicada : (adelanto?.tasaBCV ?? 36.5));
      setMontoUSD(u);
      setTasaBcv(t);
      setSemanaId(String(cuota.semanaOperativaId || cuota.SemanaOperativaId || ''));
      setEstado(cuota.estado || cuota.Estado || 'PENDIENTE');
      setObservacion(cuota.observacion || cuota.Observacion || '');
    }
  }, [cuota, adelanto, isOpen]);

  const montoBs = useMemo(() => {
    return Number((montoUSD * tasaBcv).toFixed(2));
  }, [montoUSD, tasaBcv]);

  if (!isOpen || !cuota) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        montoCuotaUSD: montoUSD,
        montoCobradoUSD: montoUSD,
        tasaBcvAplicada: tasaBcv,
        montoCobradoBs: montoBs,
        semanaOperativaId: semanaId ? parseInt(semanaId, 10) : null,
        estado,
        observacion,
      };

      const cId = cuota.id || cuota.Id;
      await finanzasApi.actualizarCuota(cId, payload);
      Swal.fire({
        icon: 'success',
        title: '¡Cuota Actualizada!',
        text: 'Los valores de la cuota y su semana asignada han sido modificados exitosamente.',
        confirmButtonColor: '#10b981',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error al Actualizar',
        text: err.response?.data?.message || err.message || 'No se pudo guardar la modificación.',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '500px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fff',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
              Ajustar Cuota #{cuota.numeroCuota || cuota.NumeroCuota} - {adelanto?.entidadNombre || adelanto?.fincaNombre}
            </h3>
            <span style={{ fontSize: '11px', color: '#bae6fd' }}>
              Adelanto #{adelanto?.id} • Cuota {cuota.numeroCuota || cuota.NumeroCuota} de {adelanto?.numeroCuotas || 1}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#ffffff',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Monto ($ USD) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={montoUSD || ''}
                onChange={(e) => setMontoUSD(parseFloat(e.target.value) || 0)}
                className="form-input"
                style={{ height: '38px', fontWeight: 800 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Tasa BCV (Bs/$) *
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                required
                value={tasaBcv || ''}
                onChange={(e) => setTasaBcv(parseFloat(e.target.value) || 0)}
                className="form-input"
                style={{ height: '38px', fontWeight: 800, color: '#2563eb' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
              Monto en Bs (Auto)
            </label>
            <input
              type="text"
              readOnly
              value={`Bs. ${montoBs.toFixed(2)}`}
              className="form-input"
              style={{ height: '38px', fontWeight: 800, background: '#f8fafc', color: '#059669' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
              Semana Operativa de Cobro
            </label>
            <select
              value={semanaId}
              onChange={(e) => setSemanaId(e.target.value)}
              className="form-input"
              style={{ height: '38px', fontWeight: 700 }}
            >
              <option value="">-- Sin semana fijada --</option>
              {semanas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo || `Semana #${s.id}`} {String(s.estado).toUpperCase() === 'ABIERTO' ? '★ (ACTIVA)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Estado Cuota
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="form-input"
                style={{ height: '38px', fontWeight: 700 }}
              >
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="COBRADO">COBRADO</option>
                <option value="POSPUESTO">POSPUESTO</option>
                <option value="ANULADA">ANULADA</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Observación
              </label>
              <input
                type="text"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Opcional..."
                className="form-input"
                style={{ height: '38px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-outline"
              style={{ fontWeight: 700, padding: '7px 14px', background: '#fff' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ fontWeight: 800, padding: '7px 18px', background: '#0284c7', border: 'none' }}
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 4. MODAL DIVIDIR CUOTA (DIVIDIR EN 2 CICLOS)
// -------------------------------------------------------------
interface ModalDividirCuotaProps {
  isOpen: boolean;
  onClose: () => void;
  cuota: any;
  adelanto: any;
  semanas: any[];
  onSuccess: () => void;
}

export const ModalDividirCuota: React.FC<ModalDividirCuotaProps> = ({
  isOpen,
  onClose,
  cuota,
  adelanto,
  semanas,
  onSuccess,
}) => {
  const cuotaTotalUSD = useMemo(() => {
    if (!cuota) return 0;
    return Number(cuota.montoCuotaUSD ?? cuota.MontoCuotaUSD ?? 0);
  }, [cuota]);

  const [montoCobrarActual, setMontoCobrarActual] = useState<number>(0);
  const [cicloDestinoId, setCicloDestinoId] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cuota && isOpen) {
      const half = Math.round((cuotaTotalUSD / 2) * 100) / 100;
      setMontoCobrarActual(half);
      setMotivo('');
      setCicloDestinoId('');
    }
  }, [cuota, cuotaTotalUSD, isOpen]);

  const montoPosponer = useMemo(() => {
    const diff = cuotaTotalUSD - montoCobrarActual;
    return diff > 0 ? Number(diff.toFixed(2)) : 0;
  }, [cuotaTotalUSD, montoCobrarActual]);

  if (!isOpen || !cuota) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (montoCobrarActual <= 0 || montoCobrarActual >= cuotaTotalUSD) {
      toast.error('El monto a cobrar en este ciclo debe ser menor al total de la cuota.');
      return;
    }
    if (!cicloDestinoId) {
      toast.error('Debe seleccionar el ciclo destino para la parte restante.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        montoCobrarActual,
        montoPosponer,
        cicloDestinoId: parseInt(cicloDestinoId, 10),
        motivo: motivo || 'División parcial de cuota acordada',
      };

      const cId = cuota.id || cuota.Id;
      await finanzasApi.dividirCuota(cId, payload);
      Swal.fire({
        icon: 'success',
        title: '¡Cuota Dividida!',
        text: `Se cobrarán $${montoCobrarActual} en el ciclo actual y se han pospuesto $${montoPosponer} al ciclo seleccionado.`,
        confirmButtonColor: '#10b981',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error al Dividir',
        text: err.response?.data?.message || err.message || 'No se pudo dividir la cuota.',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fff',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
              <i className="fa-solid fa-arrows-split-up-and-left" style={{ marginRight: '6px' }}></i>
              Dividir Cuota #{cuota.numeroCuota || cuota.NumeroCuota}
            </h3>
            <span style={{ fontSize: '11px', color: '#fef3c7' }}>
              Cobro parcial en este ciclo y posposición del remanente
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#ffffff',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              background: '#fffbeb',
              border: '1.5px solid #fde68a',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e' }}>Monto Total de la Cuota:</span>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#b45309' }}>$ {cuotaTotalUSD.toFixed(2)} USD</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e' }}>Entidad:</span>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#78350f' }}>{adelanto?.entidadNombre || adelanto?.fincaNombre}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Monto a Cobrar HOY ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={cuotaTotalUSD - 0.01}
                required
                value={montoCobrarActual || ''}
                onChange={(e) => setMontoCobrarActual(parseFloat(e.target.value) || 0)}
                className="form-input"
                style={{ height: '38px', fontWeight: 800, color: '#059669' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Monto a Posponer ($)
              </label>
              <input
                type="text"
                readOnly
                value={`$ ${montoPosponer.toFixed(2)}`}
                className="form-input"
                style={{ height: '38px', fontWeight: 800, background: '#f8fafc', color: '#dc2626' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
              Ciclo Destino para el Remanente *
            </label>
            <select
              required
              value={cicloDestinoId}
              onChange={(e) => setCicloDestinoId(e.target.value)}
              className="form-input"
              style={{ height: '38px', fontWeight: 700 }}
            >
              <option value="">-- Seleccionar Ciclo Operativo --</option>
              {semanas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo || `Semana #${s.id}`} {String(s.estado).toUpperCase() === 'ABIERTO' ? '★ (ACTIVA)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
              Motivo de la División
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Producción insuficiente esta semana, split 50/50..."
              className="form-input"
              style={{ height: '38px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-outline"
              style={{ fontWeight: 700, padding: '7px 14px', background: '#fff' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ fontWeight: 800, padding: '7px 18px', background: '#d97706', border: 'none' }}
            >
              {loading ? 'Dividiendo...' : 'Confirmar División'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 5. MODAL POSPONER CUOTA (REPROGRAMAR A OTRO CICLO)
// -------------------------------------------------------------
interface ModalPosponerCuotaProps {
  isOpen: boolean;
  onClose: () => void;
  cuota: any;
  adelanto: any;
  semanas: any[];
  onSuccess: () => void;
}

export const ModalPosponerCuota: React.FC<ModalPosponerCuotaProps> = ({
  isOpen,
  onClose,
  cuota,
  adelanto,
  semanas,
  onSuccess,
}) => {
  const [cicloDestinoId, setCicloDestinoId] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCicloDestinoId('');
      setMotivo('');
    }
  }, [isOpen]);

  if (!isOpen || !cuota) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cicloDestinoId) {
      toast.error('Debe seleccionar la semana de destino.');
      return;
    }

    setLoading(true);
    try {
      const cId = cuota.id || cuota.Id;
      await finanzasApi.posponerCuota(cId, parseInt(cicloDestinoId, 10), motivo || 'Posposición solicitada por el productor');
      Swal.fire({
        icon: 'success',
        title: '¡Cuota Pospuesta!',
        text: 'La cuota ha sido transferida exitosamente al ciclo operativo seleccionado.',
        confirmButtonColor: '#9333ea',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error al Posponer',
        text: err.response?.data?.message || err.message || 'No se pudo posponer la cuota.',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '500px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #9333ea, #7e22ce)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fff',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
              <i className="fa-solid fa-calendar-minus" style={{ marginRight: '6px' }}></i>
              Posponer Cuota #{cuota.numeroCuota || cuota.NumeroCuota}
            </h3>
            <span style={{ fontSize: '11px', color: '#f3e8ff' }}>
              Reasignar cobro a un ciclo semanal futuro
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#ffffff',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              background: '#faf5ff',
              border: '1.5px solid #e9d5ff',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b21a8' }}>Monto a Transferir:</span>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#7e22ce' }}>
                $ {Number(cuota.montoCuotaUSD ?? cuota.MontoCuotaUSD ?? 0).toFixed(2)} USD
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b21a8' }}>Entidad:</span>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#581c87' }}>{adelanto?.entidadNombre || adelanto?.fincaNombre}</div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
              Nueva Semana Operativa Destino *
            </label>
            <select
              required
              value={cicloDestinoId}
              onChange={(e) => setCicloDestinoId(e.target.value)}
              className="form-input"
              style={{ height: '38px', fontWeight: 700 }}
            >
              <option value="">-- Seleccionar Semana Operativa --</option>
              {semanas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo || `Semana #${s.id}`} {String(s.estado).toUpperCase() === 'ABIERTO' ? '★ (ACTIVA)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
              Motivo de Posposición
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Solicitud expresa del productor por emergencia..."
              className="form-input"
              style={{ height: '38px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-outline"
              style={{ fontWeight: 700, padding: '7px 14px', background: '#fff' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ fontWeight: 800, padding: '7px 18px', background: '#9333ea', border: 'none' }}
            >
              {loading ? 'Posponiendo...' : 'Confirmar Posposición'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 6. MODAL REESTRUCTURAR PLAN DE CUOTAS
// -------------------------------------------------------------
interface ModalReestructurarCuotasProps {
  isOpen: boolean;
  onClose: () => void;
  adelanto: any;
  semanas: any[];
  onSuccess: () => void;
}

export const ModalReestructurarCuotas: React.FC<ModalReestructurarCuotasProps> = ({
  isOpen,
  onClose,
  adelanto,
  semanas,
  onSuccess,
}) => {
  const saldoPendiente = useMemo(() => {
    if (!adelanto) return 0;
    return Number(adelanto.montoPendienteUSD ?? adelanto.saldoPendienteUSD ?? 0);
  }, [adelanto]);

  const [nuevasCuotas, setNuevasCuotas] = useState<number>(3);
  const [cicloInicialId, setCicloInicialId] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNuevasCuotas(3);
      setCicloInicialId('');
      setMotivo('');
    }
  }, [isOpen]);

  const nuevaCuotaUSD = useMemo(() => {
    return nuevasCuotas > 0 ? Number((saldoPendiente / nuevasCuotas).toFixed(2)) : 0;
  }, [saldoPendiente, nuevasCuotas]);

  if (!isOpen || !adelanto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nuevasCuotas < 1) {
      toast.error('Debe ingresar al menos 1 cuota.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        nuevasCuotas,
        cicloInicialId: cicloInicialId ? parseInt(cicloInicialId, 10) : undefined,
        motivo: motivo || 'Reestructuración general del saldo restante',
      };

      const aId = adelanto.id || adelanto.Id;
      await finanzasApi.reestructurarCuotas(aId, payload);
      Swal.fire({
        icon: 'success',
        title: '¡Plan Reestructurado!',
        text: `El saldo de $${saldoPendiente} ha sido redistribuido en ${nuevasCuotas} nuevas cuotas semanales de $${nuevaCuotaUSD}.`,
        confirmButtonColor: '#10b981',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error al Reestructurar',
        text: err.response?.data?.message || err.message || 'No se pudo aplicar la reestructuración.',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #0f766e, #0d9488)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fff',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
              <i className="fa-solid fa-calculator" style={{ marginRight: '6px' }}></i>
              Reestructurar Plan de Pagos
            </h3>
            <span style={{ fontSize: '11px', color: '#ccfbf1' }}>
              Adelanto #{adelanto.id} - {adelanto.entidadNombre || adelanto.fincaNombre}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#ffffff',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              background: '#f0fdfa',
              border: '1.5px solid #99f6e4',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f766e' }}>Saldo Pendiente Actual:</span>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#0d9488' }}>$ {saldoPendiente.toFixed(2)} USD</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f766e' }}>Nueva Cuota Estimada:</span>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#2563eb' }}>$ {nuevaCuotaUSD.toFixed(2)} / sem</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Nuevo Número de Cuotas *
              </label>
              <input
                type="number"
                min="1"
                max="52"
                required
                value={nuevasCuotas || ''}
                onChange={(e) => setNuevasCuotas(parseInt(e.target.value, 10) || 1)}
                className="form-input"
                style={{ height: '38px', fontWeight: 800 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Semana Inicial de Cobro
              </label>
              <select
                value={cicloInicialId}
                onChange={(e) => setCicloInicialId(e.target.value)}
                className="form-input"
                style={{ height: '38px', fontWeight: 700 }}
              >
                <option value="">-- Ciclo Activo Actual --</option>
                {semanas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo || `Semana #${s.id}`} {String(s.estado).toUpperCase() === 'ABIERTO' ? '★ (ACTIVA)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '4px' }}>
              Motivo de la Reestructuración
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Modificación a solicitud del cliente por baja producción..."
              className="form-input"
              style={{ height: '38px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-outline"
              style={{ fontWeight: 700, padding: '7px 14px', background: '#fff' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ fontWeight: 800, padding: '7px 18px', background: '#0d9488', border: 'none' }}
            >
              {loading ? 'Aplicando...' : 'Aplicar Reestructuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 7. COMPONENTE SUB-TABLA EXPANDIBLE DE CUOTAS
// -------------------------------------------------------------
interface SubRowCuotasProps {
  adelanto: any;
  onEditarCuota: (cuota: any) => void;
  onDividirCuota: (cuota: any) => void;
  onPosponerCuota: (cuota: any) => void;
  onReestructurar: () => void;
}

export const SubRowCuotas: React.FC<SubRowCuotasProps> = ({
  adelanto,
  onEditarCuota,
  onDividirCuota,
  onPosponerCuota,
  onReestructurar,
}) => {
  const cuotas = adelanto.cuotas || adelanto.Cuotas || [];

  return (
    <div
      style={{
        background: '#f8fafc',
        borderLeft: '4px solid #3b82f6',
        borderRadius: '8px',
        padding: '16px 20px',
        margin: '8px 0',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
            <i className="fa-solid fa-list-check" style={{ color: '#3b82f6', marginRight: '6px' }}></i>
            Plan de Cuotas & Cronograma de Amortización (Adelanto #{adelanto.id})
          </span>
          <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '10px' }}>
            {cuotas.length} Cuotas programadas • Saldo Pendiente: $ {Number(adelanto.montoPendienteUSD ?? adelanto.saldoPendienteUSD ?? 0).toFixed(2)} USD
          </span>
        </div>
        <button
          type="button"
          onClick={onReestructurar}
          className="btn"
          style={{
            fontSize: '11px',
            fontWeight: 800,
            padding: '5px 12px',
            background: '#e0f2fe',
            color: '#0369a1',
            border: '1px solid #7dd3fc',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <i className="fa-solid fa-rotate"></i> Reestructurar Plan de Cuotas
        </button>
      </div>

      {cuotas.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
          No hay cuotas desglosadas para este adelanto.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 800 }}>
              <tr>
                <th style={{ padding: '8px 12px', textAlign: 'center', width: '60px' }}>Cuota</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Semana de Cobro</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Monto ($)</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Tasa BCV</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Monto (Bs)</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Cobrado ($)</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Estado</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Observaciones</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', width: '140px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cuotas.map((c: any) => {
                const cId = c.id || c.Id;
                const num = c.numeroCuota || c.NumeroCuota;
                const mUSD = Number(c.montoCuotaUSD ?? c.MontoCuotaUSD ?? 0);
                const tBCV = Number(c.tasaBcvAplicada ?? c.TasaBcvAplicada ?? 0);
                const mBs = Number(c.montoCobradoBs ?? c.MontoCobradoBs ?? (mUSD * tBCV));
                const cUSD = Number(c.montoCobradoUSD ?? c.MontoCobradoUSD ?? 0);
                const semCod = c.semanaOperativaCodigo || c.semanaOperativa?.codigo || `Semana #${c.semanaOperativaId || '-'}`;
                const est = String(c.estado || c.Estado || 'PENDIENTE').toUpperCase();

                const isCobrado = est === 'COBRADO';
                const isPospuesto = est === 'POSPUESTO';

                return (
                  <tr key={cId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800 }}>#{num}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{semCod}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>
                      $ {mUSD.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>
                      Bs. {tBCV > 0 ? tBCV.toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                      Bs. {mBs.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: isCobrado ? '#10b981' : '#64748b' }}>
                      $ {cUSD.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          display: 'inline-block',
                          background: isCobrado ? '#dcfce7' : isPospuesto ? '#f3e8ff' : '#fef3c7',
                          color: isCobrado ? '#15803d' : isPospuesto ? '#7e22ce' : '#b45309',
                          border: `1px solid ${isCobrado ? '#86efac' : isPospuesto ? '#d8b4fe' : '#fde68a'}`,
                        }}
                      >
                        {est}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '11px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.observacion || c.Observacion || '-'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => onEditarCuota(c)}
                          title="Ajustar / Editar cuota"
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            borderRadius: '5px',
                            padding: '3px 7px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        {!isCobrado && (
                          <>
                            <button
                              type="button"
                              onClick={() => onDividirCuota(c)}
                              title="Dividir cuota en dos ciclos"
                              style={{
                                background: '#fffbeb',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                borderRadius: '5px',
                                padding: '3px 7px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="fa-solid fa-arrows-split-up-and-left"></i>
                            </button>
                            <button
                              type="button"
                              onClick={() => onPosponerCuota(c)}
                              title="Posponer cuota a otro ciclo"
                              style={{
                                background: '#faf5ff',
                                color: '#7e22ce',
                                border: '1px solid #e9d5ff',
                                borderRadius: '5px',
                                padding: '3px 7px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="fa-solid fa-calendar-minus"></i>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
