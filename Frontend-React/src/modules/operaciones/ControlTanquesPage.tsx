import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  Printer,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Check,
  Droplets,
  Scale,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  HelpCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { catalogosApi } from '@/api/catalogos.api';
import { operacionesApi } from '@/api/operaciones.api';
import { useAuth } from '@/hooks/useAuth';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import type { ControlTanquesDiarioDto } from '@/types';

interface MovimientoTanqueFila {
  id: number;
  fecha: string;
  chofer: string;
  litros: number;
  tipoMovimiento: 'ENTRADA' | 'SALIDA';
  tipoLeche: string;
  diferencias: number;
  porTipoLeche: string;
  detalle?: string;
}

export const ControlTanquesPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fechaDocumento, setFechaDocumento] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);

  // Tanques Iniciales (Tanque 1, 2, 3, 4, Silo)
  const [tanquesIniciales, setTanquesIniciales] = useState({
    t1: 0,
    t2: 0,
    t3: 0,
    t4: 0,
    t5: 0,
  });

  // Tanques Finales (Tanque 1, 2, 3, 4, Silo)
  const [tanquesFinales, setTanquesFinales] = useState({
    t1: 0,
    t2: 0,
    t3: 0,
    t4: 0,
    t5: 0,
  });

  // Consulta del registro diario del backend para la fecha seleccionada
  const { data: controlTanques, isLoading, refetch } = useQuery<ControlTanquesDiarioDto | null>({
    queryKey: ['control-tanques-diario', fechaDocumento],
    queryFn: () => operacionesApi.getControlTanquesDiario(fechaDocumento),
  });

  const { data: empresaConfig } = useQuery({
    queryKey: ['empresa-config'],
    queryFn: () => catalogosApi.getEmpresaConfig(),
  });

  const esSupervisorOAdmin = useMemo(() => {
    const rol = (user?.rol || '').toUpperCase();
    return rol.includes('ADMIN') || rol === 'SUPERVISOR' || rol === 'GERENTE';
  }, [user]);

  const puedeModificar = useMemo(() => {
    if (isAdmin) return true;
    if (controlTanques?.puedeModificar === false) return false;
    if (controlTanques?.cierreConfirmado) return false;
    return true;
  }, [isAdmin, controlTanques]);

  const aperturaBloqueada = useMemo(() => {
    if (isAdmin) return false;
    return !!controlTanques?.aperturaConfirmada;
  }, [isAdmin, controlTanques]);

  // Cargar datos recibidos de backend al cambiar fecha o respuesta
  useEffect(() => {
    isInitialLoadRef.current = true;
    if (controlTanques) {
      setTanquesIniciales({
        t1: controlTanques.tanque1Inicial || 0,
        t2: controlTanques.tanque2Inicial || 0,
        t3: controlTanques.tanque3Inicial || 0,
        t4: controlTanques.tanque4Inicial || 0,
        t5: controlTanques.tanque5Inicial || 0,
      });

      if (
        !controlTanques.tanque1Inicial &&
        !controlTanques.tanque2Inicial &&
        !controlTanques.tanque3Inicial &&
        !controlTanques.tanque4Inicial &&
        !controlTanques.tanque5Inicial &&
        controlTanques.totalInicialLitros > 0
      ) {
        setTanquesIniciales((prev) => ({ ...prev, t5: controlTanques.totalInicialLitros }));
      }

      setTanquesFinales({
        t1: controlTanques.tanque1Final || 0,
        t2: controlTanques.tanque2Final || 0,
        t3: controlTanques.tanque3Final || 0,
        t4: controlTanques.tanque4Final || 0,
        t5: controlTanques.tanque5Final || 0,
      });
    } else {
      setTanquesIniciales({ t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 });
      setTanquesFinales({ t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 });
    }
    setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 300);
  }, [controlTanques, fechaDocumento]);

  // Transformar FilasRecepcionJson a filas de movimientos (ENTRADAS Y SALIDAS)
  const filasMovimientos = useMemo<MovimientoTanqueFila[]>(() => {
    if (!controlTanques?.filasRecepcionJson) return [];
    try {
      const parsed = JSON.parse(controlTanques.filasRecepcionJson);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item: any) => item && (item.litros > 0 || item.litrosRuta > 0 || item.litrosRecepcion > 0 || item.chofer || item.choferRuta))
        .map((item: any, idx: number) => {
          const mov: 'ENTRADA' | 'SALIDA' =
            String(item.tipoMovimiento || '').toUpperCase() === 'SALIDA' ? 'SALIDA' : 'ENTRADA';
          const chofer = item.chofer || item.choferRuta || (mov === 'SALIDA' ? 'Despacho Planta' : 'Chofer Conductor');
          const litros = Number(item.litros ?? item.litrosRecepcion ?? item.litrosRuta ?? 0);
          const tipoLeche = item.tipoLeche || 'VACA';
          const diferencias = Number(item.diferencias ?? item.diferencia ?? 0);
          const porTipoLeche = item.porTipoLeche || 'GENERAL';
          const detalle = item.detalle || item.recepcionObs || (mov === 'ENTRADA' ? 'Descarga en Silo' : 'Salida Cisterna');

          return {
            id: item.id || idx + 1,
            fecha: item.fecha || fechaDocumento,
            chofer,
            litros,
            tipoMovimiento: mov,
            tipoLeche,
            diferencias,
            porTipoLeche,
            detalle,
          };
        });
    } catch {
      return [];
    }
  }, [controlTanques?.filasRecepcionJson, fechaDocumento]);

  // Cálculos automáticos
  const totalTanquesIniciales = useMemo(() => {
    return (
      Number(tanquesIniciales.t1 || 0) +
      Number(tanquesIniciales.t2 || 0) +
      Number(tanquesIniciales.t3 || 0) +
      Number(tanquesIniciales.t4 || 0) +
      Number(tanquesIniciales.t5 || 0)
    );
  }, [tanquesIniciales]);

  const totalTanquesFinales = useMemo(() => {
    return (
      Number(tanquesFinales.t1 || 0) +
      Number(tanquesFinales.t2 || 0) +
      Number(tanquesFinales.t3 || 0) +
      Number(tanquesFinales.t4 || 0) +
      Number(tanquesFinales.t5 || 0)
    );
  }, [tanquesFinales]);

  const totalEntradasTabla = useMemo(() => {
    const sum = filasMovimientos
      .filter((m) => m.tipoMovimiento === 'ENTRADA')
      .reduce((acc, m) => acc + (Number(m.litros) || 0), 0);
    return sum > 0 ? sum : (controlTanques?.totalEntradasRutasLitros || 0);
  }, [filasMovimientos, controlTanques?.totalEntradasRutasLitros]);

  const totalSalidasTabla = useMemo(() => {
    const sum = filasMovimientos
      .filter((m) => m.tipoMovimiento === 'SALIDA')
      .reduce((acc, m) => acc + (Number(m.litros) || 0), 0);
    return sum > 0 ? sum : (controlTanques?.totalSalidasPlantasLitros || 0);
  }, [filasMovimientos, controlTanques?.totalSalidasPlantasLitros]);

  // Total Teórico = Inicial + Entradas - Salidas
  const volumenTeoricoFinal = useMemo(() => {
    return totalTanquesIniciales + totalEntradasTabla - totalSalidasTabla;
  }, [totalTanquesIniciales, totalEntradasTabla, totalSalidasTabla]);

  // Diferencia / Variación del Día = Físico medido - Teórico
  const mermaSilo = useMemo(() => {
    return totalTanquesFinales - volumenTeoricoFinal;
  }, [totalTanquesFinales, volumenTeoricoFinal]);

  const porcentajeVariacion = useMemo(() => {
    return volumenTeoricoFinal > 0 ? (mermaSilo / volumenTeoricoFinal) * 100 : 0;
  }, [mermaSilo, volumenTeoricoFinal]);

  // Mutación Guardar
  const guardarMutation = useMutation({
    mutationFn: async (silent?: boolean) => {
      const payload: ControlTanquesDiarioDto = {
        fecha: fechaDocumento,
        tanque1Inicial: Number(tanquesIniciales.t1) || 0,
        tanque2Inicial: Number(tanquesIniciales.t2) || 0,
        tanque3Inicial: Number(tanquesIniciales.t3) || 0,
        tanque4Inicial: Number(tanquesIniciales.t4) || 0,
        tanque5Inicial: Number(tanquesIniciales.t5) || 0,
        totalInicialLitros: totalTanquesIniciales,
        aperturaConfirmada: controlTanques?.aperturaConfirmada || false,
        totalEntradasRutasLitros: totalEntradasTabla,
        totalSalidasPlantasLitros: totalSalidasTabla,
        tanque1Final: Number(tanquesFinales.t1) || 0,
        tanque2Final: Number(tanquesFinales.t2) || 0,
        tanque3Final: Number(tanquesFinales.t3) || 0,
        tanque4Final: Number(tanquesFinales.t4) || 0,
        tanque5Final: Number(tanquesFinales.t5) || 0,
        totalFinalFisicoLitros: totalTanquesFinales,
        totalTeoricoLitros: volumenTeoricoFinal,
        diferenciaMermaLitros: mermaSilo,
        cierreConfirmado: controlTanques?.cierreConfirmado || false,
        filasRecepcionJson: controlTanques?.filasRecepcionJson || JSON.stringify(filasMovimientos),
      };
      const res = await operacionesApi.guardarControlTanquesDiario(payload);
      return { res, silent };
    },
    onSuccess: ({ res, silent }) => {
      if (!silent) {
        toast.success(res.message || 'Control de tanques guardado correctamente');
      }
      queryClient.invalidateQueries({ queryKey: ['control-tanques-diario'] });
      queryClient.invalidateQueries({ queryKey: ['balance-receptoria'] });
    },
  });

  const triggerAutoSave = () => {
    if (!puedeModificar || isInitialLoadRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      guardarMutation.mutate(true);
    }, 1200);
  };

  // Mutación Confirmar Apertura
  const confirmarAperturaMutation = useMutation({
    mutationFn: async () => {
      await guardarMutation.mutateAsync(true);
      return await operacionesApi.confirmarAperturaTanques(fechaDocumento);
    },
    onSuccess: (res) => {
      Swal.fire({
        title: '¡Apertura Confirmada!',
        text: res.message || 'Los litros matutinos quedaron asegurados y no se deberían modificar hacia atrás.',
        icon: 'success',
        confirmButtonColor: '#10b981',
      });
      queryClient.invalidateQueries({ queryKey: ['control-tanques-diario'] });
      queryClient.invalidateQueries({ queryKey: ['balance-receptoria'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Error al confirmar apertura');
    },
  });

  // Mutación Confirmar Cierre
  const confirmarCierreMutation = useMutation({
    mutationFn: async () => {
      await guardarMutation.mutateAsync(true);
      return await operacionesApi.confirmarCierreTanques(fechaDocumento);
    },
    onSuccess: (res) => {
      Swal.fire({
        title: '¡Cierre Diario Confirmado!',
        text:
          res.message ||
          'El formulario diario queda cerrado y conciliado. Solo un Administrador podrá modificar datos.',
        icon: 'success',
        confirmButtonColor: '#1e3a8a',
      });
      queryClient.invalidateQueries({ queryKey: ['control-tanques-diario'] });
      queryClient.invalidateQueries({ queryKey: ['balance-receptoria'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Error al confirmar cierre');
    },
  });

  const handleConfirmarApertura = async () => {
    const res = await Swal.fire({
      title: '¿Confirmar Apertura de Tanques?',
      html: `
        <div class="text-left text-xs text-gray-700 space-y-2 p-1">
          <p>Fecha: <strong>${fechaDocumento}</strong></p>
          <p>Total Litros Matutinos en Tanques: <strong class="text-blue-700 text-sm">${totalTanquesIniciales.toLocaleString()} Lts</strong></p>
          <div class="bg-blue-50 border border-blue-200 rounded p-2 text-blue-900 mt-2">
            ℹ️ Al confirmar la apertura matutina, estos litros quedan validados y asegurados hacia atrás para que no se modifiquen.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Confirmar Apertura',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
    });
    if (res.isConfirmed) {
      confirmarAperturaMutation.mutate();
    }
  };

  const handleConfirmarCierre = async () => {
    const res = await Swal.fire({
      title: '¿Confirmar Cierre Diario?',
      html: `
        <div class="text-left text-xs text-gray-700 space-y-2 p-1">
          <p>Fecha: <strong>${fechaDocumento}</strong></p>
          <p>Total Inicial: <strong>${totalTanquesIniciales.toLocaleString()} Lts</strong></p>
          <p>Total Entradas Ruta: <strong class="text-emerald-700">+${totalEntradasTabla.toLocaleString()} Lts</strong></p>
          <p>Total Salidas Despachos: <strong class="text-rose-700">-${totalSalidasTabla.toLocaleString()} Lts</strong></p>
          <p>Total Teórico Esperado: <strong>${volumenTeoricoFinal.toLocaleString()} Lts</strong></p>
          <p>Total Físico Medido: <strong class="text-blue-700">${totalTanquesFinales.toLocaleString()} Lts</strong></p>
          <p>Diferencia / Variación: <strong class="${mermaSilo >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${mermaSilo > 0 ? '+' : ''}${mermaSilo.toLocaleString()} Lts</strong></p>
          <div class="bg-amber-50 border border-amber-200 rounded p-2 text-amber-900 mt-2 font-semibold">
            ⚠️ Al confirmar el cierre diario, el registro queda cerrado para choferes y supervisores.
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, Confirmar Cierre Diario',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (res.isConfirmed) {
      confirmarCierreMutation.mutate();
    }
  };

  const tankColumns = [
    { key: 't1' as const, label: 'Tanque 1' },
    { key: 't2' as const, label: 'Tanque 2' },
    { key: 't3' as const, label: 'Tanque 3' },
    { key: 't4' as const, label: 'Tanque 4' },
    { key: 't5' as const, label: 'Silo' },
  ];

  // Definición de Columnas para <DataTable /> (Regla Maestra #2)
  const columns = useMemo<ColumnDef<MovimientoTanqueFila>[]>(
    () => [
      {
        header: 'CHOFER',
        accessorKey: 'chofer',
        sortable: true,
        cell: (row: MovimientoTanqueFila) => (
          <div className="flex flex-col">
            <span className="font-extrabold text-slate-800 text-xs sm:text-sm">
              {row.chofer}
            </span>
            {row.detalle && (
              <span className="text-[11px] text-slate-500 font-medium">
                {row.detalle}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'LITROS',
        accessorKey: 'litros',
        sortable: true,
        className: 'text-right',
        cell: (row: MovimientoTanqueFila) => (
          <span className="font-black text-slate-900 text-sm font-mono">
            {row.litros.toLocaleString('es-VE')} <small className="text-[11px] text-slate-500 font-bold">Lts</small>
          </span>
        ),
      },
      {
        header: 'ENTRADA / SALIDA',
        accessorKey: 'tipoMovimiento',
        sortable: true,
        className: 'text-center',
        cell: (row: MovimientoTanqueFila) => {
          const isEntrada = row.tipoMovimiento === 'ENTRADA';
          return (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide border shadow-xs ${
                isEntrada
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-rose-50 text-rose-700 border-rose-300'
              }`}
            >
              {isEntrada ? (
                <>
                  <span className="text-sm leading-none">🟢 ⬇️</span>
                  <span>ENTRADA</span>
                </>
              ) : (
                <>
                  <span className="text-sm leading-none">🔴 ⬆️</span>
                  <span>SALIDA</span>
                </>
              )}
            </span>
          );
        },
      },
      {
        header: 'TIPOS DE LECHE',
        accessorKey: 'tipoLeche',
        sortable: true,
        className: 'text-center',
        cell: (row: MovimientoTanqueFila) => {
          const t = (row.tipoLeche || 'VACA').toUpperCase();
          let badgeClass = 'bg-blue-50 text-blue-800 border-blue-200';
          if (t.includes('BUFALA') || t.includes('BÚFALA')) badgeClass = 'bg-amber-50 text-amber-900 border-amber-300';
          if (t.includes('ACIDA') || t.includes('ÁCIDA')) badgeClass = 'bg-rose-50 text-rose-800 border-rose-300';
          return (
            <span className={`px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase border ${badgeClass}`}>
              {t}
            </span>
          );
        },
      },
      {
        header: 'DIFERENCIAS',
        accessorKey: 'diferencias',
        sortable: true,
        className: 'text-right',
        cell: (row: MovimientoTanqueFila) => {
          const d = row.diferencias;
          if (d > 0) {
            return (
              <span className="font-extrabold text-emerald-700 text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                +{d.toLocaleString('es-VE')} Lts
              </span>
            );
          }
          if (d < 0) {
            return (
              <span className="font-extrabold text-rose-700 text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                {d.toLocaleString('es-VE')} Lts
              </span>
            );
          }
          return <span className="text-slate-400 font-semibold text-xs">0 Lts</span>;
        },
      },
      {
        header: 'POR TIPO DE LECHE',
        accessorKey: 'porTipoLeche',
        sortable: true,
        className: 'text-center',
        cell: () => (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-black uppercase tracking-wide">
            ES EN GENERAL
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* 1. BARRA SUPERIOR DE ACCIONES Y NAVEGACIÓN */}
      <div className="print:hidden bg-white px-5 py-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-700 flex items-center justify-center font-black">
            <Droplets className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
              Control Diario de Tanques y Recepción
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              Apertura matutina, entradas/salidas de ruta automáticas y cuadre de cierre
            </p>
          </div>
        </div>

        {/* SELECTOR DE FECHA Y ACCIONES */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300">
            <Calendar className="w-4 h-4 text-blue-600" />
            <input
              type="date"
              value={fechaDocumento}
              onChange={(e) => setFechaDocumento(e.target.value)}
              className="text-xs font-black text-slate-800 bg-transparent border-none outline-none cursor-pointer"
              title="Cambiar fecha para consultar o registrar"
            />
          </div>

          {/* BOTÓN ENLACE A BALANCE (ASOCIACIÓN DIRECTA) */}
          <button
            type="button"
            onClick={() => navigate('/balance')}
            className="h-9 px-3.5 text-xs font-bold flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl transition-colors cursor-pointer"
            title="Ir a la vista de Balance Volumétrico Integral"
          >
            <Scale className="w-4 h-4 text-indigo-600" />
            <span>Ver Balance Volumétrico</span>
            <ExternalLink className="w-3 h-3 text-indigo-400" />
          </button>

          {/* BOTÓN IMPRIMIR */}
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 px-3 text-xs font-bold flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl transition-colors cursor-pointer"
            title="Imprimir formato para bitácora física"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* AVISO DE CIERRE / BLOQUEO */}
      {!puedeModificar && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-3 text-amber-900 text-xs font-semibold print:hidden shadow-xs">
          <Lock className="w-5 h-5 text-amber-700 shrink-0" />
          <span>
            <strong>Registro Diario Cerrado:</strong> Este día tiene cierre confirmado oficial. Solo un Administrador puede modificar los valores.
          </span>
        </div>
      )}

      {/* 2. PASO 1: APERTURA DE TANQUES (MAÑANA) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50/50 to-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
              1
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900 tracking-tight">
                Apertura de Tanques — Nivel Matutino
              </h2>
              <p className="text-[11px] font-medium text-slate-500">
                Se verifica el volumen en la mañana. Al confirmar, los litros hacia atrás quedan asegurados.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {controlTanques?.aperturaConfirmada ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Apertura Confirmada ({controlTanques.aperturaConfirmadaPorNombre || 'Supervisor'})</span>
              </div>
            ) : (
              esSupervisorOAdmin && (
                <button
                  type="button"
                  onClick={handleConfirmarApertura}
                  disabled={confirmarAperturaMutation.isPending}
                  className="px-4 py-2 text-xs font-black flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirmar Apertura</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* INPUTS TANQUES INICIALES (T1..T4 + SILO) */}
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {tankColumns.map((col) => (
              <div
                key={`init-${col.key}`}
                className="bg-slate-50/80 rounded-xl p-3 border border-slate-200 focus-within:border-blue-500 focus-within:bg-blue-50/20 transition-all"
              >
                <div className="text-[11px] font-extrabold text-blue-900 uppercase tracking-wide mb-1 flex items-center justify-between">
                  <span>{col.label}</span>
                  {aperturaBloqueada && <Lock className="w-3 h-3 text-slate-400" />}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    disabled={aperturaBloqueada || !puedeModificar}
                    value={tanquesIniciales[col.key] || ''}
                    onChange={(e) => {
                      setTanquesIniciales({
                        ...tanquesIniciales,
                        [col.key]: Number(e.target.value),
                      });
                      triggerAutoSave();
                    }}
                    placeholder="0"
                    className="w-full text-lg font-black text-slate-900 bg-transparent border-none outline-none font-mono disabled:opacity-80"
                  />
                  <span className="absolute right-0 bottom-1 text-[10px] font-bold text-slate-400">Lts</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">
              {aperturaBloqueada
                ? '🔒 Nivel inicial asegurado. No se permite modificar para mantener integridad histórica.'
                : '💡 Ingrese la medición matutina y presione "Confirmar Apertura" para asegurar los litros.'}
            </span>
            <div className="text-right">
              <span className="text-slate-500 font-semibold uppercase text-[11px] mr-2">Total Inicial en Tanques:</span>
              <span className="text-base font-black text-blue-900 font-mono">
                {totalTanquesIniciales.toLocaleString('es-VE')} <small className="text-xs">Lts</small>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. PASO 2: TABLA DE ENTRADAS Y SALIDAS (SERVICIO TIPO 1 - RUTA) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50/40 via-white to-rose-50/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
              2
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900 tracking-tight">
                Movimientos del Día — Servicio Tipo 1 (Ruta)
              </h2>
              <p className="text-[11px] font-medium text-slate-500">
                Llenado automático con Entradas (Descargas en Silos) y Salidas (Despachos desde Tanques)
              </p>
            </div>
          </div>

          {/* RESUMEN RÁPIDO DE ENTRADAS Y SALIDAS */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
              <span className="text-xs">🟢 ⬇️</span>
              <span className="text-slate-600 font-bold">Entradas:</span>
              <strong className="text-emerald-700 font-black font-mono">
                +{totalEntradasTabla.toLocaleString('es-VE')} Lts
              </strong>
            </div>

            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-3 py-1 rounded-lg">
              <span className="text-xs">🔴 ⬆️</span>
              <span className="text-slate-600 font-bold">Salidas:</span>
              <strong className="text-rose-700 font-black font-mono">
                -{totalSalidasTabla.toLocaleString('es-VE')} Lts
              </strong>
            </div>
          </div>
        </div>

        {/* TABLA PRINCIPAL IMPLEMENTADA CON <DataTable /> REGLA #2 */}
        <div className="p-5">
          <DataTable
            data={filasMovimientos}
            columns={columns}
            searchPlaceholder="Buscar por chofer, planta o tipo..."
            exportFileName={`movimientos-tanques-ruta-${fechaDocumento}`}
            pageSizeDefault={10}
            emptyMessage="No hay movimientos registrados para esta fecha. Las descargas de choferes en Receptoría y despachos de cisterna aparecerán automáticamente."
          />
        </div>
      </div>

      {/* 4. PASO 3: CIERRE DE TANQUES (TARDE/NOCHE) Y CONCILIACIÓN */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50/50 to-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-black text-xs flex items-center justify-center shadow-xs">
              3
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900 tracking-tight">
                Cierre de Tanques — Conciliación y Bloqueo Diario
              </h2>
              <p className="text-[11px] font-medium text-slate-500">
                Nivel físico final medido en la tarde/noche vs cálculo teórico (por si hubo fallo al medir o contar)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {controlTanques?.cierreConfirmado ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-300 text-slate-800 text-xs font-black rounded-xl">
                <Lock className="w-4 h-4 text-slate-600" />
                <span>Cierre Confirmado ({controlTanques.cierreConfirmadoPorNombre || 'Supervisor'})</span>
              </div>
            ) : (
              esSupervisorOAdmin && (
                <button
                  type="button"
                  onClick={handleConfirmarCierre}
                  disabled={confirmarCierreMutation.isPending}
                  className="px-4 py-2 text-xs font-black flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Cierre Diario</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* INPUTS TANQUES FINALES */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {tankColumns.map((col) => (
              <div
                key={`final-${col.key}`}
                className="bg-slate-50/80 rounded-xl p-3 border border-slate-200 focus-within:border-emerald-500 focus-within:bg-emerald-50/20 transition-all"
              >
                <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wide mb-1 flex items-center justify-between">
                  <span>{col.label} Final</span>
                  {!puedeModificar && <Lock className="w-3 h-3 text-slate-400" />}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    disabled={!puedeModificar}
                    value={tanquesFinales[col.key] || ''}
                    onChange={(e) => {
                      setTanquesFinales({
                        ...tanquesFinales,
                        [col.key]: Number(e.target.value),
                      });
                      triggerAutoSave();
                    }}
                    placeholder="0"
                    className="w-full text-lg font-black text-slate-900 bg-transparent border-none outline-none font-mono disabled:opacity-80"
                  />
                  <span className="absolute right-0 bottom-1 text-[10px] font-bold text-slate-400">Lts</span>
                </div>
              </div>
            ))}
          </div>

          {/* TARJETA COMPARATIVA: TEÓRICO VS FÍSICO */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* 1. Cálculo Teórico */}
            <div className="space-y-1">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide block">
                Volumen Teórico Esperado
              </span>
              <div className="text-xl font-black text-slate-900 font-mono">
                {volumenTeoricoFinal.toLocaleString('es-VE')} <small className="text-xs">Lts</small>
              </div>
              <span className="text-[10px] text-slate-500 block">
                {totalTanquesIniciales.toLocaleString()} (Ini) + {totalEntradasTabla.toLocaleString()} (Ent) - {totalSalidasTabla.toLocaleString()} (Sal)
              </span>
            </div>

            {/* 2. Medición Física */}
            <div className="space-y-1">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide block">
                Total Físico Medido en Tanques
              </span>
              <div className="text-xl font-black text-blue-900 font-mono">
                {totalTanquesFinales.toLocaleString('es-VE')} <small className="text-xs">Lts</small>
              </div>
              <span className="text-[10px] text-slate-500 block">
                Suma aforo vespertino Tanque 1..4 + Silo
              </span>
            </div>

            {/* 3. Diferencia / Variación */}
            <div className="space-y-1 bg-white p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide block">
                Diferencia / Fallo al Contar
              </span>
              <div
                className={`text-xl font-black font-mono ${
                  mermaSilo > 0 ? 'text-emerald-600' : mermaSilo < 0 ? 'text-rose-600' : 'text-slate-800'
                }`}
              >
                {mermaSilo > 0 ? '+' : ''}{mermaSilo.toLocaleString('es-VE')} <small className="text-xs">Lts</small>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold block">
                Variación: {porcentajeVariacion.toFixed(2)}% ({mermaSilo >= 0 ? 'Sobrante' : 'Faltante / Merma'})
              </span>
            </div>
          </div>

          <div className="text-right text-[11px] font-semibold text-slate-500">
            {controlTanques?.cierreConfirmadoPorNombre && (
              <span>
                Cierre verificado oficialmente por: <strong>{controlTanques.cierreConfirmadoPorNombre}</strong> el{' '}
                {new Date(controlTanques.cierreConfirmadoAt || '').toLocaleDateString('es-VE')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlTanquesPage;
