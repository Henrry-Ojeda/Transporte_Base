import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { CamionSelect, ChoferSelect } from '@/components/selectors';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import {
  Route as RouteIcon,
  PlusCircle,
  Truck,
  User,
  Landmark,
  Edit2,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  Layers,
  Search,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { operacionesApi } from '@/api/operaciones.api';
import { sistemaApi } from '@/api/sistema.api';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import type { RutaLogisticaDto, CamionDto, ChoferDto, FincaDto } from '@/types';

export const RutasLogisticaPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Modales
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalAsignarFincas, setModalAsignarFincas] = useState(false);
  const [modalAsignarFincaDirecta, setModalAsignarFincaDirecta] = useState(false);
  const [fincaParaAsignarDirecta, setFincaParaAsignarDirecta] = useState<FincaDto | null>(null);
  const [rutaDestinoDirectaId, setRutaDestinoDirectaId] = useState<number | undefined>(undefined);

  const [rutaSeleccionada, setRutaSeleccionada] = useState<RutaLogisticaDto | null>(null);
  const [fincasSeleccionadas, setFincasSeleccionadas] = useState<number[]>([]);
  const [fincasAlternas, setFincasAlternas] = useState<number[]>([]);
  const [busquedaFincasModal, setBusquedaFincasModal] = useState('');
  const [focusedFincaIndex, setFocusedFincaIndex] = useState(0);
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);

  const initialForm = {
    nombre: '',
    descripcion: '',
    camionPredeterminadoId: undefined as number | undefined,
    choferPredeterminadoId: undefined as number | undefined,
  };
  const [form, setForm] = useState(initialForm);

  // Queries
  const { data: rutas = [], isLoading } = useQuery<RutaLogisticaDto[]>({
    queryKey: ['rutas-logistica'],
    queryFn: () => operacionesApi.getRutasLogistica(),
  });

  const { data: camiones = [] } = useQuery<CamionDto[]>({
    queryKey: ['camiones'],
    queryFn: () => catalogosApi.getCamiones(true),
  });

  const { data: choferes = [] } = useQuery<ChoferDto[]>({
    queryKey: ['choferes'],
    queryFn: () => catalogosApi.getChoferes(),
  });

  // Fechas para cálculo dinámico en vivo del promedio de las últimas 15 recolecciones
  const fechaHoyStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const fecha15DiasAtrasStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  }, []);

  const { data: reporteFincas15Dias = [] } = useQuery({
    queryKey: ['reporte-fincas-15d-rutas', fecha15DiasAtrasStr, fechaHoyStr],
    queryFn: () => sistemaApi.getReporteFincas(fecha15DiasAtrasStr, fechaHoyStr),
    staleTime: 60000,
  });

  const mapaPromedios15Dias = useMemo(() => {
    const map = new Map<number, number>();
    reporteFincas15Dias.forEach((rf: any) => {
      const ultimos15 = Array.isArray(rf.detalle) && rf.detalle.length > 0 ? rf.detalle.slice(-15) : [];
      const cant = ultimos15.length > 0 ? ultimos15.length : 1;
      const total = ultimos15.length > 0
        ? ultimos15.reduce((acc: number, item: any) => acc + Number(item.litros || 0), 0)
        : Number(rf.totalLitros || 0);
      const prom = total > 0 ? Math.round(total / cant) : 0;
      if (prom > 0) {
        map.set(Number(rf.id), prom);
      }
    });
    return map;
  }, [reporteFincas15Dias]);

  const promedioGlobalReferencia = useMemo(() => {
    const valores = Array.from(mapaPromedios15Dias.values()).filter((v) => v > 0);
    if (valores.length === 0) return 185;
    return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
  }, [mapaPromedios15Dias]);

  const getPromedioReal15Dias = (fincaId: number, f?: any): number => {
    if (mapaPromedios15Dias.has(fincaId)) {
      return mapaPromedios15Dias.get(fincaId)!;
    }
    const directo = Number(f?.promedioLitrosDiarios || f?.ultimoLitros || 0);
    if (directo > 0) return directo;
    return promedioGlobalReferencia;
  };

  const { data: fincasRaw = [] } = useQuery<FincaDto[]>({
    queryKey: ['fincas'],
    queryFn: () => catalogosApi.getFincas(true),
  });

  // Las materas/fincas INACTIVAS nunca se muestran ni se asocian a las rutas logísticas
  const fincas = useMemo(() => {
    return fincasRaw.filter((f) => f.activo !== false);
  }, [fincasRaw]);

  // Fincas sin ruta asignada (Huérfanas / Pendientes, solo ACTIVAS)
  const fincasSinRuta = useMemo(() => {
    return fincas.filter((f) => f.activo !== false && (!f.rutaId || f.rutaId === 0));
  }, [fincas]);

  // Cálculo de Capacidad, Litros y Rendimiento en tiempo real
  const camionSeleccionado = useMemo(() => {
    return camiones.find((c) => c.id === form.camionPredeterminadoId);
  }, [camiones, form.camionPredeterminadoId]);

  const totalLitrosRutaEstimados = useMemo(() => {
    return fincasSeleccionadas.reduce((acc, fId) => {
      // Las fincas alternas no suman a la proyección fija de litros de la ruta habitual
      if (fincasAlternas.includes(fId)) return acc;
      const f = fincas.find((item) => item.id === fId);
      const lts = getPromedioReal15Dias(fId, f);
      return acc + lts;
    }, 0);
  }, [fincasSeleccionadas, fincas, fincasAlternas]);

  const capacidadCisterna = camionSeleccionado?.capacidadLitros || 0;
  const porcentajeUtilizacion = capacidadCisterna > 0 ? Math.round((totalLitrosRutaEstimados / capacidadCisterna) * 100) : 0;

  // Mutaciones
  const guardarMutation = useMutation({
    mutationFn: async (dto: typeof initialForm) => {
      let rId = modoEdicionId;
      if (modoEdicionId) {
        await operacionesApi.actualizarRutaLogistica(modoEdicionId, dto);
      } else {
        const res = await operacionesApi.crearRutaLogistica(dto);
        rId = res.id;
      }
      if (rId) {
        const fincasActivasIds = fincasSeleccionadas.filter((id) =>
          fincas.some((f) => f.id === id && f.activo !== false)
        );
        const alternasIds = fincasActivasIds.filter((id) => fincasAlternas.includes(id));
        const habitualesIds = fincasActivasIds.filter((id) => !fincasAlternas.includes(id));
        await operacionesApi.asignarFincasARuta(rId, fincasActivasIds, habitualesIds, alternasIds);
      }
      return { id: rId };
    },
    onSuccess: () => {
      Swal.fire({
        icon: 'success',
        title: modoEdicionId ? '¡Ruta Actualizada!' : '¡Ruta Creada!',
        text: `La ruta logística y sus ${fincasSeleccionadas.length} fincas asociadas se han guardado con éxito.`,
        confirmButtonColor: '#2563eb',
      });
      queryClient.invalidateQueries({ queryKey: ['rutas-logistica'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      cerrarModal();
    },
    onError: (err: any) => {
      Swal.fire({
        icon: 'error',
        title: 'Error al Guardar Ruta',
        text: err.response?.data?.message || 'Error al guardar ruta',
        confirmButtonColor: '#ef4444',
      });
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => operacionesApi.eliminarRutaLogistica(id),
    onSuccess: (data) => {
      Swal.fire({
        icon: 'success',
        title: 'Ruta Eliminada',
        text: (data as any)?.message || 'Ruta logística eliminada exitosamente',
        confirmButtonColor: '#2563eb',
      });
      queryClient.invalidateQueries({ queryKey: ['rutas-logistica'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
    },
    onError: (err: any) => {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.message || 'Error al eliminar',
        confirmButtonColor: '#ef4444',
      });
    },
  });

  const asignarFincaDirectaMutation = useMutation({
    mutationFn: async ({ rutaId, fincaId }: { rutaId: number; fincaId: number }) => {
      // 1. Asignar directamente a nivel de base de datos sin sobreescribir la lista del circuito
      await operacionesApi.asignarFincaDirecta(rutaId, fincaId);

      // 2. Sincronizar cache de overrides para actualización reactiva 100% instantánea
      try {
        const raw = localStorage.getItem('transporte_fincas_overrides_v1');
        if (raw) {
          const ov = JSON.parse(raw);
          if (ov[fincaId]) {
            ov[fincaId].rutaId = rutaId;
          } else {
            ov[fincaId] = { rutaId };
          }
          localStorage.setItem('transporte_fincas_overrides_v1', JSON.stringify(ov));
        }
      } catch {}

      return { success: true };
    },
    onSuccess: () => {
      Swal.fire({
        icon: 'success',
        title: '¡Finca Asignada!',
        text: 'La finca se ha incorporado exitosamente a la ruta seleccionada.',
        confirmButtonColor: '#2563eb',
      });
      queryClient.invalidateQueries({ queryKey: ['rutas-logistica'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      setModalAsignarFincaDirecta(false);
      setFincaParaAsignarDirecta(null);
      setRutaDestinoDirectaId(undefined);
    },
    onError: (err: any) => {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.message || 'No se pudo asignar la finca a la ruta',
        confirmButtonColor: '#ef4444',
      });
    },
  });

  const abrirModalCrear = () => {
    setModoEdicionId(null);
    setForm(initialForm);
    setFincasSeleccionadas([]);
    setFincasAlternas([]);
    setBusquedaFincasModal('');
    setModalAbierto(true);
  };

  const abrirModalEditar = async (item: RutaLogisticaDto) => {
    setModoEdicionId(item.id);
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      camionPredeterminadoId: item.camionPredeterminadoId,
      choferPredeterminadoId: item.choferPredeterminadoId,
    });
    setBusquedaFincasModal('');
    setModalAbierto(true);

    try {
      const fincasRuta = await operacionesApi.getFincasDeRutaLogistica(item.id);
      const asignadas = fincasRuta.filter((x: any) => x.asignada === 1);
      if (asignadas.length > 0) {
        setFincasSeleccionadas(asignadas.map((x: any) => x.id));
        setFincasAlternas(
          asignadas
            .filter((x: any) => x.esPrincipal === 0 || x.tipoAsignacion === 'ALTERNA')
            .map((x: any) => x.id)
        );
      } else {
        const fallbackIds = fincas.filter((f) => f.rutaId === item.id).map((f) => f.id);
        setFincasSeleccionadas(fallbackIds);
        setFincasAlternas([]);
      }
    } catch {
      const fallbackIds = fincas.filter((f) => f.rutaId === item.id).map((f) => f.id);
      setFincasSeleccionadas(fallbackIds);
      setFincasAlternas([]);
    }
  };

  const abrirModalAsignar = (item: RutaLogisticaDto) => {
    setRutaSeleccionada(item);
    const fincasDeRuta = fincas.filter((f) => f.rutaId === item.id).map((f) => f.id);
    setFincasSeleccionadas(fincasDeRuta);
    setModalAsignarFincas(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setModoEdicionId(null);
    setFincasSeleccionadas([]);
    setFincasAlternas([]);
    setBusquedaFincasModal('');
  };

  // Manejadores para agregar / quitar fincas en el modal
  const toggleFinca = (id: number) => {
    setFincasSeleccionadas((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleHabitualAlterna = (id: number) => {
    setFincasAlternas((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const removerFincaSeleccionada = (id: number) => {
    setFincasSeleccionadas((prev) => prev.filter((item) => item !== id));
    setFincasAlternas((prev) => prev.filter((item) => item !== id));
  };

  const agregarFincaSeleccionada = (id: number) => {
    if (!fincasSeleccionadas.includes(id)) {
      setFincasSeleccionadas((prev) => [...prev, id]);
    }
  };

  // Mapeo de fincas en el modal separadas: Seleccionadas vs Disponibles
  const fincasEnModal = useMemo(() => {
    const seleccionadas = fincas.filter((f) => fincasSeleccionadas.includes(f.id));
    const disponibles = fincas.filter((f) => {
      const noEstaSeleccionada = !fincasSeleccionadas.includes(f.id);
      if (!noEstaSeleccionada) return false;
      if (!busquedaFincasModal.trim()) return true;
      const term = busquedaFincasModal.toLowerCase();
      return (
        f.nombre.toLowerCase().includes(term) ||
        (f.propietarioNombre && f.propietarioNombre.toLowerCase().includes(term)) ||
        ((f as any).propietario && String((f as any).propietario).toLowerCase().includes(term)) ||
        (f.codigo && f.codigo.toLowerCase().includes(term))
      );
    });

    return { seleccionadas, disponibles };
  }, [fincas, fincasSeleccionadas, busquedaFincasModal]);

  // Resumen ejecutivo de rutas y cobertura
  const resumenRutas = useMemo(() => {
    const totalRutas = rutas.length;
    const fincasAsignadas = fincas.filter((f) => f.rutaId != null && f.rutaId > 0).length;
    const volumenEstimadoTotal = fincas.reduce((acc, f) => {
      if (f.rutaId) {
        return acc + getPromedioReal15Dias(f.id, f);
      }
      return acc;
    }, 0);
    const rutasConCamion = rutas.filter((r) => r.camionPredeterminadoId != null && r.camionPredeterminadoId > 0).length;
    const porcentajeCobertura = totalRutas > 0 ? Math.round((rutasConCamion / totalRutas) * 100) : 0;

    return {
      totalRutas,
      fincasAsignadas,
      volumenEstimadoTotal,
      rutasConCamion,
      porcentajeCobertura,
    };
  }, [rutas, fincas]);

  // Columnas de la tabla de Rutas Logísticas
  const columns: ColumnDef<RutaLogisticaDto>[] = [
    {
      header: 'Nombre de Ruta',
      accessorKey: 'nombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-gray-900">{row.nombre}</div>
          <div className="text-xs text-gray-400">{row.descripcion || 'Sin descripción'}</div>
        </div>
      ),
    },
    {
      header: 'Unidad Habitual',
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-gray-700">
          <Truck className="w-3.5 h-3.5 text-gray-400" />
          <span>{row.camionPlaca || 'Sin asignar'}</span>
        </div>
      ),
    },
    {
      header: 'Chofer Habitual',
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-gray-700">
          <User className="w-3.5 h-3.5 text-gray-400" />
          <span>{row.choferNombre || 'Sin asignar'}</span>
        </div>
      ),
    },
    {
      header: 'Fincas en Circuito',
      cell: (row) => {
        const count = row.totalFincasAsignadas || fincas.filter((f) => f.rutaId === row.id).length;
        const alt = row.totalFincasAlternas || 0;
        return (
          <button
            onClick={() => abrirModalEditar(row)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
            title="Administrar fincas del circuito"
          >
            <Landmark className="w-3 h-3" />
            <span>{count} {count === 1 ? 'finca asignada' : 'fincas asignadas'}</span>
            {alt > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-extrabold border border-amber-300">
                +{alt} alterna{alt > 1 ? 's' : ''}
              </span>
            )}
          </button>
        );
      },
    },
    {
      header: 'Litros Estimados / Capacidad',
      cell: (row) => {
        // Los litros estimados de la ruta se calculan exclusivamente de sus fincas habituales
        const ltsTot = row.totalLitrosEstimados != null && row.totalLitrosEstimados > 0
          ? row.totalLitrosEstimados
          : fincas.filter((f) => f.rutaId === row.id).reduce((acc, f) => acc + getPromedioReal15Dias(f.id, f), 0);
        const cam = camiones.find((c) => c.id === row.camionPredeterminadoId);
        const cap = cam?.capacidadLitros || row.capacidadCamionLitros || 0;
        const pct = cap > 0 ? Math.round((ltsTot / cap) * 100) : 0;
        const color = pct > 100 ? '#ef4444' : pct >= 75 ? '#10b981' : pct >= 60 ? '#3b82f6' : '#f59e0b';
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '12.5px' }}>
                {ltsTot.toLocaleString()} Lts
              </span>
              {cap > 0 && (
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  / {cap.toLocaleString()} Lts
                </span>
              )}
            </div>
            {cap > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                <div style={{ flex: 1, height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: '3px' }} />
                </div>
                <span style={{ fontSize: '10.5px', fontWeight: 800, color }}>{pct}%</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => abrirModalEditar(row)}
            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
            title="Editar Ruta y Fincas"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              if (await confirmDeleteOrDeactivate('Eliminar la ruta logística', row.nombre)) {
                eliminarMutation.mutate(row.id);
              }
            }}
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
            title="Eliminar Ruta"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  // Columnas para la tabla de Fincas sin Ruta Asignada
  const columnsFincasSinRuta: ColumnDef<FincaDto>[] = [
    {
      header: 'Finca Ganadera',
      accessorKey: 'nombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div className="font-bold text-gray-900 text-sm">{row.nombre}</div>
          <div className="text-xs text-gray-500">{row.codigo ? `Cód: ${row.codigo}` : `#${row.id}`}</div>
        </div>
      ),
    },
    {
      header: 'Productor / Propietario',
      accessorKey: 'propietarioNombre',
      sortable: true,
      cell: (row) => (
        <span className="text-xs font-semibold text-gray-700">
          {(row as any).propietario || row.propietarioNombre || 'Sin propietario asignado'}
        </span>
      ),
    },
    {
      header: 'Promedio Litros / Día',
      accessorKey: 'promedioLitrosDiarios',
      sortable: true,
      cell: (row) => {
        const lts = getPromedioReal15Dias(row.id, row);
        return (
          <span className="font-extrabold text-blue-700 text-sm">
            {lts.toLocaleString()} <small className="text-gray-500 font-normal">Lts/d</small>
          </span>
        );
      },
    },
    {
      header: 'Tipo de Leche',
      accessorKey: 'tipoLeche',
      cell: (row) => (
        <span
          className="badge"
          style={{
            background: row.tipoLeche === 'BUFALA' ? '#fdf4ff' : '#eff6ff',
            color: row.tipoLeche === 'BUFALA' ? '#a21caf' : '#1d4ed8',
            border: `1px solid ${row.tipoLeche === 'BUFALA' ? '#f5d0fe' : '#bfdbfe'}`,
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          {row.tipoLeche === 'BUFALA' ? '🐃 Búfala' : '🐄 Vaca'}
        </span>
      ),
    },
    {
      header: 'Estado Logístico',
      cell: () => (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          Sin Ruta
        </span>
      ),
    },
    {
      header: 'Acción',
      className: 'text-right',
      cell: (row) => (
        <button
          type="button"
          onClick={() => {
            setFincaParaAsignarDirecta(row);
            setRutaDestinoDirectaId(undefined);
            setModalAsignarFincaDirecta(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <RouteIcon className="w-3.5 h-3.5" />
          Asignar a Ruta
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER DE PLANIFICACIÓN DE RUTAS 1:1 */}
      <div className="view-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              className="badge"
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #3b82f6)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '20px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              <RouteIcon className="w-3.5 h-3.5 inline mr-1" /> Circuitos de Transporte
            </span>
            <span
              className="badge"
              style={{
                background: '#ecfdf5',
                color: '#047857',
                border: '1px solid #a7f3d0',
                fontWeight: 800,
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: '20px',
              }}
            >
              {resumenRutas.totalRutas} Rutas Planificadas
            </span>
          </div>

          <h1 className="view-title">
            <RouteIcon className="inline-block text-blue-600 mr-2 w-6 h-6" />
            Logísticas — Circuitos y Rutas Base
          </h1>
          <p className="view-subtitle">
            Definición de circuitos lecheros, vinculación de fincas ganaderas y asignación logística flexible de cisternas y conductores.
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link
            to="/planificacion-rutas-choferes"
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              borderRadius: '10px',
              padding: '9px 16px',
              background: '#ecfdf5',
              color: '#047857',
              border: '1.5px solid #a7f3d0',
              textDecoration: 'none',
              fontSize: '12px',
            }}
          >
            <Truck className="w-4 h-4 text-emerald-600" />
            Planificación Rutas-Choferes
          </Link>

          <button
            type="button"
            onClick={abrirModalCrear}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              borderRadius: '10px',
              padding: '9px 18px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: 'none',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <PlusCircle className="w-4 h-4" />
            Nueva Ruta
          </button>
        </div>
      </div>

      {/* TARJETAS KPI RESUMEN DE PLANIFICACIÓN */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Rutas Activas
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <RouteIcon className="w-4 h-4" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
            {resumenRutas.totalRutas}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Circuitos lecheros registrados
          </div>
        </div>

        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>
              Fincas en Circuito
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669', fontFamily: 'monospace' }}>
            {resumenRutas.fincasAsignadas} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>de {fincas.length}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Fincas con recolección planificada
          </div>
        </div>

        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
              Volumen Estimado Día
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(2, 132, 199, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0284c7', fontFamily: 'monospace' }}>
            {resumenRutas.volumenEstimadoTotal.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>Lts/d</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Capacidad proyectada total
          </div>
        </div>

        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#d97706', textTransform: 'uppercase' }}>
              Cisternas Asignadas
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(217, 119, 6, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#d97706', fontFamily: 'monospace' }}>
            {resumenRutas.rutasConCamion} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>({resumenRutas.porcentajeCobertura}%)</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            {resumenRutas.totalRutas - resumenRutas.rutasConCamion} sin cisterna fija (Opcional)
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL: RUTAS LOGÍSTICAS CON DATATABLE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <RouteIcon className="w-4 h-4 text-blue-600" />
            Circuitos de Recolección Registrados
          </h2>
        </div>
        <DataTable
          data={rutas}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Buscar por nombre de ruta, camión o chofer..."
          exportFileName="planificacion_rutas_logisticas"
          searchFilter={(row, term) =>
            Boolean(
              row.nombre.toLowerCase().includes(term) ||
              (row.camionPlaca && row.camionPlaca.toLowerCase().includes(term)) ||
              (row.choferNombre && row.choferNombre.toLowerCase().includes(term))
            )
          }
        />
      </div>

      {/* SECCIÓN 2: FINCAS SIN RUTA ASIGNADA (CON DATATABLE SEGÚN REGLA 2 INSTRUCCIONES.MD) */}
      <div className="mt-8 p-5 sm:p-6 bg-white rounded-2xl border border-amber-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-amber-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  Fincas Ganaderas sin Ruta Asignada
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                  {fincasSinRuta.length} Pendientes
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Fincas activas registradas en el catálogo que no están incluidas en ningún circuito de recolección diaria.
              </p>
            </div>
          </div>

          {fincasSinRuta.length > 0 && (
            <button
              type="button"
              onClick={abrirModalCrear}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Crear Nueva Ruta con Fincas
            </button>
          )}
        </div>

        <DataTable
          data={fincasSinRuta}
          columns={columnsFincasSinRuta}
          isLoading={isLoading}
          searchPlaceholder="Buscar finca sin ruta por nombre, código o propietario..."
          exportFileName="fincas_sin_ruta_asignada"
          searchFilter={(row, term) =>
            Boolean(
              row.nombre.toLowerCase().includes(term) ||
              (row.propietarioNombre && row.propietarioNombre.toLowerCase().includes(term)) ||
              (row.codigo && row.codigo.toLowerCase().includes(term))
            )
          }
        />
      </div>

      {/* ========================================================================= */}
      {/* MODAL CREAR / EDITAR RUTA — AUTO-AJUSTABLE CON TAILWIND (MAX-H / SCROLL)   */}
      {/* ========================================================================= */}
      {modalAbierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl lg:max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header del Modal - Fijo */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <RouteIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white leading-tight">
                    {modoEdicionId ? 'Editar Ruta Logística' : 'Planificar Nueva Ruta de Recolección'}
                  </h3>
                  <span className="text-xs text-blue-100 font-medium">
                    Asignación de unidad de transporte, chofer y circuito de fincas ganaderas
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario / Body - Auto-ajustable con Scroll interno */}
            <form
              id="form-ruta-logistica"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.nombre.trim()) {
                  Swal.fire({
                    icon: 'warning',
                    title: 'Campo Requerido',
                    text: 'El nombre de la ruta es obligatorio',
                    confirmButtonColor: '#2563eb',
                  });
                  return;
                }
                if (!form.camionPredeterminadoId) {
                  Swal.fire({
                    icon: 'warning',
                    title: 'Camión Cisterna Obligatorio',
                    text: 'Debe seleccionar un camión cisterna obligatorio para la ruta.',
                    confirmButtonColor: '#2563eb',
                  });
                  return;
                }
                if (!form.choferPredeterminadoId) {
                  Swal.fire({
                    icon: 'warning',
                    title: 'Chofer Obligatorio',
                    text: 'Debe seleccionar un chofer habitual obligatorio para la ruta.',
                    confirmButtonColor: '#2563eb',
                  });
                  return;
                }
                guardarMutation.mutate(form);
              }}
              className="flex-1 overflow-y-auto p-5 sm:p-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* COLUMNA IZQUIERDA: DATOS GENERALES Y TRANSPORTE */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nombre de la Ruta <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      placeholder="Ej: Ruta 1 - El Palmar / Atarigua"
                      className="form-input w-full h-10 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Descripción / Circuito Operativo
                    </label>
                    <input
                      type="text"
                      value={form.descripcion}
                      onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                      placeholder="Ej: Turno matutino, circuito de tanques de frío"
                      className="form-input w-full h-10 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Camión Cisterna Asignado <span className="text-red-500 font-bold">*</span>
                    </label>
                    <CamionSelect
                      value={form.camionPredeterminadoId}
                      onChange={(id, camion) => {
                        setForm({
                          ...form,
                          camionPredeterminadoId: id || undefined,
                          choferPredeterminadoId: camion?.usuarioId || form.choferPredeterminadoId,
                        });
                      }}
                      placeholder="-- Seleccionar camión cisterna obligatorio --"
                      allowClear
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Chofer Habitual de Ruta <span className="text-red-500 font-bold">*</span>
                    </label>
                    <ChoferSelect
                      value={form.choferPredeterminadoId}
                      onChange={(id) => {
                        const camMatch = camiones.find((c) => c.usuarioId === id);
                        setForm({
                          ...form,
                          choferPredeterminadoId: id || undefined,
                          camionPredeterminadoId: form.camionPredeterminadoId || camMatch?.id,
                        });
                      }}
                      placeholder="-- Seleccionar chofer obligatorio --"
                      allowClear
                    />
                  </div>

                  {/* Panel de Aprovechamiento de Cisterna */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-blue-600" />
                        Aprovechamiento de Cisterna
                      </span>
                      {capacidadCisterna > 0 ? (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                            porcentajeUtilizacion > 100
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : porcentajeUtilizacion >= 75
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : porcentajeUtilizacion >= 60
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {porcentajeUtilizacion}% Capacidad
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Sin camión asignado</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="text-slate-500 text-[11px] block">Litros Estimados:</span>
                        <strong className="text-slate-900 text-sm font-extrabold">{totalLitrosRutaEstimados.toLocaleString()} Lts</strong>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="text-slate-500 text-[11px] block">Capacidad Cisterna:</span>
                        <strong className="text-slate-900 text-sm font-extrabold">
                          {capacidadCisterna > 0 ? `${capacidadCisterna.toLocaleString()} Lts` : 'No asignado'}
                        </strong>
                      </div>
                    </div>

                    {capacidadCisterna > 0 && (
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            porcentajeUtilizacion > 100
                              ? 'bg-red-500'
                              : porcentajeUtilizacion >= 75
                              ? 'bg-emerald-500'
                              : porcentajeUtilizacion >= 60
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(porcentajeUtilizacion, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* COLUMNA DERECHA: FINCAS SEPARADAS (SELECCIONADAS vs DISPONIBLES) */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col space-y-4">
                  {/* SECCIÓN 1: FINCAS YA SELECCIONADAS */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Fincas Seleccionadas en la Ruta ({fincasEnModal.seleccionadas.length})
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                        ~{totalLitrosRutaEstimados.toLocaleString()} Lts/d
                      </span>
                    </div>

                    {fincasEnModal.seleccionadas.length === 0 ? (
                      <div className="p-3 bg-white rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400">
                        No hay fincas seleccionadas aún. Agrega fincas del listado inferior.
                      </div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {fincasEnModal.seleccionadas.map((f) => {
                          const lts = getPromedioReal15Dias(f.id, f);
                          const esAlterna = fincasAlternas.includes(f.id);
                          return (
                            <div
                              key={f.id}
                              className={`flex items-center justify-between p-2 bg-white rounded-lg border shadow-2xs transition-all text-xs ${
                                esAlterna ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200'
                              }`}
                            >
                              <div className="flex-1 pr-2">
                                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                  <span>{f.nombre}</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleHabitualAlterna(f.id)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase border cursor-pointer transition-colors ${
                                      esAlterna
                                        ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                        : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    }`}
                                    title={
                                      esAlterna
                                        ? 'Ruta Alterna: No suma al volumen diario estimado fijo. Clic para cambiar a Habitual'
                                        : 'Ruta Habitual: Suma al volumen diario estimado fijo. Clic para cambiar a Alterna'
                                    }
                                  >
                                    {esAlterna ? '🔄 Alterna' : '📍 Habitual'}
                                  </button>
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span>{(f as any).propietario || f.propietarioNombre || 'Productor'}</span>
                                  <span className={`font-semibold ${esAlterna ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    ~{lts} Lts/d {esAlterna ? '(Op)' : ''}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removerFincaSeleccionada(f.id)}
                                className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors"
                                title="Quitar finca de la ruta"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* SECCIÓN 2: FINCAS DISPONIBLES PARA AGREGAR */}
                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Landmark className="w-4 h-4 text-blue-600" />
                        Fincas Disponibles para Agregar ({fincasEnModal.disponibles.length})
                      </span>
                    </div>

                    {/* Buscador de fincas con soporte de flechas y Enter */}
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={busquedaFincasModal}
                        onChange={(e) => {
                          setBusquedaFincasModal(e.target.value);
                          setFocusedFincaIndex(0);
                        }}
                        onKeyDown={(e) => {
                          const total = fincasEnModal.disponibles.length;
                          if (total === 0) return;
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setFocusedFincaIndex((prev) => (prev + 1) % total);
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setFocusedFincaIndex((prev) => (prev - 1 + total) % total);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const targetFinca =
                              fincasEnModal.disponibles[focusedFincaIndex] ||
                              fincasEnModal.disponibles[0];
                            if (targetFinca) {
                              agregarFincaSeleccionada(targetFinca.id);
                              setFocusedFincaIndex(0);
                            }
                          }
                        }}
                        placeholder="Buscar finca (Usa ↑↓ y Enter para agregar)..."
                        className="form-input w-full pl-8 h-8 text-xs bg-white"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {fincasEnModal.disponibles.length === 0 ? (
                        <div className="p-3 bg-white rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
                          No se encontraron fincas disponibles con ese criterio de búsqueda.
                        </div>
                      ) : (
                        fincasEnModal.disponibles.map((f, idx) => {
                          const lts = getPromedioReal15Dias(f.id, f);
                          const tieneOtraRuta = f.rutaId && f.rutaId !== modoEdicionId;
                          const isFocused = idx === focusedFincaIndex;
                          return (
                            <div
                              key={f.id}
                              onMouseEnter={() => setFocusedFincaIndex(idx)}
                              className={`flex items-center justify-between p-2 rounded-lg border transition-all text-xs ${
                                isFocused
                                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-400'
                                  : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                              }`}
                            >
                              <div className="flex-1 pr-2">
                                <div className="font-semibold text-slate-900">{f.nombre}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                  <span>{(f as any).propietario || f.propietarioNombre || 'Productor'}</span>
                                  <span className="font-medium text-slate-600">~{lts} Lts/d</span>
                                  {tieneOtraRuta && (
                                    <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded border border-amber-200">
                                      En otra ruta
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => agregarFincaSeleccionada(f.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                                  isFocused
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white'
                                }`}
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                Agregar
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </form>

            {/* Footer del Modal - Fijo */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={cerrarModal}
                className="btn btn-outline text-xs h-9 px-4 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-ruta-logistica"
                disabled={guardarMutation.isPending}
                className="btn btn-primary text-xs h-9 px-5 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-2 cursor-pointer"
              >
                {guardarMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Guardar Cambios de Ruta
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL ASIGNAR FINCA DIRECTA A UNA RUTA DESDE LA TABLA DE FINCAS SIN RUTA */}
      {/* ========================================================================= */}
      {modalAsignarFincaDirecta && fincaParaAsignarDirecta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-visible my-auto border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <RouteIcon className="w-5 h-5 text-white" />
                <h3 className="text-base font-extrabold text-white">
                  Asignar Finca a Circuito
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAsignarFincaDirecta(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-visible">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Finca Seleccionada:
                </span>
                <strong className="text-sm font-extrabold text-slate-900 block mt-0.5">
                  {fincaParaAsignarDirecta.nombre}
                </strong>
                <span className="text-xs text-slate-600 block mt-0.5">
                  Propietario: {(fincaParaAsignarDirecta as any).propietario || fincaParaAsignarDirecta.propietarioNombre || 'Productor'} • ~{getPromedioReal15Dias(fincaParaAsignarDirecta.id, fincaParaAsignarDirecta)} Lts/d
                </span>
              </div>

              <div className="relative z-30">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Selecciona la Ruta Logística de Destino:
                </label>
                <SearchableSelect
                  options={rutas.map((r) => ({
                    value: r.id,
                    label: `${r.nombre} (${r.camionPlaca || 'Sin cisterna'})`,
                    subLabel: `${fincas.filter((f) => f.rutaId === r.id).length} fincas en circuito`,
                  }))}
                  value={rutaDestinoDirectaId || ''}
                  onChange={(val) => setRutaDestinoDirectaId(Number(val) || undefined)}
                  placeholder="-- Elegir ruta de destino --"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setModalAsignarFincaDirecta(false)}
                className="btn btn-outline text-xs h-9 px-4 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!rutaDestinoDirectaId || asignarFincaDirectaMutation.isPending}
                onClick={() => {
                  if (rutaDestinoDirectaId && fincaParaAsignarDirecta) {
                    asignarFincaDirectaMutation.mutate({
                      rutaId: rutaDestinoDirectaId,
                      fincaId: fincaParaAsignarDirecta.id,
                    });
                  }
                }}
                className="btn btn-primary text-xs h-9 px-5 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {asignarFincaDirectaMutation.isPending ? 'Asignando...' : 'Confirmar Asignación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
