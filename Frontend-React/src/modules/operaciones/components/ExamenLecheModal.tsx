import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  examenesLecheApi,
  LACTOSCAN_FIELDS,
  evaluarValorContraParametro,
  comprimirImagenArchivo,
  type ExamenLecheDto,
  type GuardarExamenLecheDto,
  type ParametroCalidadLecheDto,
} from '@/api/examenesLeche.api';
import { catalogosApi } from '@/api/catalogos.api';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { ChoferSelect, CamionSelect } from '@/components/selectors';
import { useAuthStore } from '@/stores/authStore';

export interface ExamenLecheModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  examenEditar?: ExamenLecheDto | null;
  defaults?: {
    nivelPrueba?: 'TICKET' | 'FINCA';
    controlRutaId?: number | null;
    controlCompaniaId?: number | null;
    rutaRecoleccionId?: number | null;
    fincaId?: number | null;
    fincaNombre?: string | null;
    choferId?: number | null;
    camionId?: number | null;
    litrosAsociados?: number | null;
    fecha?: string;
    tipoLeche?: string;
  };
  bloquearContexto?: boolean;
}

const getTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ExamenLecheModal: React.FC<ExamenLecheModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  examenEditar,
  defaults,
  bloquearContexto = false,
}) => {
  const hasBufala = useAuthStore((s) => s.hasTenantModule('MOD_LECHE_BUFALA'));

  const [form, setForm] = useState<GuardarExamenLecheDto>({
    fecha: getTodayIso(),
    nivelPrueba: 'TICKET',
    tipoLeche: 'VACA',
    resultado: 'APROBADA',
    equipo: 'Lactoscan S50',
  });
  const [leyendoOcr, setLeyendoOcr] = useState(false);

  const { data: parametroPrincipal } = useQuery<ParametroCalidadLecheDto | null>({
    queryKey: ['parametro-calidad-principal'],
    queryFn: () => examenesLecheApi.getParametroPrincipal(),
    enabled: isOpen,
  });

  const { data: fincas = [] } = useQuery({
    queryKey: ['fincas-selector-calidad'],
    queryFn: () => catalogosApi.getFincas(true),
    enabled: isOpen,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (examenEditar) {
      setForm({
        fecha: examenEditar.fecha ? examenEditar.fecha.substring(0, 10) : getTodayIso(),
        horaPrueba: examenEditar.horaPrueba || '',
        nivelPrueba: (examenEditar.nivelPrueba as 'TICKET' | 'FINCA') || 'TICKET',
        controlRutaId: examenEditar.controlRutaId ?? null,
        controlCompaniaId: examenEditar.controlCompaniaId ?? null,
        rutaRecoleccionId: examenEditar.rutaRecoleccionId ?? null,
        fincaId: examenEditar.fincaId ?? null,
        camionId: examenEditar.camionId ?? null,
        choferId: examenEditar.choferId ?? null,
        litrosAsociados: examenEditar.litrosAsociados ?? null,
        tipoLeche: examenEditar.tipoLeche || 'VACA',
        equipo: examenEditar.equipo || 'Lactoscan S50',
        numeroSerial: examenEditar.numeroSerial || '',
        calibracion: examenEditar.calibracion || '',
        grasaPct: examenEditar.grasaPct ?? null,
        sngPct: examenEditar.sngPct ?? null,
        densidad: examenEditar.densidad ?? null,
        lactosaPct: examenEditar.lactosaPct ?? null,
        salesPct: examenEditar.salesPct ?? null,
        proteinaPct: examenEditar.proteinaPct ?? null,
        solidosTotalesPct: examenEditar.solidosTotalesPct ?? null,
        aguaAdicionadaPct: examenEditar.aguaAdicionadaPct ?? null,
        temperaturaC: examenEditar.temperaturaC ?? null,
        puntoCongelacion: examenEditar.puntoCongelacion ?? null,
        ph: examenEditar.ph ?? null,
        conductividad: examenEditar.conductividad ?? null,
        resultado: examenEditar.resultado || 'APROBADA',
        imagenExamen: examenEditar.imagenExamen ?? null,
        imagenRecibo: examenEditar.imagenRecibo ?? null,
        observacion: examenEditar.observacion || '',
      });
    } else {
      setForm({
        fecha: defaults?.fecha ? defaults.fecha.substring(0, 10) : getTodayIso(),
        horaPrueba: new Date().toTimeString().substring(0, 8),
        nivelPrueba: defaults?.nivelPrueba || (defaults?.fincaId ? 'FINCA' : 'TICKET'),
        controlRutaId: defaults?.controlRutaId ?? null,
        controlCompaniaId: defaults?.controlCompaniaId ?? null,
        rutaRecoleccionId: defaults?.rutaRecoleccionId ?? null,
        fincaId: defaults?.fincaId ?? null,
        camionId: defaults?.camionId ?? null,
        choferId: defaults?.choferId ?? null,
        litrosAsociados: defaults?.litrosAsociados ?? null,
        tipoLeche: defaults?.tipoLeche || 'VACA',
        equipo: 'Lactoscan S50',
        numeroSerial: '',
        calibracion: '',
        resultado: 'APROBADA',
        imagenExamen: null,
        imagenRecibo: null,
        observacion: '',
      });
    }
  }, [isOpen, examenEditar, defaults]);

  const guardarMutation = useMutation({
    mutationFn: (payload: GuardarExamenLecheDto) =>
      examenEditar
        ? examenesLecheApi.actualizarExamen(examenEditar.id, payload)
        : examenesLecheApi.crearExamen(payload),
    onSuccess: (res) => {
      toast.success(res.message || 'Examen de leche guardado exitosamente');
      onSaved?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Error al guardar examen de leche');
    },
  });

  if (!isOpen) return null;

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'imagenExamen' | 'imagenRecibo'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await comprimirImagenArchivo(file);
      setForm((prev) => ({ ...prev, [field]: compressed }));
    } catch (err: any) {
      toast.error(err?.message || 'Error al procesar imagen');
    }
  };

  const handleLeerOcr = async () => {
    if (!form.imagenExamen) {
      toast.warning('Primero sube o toma la foto del ticket Lactoscan.');
      return;
    }
    setLeyendoOcr(true);
    try {
      const res = await examenesLecheApi.leerTicketLactoscanOcr(form.imagenExamen);
      if (res.exito) {
        setForm((prev) => ({
          ...prev,
          horaPrueba: res.horaPrueba || prev.horaPrueba,
          equipo: res.equipo || prev.equipo,
          numeroSerial: res.numeroSerial || prev.numeroSerial,
          calibracion: res.calibracion || prev.calibracion,
          tipoLeche: res.tipoLecheDetectado || prev.tipoLeche,
          grasaPct: res.grasaPct ?? prev.grasaPct,
          sngPct: res.sngPct ?? prev.sngPct,
          densidad: res.densidad ?? prev.densidad,
          lactosaPct: res.lactosaPct ?? prev.lactosaPct,
          salesPct: res.salesPct ?? prev.salesPct,
          proteinaPct: res.proteinaPct ?? prev.proteinaPct,
          solidosTotalesPct: res.solidosTotalesPct ?? prev.solidosTotalesPct,
          aguaAdicionadaPct: res.aguaAdicionadaPct ?? prev.aguaAdicionadaPct,
          temperaturaC: res.temperaturaC ?? prev.temperaturaC,
          puntoCongelacion: res.puntoCongelacion ?? prev.puntoCongelacion,
          ph: res.ph ?? prev.ph,
          conductividad: res.conductividad ?? prev.conductividad,
        }));
        toast.success(res.mensaje || 'Ticket Lactoscan leído con IA');
      } else {
        toast.info(res.mensaje || 'No se pudo leer automáticamente; ingresa los campos manualmente.');
      }
    } catch {
      toast.error('Error al consultar OCR de Lactoscan.');
    } finally {
      setLeyendoOcr(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.nivelPrueba === 'FINCA' && !form.fincaId) {
      toast.error('Debe seleccionar una finca para un examen a nivel de FINCA.');
      return;
    }
    guardarMutation.mutate(form);
  };

  const alertasDetectadas = LACTOSCAN_FIELDS.filter((f) => {
    const val = form[f.key] as number | null | undefined;
    return evaluarValorContraParametro(val, parametroPrincipal, f.minKey, f.maxKey).estado === 'alerta';
  });

  return (
    <div className="fixed inset-0 z-[9990] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div
        className="w-full max-w-4xl rounded-2xl shadow-2xl border overflow-hidden my-4"
        style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold flex items-center gap-2">
              <i className="fa-solid fa-flask-vial"></i>
              {examenEditar ? `Editar Examen de Leche #${examenEditar.id}` : 'Registrar Examen de Calidad de Leche (Lactoscan S50)'}
            </h3>
            <p className="text-xs text-indigo-100 mt-0.5">
              {defaults?.fincaNombre
                ? `Finca: ${defaults.fincaNombre}${defaults.controlRutaId ? ` • Ticket #${defaults.controlRutaId}` : ''}`
                : form.controlRutaId
                  ? `Ticket #${form.controlRutaId} • Nivel ${form.nivelPrueba}`
                  : 'Todos los campos y fotografías son opcionales'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Alerta parámetro principal */}
          {parametroPrincipal ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl text-xs border bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800">
              <span className="font-semibold text-indigo-800 dark:text-indigo-200">
                <i className="fa-solid fa-shield-check mr-1.5"></i>
                Evaluando contra Parámetro Principal: <strong>{parametroPrincipal.nombre}</strong>
              </span>
              {alertasDetectadas.length > 0 ? (
                <span className="px-2.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200">
                  <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                  {alertasDetectadas.length} valor(es) fuera de rango
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200">
                  <i className="fa-solid fa-check mr-1"></i>
                  Dentro de parámetros
                </span>
              )}
            </div>
          ) : null}

          {/* Fila 1: Contexto del Examen */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Nivel de Prueba</label>
              <SearchableSelect
                value={form.nivelPrueba || 'TICKET'}
                onChange={(val) => setForm((p) => ({ ...p, nivelPrueba: String(val || 'TICKET') }))}
                options={[
                  { value: 'TICKET', label: 'Ticket / Camión General' },
                  { value: 'FINCA', label: 'Prueba Individual Finca' },
                ]}
                disabled={bloquearContexto}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Fecha</label>
              <input
                type="date"
                value={form.fecha || ''}
                onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Hora Prueba</label>
              <input
                type="text"
                placeholder="01:48:57"
                value={form.horaPrueba || ''}
                onChange={(e) => setForm((p) => ({ ...p, horaPrueba: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Resultado</label>
              <SearchableSelect
                value={form.resultado || 'APROBADA'}
                onChange={(val) => setForm((p) => ({ ...p, resultado: String(val || 'APROBADA') }))}
                options={[
                  { value: 'APROBADA', label: 'APROBADA' },
                  { value: 'OBSERVADA', label: 'OBSERVADA' },
                  { value: 'ACIDA', label: 'ÁCIDA' },
                  { value: 'RECHAZADA', label: 'RECHAZADA' },
                ]}
              />
            </div>
          </div>

          {/* Fila 2: Finca / Ticket / Chofer / Camión / Litros / Tipo Leche */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {form.nivelPrueba === 'FINCA' && (
              <div className="md:col-span-2">
                <label className="block text-xs font-bold mb-1 opacity-80">Finca *</label>
                <SearchableSelect
                  value={form.fincaId ? String(form.fincaId) : ''}
                  onChange={(val) => setForm((p) => ({ ...p, fincaId: val ? Number(val) : null }))}
                  options={fincas.map((f: any) => ({ value: String(f.id), label: f.nombre }))}
                  placeholder="Seleccionar finca..."
                  disabled={bloquearContexto && !!defaults?.fincaId}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">N° Ticket (Opcional)</label>
              <input
                type="number"
                placeholder="Ej. 1045"
                value={form.controlRutaId ?? ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, controlRutaId: e.target.value ? Number(e.target.value) : null }))
                }
                disabled={bloquearContexto && !!defaults?.controlRutaId}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Litros Asociados</label>
              <input
                type="number"
                placeholder="Litros"
                value={form.litrosAsociados ?? ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, litrosAsociados: e.target.value ? Number(e.target.value) : null }))
                }
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>

            {form.nivelPrueba !== 'FINCA' && (
              <>
                <div>
                  <label className="block text-xs font-bold mb-1 opacity-80">Chofer</label>
                  <ChoferSelect
                    value={form.choferId ? String(form.choferId) : ''}
                    onChange={(val) => setForm((p) => ({ ...p, choferId: val ? Number(val) : null }))}
                    placeholder="Seleccionar chofer..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 opacity-80">Camión</label>
                  <CamionSelect
                    value={form.camionId ? String(form.camionId) : ''}
                    onChange={(val) => setForm((p) => ({ ...p, camionId: val ? Number(val) : null }))}
                    placeholder="Seleccionar camión..."
                  />
                </div>
              </>
            )}

            {hasBufala && (
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Tipo de Leche</label>
                <SearchableSelect
                  value={form.tipoLeche || 'VACA'}
                  onChange={(val) => setForm((p) => ({ ...p, tipoLeche: String(val || 'VACA') }))}
                  options={[
                    { value: 'VACA', label: 'Vaca' },
                    { value: 'BUFALA', label: 'Búfala' },
                  ]}
                />
              </div>
            )}
          </div>

          {/* Bloque Fotos: 1. Examen de Leche + 2. Recibo de Leche */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Imagen Examen */}
            <div className="p-3.5 rounded-xl border space-y-2.5" style={{ borderColor: 'var(--t-border)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  <i className="fa-solid fa-file-medical mr-1.5"></i>1. Imagen Examen de Leche (Opcional)
                </span>
                {form.imagenExamen && (
                  <button
                    type="button"
                    onClick={handleLeerOcr}
                    disabled={leyendoOcr}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5"
                  >
                    <i className={`fa-solid ${leyendoOcr ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                    {leyendoOcr ? 'Leyendo...' : 'Auto-llenar con IA'}
                  </button>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleImageUpload(e, 'imagenExamen')}
                className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
              />
              {form.imagenExamen && (
                <div className="relative">
                  <img
                    src={form.imagenExamen}
                    alt="Examen Lactoscan"
                    className="w-full h-36 object-contain rounded-lg bg-slate-950/50 border border-slate-700/40"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, imagenExamen: '' }))}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center shadow"
                    title="Quitar imagen"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              )}
            </div>

            {/* Imagen Recibo */}
            <div className="p-3.5 rounded-xl border space-y-2.5" style={{ borderColor: 'var(--t-border)' }}>
              <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 block">
                <i className="fa-solid fa-receipt mr-1.5"></i>2. Imagen Recibo de Leche (Opcional)
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleImageUpload(e, 'imagenRecibo')}
                className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer"
              />
              {form.imagenRecibo && (
                <div className="relative">
                  <img
                    src={form.imagenRecibo}
                    alt="Recibo de leche"
                    className="w-full h-36 object-contain rounded-lg bg-slate-950/50 border border-slate-700/40"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, imagenRecibo: '' }))}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center shadow"
                    title="Quitar imagen"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Metadatos Equipo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Equipo</label>
              <input
                type="text"
                placeholder="Lactoscan S50"
                value={form.equipo || ''}
                onChange={(e) => setForm((p) => ({ ...p, equipo: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg border text-sm"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Número Serial</label>
              <input
                type="text"
                placeholder="048680"
                value={form.numeroSerial || ''}
                onChange={(e) => setForm((p) => ({ ...p, numeroSerial: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg border text-sm"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Calibración</label>
              <input
                type="text"
                placeholder="Calibr 1 Vaca"
                value={form.calibracion || ''}
                onChange={(e) => setForm((p) => ({ ...p, calibracion: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg border text-sm"
                style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              />
            </div>
          </div>

          {/* 12 Campos Lactoscan S50 */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider mb-2.5 opacity-80">
              <i className="fa-solid fa-vials mr-1.5 text-cyan-500"></i>
              Resultados de Laboratorio (12 Parámetros Lactoscan S50)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {LACTOSCAN_FIELDS.map((field) => {
                const val = form[field.key] as number | null | undefined;
                const evalRes = evaluarValorContraParametro(val, parametroPrincipal, field.minKey, field.maxKey);
                const borderClass =
                  evalRes.estado === 'alerta'
                    ? 'border-rose-500 ring-1 ring-rose-400/50'
                    : evalRes.estado === 'ok'
                      ? 'border-emerald-500/70'
                      : '';

                return (
                  <div key={String(field.key)}>
                    <label className="flex items-center justify-between text-[11px] font-bold mb-1">
                      <span className="truncate">{field.label} {field.unit ? `(${field.unit})` : ''}</span>
                      {evalRes.estado === 'alerta' && (
                        <i className="fa-solid fa-triangle-exclamation text-rose-500 ml-1" title={`Fuera de rango (${evalRes.rangoTexto})`}></i>
                      )}
                    </label>
                    <input
                      type="number"
                      step={field.step}
                      placeholder={evalRes.rangoTexto || '0.00'}
                      value={val ?? ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          [field.key]: e.target.value === '' ? null : Number(e.target.value),
                        }))
                      }
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-sm font-semibold ${borderClass}`}
                      style={{
                        background: 'var(--t-input-bg)',
                        borderColor: evalRes.estado === 'neutro' ? 'var(--t-border)' : undefined,
                        color: 'var(--t-text)',
                      }}
                    />
                    {evalRes.rangoTexto && (
                      <div className="text-[10px] opacity-60 mt-0.5">Rango: {evalRes.rangoTexto}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Observación */}
          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">Observación</label>
            <textarea
              rows={2}
              placeholder="Notas adicionales de laboratorio o recepción..."
              value={form.observacion || ''}
              onChange={(e) => setForm((p) => ({ ...p, observacion: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--t-input-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--t-border)' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-bold border hover:opacity-80"
              style={{ borderColor: 'var(--t-border)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardarMutation.isPending}
              className="px-5 py-2 rounded-xl text-sm font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg disabled:opacity-60 flex items-center gap-2"
            >
              <i className={`fa-solid ${guardarMutation.isPending ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
              {guardarMutation.isPending ? 'Guardando...' : 'Guardar Examen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
