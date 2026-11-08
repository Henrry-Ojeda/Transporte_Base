import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { CamionSelect, ChoferSelect } from '@/components/selectors';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { operacionesApi } from '@/api/operaciones.api';
import { catalogosApi } from '@/api/catalogos.api';
import type {
  PlanificacionRutaChoferDto,
  GuardarPlanificacionRutaChoferDto,
  FincaPromedioDto,
  CamionDto,
  RutaLogisticaDto,
} from '@/types';
import {
  Calendar,
  Truck,
  User,
  Route as RouteIcon,
  PlusCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Info,
  X,
  Search,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';

export interface PlanificacionRutasChoferesProps {
  fechaInicial?: string;
  onFechaChange?: (fecha: string) => void;
  esIntegrado?: boolean;
}

export const PlanificacionRutasChoferesPage: React.FC<PlanificacionRutasChoferesProps> = ({
  fechaInicial,
  onFechaChange,
  esIntegrado = false,
}) => {
  const queryClient = useQueryClient();

  // Fecha operativa (por defecto hoy en YYYY-MM-DD o fecha inicial provista)
  const [fechaOperativa, setFechaOperativa] = useState<string>(() => {
    if (fechaInicial) return fechaInicial;
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  // Sincronizar con fecha externa si cambia
  React.useEffect(() => {
    if (fechaInicial && fechaInicial !== fechaOperativa) {
      setFechaOperativa(fechaInicial);
    }
  }, [fechaInicial]);

  // Vista: 'tarjetas' | 'tabla'
  const [vistaModo, setVistaModo] = useState<'tarjetas' | 'tabla'>('tarjetas');

  // Modal Estado
  const [modalAbierto, setModalAbierto] = useState(false);
  const [planificacionEditar, setPlanificacionEditar] = useState<PlanificacionRutaChoferDto | null>(null);

  // Formulario de asignación
  const [formFecha, setFormFecha] = useState<string>(fechaOperativa);
  const [formCamionId, setFormCamionId] = useState<number | undefined>(undefined);
  const [formChoferId, setFormChoferId] = useState<number | undefined>(undefined);
  const [formRutasIds, setFormRutasIds] = useState<number[]>([]);
  const [formFincasSeleccionadas, setFormFincasSeleccionadas] = useState<number[]>([]);
  const [formObservacion, setFormObservacion] = useState<string>('');
  const [busquedaFincaChecklist, setBusquedaFincaChecklist] = useState<string>('');
  const [filtroSoloRuta, setFiltroSoloRuta] = useState<boolean>(true);

  // Navegación de fecha
  const cambiarFecha = (dias: number) => {
    const [y, m, d] = fechaOperativa.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + dias);
    const nextStr = date.toISOString().split('T')[0];
    setFechaOperativa(nextStr);
    onFechaChange?.(nextStr);
  };

  const irAHoy = () => {
    const hoy = new Date().toISOString().split('T')[0];
    setFechaOperativa(hoy);
    onFechaChange?.(hoy);
  };

  // Queries
  const { data: planificaciones = [], isLoading: cargandoPlanes } = useQuery<PlanificacionRutaChoferDto[]>({
    queryKey: ['planificaciones-choferes', fechaOperativa],
    queryFn: () => operacionesApi.getPlanificacionesChoferes(fechaOperativa),
  });

  // Filtro Estricto: Solo tickets y asignaciones activas (excluir finalizados/cerrados)
  const esTicketActivo = (estado?: string) => {
    if (!estado) return true;
    const s = estado.toUpperCase();
    return !s.includes('FINALIZ') && !s.includes('CERRAD') && !s.startsWith('4');
  };

  const planificacionesActivas = useMemo(() => {
    return planificaciones.filter((p) => esTicketActivo(p.estadoTicket));
  }, [planificaciones]);

  const { data: rutas = [] } = useQuery<RutaLogisticaDto[]>({
    queryKey: ['rutas-logistica'],
    queryFn: () => operacionesApi.getRutasLogistica(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: fincasPromedios = [], isLoading: cargandoFincas } = useQuery<FincaPromedioDto[]>({
    queryKey: ['fincas-promedios-15dias'],
    queryFn: () => operacionesApi.getFincasPromedios15Dias(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: camiones = [] } = useQuery<CamionDto[]>({
    queryKey: ['camiones-catalogos'],
    queryFn: () => catalogosApi.getCamiones(true),
    staleTime: 1000 * 60 * 5,
  });

  const [fincasBloqueadas, setFincasBloqueadas] = useState<number[]>([]);

  // Mutaciones
  const guardarMutation = useMutation({
    mutationFn: (dto: GuardarPlanificacionRutaChoferDto) => operacionesApi.guardarPlanificacionChofer(dto),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['planificaciones-choferes'] });
      queryClient.invalidateQueries({ queryKey: ['controles-rutas'] });
      queryClient.invalidateQueries({ queryKey: ['viajes-rutas'] });
      setModalAbierto(false);
      Swal.fire({
        icon: 'success',
        title: 'Planificación Guardada',
        text: res.message || 'La asignación de ruta y chofer se guardó exitosamente y se sincronizó con el ticket.',
        confirmButtonColor: '#2563eb',
        timer: 2000,
        showConfirmButton: false,
      });
    },
    onError: (err: any) => {
      Swal.fire({
        icon: 'error',
        title: 'Error al Guardar',
        text: err?.response?.data?.message || err?.message || 'No se pudo guardar la planificación.',
        confirmButtonColor: '#2563eb',
      });
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => operacionesApi.eliminarPlanificacionChofer(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['planificaciones-choferes'] });
      Swal.fire({
        icon: 'success',
        title: 'Planificación Eliminada',
        text: res.message || 'La asignación se eliminó correctamente.',
        confirmButtonColor: '#2563eb',
        timer: 2000,
        showConfirmButton: false,
      });
    },
    onError: (err: any) => {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err?.response?.data?.message || 'No se pudo eliminar la planificación.',
        confirmButtonColor: '#2563eb',
      });
    },
  });

  // Camión seleccionado en el modal
  const camionSeleccionado = useMemo(() => {
    return camiones.find((c) => c.id === formCamionId);
  }, [camiones, formCamionId]);

  // Capacidad de la cisterna seleccionada
  const capacidadCisterna = camionSeleccionado?.capacidadLitros || 0;

  // Mapa de fincas ya asignadas a otros camiones en la misma fecha
  const fincasAsignadasEnFecha = useMemo(() => {
    const map = new Map<number, { camionPlaca: string; choferNombre: string; planId: number }>();
    planificaciones.forEach((p) => {
      if (planificacionEditar && p.id === planificacionEditar.id) {
        return; // Excluir la planificación que se está editando
      }
      (p.listaFincasIds || []).forEach((fId) => {
        map.set(fId, {
          camionPlaca: p.camionPlaca || `Camión #${p.camionId}`,
          choferNombre: p.conductorNombre || 'Chofer',
          planId: p.id,
        });
      });
    });
    return map;
  }, [planificaciones, planificacionEditar]);

  const getFincaId = (f: any): number => Number(f?.fincaId ?? f?.FincaId ?? f?.id ?? f?.Id ?? 0);
  const getRutaId = (f: any): number => Number(f?.rutaId ?? f?.RutaId ?? 0);

  // Fincas filtradas y ordenadas para el modal
  const fincasParaModal = useMemo(() => {
    let list = fincasPromedios;
    if (filtroSoloRuta && formRutasIds.length > 0) {
      list = list.filter((f) => formRutasIds.includes(getRutaId(f)));
    }
    if (busquedaFincaChecklist.trim()) {
      const q = busquedaFincaChecklist.toLowerCase();
      list = list.filter(
        (f) =>
          (f.fincaNombre && f.fincaNombre.toLowerCase().includes(q)) ||
          (f.propietario && f.propietario.toLowerCase().includes(q))
      );
    }

    // Regla: Cuando se selecciona una ruta, sus fincas y las fincas marcadas pasan DE PRIMERO para desmarcar o marcar
    return [...list].sort((a, b) => {
      const fIdA = getFincaId(a);
      const fIdB = getFincaId(b);
      const checkedA = formFincasSeleccionadas.includes(fIdA) || fincasBloqueadas.includes(fIdA);
      const checkedB = formFincasSeleccionadas.includes(fIdB) || fincasBloqueadas.includes(fIdB);
      const inRouteA = formRutasIds.length > 0 && formRutasIds.includes(getRutaId(a));
      const inRouteB = formRutasIds.length > 0 && formRutasIds.includes(getRutaId(b));

      // Ponderación:
      // 4: De la ruta seleccionada y marcada (lista para revisar/desmarcar)
      // 3: De la ruta seleccionada pero no marcada (fácil de marcar)
      // 2: Marcada (de otra ruta o manual)
      // 0: Resto de fincas
      const scoreA = (inRouteA && checkedA ? 4 : inRouteA ? 3 : checkedA ? 2 : 0);
      const scoreB = (inRouteB && checkedB ? 4 : inRouteB ? 3 : checkedB ? 2 : 0);

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      const nameA = a.fincaNombre || (a as any).FincaNombre || '';
      const nameB = b.fincaNombre || (b as any).FincaNombre || '';
      return nameA.localeCompare(nameB);
    });
  }, [fincasPromedios, filtroSoloRuta, formRutasIds, busquedaFincaChecklist, formFincasSeleccionadas, fincasBloqueadas]);

  // Litros estimados en vivo de las fincas seleccionadas en el modal
  const litrosEstimadosSeleccionados = useMemo(() => {
    const mapaPromedios = new Map<number, number>();
    fincasPromedios.forEach((f) => mapaPromedios.set(getFincaId(f), f.promedioLitros || 0));
    return formFincasSeleccionadas.reduce((acc, fId) => acc + (mapaPromedios.get(fId) || 0), 0);
  }, [formFincasSeleccionadas, fincasPromedios]);

  // Porcentaje de ocupación proyectado
  const porcentajeOcupacion = useMemo(() => {
    if (capacidadCisterna <= 0) return 0;
    return Math.round((litrosEstimadosSeleccionados / capacidadCisterna) * 100);
  }, [litrosEstimadosSeleccionados, capacidadCisterna]);

  // Opciones de rutas para el selector
  const opcionesRutas: SelectOption[] = useMemo(() => {
    return rutas.map((r) => ({
      value: r.id,
      label: r.nombre,
      subLabel: `${r.totalFincas || 0} fincas asignadas base`,
    }));
  }, [rutas]);

  // Alternar selección de una ruta logística
  const toggleRuta = (rutaId: number) => {
    setFormRutasIds((prev) => {
      const exists = prev.includes(rutaId);
      const updated = exists ? prev.filter((id) => id !== rutaId) : [...prev, rutaId];
      if (!exists) {
        // Al agregar la ruta, preseleccionar sus fincas
        const fincasDeEstaRuta = fincasPromedios.filter((f) => getRutaId(f) === rutaId).map(getFincaId);
        setFormFincasSeleccionadas((prevF) => Array.from(new Set([...prevF, ...fincasDeEstaRuta])));
      }
      return updated;
    });
  };

  // Abrir modal para crear
  const abrirModalCrear = () => {
    setPlanificacionEditar(null);
    setFincasBloqueadas([]);
    setFormFecha(fechaOperativa);
    setFormCamionId(undefined);
    setFormChoferId(undefined);
    setFormRutasIds([]);
    setFormFincasSeleccionadas([]);
    setFormObservacion('');
    setBusquedaFincaChecklist('');
    setFiltroSoloRuta(true);
    setModalAbierto(true);
  };

  // Abrir modal para editar (o modificar fincas en caliente)
  const abrirModalEditar = (item: PlanificacionRutaChoferDto) => {
    setPlanificacionEditar(item);
    setFincasBloqueadas(item.fincasRecolectadasIds || []);
    setFormFecha(item.fecha ? String(item.fecha).split('T')[0] : fechaOperativa);
    setFormCamionId(item.camionId);
    setFormChoferId(item.conductorId);
    
    // Parsear rutasIds múltiples o fallback a rutaLogisticaId
    const rIds = (item.rutasIds || '')
      .split(',')
      .map(Number)
      .filter((n) => n > 0);
    if (rIds.length === 0 && item.rutaLogisticaId) {
      rIds.push(item.rutaLogisticaId);
    }
    setFormRutasIds(rIds);
    setFormFincasSeleccionadas([...(item.listaFincasIds || [])]);
    setFormObservacion(item.observacion || '');
    setBusquedaFincaChecklist('');
    setFiltroSoloRuta(false);
    setModalAbierto(true);
  };

  // Guardar asignación
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCamionId) {
      Swal.fire({ icon: 'warning', title: 'Camión requerido', text: 'Por favor seleccione el camión cisterna.' });
      return;
    }
    if (!formChoferId) {
      Swal.fire({ icon: 'warning', title: 'Conductor requerido', text: 'Por favor seleccione el conductor responsable.' });
      return;
    }
    if (formFincasSeleccionadas.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin fincas seleccionadas', text: 'Debe seleccionar al menos una finca para este camión.' });
      return;
    }

    // REGLA: Si dos choferes tienen o intentan confirmar la misma finca, se requiere confirmación explícita
    const fincasDuplicadas = formFincasSeleccionadas.filter((fId) => fincasAsignadasEnFecha.has(fId));
    if (fincasDuplicadas.length > 0) {
      const itemsList = fincasDuplicadas
        .map((fId) => {
          const fObj = fincasPromedios.find((f) => getFincaId(f) === fId);
          const asig = fincasAsignadasEnFecha.get(fId)!;
          const nom = fObj?.fincaNombre || (fObj as any)?.FincaNombre || `Finca #${fId}`;
          return `<li><strong>${nom}</strong>: ya está asignada a <em>${asig.camionPlaca} (${asig.choferNombre})</em></li>`;
        })
        .join('');

      const result = await Swal.fire({
        title: '⚠️ Fincas compartidas entre choferes',
        html: `
          <div style="text-align: left; font-size: 13px; line-height: 1.6;">
            <p>Las siguientes fincas seleccionadas ya están asignadas a otro camión hoy:</p>
            <ul style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 10px 18px; margin: 12px 0;">
              ${itemsList}
            </ul>
            <p style="color: #b45309; font-weight: 700; margin-bottom: 0;">
              ¿Desea confirmar y mantener esta asignación compartida para ambos choferes?
            </p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, confirmar asignación',
        cancelButtonText: 'Cancelar y revisar',
      });

      if (!result.isConfirmed) {
        return;
      }
    }

    const dto: GuardarPlanificacionRutaChoferDto = {
      id: planificacionEditar?.id,
      fecha: formFecha || fechaOperativa,
      camionId: formCamionId,
      conductorId: formChoferId,
      rutaLogisticaId: formRutasIds.length > 0 ? formRutasIds[0] : undefined,
      rutasIds: formRutasIds.length > 0 ? formRutasIds.join(',') : undefined,
      fincasIds: formFincasSeleccionadas,
      litrosEstimados: Math.round(litrosEstimadosSeleccionados),
      observacion: formObservacion.trim() || undefined,
    };

    guardarMutation.mutate(dto);
  };

  // Alternar finca en el checklist
  const toggleFinca = (fincaId: number) => {
    if (!fincaId) return;
    if (fincasBloqueadas.includes(fincaId)) return; // Finca ya recolectada por el chofer no se puede desmarcar
    setFormFincasSeleccionadas((prev) =>
      prev.includes(fincaId) ? prev.filter((id) => id !== fincaId) : [...prev, fincaId]
    );
  };

  // Seleccionar todas las fincas visibles en el checklist
  const seleccionarTodasDeRuta = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const idsVisibles = fincasParaModal.map(getFincaId).filter((id) => id > 0);
    if (idsVisibles.length === 0) return;
    setFormFincasSeleccionadas((prev) => {
      const prevNums = prev.map(Number);
      const todosYaEstan = idsVisibles.every((id) => prevNums.includes(id));
      if (todosYaEstan) {
        return prevNums.filter((id) => !idsVisibles.includes(id) || fincasBloqueadas.includes(id));
      }
      return Array.from(new Set([...prevNums, ...idsVisibles]));
    });
  };

  // Deseleccionar todas las fincas no bloqueadas
  const deseleccionarTodas = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFormFincasSeleccionadas([...fincasBloqueadas]);
  };

  // Al cambiar camión, si tiene chofer asignado sugerirlo
  const handleCamionChange = (val: number, cam?: CamionDto) => {
    setFormCamionId(val);
    if (cam?.usuarioId && !formChoferId) {
      setFormChoferId(cam.usuarioId);
    }
  };

  // KPIs de la fecha (Solo de Tickets / Asignaciones Activas)
  const kpiTotalCamiones = planificacionesActivas.length;
  const kpiTotalLitrosEstimados = planificacionesActivas.reduce((acc, p) => acc + (p.litrosEstimados || 0), 0);
  const kpiTotalFincas = useMemo(() => {
    const set = new Set<number>();
    planificacionesActivas.forEach((p) => (p.listaFincasIds || []).forEach((id) => set.add(id)));
    return set.size;
  }, [planificacionesActivas]);

  const kpiCapacidadPromedio = useMemo(() => {
    if (planificacionesActivas.length === 0) return 0;
    const sumPcts = planificacionesActivas.reduce((acc, p) => acc + (p.porcentajeOcupacion || 0), 0);
    return Math.round(sumPcts / planificacionesActivas.length);
  }, [planificacionesActivas]);

  // Columnas para DataTable
  const columnas: ColumnDef<PlanificacionRutaChoferDto>[] = [
    {
      header: 'Camión Cisterna',
      accessorKey: 'camionPlaca',
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <div className="font-extrabold text-slate-800 text-sm">{row.camionPlaca || `ID: ${row.camionId}`}</div>
            <div className="text-xs text-slate-500">Capacidad: {(row.capacidadCamionLitros || 0).toLocaleString()} L</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Conductor / Chofer',
      accessorKey: 'conductorNombre',
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-bold text-slate-700 text-sm">{row.conductorNombre || 'Sin chofer'}</span>
        </div>
      ),
    },
    {
      header: 'Ruta Base',
      accessorKey: 'rutaLogisticaNombre',
      sortable: true,
      cell: (row) => {
        let nombresRutas: string[] = [];
        if (row.rutasIds) {
          const ids = row.rutasIds.split(',').map(Number);
          nombresRutas = ids.map((id: number) => rutas.find((r) => r.id === id)?.nombre).filter(Boolean) as string[];
        }
        if (nombresRutas.length === 0 && row.rutaLogisticaNombre) {
          nombresRutas = [row.rutaLogisticaNombre];
        }
        return nombresRutas.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {nombresRutas.map((nom, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <RouteIcon className="w-3 h-3 text-indigo-500" />
                {nom}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400 font-medium">Multiruta / Libre</span>
        );
      },
    },
    {
      header: 'Fincas Asignadas',
      accessorKey: 'totalFincas',
      sortable: true,
      cell: (row) => (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
          <Layers className="w-3 h-3 text-slate-500" />
          {row.totalFincas} {row.totalFincas === 1 ? 'Finca' : 'Fincas'}
        </span>
      ),
    },
    {
      header: 'Carga Estimada (15 Días)',
      accessorKey: 'litrosEstimados',
      sortable: true,
      cell: (row) => {
        const pct = row.porcentajeOcupacion || 0;
        const color = pct > 100 ? '#ef4444' : pct >= 90 ? '#f59e0b' : '#10b981';
        return (
          <div className="min-w-[130px]">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-extrabold text-slate-800">
                {(row.litrosEstimados || 0).toLocaleString()} Lts
              </span>
              <span className="font-extrabold" style={{ color }}>{pct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      },
    },
    {
      header: 'Observación',
      accessorKey: 'observacion',
      cell: (row) => (
        <span className="text-xs text-slate-500 italic max-w-[200px] truncate block" title={row.observacion || ''}>
          {row.observacion || '—'}
        </span>
      ),
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => abrirModalEditar(row)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            title="Editar Planificación"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await confirmDeleteOrDeactivate(
                'Eliminar Asignación',
                `¿Desea eliminar la planificación del camión ${row.camionPlaca} con ${row.conductorNombre}?`
              );
              if (res) {
                eliminarMutation.mutate(row.id);
              }
            }}
            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
            title="Eliminar Planificación"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className={esIntegrado ? "space-y-6 pt-1" : "page-container p-4 md:p-6 space-y-6"}>
      {/* CABECERA SUPERIOR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wide">
              <RouteIcon className="w-3.5 h-3.5 text-blue-600" /> Logísticas & Flota Diaria
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Promedio 15 Días
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Planificación de Rutas-choferes
          </h1>
          <p className="text-sm text-slate-500">
            Asignación y distribución diaria de fincas y rutas logísticas por camión cisterna y conductor, con proyección de carga en base al promedio de 15 días.
          </p>
        </div>

        {/* CONTROLES DERECHA: FECHA OPERATIVA Y BOTÓN NUEVO */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Navegador de Fecha */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-xs p-1">
            <button
              type="button"
              onClick={() => cambiarFecha(-1)}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Día Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <input
                type="date"
                value={fechaOperativa}
                onChange={(e) => setFechaOperativa(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent border-none outline-none cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={() => cambiarFecha(1)}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Día Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={irAHoy}
              className="ml-1 px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            >
              Hoy
            </button>
          </div>

          {/* Botón Asignar Camión */}
          <button
            type="button"
            onClick={abrirModalCrear}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Planificar Camión / Chofer
          </button>
        </div>
      </div>

      {/* KPIS DE RESUMEN DIARIO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Camiones Planificados</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{kpiTotalCamiones}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Asignados para {fechaOperativa}</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Litros Proyectados (15D)</div>
            <div className="text-2xl font-black text-blue-700 mt-1">{kpiTotalLitrosEstimados.toLocaleString()} Lts</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Basado en promedio histórico</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Droplet className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fincas en Recorrido</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">{kpiTotalFincas}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Paradas programadas hoy</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ocupación Media Cisternas</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{kpiCapacidadPromedio}%</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Capacidad proyectada total</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <RouteIcon className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* CONTROLES DE VISTA */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
          <span>Asignaciones de la Jornada ({planificacionesActivas.length})</span>
        </div>
        <div className="flex items-center bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setVistaModo('tarjetas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              vistaModo === 'tarjetas' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Tarjetas de Flota
          </button>
          <button
            type="button"
            onClick={() => setVistaModo('tabla')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              vistaModo === 'tabla' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            Tabla Completa
          </button>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL: TARJETAS O TABLA */}
      {cargandoPlanes ? (
        <div className="p-12 text-center text-slate-400">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
          Cargando planificaciones de la fecha...
        </div>
      ) : planificacionesActivas.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <Truck className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">Sin Planificaciones Registradas</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Aún no se han asignado camiones, choferes y fincas para la fecha <b>{fechaOperativa}</b>. Comience planificando la primera cisterna.
          </p>
          <button
            type="button"
            onClick={abrirModalCrear}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            Planificar Primer Camión
          </button>
        </div>
      ) : vistaModo === 'tarjetas' ? (
        /* VISTA DE TARJETAS DE CAMIÓN (SOLO TICKETS ACTIVOS) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {planificacionesActivas.map((plan) => {
            const pct = plan.porcentajeOcupacion || 0;
            const color = pct > 100 ? '#ef4444' : pct >= 90 ? '#f59e0b' : '#10b981';
            const fincasIds = plan.listaFincasIds || [];

            return (
              <div
                key={plan.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between"
              >
                <div>
                  {/* Encabezado de la tarjeta */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-base leading-tight">
                            {plan.camionPlaca}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                            Ticket #{plan.controlRutaId || plan.id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                              plan.estadoTicket === 'FINALIZADO'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : (plan.litrosRecolectadosReal || 0) > 0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {plan.estadoTicket === 'FINALIZADO'
                              ? '✅ Finalizado'
                              : (plan.litrosRecolectadosReal || 0) > 0
                              ? '🚛 En Ruta'
                              : '📋 Planificado'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-medium">
                          Capacidad: {(plan.capacidadCamionLitros || 0).toLocaleString()} Lts
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => abrirModalEditar(plan)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Modificar Fincas / Ruta (En Caliente)"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await confirmDeleteOrDeactivate(
                            'Eliminar Asignación',
                            `¿Desea eliminar la planificación del camión ${plan.camionPlaca}?`
                          );
                          if (res) eliminarMutation.mutate(plan.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar Asignación"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Chofer y Ruta */}
                  <div className="bg-slate-50/80 rounded-xl p-3 mb-3 space-y-2 border border-slate-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" /> Chofer Responsable:
                      </span>
                      <span className="font-bold text-slate-800">{plan.conductorNombre || 'Sin chofer'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <RouteIcon className="w-3.5 h-3.5 text-slate-400" /> Circuito Logístico:
                      </span>
                      {(() => {
                        let nombresRutas: string[] = [];
                        if (plan.rutasIds) {
                          const ids = plan.rutasIds.split(',').map(Number);
                          nombresRutas = ids.map((id: number) => rutas.find((r) => r.id === id)?.nombre).filter(Boolean) as string[];
                        }
                        if (nombresRutas.length === 0 && plan.rutaLogisticaNombre) {
                          nombresRutas = [plan.rutaLogisticaNombre];
                        }
                        return (
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 text-right">
                            {nombresRutas.length > 0 ? nombresRutas.join(' + ') : 'Flexible / Multiruta'}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Barra de progreso de capacidad */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-700">Carga Proyectada (15D):</span>
                      <div className="flex items-center gap-1">
                        <span className="font-extrabold text-slate-900">
                          {(plan.litrosEstimados || 0).toLocaleString()} Lts
                        </span>
                        <span className="text-slate-400">/</span>
                        <span className="text-slate-500">{(plan.capacidadCamionLitros || 0).toLocaleString()} L</span>
                        <span className="font-black ml-1 text-xs" style={{ color }}>
                          ({pct}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                      />
                    </div>
                    {pct > 100 && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Sobrecupo: Excede en {((plan.litrosEstimados || 0) - (plan.capacidadCamionLitros || 0)).toLocaleString()} Lts
                      </div>
                    )}

                    {(plan.litrosRecolectadosReal || 0) > 0 && (
                      <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                          <Droplet className="w-3.5 h-3.5 text-emerald-600" /> Leche Recolectada en Ruta:
                        </span>
                        <span className="font-black text-emerald-900 text-sm">
                          {(plan.litrosRecolectadosReal || 0).toLocaleString()} Lts
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Lista de Fincas Asignadas */}
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Fincas Asignadas ({fincasIds.length})</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {plan.fincasRecolectadasIds?.length || 0} recogidas
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {fincasIds.map((fId) => {
                        const finca = fincasPromedios.find((f) => f.fincaId === fId);
                        const yaRecolectada = plan.fincasRecolectadasIds?.includes(fId);
                        return (
                          <span
                            key={fId}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                              yaRecolectada
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <span>{yaRecolectada ? '✅' : '⏳'}</span>
                            <span className="truncate max-w-[140px]">{finca?.fincaNombre || `Finca #${fId}`}</span>
                            {finca?.promedioLitros ? (
                              <span className="text-[10px] font-bold text-blue-600 ml-0.5">
                                ~{finca.promedioLitros.toLocaleString()}L
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer de Tarjeta & Botón Acción Directa */}
                <div>
                  {plan.observacion && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 italic">
                      <Info className="w-3 h-3 inline mr-1 text-slate-400" />
                      {plan.observacion}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => abrirModalEditar(plan)}
                    className="w-full mt-3 py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Modificar Fincas / Ruta (En Caliente)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA DE TABLA CON DATATABLE (REGLA MAESTRA 2) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
          <DataTable
            data={planificacionesActivas}
            columns={columnas}
            searchPlaceholder="Buscar por placa, chofer, ruta u observación..."
            pageSizeDefault={10}
            exportFileName={`Planificacion_Rutas_Choferes_${fechaOperativa}`}
          />
        </div>
      )}

      {/* MODAL PARA CREAR / EDITAR PLANIFICACIÓN */}
      {modalAbierto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 16px 24px',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '920px',
              maxHeight: 'calc(100vh - 90px)',
              margin: 'auto',
              background: '#ffffff',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Cabecera del Modal */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {planificacionEditar ? 'Editar Planificación de Camión' : 'Planificar Camión y Chofer'}
                  </h3>
                  <p className="text-xs text-slate-500">Distribución de circuitos y fincas de recolección</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleGuardar} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4">
              {/* FILA 1: FECHA, CAMIÓN Y CHOFER */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Fecha Operativa Editable */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" /> Fecha Operativa *
                  </label>
                  <input
                    type="date"
                    value={formFecha}
                    onChange={(e) => setFormFecha(e.target.value)}
                    className="w-full h-10 px-3 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                    required
                  />
                </div>

                {/* Camión Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Camión Cisterna *
                  </label>
                  <CamionSelect
                    value={formCamionId}
                    onChange={handleCamionChange}
                    required
                  />
                  {camionSeleccionado && (
                    <div className="mt-1 text-[11px] text-blue-700 font-semibold">
                      Capacidad: {capacidadCisterna.toLocaleString()} Lts
                    </div>
                  )}
                </div>

                {/* Chofer Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Conductor / Chofer *
                  </label>
                  <ChoferSelect
                    value={formChoferId}
                    onChange={(val) => setFormChoferId(val)}
                    required
                  />
                </div>
              </div>

              {/* FILA 2: RUTAS LOGÍSTICAS MÚLTIPLES */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <RouteIcon className="w-3.5 h-3.5 text-indigo-600" /> Circuitos / Rutas Logísticas Asignadas (Puede seleccionar varias)
                  </label>
                  {formRutasIds.length > 0 && (
                    <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      {formRutasIds.length} {formRutasIds.length === 1 ? 'ruta seleccionada' : 'rutas seleccionadas'}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl max-h-24 overflow-y-auto">
                  {rutas.map((r) => {
                    const isSel = formRutasIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRuta(r.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSel
                            ? 'bg-indigo-600 text-white shadow-xs border border-indigo-600'
                            : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <i className={`fa-solid ${isSel ? 'fa-check' : 'fa-plus'} text-[10px]`}></i>
                        <span>{r.nombre}</span>
                      </button>
                    );
                  })}
                  {rutas.length === 0 && (
                    <span className="text-xs text-slate-400 py-1">No hay rutas registradas</span>
                  )}
                </div>
              </div>

              {/* PANEL EN VIVO DE CAPACIDAD Y OCUPACIÓN */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-2xl p-4 border border-blue-100 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                      Proyección de Carga Cisterna (15 Días)
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-black text-slate-900">
                        {Math.round(litrosEstimadosSeleccionados).toLocaleString()} Lts
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        / {capacidadCisterna > 0 ? `${capacidadCisterna.toLocaleString()} Lts` : 'Sin camión'}
                      </span>
                      <span
                        className="text-sm font-black px-2 py-0.5 rounded-full"
                        style={{
                          background: porcentajeOcupacion > 100 ? '#fef2f2' : porcentajeOcupacion >= 90 ? '#fefce8' : '#ecfdf5',
                          color: porcentajeOcupacion > 100 ? '#dc2626' : porcentajeOcupacion >= 90 ? '#d97706' : '#059669',
                          border: `1px solid ${porcentajeOcupacion > 100 ? '#fecaca' : porcentajeOcupacion >= 90 ? '#fde68a' : '#a7f3d0'}`,
                        }}
                      >
                        {porcentajeOcupacion}% Ocupación
                      </span>
                    </div>
                  </div>

                  <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4">
                    <div className="text-xs font-bold text-slate-500">Fincas Seleccionadas</div>
                    <div className="text-xl font-extrabold text-blue-700">
                      {formFincasSeleccionadas.length}
                    </div>
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="mt-3 w-full h-3 bg-slate-200/70 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(porcentajeOcupacion, 100)}%`,
                      backgroundColor:
                        porcentajeOcupacion > 100
                          ? '#ef4444'
                          : porcentajeOcupacion >= 90
                          ? '#f59e0b'
                          : '#10b981',
                    }}
                  />
                </div>

                {/* Mensaje de alerta de sobrecupo o capacidad adecuada */}
                {capacidadCisterna > 0 && (
                  <div className="mt-2 text-xs font-semibold">
                    {porcentajeOcupacion > 100 ? (
                      <span className="text-red-700 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        Sobrecupo proyectado: Excede la capacidad por {(Math.round(litrosEstimadosSeleccionados) - capacidadCisterna).toLocaleString()} Lts. Se recomienda dividir fincas con otro camión.
                      </span>
                    ) : porcentajeOcupacion >= 90 ? (
                      <span className="text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Capacidad casi completa ({porcentajeOcupacion}%). Margen libre de {(capacidadCisterna - Math.round(litrosEstimadosSeleccionados)).toLocaleString()} Lts.
                      </span>
                    ) : (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Carga óptima dentro del límite. Margen disponible: {(capacidadCisterna - Math.round(litrosEstimadosSeleccionados)).toLocaleString()} Lts.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* SELECCIÓN DE FINCAS GANADERAS */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Fincas a Recolectar (Promedio Histórico 15 Días)
                  </label>
                  <div className="flex items-center gap-2">
                    {formRutasIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFiltroSoloRuta(!filtroSoloRuta)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                          filtroSoloRuta ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {filtroSoloRuta ? `✓ Filtrando por ${formRutasIds.length} ${formRutasIds.length === 1 ? 'Ruta' : 'Rutas'}` : 'Ver Todas las Rutas'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={seleccionarTodasDeRuta}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      {fincasParaModal.length > 0 && fincasParaModal.every((f) => formFincasSeleccionadas.includes(getFincaId(f)))
                        ? `Deseleccionar Visibles (${fincasParaModal.length})`
                        : `Seleccionar Visibles (${fincasParaModal.length})`}
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={deseleccionarTodas}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                    >
                      Deseleccionar
                    </button>
                  </div>
                </div>

                {/* Buscador dentro del checklist */}
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={busquedaFincaChecklist}
                    onChange={(e) => setBusquedaFincaChecklist(e.target.value)}
                    placeholder="Filtrar finca o productor..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                  />
                </div>

                {/* Lista de fincas con scroll */}
                <div className="border border-slate-200 rounded-2xl max-h-64 overflow-y-auto p-2 divide-y divide-slate-100 bg-white">
                  {cargandoFincas ? (
                    <div className="p-6 text-center text-xs text-slate-400">Cargando fincas...</div>
                  ) : fincasParaModal.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No se encontraron fincas con los filtros seleccionados.
                    </div>
                  ) : (
                    fincasParaModal.map((finca) => {
                      const fId = getFincaId(finca);
                      const isBloqueada = fincasBloqueadas.includes(fId);
                      const isChecked = formFincasSeleccionadas.includes(fId) || isBloqueada;
                      const inSelectedRoute = formRutasIds.length > 0 && formRutasIds.includes(getRutaId(finca));
                      const asignadaA = fincasAsignadasEnFecha.get(fId);
                      const nombreFinca = finca.fincaNombre || (finca as any).FincaNombre || (finca as any).nombre || `Finca #${fId}`;
                      const nombrePropietario = finca.propietario || (finca as any).Propietario || (finca as any).productor || 'Sin propietario';
                      const promLitros = Number(finca.promedioLitros || (finca as any).PromedioLitros || 0);

                      return (
                        <div
                          key={fId}
                          onClick={() => {
                            if (!isBloqueada) toggleFinca(fId);
                          }}
                          className={`flex items-center justify-between p-2 rounded-xl transition-colors ${
                            isBloqueada
                              ? 'bg-emerald-50/70 border border-emerald-200 cursor-not-allowed'
                              : isChecked
                              ? 'bg-blue-50/70 hover:bg-blue-50 cursor-pointer border border-blue-100'
                              : inSelectedRoute
                              ? 'bg-purple-50/40 hover:bg-purple-50/70 cursor-pointer border border-purple-100'
                              : 'hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isBloqueada}
                              onChange={() => {}} // controlado por el onClick del contenedor
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-60"
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                <span>{nombreFinca}</span>
                                {inSelectedRoute && (
                                  <span
                                    className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300"
                                    title="Finca perteneciente al circuito de la ruta seleccionada"
                                  >
                                    📍 De la Ruta
                                  </span>
                                )}
                                {isBloqueada ? (
                                  <span
                                    className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300"
                                    title="Esta finca ya fue recolectada por el chofer. No se puede desasignar del ticket."
                                  >
                                    ✅ Recolectada en ruta
                                  </span>
                                ) : asignadaA ? (
                                  <span
                                    className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300"
                                    title={`Esta finca ya está asignada hoy a ${asignadaA.camionPlaca} (${asignadaA.choferNombre})`}
                                  >
                                    ⚠️ Asignada a {asignadaA.camionPlaca}
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {nombrePropietario}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                              ~{Math.round(promLitros).toLocaleString()} Lts/d
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* OBSERVACIÓN OPERATIVA */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Observación Operativa / Instrucciones para el Chofer (Opcional)
                </label>
                <textarea
                  value={formObservacion}
                  onChange={(e) => setFormObservacion(e.target.value)}
                  placeholder="Ej: Comenzar por el sector norte, recoger canecas adicionales en finca Guasimales..."
                  rows={2}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                />
              </div>

              {/* ACCIONES FOOTER */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {guardarMutation.isPending ? 'Guardando...' : planificacionEditar ? 'Actualizar Planificación' : 'Guardar Planificación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanificacionRutasChoferesPage;
