import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { operacionesApi } from '@/api/operaciones.api';
import { catalogosApi } from '@/api/catalogos.api';
import { sistemaApi } from '@/api/sistema.api';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { CamionSelect, ChoferSelect, CompaniaSelect, TipoLecheSelect } from '@/components/selectors';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import Swal from 'sweetalert2';
import type { CompaniaDto, CamionDto, UsuarioDto, DespachoCompaniaDto, ControlRutaDto } from '@/types';
import { viajeEstaEnviadoAReceptoria, esReceptoriaPrincipal } from '@/utils/procesoViaje';

export const ReceptoriaPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const hasBufala = useAuthStore((state) => state.hasTenantModule('MOD_LECHE_BUFALA'));
  const hoyStr = new Date().toISOString().split('T')[0];

  // Filtros globales de la vista
  const [filtroFecha, setFiltroFecha] = useState<string>(hoyStr);
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [busquedaBandeja, setBusquedaBandeja] = useState<string>('');
  const [segmentoActivo, setSegmentoActivo] = useState<'TODOS' | 'ENTRADAS' | 'SALIDAS' | 'FORM' | 'HISTORIAL'>('TODOS');
  const [subFiltroEntradas, setSubFiltroEntradas] = useState<'TODAS' | 'EN_SILOS' | 'EN_RECOLECCION' | 'RECEPCIONADAS'>('TODAS');
  const [subFiltroSalidas, setSubFiltroSalidas] = useState<'TODAS' | 'EN_TRANSITO' | 'FINALIZADAS'>('TODAS');
  const [mostrarFormulario, setMostrarFormulario] = useState<boolean>(false);

  // Filtros específicos de la tabla de entregas
  const [filtroChoferTabla, setFiltroChoferTabla] = useState<string>('');
  const [filtroCompaniaTabla, setFiltroCompaniaTabla] = useState<string>('');
  const [busquedaTabla, setBusquedaTabla] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortColumn, setSortColumn] = useState<string>('fecha');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Modales
  const [modalNuevoDespacho, setModalNuevoDespacho] = useState<boolean>(false);
  const [modalConfirmar, setModalConfirmar] = useState<boolean>(false);
  const [modalVerFotoRecibo, setModalVerFotoRecibo] = useState<string | null>(null);
  const [despachoSeleccionado, setDespachoSeleccionado] = useState<DespachoCompaniaDto | null>(null);
  const [litrosConfirmadosInput, setLitrosConfirmadosInput] = useState<number>(0);
  const [obsConfirmacionInput, setObsConfirmacionInput] = useState<string>('');

  // Formulario rápido de entrega directa
  const [formEntrega, setFormEntrega] = useState({
    fecha: hoyStr,
    usuarioId: user?.rol === 'CHOFER' ? user.id : 0,
    companiaId: 0,
    litros: 0,
    observacion: '',
  });

  // Formulario nuevo despacho a quesera / salida con multi-destinos
  interface DestinoSalidaRow {
    id: string;
    companiaId: number;
    litrosDespachados: number;
    tipoLeche: string;
    numeroGuiaSADA: string;
    observacion: string;
  }

  const [despachoCamionId, setDespachoCamionId] = useState<number>(0);
  const [fechaDespacho, setFechaDespacho] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [modalEditarDespacho, setModalEditarDespacho] = useState(false);
  const [despachoAEditar, setDespachoAEditar] = useState<any>(null);
  const [despachoUsuarioId, setDespachoUsuarioId] = useState<number>(0);
  const [destinosSalida, setDestinosSalida] = useState<DestinoSalidaRow[]>([
    { id: '1', companiaId: 0, litrosDespachados: 0, tipoLeche: 'VACA', numeroGuiaSADA: '', observacion: '' }
  ]);

  // Modal Auditoría y Validación de Litros y Recibos por Finca antes de Receptoría
  const [modalValidarFincasTicket, setModalValidarFincasTicket] = useState<boolean>(false);
  const [busquedaFincasValidar, setBusquedaFincasValidar] = useState<string>('');
  const [ticketsFincasValidadas, setTicketsFincasValidadas] = useState<Set<number>>(new Set());

  // Modal Verificar y Recibir Leche de Ruta (con Recargar y Despachar)
  const [modalVerificarViaje, setModalVerificarViaje] = useState<boolean>(false);
  const [viajeParaRecibir, setViajeParaRecibir] = useState<any | null>(null);
  const [litrosRecibidosInput, setLitrosRecibidosInput] = useState<number>(0);
  const [modoRecepcion, setModoRecepcion] = useState<'DEJAR_EN_RECEPTORIA' | 'RECARGAR_Y_DESPACHAR'>('DEJAR_EN_RECEPTORIA');
  const [recargaSilosInput, setRecargaSilosInput] = useState<number>(0);
  const [destinosRecarga, setDestinosRecarga] = useState<DestinoSalidaRow[]>([
    { id: '1', companiaId: 0, litrosDespachados: 0, tipoLeche: 'VACA', numeroGuiaSADA: '', observacion: '' }
  ]);
  const [obsRecepcionInput, setObsRecepcionInput] = useState<string>('');
  const [fincasViajeVerificar, setFincasViajeVerificar] = useState<any[]>([]);
  const [fincasVerificadasIds, setFincasVerificadasIds] = useState<Set<number>>(new Set());
  const [cargandoFincasViaje, setCargandoFincasViaje] = useState<boolean>(false);

  const [formDespacho, setFormDespacho] = useState({
    camionId: 0,
    companiaId: 0,
    litrosDespachados: 0,
    tipoLeche: 'VACA',
    numeroGuiaSADA: '',
    observaciones: '',
  });

  // Queries con auto-actualización reactiva en tiempo real (cada 8s)
  const { data: entregasHoy = [], isLoading: loadingEntregas } = useQuery<any[]>({
    queryKey: ['receptoria-hoy', filtroFecha],
    queryFn: () => operacionesApi.getEntregasHoy(filtroFecha || undefined),
    refetchInterval: 8000,
  });

  const { data: rutasHoy = [] } = useQuery<any[]>({
    queryKey: ['rutas-hoy', filtroFecha],
    queryFn: () => operacionesApi.getRutasHoy(filtroFecha || undefined),
    refetchInterval: 8000,
  });

  const { data: despachosCompanias = [], isLoading: loadingDespachos } = useQuery<DespachoCompaniaDto[]>({
    queryKey: ['despachos-companias', filtroFecha],
    queryFn: () => operacionesApi.getDespachosCompanias(filtroFecha || undefined),
    refetchInterval: 8000,
  });

  const { data: viajesActivos = [] } = useQuery<ControlRutaDto[]>({
    queryKey: ['viajes-activos-receptoria', filtroFecha],
    queryFn: () => operacionesApi.getControles(filtroFecha || undefined),
    refetchInterval: 8000,
  });

  const { data: companias = [] } = useQuery<CompaniaDto[]>({
    queryKey: ['companias-receptoria'],
    queryFn: () => catalogosApi.getCompanias(true),
  });

  const { data: camiones = [] } = useQuery<CamionDto[]>({
    queryKey: ['camiones-receptoria'],
    queryFn: () => catalogosApi.getCamiones(true),
  });

  const { data: usuarios = [] } = useQuery<UsuarioDto[]>({
    queryKey: ['usuarios-choferes'],
    queryFn: () => sistemaApi.getUsuarios('CHOFER'),
  });

  const { data: recolecciones = [] } = useQuery<any[]>({
    queryKey: ['receptoria-fincas-hoy', filtroFecha],
    queryFn: () => operacionesApi.getRutasHoy(filtroFecha || undefined),
    refetchInterval: 8000,
  });

  const { data: conductores = [] } = useQuery<any[]>({
    queryKey: ['receptoria-conductores'],
    queryFn: () => catalogosApi.getChoferes(),
  });

  const fincasTicketsMap = useMemo(() => {
    const map: Record<number, any[]> = {};
    recolecciones.forEach((rf: any) => {
      const vId = Number(rf.controlRutaId || rf.controlId || rf.ControlRutaId || 0);
      if (vId > 0) {
        if (!map[vId]) map[vId] = [];
        map[vId].push(rf);
      }
    });
    return map;
  }, [recolecciones]);

  // Opciones con búsqueda interna para SearchableSelect
  const camionesOptions = useMemo(() => {
    return camiones.map((c) => ({
      value: c.id,
      label: `${c.placa} - ${c.marca || 'Cisterna'} ${c.modelo || ''}`.trim(),
      subLabel: `Chofer: ${c.choferNombre || 'Sin chofer asignado'} | Capacidad: ${(c.capacidadLitros || 0).toLocaleString()} L`,
      badge: `${(c.capacidadLitros || 0).toLocaleString()} L`,
    }));
  }, [camiones]);

  const conductoresOptions = useMemo(() => {
    return usuarios.map((u) => ({
      value: u.id,
      label: u.nombreCompleto || u.nombreUsuario,
      subLabel: `Usuario: ${u.nombreUsuario} | Rol: ${u.rol || 'CHOFER'}`,
    }));
  }, [usuarios]);

  const companiasOptions = useMemo(() => {
    return companias.map((c) => ({
      value: c.id,
      label: c.nombre,
      subLabel: c.contacto ? `Contacto: ${c.contacto}` : undefined,
    }));
  }, [companias]);

  const tiposLecheOptions = useMemo(() => [
    { value: 'VACA', label: '🥛 Leche de Vaca' },
    { value: 'BUFALA', label: '🐃 Leche de Búfala' },
  ], []);

  // Mutaciones
  const guardarEntregaMutation = useMutation({
    mutationFn: (dto: typeof formEntrega) => operacionesApi.guardarEntrega(dto),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Entrega registrada exitosamente');
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-hoy'] });
      setFormEntrega({
        fecha: hoyStr,
        usuarioId: user?.rol === 'CHOFER' ? user.id : 0,
        companiaId: 0,
        litros: 0,
        observacion: '',
      });
      setMostrarFormulario(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar entrega');
    },
  });

  const crearDespachoMutation = useMutation({
    mutationFn: (dto: typeof formDespacho) => operacionesApi.crearDespachoCompania(dto),
    onSuccess: (data) => {
      toast.success(data.message || 'Ticket de salida a planta creado');
      queryClient.invalidateQueries({ queryKey: ['despachos-companias'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
      setModalNuevoDespacho(false);
      setFormDespacho({
        camionId: 0,
        companiaId: 0,
        litrosDespachados: 0,
        tipoLeche: 'VACA',
        numeroGuiaSADA: '',
        observaciones: '',
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al crear despacho');
    },
  });

  const crearDespachosMultiMutation = useMutation({
    mutationFn: async (payload: { fecha?: string; camionId: number; usuarioId: number; destinos: DestinoSalidaRow[] }) => {
      const results = [];
      for (const dest of payload.destinos) {
        const res = await operacionesApi.crearDespachoCompania({
          fecha: payload.fecha,
          camionId: payload.camionId,
          usuarioId: payload.usuarioId,
          companiaId: dest.companiaId,
          litrosDespachados: dest.litrosDespachados,
          tipoLeche: dest.tipoLeche,
          numeroGuiaSADA: dest.numeroGuiaSADA,
          observaciones: dest.observacion,
        });
        results.push(res);
      }
      return results;
    },
    onSuccess: (data) => {
      toast.success(`${data.length} Ticket(s) de salida emitido(s) con éxito`);
      queryClient.invalidateQueries({ queryKey: ['despachos-companias'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-balance'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['viajes-activos-receptoria'] });
      setModalNuevoDespacho(false);
      setDestinosSalida([
        { id: '1', companiaId: 0, litrosDespachados: 0, tipoLeche: 'VACA', numeroGuiaSADA: '', observacion: '' }
      ]);
      setDespachoCamionId(0);
      setDespachoUsuarioId(0);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al emitir despacho');
    },
  });

  const actualizarDespachoMutation = useMutation({
    mutationFn: (dto: { id: number; fecha: string; litrosDespachados: number; tipoLeche?: string; observacion?: string }) =>
      operacionesApi.actualizarDespachoCompania(dto.id, {
        fecha: dto.fecha,
        litrosDespachados: dto.litrosDespachados,
        tipoLeche: dto.tipoLeche,
        observacion: dto.observacion
      }),
    onSuccess: () => {
      toast.success('Ticket de salida actualizado correctamente');
      queryClient.invalidateQueries({ queryKey: ['despachos-companias'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-balance'] });
      setModalEditarDespacho(false);
      setDespachoAEditar(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar ticket de salida');
    }
  });

  const validarMutation = useMutation({
    mutationFn: ({ id, litros, obs }: { id: number; litros: number; obs: string }) =>
      operacionesApi.validarEntregaCompania(id, {
        litrosConfirmados: litros,
        litrosRecibidosCompania: litros,
        observaciones: obs,
        observacion: obs,
      }),
    onSuccess: (data) => {
      toast.success(data.message || 'Entrega validada y conciliada');
      queryClient.invalidateQueries({ queryKey: ['despachos-companias'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['viajes-activos-receptoria'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-fincas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['controles-rutas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-balance'] });
      setModalConfirmar(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al validar entrega');
    },
  });

  const devolverAlChoferMutation = useMutation({
    mutationFn: ({ ticketId, motivo }: { ticketId: number; motivo: string }) =>
      operacionesApi.revertirProcesoViaje(ticketId, {
        nuevoProcesoId: 1,
        motivo: motivo || 'Devuelto desde receptoría para que el chofer agregue o modifique fincas',
      }),
    onSuccess: (data: any) => {
      Swal.fire({
        icon: 'success',
        title: '¡Ticket Devuelto al Chofer!',
        text: data?.message || 'El ticket ha vuelto al estado ABIERTO exitosamente. El chofer ya puede agregar o editar fincas en el recorrido.',
        confirmButtonColor: '#059669',
      });
      queryClient.invalidateQueries({ queryKey: ['despachos-companias'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-viajes-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['controles-rutas-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['viajes-activos-receptoria'] });
      setModalConfirmar(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al devolver el ticket al chofer');
    },
  });

  const handleDevolverTicketAlChofer = async (ticketId: number) => {
    const { isConfirmed, value: motivo } = await Swal.fire({
      title: `¿Devolver Ticket #${ticketId} al Chofer?`,
      text: 'El ticket volverá al estado ABIERTO para que el chofer pueda agregar o modificar fincas en el viaje.',
      input: 'text',
      inputLabel: 'Motivo de la devolución (opcional):',
      inputPlaceholder: 'Ej: Faltó registrar fincas o corregir litros...',
      showCancelButton: true,
      confirmButtonText: 'Sí, Devolver al Chofer',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#64748b',
    });

    if (isConfirmed) {
      devolverAlChoferMutation.mutate({
        ticketId,
        motivo: motivo || 'Devuelto desde receptoría para agregar o modificar fincas',
      });
    }
  };

  const forzarEnviarReceptoriaMutation = useMutation({
    mutationFn: (ticketId: number) => operacionesApi.enviarAReceptoria(ticketId, 'Despachado desde Receptoría Web'),
    onSuccess: (data: any) => {
      Swal.fire({
        icon: 'success',
        title: '¡Viaje en Planta!',
        text: data?.message || 'El viaje ha sido recibido en receptoría y ahora está listo para validación y descarga.',
        confirmButtonColor: '#0284c7',
      });
      queryClient.invalidateQueries({ queryKey: ['viajes-activos-receptoria'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-hoy'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al enviar a receptoría');
    },
  });

  const handleForzarEnvioReceptoria = async (viaje: any) => {
    const choferNom = viaje._choferNombre || viaje.nombreConductor || 'Elvis Macias';
    const placa = viaje.camionPlaca || 'Cisterna';
    const lts = viaje._litrosRecogidos ? `${viaje._litrosRecogidos.toLocaleString()} Lts` : '';
    const res = await Swal.fire({
      title: `¿Recibir Cisterna en Planta?`,
      html: `<div style="text-align: left; font-size: 13.5px; line-height: 1.5;">
        <p>Ticket <b>#${viaje.codigoTicket || viaje.id}</b> — Conductor: <b>${choferNom}</b> (${placa})</p>
        ${lts ? `<p style="color: #0284c7; font-weight: 700;">Litros en Cisterna: ${lts}</p>` : ''}
        <div style="background: #eff6ff; border: 1.5px solid #bfdbfe; border-left: 4px solid #0284c7; padding: 10px 12px; border-radius: 8px; margin: 12px 0; color: #1e40af;">
          ℹ️ Se marcará la llegada de la cisterna a Planta / Silos para habilitar la auditoría de fincas y registro de pesaje de inmediato.
        </div>
      </div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Marcar en Planta',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0284c7',
    });
    if (res.isConfirmed) {
      forzarEnviarReceptoriaMutation.mutate(viaje.id);
    }
  };

  const eliminarEntregaMutation = useMutation({
    mutationFn: (id: number) => operacionesApi.eliminarEntrega(id),
    onSuccess: (data) => {
      toast.success(data.message || 'Entrega eliminada');
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al eliminar entrega');
    },
  });

  const abrirModalValidarFincas = (viaje: any) => {
    // REGLA OBLIGATORIA: Los procesos se respetan (incluso para ADMIN y SUPER ADMIN)
    if (!viajeEstaEnviadoAReceptoria(viaje)) {
      Swal.fire({
        icon: 'warning',
        title: 'Proceso Operativo en Curso',
        html: `<div style="text-align: left; font-size: 13.5px; line-height: 1.5;">
          <p>El conductor <b>${viaje.choferNombre || 'asignado'}</b> aún se encuentra <b>recolectando en fincas</b> con la cisterna <b>${viaje.camionPlaca || ''}</b>.</p>
          <div style="background: #fffbeb; border: 1.5px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 12px; border-radius: 8px; margin: 12px 0; color: #92400e;">
            ⚠️ <b>Respeto Obligatorio del Proceso:</b><br/>
            Aunque usted sea Administrador, no se puede verificar litros ni descargar en Receptoría mientras el chofer no haya finalizado su recorrido en campo y enviado la cisterna a Planta.
          </div>
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            Una vez el conductor finalice la ruta y despache a Receptoría desde su terminal móvil, se habilitará la recepción de la carga.
          </p>
        </div>`,
        confirmButtonColor: '#0284c7',
        confirmButtonText: 'Entendido',
      });
      return;
    }

    const lts = Number(viaje.totalLitrosRecogidos || viaje.totalLitrosFinca || 0);
    setViajeParaRecibir(viaje);
    setLitrosRecibidosInput(lts);
    setModoRecepcion('DEJAR_EN_RECEPTORIA');
    setRecargaSilosInput(0);
    setDestinosRecarga([
      { id: '1', companiaId: 0, litrosDespachados: lts, tipoLeche: 'VACA', numeroGuiaSADA: '', observacion: '' }
    ]);
    setObsRecepcionInput('');
    setFincasViajeVerificar([]);
    setBusquedaFincasValidar('');
    setCargandoFincasViaje(true);
    setModalValidarFincasTicket(true);

    if (viaje?.id) {
      operacionesApi.getFincasViaje(viaje.id, true)
        .then((fincas) => {
          const list = Array.isArray(fincas) ? fincas : [];
          // En validación de Receptoría: Solo mostrar fincas que tienen litros recolectados (> 0)
          // Las fincas que no tienen litros ni nada NO se visualizan en la validación
          const fincasConLitros = list.filter((f: any) => Number(f.litros ?? f.Litros ?? f.litrosLeche ?? 0) > 0);
          setFincasViajeVerificar(fincasConLitros);
          if (ticketsFincasValidadas.has(viaje.id)) {
            setFincasVerificadasIds(new Set(fincasConLitros.map((f: any, idx: number) => Number(f.id || f.fincaId || idx))));
          } else {
            setFincasVerificadasIds(new Set());
          }
        })
        .catch(() => {
          setFincasViajeVerificar([]);
        })
        .finally(() => {
          setCargandoFincasViaje(false);
        });
    }
  };

  const confirmarValidacionFincas = () => {
    if (!viajeParaRecibir) return;
    if (fincasViajeVerificar.length > 0 && fincasVerificadasIds.size === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Sin Fincas Seleccionadas',
        text: 'Debe verificar al menos una finca o hacer clic en "Seleccionar Todas las Fincas" para confirmar la concordancia de litros y recibos.',
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    if (fincasViajeVerificar.length > 0 && fincasVerificadasIds.size < fincasViajeVerificar.length) {
      Swal.fire({
        title: 'Validación Parcial de Fincas',
        text: `Ha verificado ${fincasVerificadasIds.size} de ${fincasViajeVerificar.length} fincas. ¿Desea marcar todas como validadas o continuar con las seleccionadas?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#2563eb',
        confirmButtonText: 'Seleccionar TODAS y Continuar',
        cancelButtonText: 'Continuar con seleccionadas',
      }).then((result) => {
        if (result.isConfirmed) {
          setFincasVerificadasIds(new Set(fincasViajeVerificar.map((f: any, idx: number) => Number(f.id || f.fincaId || idx))));
        }
        procederTrasValidacion();
      });
      return;
    }

    procederTrasValidacion();
  };

  const procederTrasValidacion = () => {
    if (!viajeParaRecibir) return;
    setTicketsFincasValidadas((prev) => new Set(prev).add(viajeParaRecibir.id));
    toast.success('¡Litros y Recibos de Fincas Validados Exitosamente!');
    setModalValidarFincasTicket(false);
    if (despachoSeleccionado && Number(despachoSeleccionado.controlRutaId) === Number(viajeParaRecibir.id)) {
      setModalConfirmar(true);
    } else {
      setModalVerificarViaje(true);
    }
  };

  const abrirModalValidarFincasDesdeDespacho = (despacho: any) => {
    setDespachoSeleccionado(despacho);
    const cRutaId = Number(despacho.controlRutaId || 0);
    if (!cRutaId) {
      toast.error('Este despacho no tiene ticket de recolección de ruta vinculado.');
      return;
    }
    const viajeCorrespondiente = viajesActivos.find((v) => v.id === cRutaId) || {
      id: cRutaId,
      camionPlaca: despacho.camionPlaca,
      choferNombre: despacho.nombreConductor || (despacho as any).conductorNombre,
      totalLitrosRecogidos: despacho.litrosDespachados,
      procesoActualId: 3,
      estado: 'RECEPCIONADO',
      nombreCompaniaDestino: despacho.nombreCompania || (despacho as any).companiaNombre,
    };
    abrirModalValidarFincas(viajeCorrespondiente);
  };

  const abrirModalVerificarViaje = (viaje: any) => {
    // REGLA OBLIGATORIA: Los procesos se respetan (incluso para ADMIN y SUPER ADMIN)
    if (!viajeEstaEnviadoAReceptoria(viaje)) {
      Swal.fire({
        icon: 'warning',
        title: 'Proceso Operativo en Curso',
        html: `<div style="text-align: left; font-size: 13.5px; line-height: 1.5;">
          <p>El conductor <b>${viaje.choferNombre || 'asignado'}</b> aún se encuentra <b>recolectando en fincas</b> con la cisterna <b>${viaje.camionPlaca || ''}</b>.</p>
          <div style="background: #fffbeb; border: 1.5px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 12px; border-radius: 8px; margin: 12px 0; color: #92400e;">
            ⚠️ <b>Respeto Obligatorio del Proceso:</b><br/>
            Aunque usted sea Administrador, no se puede verificar litros ni descargar en Receptoría mientras el chofer no haya finalizado su recorrido en campo y enviado la cisterna a Planta.
          </div>
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            Una vez el conductor finalice la ruta y despache a Receptoría desde su terminal móvil, se habilitará la recepción de la carga.
          </p>
        </div>`,
        confirmButtonColor: '#0284c7',
        confirmButtonText: 'Entendido',
      });
      return;
    }

    // Si aún no se han validado las fincas de este viaje, redirigir primero a la validación de fincas
    if (!ticketsFincasValidadas.has(viaje.id)) {
      abrirModalValidarFincas(viaje);
      return;
    }

    const lts = Number(viaje.totalLitrosRecogidos || viaje.totalLitrosFinca || 0);
    setViajeParaRecibir(viaje);
    setLitrosRecibidosInput(lts);
    setModoRecepcion('DEJAR_EN_RECEPTORIA');
    setRecargaSilosInput(0);
    setDestinosRecarga([
      { id: '1', companiaId: 0, litrosDespachados: lts, tipoLeche: 'VACA', numeroGuiaSADA: '', observacion: '' }
    ]);
    setObsRecepcionInput('');
    setModalVerificarViaje(true);

    if (viaje?.id && fincasViajeVerificar.length === 0) {
      setCargandoFincasViaje(true);
      operacionesApi.getFincasViaje(viaje.id, true)
        .then((fincas) => {
          const list = Array.isArray(fincas) ? fincas : [];
          const fincasConLitros = list.filter((f: any) => Number(f.litros ?? f.Litros ?? f.litrosLeche ?? 0) > 0);
          setFincasViajeVerificar(fincasConLitros);
          setFincasVerificadasIds(new Set(fincasConLitros.map((f: any, idx: number) => Number(f.id || f.fincaId || idx))));
        })
        .catch(() => {
          setFincasViajeVerificar([]);
        })
        .finally(() => {
          setCargandoFincasViaje(false);
        });
    }
  };

  const recibirViajeMutation = useMutation({
    mutationFn: async () => {
      if (!viajeParaRecibir) return;
      if (fincasViajeVerificar.length > 0 && !ticketsFincasValidadas.has(viajeParaRecibir.id) && fincasVerificadasIds.size < fincasViajeVerificar.length) {
        throw new Error('Debe validar y confirmar los litros y recibos de las fincas del ticket antes de finalizar la recepción.');
      }
      const payload: any = {
        litrosRecibidos: Math.round(Number(litrosRecibidosInput)),
        accion: modoRecepcion,
        litrosCargadosAdicional: modoRecepcion === 'RECARGAR_Y_DESPACHAR' ? Math.round(Number(recargaSilosInput)) : 0,
        observacion: obsRecepcionInput,
      };
      if (modoRecepcion === 'RECARGAR_Y_DESPACHAR') {
        const dests = destinosRecarga
          .filter((d) => d.companiaId > 0 && Number(d.litrosDespachados) > 0)
          .map((d) => ({
            companiaId: d.companiaId,
            litrosDespachados: Math.round(Number(d.litrosDespachados)),
            litros: Math.round(Number(d.litrosDespachados)),
            tipoLeche: d.tipoLeche || 'VACA',
            numeroGuiaSADA: d.numeroGuiaSADA || '',
            observacion: d.observacion || '',
          }));

        if (dests.length === 0) {
          throw new Error('Debe especificar al menos una planta o compañía de destino con litros mayores a 0.');
        }
        payload.destinos = dests;
      }
      return await operacionesApi.recibirEnReceptoria(viajeParaRecibir.id, payload);
    },
    onSuccess: () => {
      toast.success(
        modoRecepcion === 'RECARGAR_Y_DESPACHAR'
          ? '¡Recepción verificada y Despacho a Compañía emitido exitosamente!'
          : '¡Leche descargada en Silos y viaje finalizado con éxito!'
      );
      queryClient.invalidateQueries({ queryKey: ['viajes-activos-receptoria'] });
      queryClient.invalidateQueries({ queryKey: ['despachos-companias'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['receptoria-balance'] });
      queryClient.invalidateQueries({ queryKey: ['rutas-hoy'] });
      setModalVerificarViaje(false);
      setViajeParaRecibir(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Error al procesar la recepción');
    }
  });

  // Cálculo de totales y balance
  const totalLitrosRuta = useMemo(() => {
    return rutasHoy.reduce((acc, r) => acc + Number(r.litros || r.Litros || 0), 0);
  }, [rutasHoy]);

  const totalLitrosReceptoria = useMemo(() => {
    return entregasHoy.reduce((acc, e) => acc + Number(e.litros || e.Litros || 0), 0);
  }, [entregasHoy]);

  const diferenciaBalance = totalLitrosReceptoria - totalLitrosRuta;
  const pctMermaGlobal = totalLitrosRuta > 0 ? (Math.abs(diferenciaBalance) / totalLitrosRuta) * 100 : 0;

  // Clasificador de proceso por entrega
  const clasificarEntrega = (e: any) => {
    const compNom = (e.companiaNombre || '').toUpperCase();
    const obs = (e.observacion || '').toUpperCase();
    const numLitros = Number(e.litros || e.Litros || 0);

    const ticketId = e.controlRutaId || null;
    let ctrlCompId = null;
    if (e.observacion) {
      const matchCtrl = e.observacion.match(/Control\s*Compañ[íi]as\s*#?(\d+)/i) || e.observacion.match(/Ctrl\s*#?(\d+)/i);
      if (matchCtrl) ctrlCompId = parseInt(matchCtrl[1], 10);
    }

    if (((compNom.includes('RECEPTORIA') || compNom.includes('RECEPTORÍA')) && numLitros < 0) || obs.includes('SALIDA DESDE RECEPTORÍA')) {
      return {
        tipo: 'SALIDA_RECEPTORIA',
        label: 'Salida Receptoría',
        subLabel: 'Descarga de Tanque',
        icono: 'fa-solid fa-arrow-up-from-bracket',
        badgeBg: '#fff7ed',
        badgeColor: '#c2410c',
        badgeBorder: '#fed7aa',
        rowBg: 'rgba(255, 247, 237, 0.65)',
        borderLeft: '#ea580c',
        titleColor: '#c2410c',
        litrosColor: '#dc2626',
        ticketId,
        ctrlCompId,
      };
    }

    if ((compNom.includes('RECEPTORIA') || compNom.includes('RECEPTORÍA')) && numLitros >= 0) {
      return {
        tipo: 'INGRESO_RECEPTORIA',
        label: 'Ingreso Receptoría',
        subLabel: 'Recepción en Tanque',
        icono: 'fa-solid fa-warehouse',
        badgeBg: '#f0f9ff',
        badgeColor: '#0284c7',
        badgeBorder: '#bae6fd',
        rowBg: 'rgba(240, 249, 255, 0.65)',
        borderLeft: '#0284c7',
        titleColor: '#0369a1',
        litrosColor: '#0284c7',
        ticketId,
        ctrlCompId,
      };
    }

    if (e.controlRutaId != null && !obs.includes('CONTROL COMPAÑÍAS') && !obs.includes('DESPACHADO DESDE RECEPTOR')) {
      return {
        tipo: 'DIRECTO_FINCA_COMPANIA',
        label: 'Directo Finca ➔ Planta',
        subLabel: 'Ruta Directa',
        icono: 'fa-solid fa-route',
        badgeBg: '#ecfdf5',
        badgeColor: '#059669',
        badgeBorder: '#a7f3d0',
        rowBg: 'rgba(236, 253, 245, 0.65)',
        borderLeft: '#10b981',
        titleColor: '#047857',
        litrosColor: '#059669',
        ticketId,
        ctrlCompId,
      };
    }

    return {
      tipo: 'LLEGADA_COMPANIA',
      label: 'Llegada a Planta',
      subLabel: 'Recepción en Compañía',
      icono: 'fa-solid fa-building-circle-check',
      badgeBg: '#faf5ff',
      badgeColor: '#7c3aed',
      badgeBorder: '#ddd6fe',
      rowBg: 'rgba(250, 245, 255, 0.65)',
      borderLeft: '#9333ea',
      titleColor: '#6d28d9',
      litrosColor: '#7c3aed',
      ticketId,
      ctrlCompId,
    };
  };

  // Filtrado y ordenamiento de la tabla
  const entregasFiltradas = useMemo(() => {
    let items = entregasHoy.slice();

    if (filtroChoferTabla) {
      items = items.filter((e) =>
        (e.conductorNombre || '').toLowerCase().includes(filtroChoferTabla.toLowerCase())
      );
    }

    if (filtroCompaniaTabla) {
      items = items.filter((e) =>
        (e.companiaNombre || '').toLowerCase().includes(filtroCompaniaTabla.toLowerCase())
      );
    }

    if (busquedaTabla.trim()) {
      const term = busquedaTabla.toLowerCase().trim();
      items = items.filter((e) =>
        (e.companiaNombre || '').toLowerCase().includes(term) ||
        (e.conductorNombre || '').toLowerCase().includes(term) ||
        (e.observacion || '').toLowerCase().includes(term) ||
        (e.litros?.toString() || '').includes(term)
      );
    }

    items.sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];
      if (sortColumn === 'litros') {
        valA = Number(a.litros || 0);
        valB = Number(b.litros || 0);
      }
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    return items;
  }, [entregasHoy, filtroChoferTabla, filtroCompaniaTabla, busquedaTabla, sortColumn, sortAsc]);

  const totalFiltradoLts = useMemo(() => {
    return entregasFiltradas.reduce((acc, e) => acc + Number(e.litros || 0), 0);
  }, [entregasFiltradas]);

  const totalPages = Math.max(1, Math.ceil(entregasFiltradas.length / (pageSize === -1 ? 999999 : pageSize)));
  const entregasPaginadas = useMemo(() => {
    if (pageSize === -1) return entregasFiltradas;
    const start = (currentPage - 1) * pageSize;
    return entregasFiltradas.slice(start, start + pageSize);
  }, [entregasFiltradas, currentPage, pageSize]);

  // Lista dinámica de choferes y compañías que tienen entregas hoy
  const choferesUnicosHoy = useMemo(() => {
    const set = new Set<string>();
    entregasHoy.forEach((e) => {
      if (e.conductorNombre) set.add(e.conductorNombre.trim());
    });
    return Array.from(set).sort();
  }, [entregasHoy]);

  const companiasUnicasHoy = useMemo(() => {
    const set = new Set<string>();
    entregasHoy.forEach((e) => {
      if (e.companiaNombre) set.add(e.companiaNombre.trim());
    });
    return Array.from(set).sort();
  }, [entregasHoy]);

  const filtroChoferOptions = useMemo(() => [
    { value: '', label: 'TODOS LOS CHOFERES' },
    ...choferesUnicosHoy.map((c) => ({ value: c, label: c }))
  ], [choferesUnicosHoy]);

  const filtroCompaniaOptions = useMemo(() => [
    { value: '', label: 'TODAS LAS COMPAÑÍAS' },
    ...companiasUnicasHoy.map((cp) => ({ value: cp, label: cp }))
  ], [companiasUnicasHoy]);

  // Conteos globales reactivos para badges y filtros
  const conteosEntradas = useMemo(() => {
    let total = 0;
    let enSilos = 0;
    let enRecoleccion = 0;
    let recepcionadas = 0;

    viajesActivos.forEach((v: any) => {
      if (filtroFecha) {
        const fechaTicket = v.fecha ? v.fecha.split('T')[0] : (v.createdAt ? v.createdAt.split('T')[0] : '');
        if (fechaTicket && fechaTicket !== filtroFecha) return;
      }
      const procId = Number(v.procesoActualId || 1);
      const est = String(v.estado || '').toUpperCase().trim();
      const enviadoARecep = viajeEstaEnviadoAReceptoria(v);

      total++;
      if (procId >= 4 || est === 'FINALIZADO' || est === 'RECEPCIONADO' || Number(v.litrosRecibidosReceptoria || v.totalLitrosReceptoria || 0) > 0) {
        recepcionadas++;
      } else if (enviadoARecep) {
        enSilos++;
      } else {
        enRecoleccion++;
      }
    });

    return { total, enSilos, enRecoleccion, recepcionadas };
  }, [viajesActivos, filtroFecha]);

  const conteosSalidas = useMemo(() => {
    let total = 0;
    let enTransito = 0;
    let finalizadas = 0;

    despachosCompanias.forEach((d: any) => {
      if (filtroFecha) {
        const fechaDesp = d.fecha ? d.fecha.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : '');
        if (fechaDesp && fechaDesp !== filtroFecha) return;
      }
      const estadoNorm = (d.estado || '').toUpperCase().trim();
      const isFin = estadoNorm === 'FINALIZADO' || estadoNorm === 'CERRADO' || estadoNorm === 'DESPACHO' || Number(d.litrosRecibidosCompania || d.litrosConfirmados || 0) > 0;
      total++;
      if (isFin) {
        finalizadas++;
      } else {
        enTransito++;
      }
    });

    return { total, enTransito, finalizadas };
  }, [despachosCompanias, filtroFecha]);

  // Bandeja 1: Camiones en espera (Entradas a Planta / Receptoría)
  const camionesEnEspera = useMemo(() => {
    return viajesActivos
      .filter((v: any) => {
        // 1. Filtro estricto de Fecha
        if (filtroFecha) {
          const fechaTicket = v.fecha ? v.fecha.split('T')[0] : (v.createdAt ? v.createdAt.split('T')[0] : '');
          if (fechaTicket && fechaTicket !== filtroFecha) {
            return false;
          }
        }

        const procId = Number(v.procesoActualId || 1);
        const est = String(v.estado || '').toUpperCase().trim();
        const enviadoARecep = viajeEstaEnviadoAReceptoria(v);
        const isRecepcionado = procId >= 4 || est === 'FINALIZADO' || est === 'RECEPCIONADO' || Number(v.litrosRecibidosReceptoria || v.totalLitrosReceptoria || 0) > 0;

        // 2. Sub-filtro de Entradas
        if (subFiltroEntradas === 'EN_SILOS') {
          if (!enviadoARecep || isRecepcionado) return false;
        } else if (subFiltroEntradas === 'EN_RECOLECCION') {
          if (enviadoARecep || isRecepcionado) return false;
        } else if (subFiltroEntradas === 'RECEPCIONADAS') {
          if (!isRecepcionado) return false;
        }

        // 3. Filtro por Búsqueda Rápida
        if (busquedaBandeja.trim()) {
          const q = busquedaBandeja.toLowerCase().trim();
          const placa = (v.camionPlaca || '').toLowerCase();
          const chofer = (v.nombreConductor || v.choferNombre || '').toLowerCase();
          const ruta = (v.rutaLogisticaNombre || v.rutasLogisticasNombres || '').toLowerCase();
          const ticketId = String(v.id || '');
          const codTicket = (v.codigoTicket || '').toLowerCase();
          const matches = placa.includes(q) || chofer.includes(q) || ruta.includes(q) || ticketId.includes(q) || codTicket.includes(q);
          if (!matches) return false;
        }

        return true;
      })
      .map((v: any) => {
        const fincasT = fincasTicketsMap[v.id] || [];
        const ltsFincas = fincasT.reduce((acc: number, f: any) => acc + Number(f.litros || f.Litros || f.litrosLeche || 0), 0);
        const ltsBackend = Number(v.totalLitrosFinca ?? v.totalLitrosRecogidos ?? (v as any).totalLitros ?? 0);
        const litrosRecogidos = ltsBackend > 0 ? ltsBackend : ltsFincas;

        const choferObj = conductores.find((ch: any) => ch.id === (v.choferId || v.usuarioId) || (ch.nombre && v.nombreConductor && ch.nombre.trim().toUpperCase() === v.nombreConductor.trim().toUpperCase()));
        const choferNombre = v.nombreConductor || v.choferNombre || (v as any).conductorNombre || choferObj?.nombre || usuarios.find(u => u.id === (v.usuarioId || v.choferId))?.nombreCompleto || 'Elvis Macias';

        const totalParadas = fincasT.length > 0 ? fincasT.length : Number((v as any).totalFincas || v.fincasPlanificadasIds?.length || 0);

        return {
          ...v,
          _litrosRecogidos: litrosRecogidos,
          _choferNombre: choferNombre,
          _totalParadas: totalParadas,
          _fincas: fincasT,
        };
      });
  }, [viajesActivos, filtroFecha, subFiltroEntradas, busquedaBandeja, fincasTicketsMap, conductores, usuarios]);

  // Bandeja 2: Salidas a queseras (En espera de verificación en planta)
  const salidasTransito = useMemo(() => {
    if (subFiltroSalidas === 'FINALIZADAS') return [];

    return despachosCompanias.filter((d) => {
      // 1. Filtro estricto de Fecha
      if (filtroFecha) {
        const fechaDesp = d.fecha ? d.fecha.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : '');
        if (fechaDesp && fechaDesp !== filtroFecha) {
          return false;
        }
      }

      const estadoNorm = (d.estado || '').toUpperCase().trim();
      if (estadoNorm === 'FINALIZADO' || estadoNorm === 'CERRADO' || estadoNorm === 'DESPACHO') {
        return false;
      }

      const enTransito = (
        estadoNorm === 'EN VIA' ||
        estadoNorm === 'EN_VIA' ||
        estadoNorm === 'EN_TRANSITO' ||
        estadoNorm === 'POR VERIFICACIÓN' ||
        estadoNorm === 'POR VERIFICACION' ||
        estadoNorm === 'PENDIENTE' ||
        (!d.litrosRecibidosCompania && estadoNorm !== 'FINALIZADO' && estadoNorm !== 'CERRADO')
      );

      if (!enTransito) return false;

      // Filtro por Búsqueda Rápida
      if (busquedaBandeja.trim()) {
        const q = busquedaBandeja.toLowerCase().trim();
        const placa = (d.camionPlaca || '').toLowerCase();
        const chofer = (d.nombreConductor || d.choferNombre || '').toLowerCase();
        const compania = (d.nombreCompania || d.companiaNombre || '').toLowerCase();
        const guia = (d.numeroGuiaSADA || '').toLowerCase();
        const idSalida = String(d.id || '');
        const idTicket = String(d.controlRutaId || '');
        const matches = placa.includes(q) || chofer.includes(q) || compania.includes(q) || guia.includes(q) || idSalida.includes(q) || idTicket.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [despachosCompanias, filtroFecha, subFiltroSalidas, busquedaBandeja]);

  // Bandeja 2.1: Salidas confirmadas y finalizadas
  const salidasFinalizadas = useMemo(() => {
    if (subFiltroSalidas === 'EN_TRANSITO') return [];

    return despachosCompanias.filter((d) => {
      // 1. Filtro estricto de Fecha
      if (filtroFecha) {
        const fechaDesp = d.fecha ? d.fecha.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : '');
        if (fechaDesp && fechaDesp !== filtroFecha) {
          return false;
        }
      }

      const estadoNorm = (d.estado || '').toUpperCase().trim();
      const finalizada = (
        estadoNorm === 'FINALIZADO' ||
        estadoNorm === 'CERRADO' ||
        estadoNorm === 'DESPACHO' ||
        Number(d.litrosRecibidosCompania || d.litrosConfirmados || 0) > 0
      );

      if (!finalizada) return false;

      // Filtro por Búsqueda Rápida
      if (busquedaBandeja.trim()) {
        const q = busquedaBandeja.toLowerCase().trim();
        const placa = (d.camionPlaca || '').toLowerCase();
        const chofer = (d.nombreConductor || d.choferNombre || '').toLowerCase();
        const compania = (d.nombreCompania || d.companiaNombre || '').toLowerCase();
        const guia = (d.numeroGuiaSADA || '').toLowerCase();
        const idSalida = String(d.id || '');
        const idTicket = String(d.controlRutaId || '');
        const matches = placa.includes(q) || chofer.includes(q) || compania.includes(q) || guia.includes(q) || idSalida.includes(q) || idTicket.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [despachosCompanias, filtroFecha, subFiltroSalidas, busquedaBandeja]);

  const handleCambiarVista = (val: string) => {
    setFiltroEstado(val);
    if (val === 'TODOS') {
      setSegmentoActivo('TODOS');
      setSubFiltroEntradas('TODAS');
      setSubFiltroSalidas('TODAS');
    } else if (val === 'EN_ESPERA' || val === 'ENTRADAS_ESPERA') {
      setSegmentoActivo('ENTRADAS');
      setSubFiltroEntradas('EN_SILOS');
    } else if (val === 'ENTRADAS_RUTA') {
      setSegmentoActivo('ENTRADAS');
      setSubFiltroEntradas('EN_RECOLECCION');
    } else if (val === 'RECEPCIONADO' || val === 'ENTRADAS_RECIBIDAS') {
      setSegmentoActivo('ENTRADAS');
      setSubFiltroEntradas('RECEPCIONADAS');
    } else if (val === 'EN_VIA' || val === 'SALIDAS_VIA') {
      setSegmentoActivo('SALIDAS');
      setSubFiltroSalidas('EN_TRANSITO');
    } else if (val === 'DESPACHO' || val === 'SALIDAS_ENTREGADAS') {
      setSegmentoActivo('SALIDAS');
      setSubFiltroSalidas('FINALIZADAS');
    }
  };

  return (
    <section id="tab-receptoria" className="tab-content" style={{ display: 'block' }}>
      {/* CABECERA VISTA */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Control de Entregas en Receptoría</h1>
          <p className="view-subtitle">
            Registro y control de entregas de leche en plantas y compañías receptoras
          </p>
        </div>
      </div>

      {/* SECCIÓN BANDEJAS ACTIVAS EN RECEPTORÍA */}
      <div id="seccionBandejasReceptoria" style={{ marginBottom: '20px' }}>
        {/* BARRA DE CONTROL GLOBAL */}
        <div
          className="content-card"
          style={{
            marginBottom: '14px',
            padding: '12px 18px',
            borderRadius: '12px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Filtro de Estado */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                htmlFor="filtroEstadoBandejaReceptoria"
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                <i className="fa-solid fa-filter" style={{ color: '#0284c7' }}></i> Vista:
              </label>
              <select
                id="filtroEstadoBandejaReceptoria"
                className="form-input"
                value={filtroEstado}
                onChange={(e) => handleCambiarVista(e.target.value)}
                style={{
                  height: '36px',
                  padding: '4px 12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#0f172a',
                  minWidth: '220px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  background: '#f8fafc',
                }}
              >
                <option value="TODOS">⚡ Flujo Operativo Completo</option>
                <option value="ENTRADAS_ESPERA">⏳ 1. Entradas (En Silos / Por Recibir)</option>
                <option value="ENTRADAS_RUTA">🚚 1. Entradas (Chofer en Recolección)</option>
                <option value="ENTRADAS_RECIBIDAS">✅ 1. Entradas Recepcionadas</option>
                <option value="SALIDAS_VIA">🚚 2. Salidas (En Tránsito a Queseras)</option>
                <option value="SALIDAS_ENTREGADAS">🏢 2. Salidas Entregadas / Confirmadas</option>
              </select>
            </div>

            {/* Filtro de Fecha Sincronizado */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label
                htmlFor="filtroFechaBandejaReceptoria"
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                <i className="fa-regular fa-calendar" style={{ color: '#0284c7' }}></i> Fecha:
              </label>
              <input
                type="date"
                id="filtroFechaBandejaReceptoria"
                className="form-input"
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                style={{ height: '36px', fontSize: '13px', width: '145px', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
              />
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setFiltroFecha(hoyStr)}
                title="Ver fecha de hoy"
                style={{ height: '36px', padding: '0 10px', fontSize: '12px', fontWeight: 700, borderRadius: '8px' }}
              >
                Hoy
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setFiltroFecha('')}
                title="Ver histórico / todas las fechas"
                style={{ height: '36px', padding: '0 10px', fontSize: '12px', fontWeight: 600, borderRadius: '8px' }}
              >
                Todas
              </button>
            </div>

            {/* Buscador Rápido de Tickets / Chofer / Camión / Ruta */}
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              <i
                className="fa-solid fa-magnifying-glass"
                style={{
                  position: 'absolute',
                  left: '10px',
                  color: '#94a3b8',
                  fontSize: '12px',
                  pointerEvents: 'none',
                }}
              ></i>
              <input
                type="text"
                className="form-input"
                placeholder="Buscar chofer, camión, ticket o ruta..."
                value={busquedaBandeja}
                onChange={(e) => setBusquedaBandeja(e.target.value)}
                style={{
                  height: '36px',
                  paddingLeft: '30px',
                  paddingRight: busquedaBandeja ? '28px' : '10px',
                  fontSize: '13px',
                  width: '240px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  background: '#f8fafc',
                }}
              />
              {busquedaBandeja && (
                <button
                  type="button"
                  onClick={() => setBusquedaBandeja('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px',
                  }}
                  title="Limpiar búsqueda"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>
          </div>

          {/* Botones de Acción */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setModalNuevoDespacho(true)}
              style={{
                height: '36px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #9333ea, #7e22ce)',
                border: 'none',
                borderRadius: '8px',
                padding: '0 16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(147,51,234,0.3)',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-plus-circle"></i> Nuevo Ticket Salida / ENVÍO
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setMostrarFormulario(!mostrarFormulario)}
              style={{
                height: '36px',
                fontWeight: 700,
                color: '#0284c7',
                borderColor: '#7dd3fc',
                background: '#f0f9ff',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-pen-to-square"></i> Registrar Entrega
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['receptoria-hoy'] });
                queryClient.invalidateQueries({ queryKey: ['rutas-hoy'] });
                queryClient.invalidateQueries({ queryKey: ['despachos-companias'] });
                queryClient.invalidateQueries({ queryKey: ['viajes-activos-receptoria'] });
              }}
              style={{ height: '36px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '8px', cursor: 'pointer' }}
            >
              <i className="fa-solid fa-arrows-rotate"></i> Actualizar
            </button>
          </div>
        </div>

        {/* ACCESOS RÁPIDOS POR SEGMENTOS OPERATIVOS */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
          {[
            { id: 'TODOS', label: 'Todos', icon: 'fa-layer-group', count: conteosEntradas.total + conteosSalidas.total, color: '#334155', bg: '#f1f5f9' },
            { id: 'ENTRADAS', label: '1. Entradas', icon: 'fa-truck-ramp-box', count: conteosEntradas.total, color: '#0284c7', bg: '#e0f2fe' },
            { id: 'SALIDAS', label: '2. Salidas', icon: 'fa-building-wheat', count: conteosSalidas.total, color: '#9333ea', bg: '#f3e8ff' },
            { id: 'FORM', label: 'Formulario de Entrega', icon: 'fa-edit', count: null },
            { id: 'HISTORIAL', label: 'Historial de Entregas', icon: 'fa-table-list', count: null },
          ].map((seg) => {
            const esActivo = segmentoActivo === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setSegmentoActivo(seg.id as any);
                  if (seg.id === 'FORM') setMostrarFormulario(true);
                }}
                style={{
                  borderRadius: '20px',
                  fontWeight: 700,
                  padding: '5px 15px',
                  fontSize: '12.5px',
                  border: `1.5px solid ${esActivo ? '#0284c7' : '#cbd5e1'}`,
                  background: esActivo ? '#0284c7' : '#ffffff',
                  color: esActivo ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className={`fa-solid ${seg.icon}`} style={{ color: esActivo ? '#ffffff' : (seg.color || '#64748b') }}></i>
                {seg.label}
                {seg.count !== null && (
                  <span
                    className="badge"
                    style={{
                      background: esActivo ? 'rgba(255,255,255,0.25)' : seg.bg,
                      color: esActivo ? '#ffffff' : seg.color,
                      marginLeft: '4px',
                      fontSize: '11px',
                    }}
                  >
                    {seg.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* BANDEJA 1: ENTRADAS - CAMIONES EN ESPERA */}
        {(segmentoActivo === 'TODOS' || segmentoActivo === 'ENTRADAS') && (
          <div
            id="cardBandejaEnEspera"
            className="content-card"
            style={{
              marginBottom: '18px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              border: '1px solid #e2e8f0',
              borderLeft: '4px solid #0284c7',
              background: '#ffffff',
              padding: '16px 20px',
            }}
          >
            <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0284c7', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-truck-ramp-box"></i> 1. ENTRADAS: RECEPCIÓN DE LECHE DE FINCAS (CONTROL RUTAS)
                </h3>
                <span className="badge" style={{ background: '#e0f2fe', color: '#0284c7', fontWeight: 800, border: '1px solid #bae6fd' }}>
                  {camionesEnEspera.length} {camionesEnEspera.length === 1 ? 'Camión' : 'Camiones'}
                </span>
              </div>

              {/* Sub-filtros interactivos de Entradas */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'TODAS', label: 'Todas', count: conteosEntradas.total, color: '#475569', bg: '#f1f5f9' },
                  { id: 'EN_SILOS', label: '⏳ En Silos / Por Recibir', count: conteosEntradas.enSilos, color: '#16a34a', bg: '#dcfce7' },
                  { id: 'EN_RECOLECCION', label: '🚚 En Recolección', count: conteosEntradas.enRecoleccion, color: '#b45309', bg: '#fef3c7' },
                  { id: 'RECEPCIONADAS', label: '✅ Recepcionadas', count: conteosEntradas.recepcionadas, color: '#0284c7', bg: '#e0f2fe' },
                ].map((sf) => {
                  const sel = subFiltroEntradas === sf.id;
                  return (
                    <button
                      key={sf.id}
                      type="button"
                      onClick={() => setSubFiltroEntradas(sf.id as any)}
                      style={{
                        border: sel ? `1.5px solid ${sf.color}` : '1px solid #cbd5e1',
                        background: sel ? sf.bg : '#ffffff',
                        color: sel ? sf.color : '#64748b',
                        fontWeight: sel ? 800 : 600,
                        fontSize: '11.5px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{sf.label}</span>
                      <span style={{ fontSize: '10.5px', opacity: 0.85, fontWeight: 800 }}>({sf.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {camionesEnEspera.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                <i className="fa-solid fa-circle-check" style={{ color: '#10b981', marginRight: '6px' }}></i>
                No hay camiones en este estado para la fecha seleccionada.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '14px' }}>
                {camionesEnEspera.map((c: any) => {
                  const enviadoARecep = viajeEstaEnviadoAReceptoria(c);
                  const procId = Number(c.procesoActualId || 1);
                  const est = String(c.estado || '').toUpperCase().trim();
                  const isRecepcionado = procId >= 4 || est === 'FINALIZADO' || est === 'RECEPCIONADO' || Number(c.litrosRecibidosReceptoria || c.totalLitrosReceptoria || 0) > 0;

                  // 1. Litros reales y paradas
                  const litrosRecogidos = Number(c._litrosRecogidos || 0);
                  const totalParadas = Number(c._totalParadas || 0);

                  // 2. Chofer Asignado
                  const choferNombre = c._choferNombre || 'Elvis Macias';

                  // 3. Camión y Capacidad
                  const camionObj = camiones.find(cam => cam.id === c.camionId || (cam.placa && c.camionPlaca && cam.placa.trim().toUpperCase() === c.camionPlaca.trim().toUpperCase()));
                  const placaCamion = c.camionPlaca || camionObj?.placa || 'Cisterna';
                  const marcaModelo = camionObj ? `${camionObj.marca || ''} ${camionObj.modelo || ''}`.trim() : '';
                  const capacidad = Number(c.capacidadCamionLitros || camionObj?.capacidadLitros || 5500);
                  const pctCapacidad = capacidad > 0 ? Math.min(100, Math.round((litrosRecogidos / capacidad) * 100)) : 0;

                  // 4. Ruta Logística
                  const rutaNombre = c.rutaLogisticaNombre || c.rutasLogisticasNombres || c.rutaNombre || 'TODOS';

                  // 5. Fechas y Horas
                  const fechaFmt = c.fecha ? new Date(c.fecha).toLocaleDateString('es-VE') : '';
                  const horaSalida = c.createdAt ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const horaLlegada = (c as any).fechaLlegadaReceptoria ? new Date((c as any).fechaLlegadaReceptoria).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                  // 6. Tipo de leche (si aplica búfala)
                  const esBufala = String((c as any).tipoLeche || '').toUpperCase().includes('BUFAL') || (c._fincas && c._fincas.some((f: any) => String(f.tipoLeche || '').toUpperCase().includes('BUFAL')));

                  return (
                    <div
                      key={c.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderTop: isRecepcionado ? '4px solid #10b981' : (enviadoARecep ? '4px solid #0284c7' : '4px solid #f59e0b'),
                        borderRadius: '12px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '10px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      }}
                    >
                      {/* CABECERA: Camión, Placa, Estado y Ticket ID */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className="fa-solid fa-truck" style={{ color: '#0284c7' }}></i>
                              <span>{placaCamion}</span>
                              {marcaModelo && (
                                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                                  ({marcaModelo})
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                              <i className="fa-regular fa-calendar-days" style={{ color: '#0284c7' }}></i>
                              <span>{fechaFmt || hoyStr}</span>
                              {horaSalida && <span>• Salida: {horaSalida}</span>}
                              {horaLlegada && <span style={{ color: '#0369a1', fontWeight: 700 }}>• Llegada: {horaLlegada}</span>}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {hasBufala && (
                              <span
                                className="badge"
                                style={{
                                  background: esBufala ? '#f3e8ff' : '#e0f2fe',
                                  color: esBufala ? '#7e22ce' : '#0369a1',
                                  border: `1px solid ${esBufala ? '#d8b4fe' : '#bae6fd'}`,
                                  fontWeight: 800,
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                }}
                              >
                                {esBufala ? '🐃 BÚFALA' : '🥛 VACA'}
                              </span>
                            )}
                            <span
                              className="badge"
                              style={{
                                background: isRecepcionado ? '#dcfce7' : (enviadoARecep ? '#e0f2fe' : '#fef3c7'),
                                color: isRecepcionado ? '#15803d' : (enviadoARecep ? '#0284c7' : '#b45309'),
                                fontWeight: 800,
                                fontSize: '11px',
                                border: isRecepcionado ? '1px solid #bbf7d0' : (enviadoARecep ? '1px solid #bae6fd' : '1px solid #fde68a'),
                                padding: '3px 7px',
                              }}
                            >
                              <i className={`fa-solid ${isRecepcionado ? 'fa-circle-check' : (enviadoARecep ? 'fa-building-wheat' : 'fa-clock')} mr-1`}></i>
                              {isRecepcionado ? 'Recepcionado' : (enviadoARecep ? 'En Planta' : 'En Recolección')}
                            </span>
                            <span className="badge" style={{ background: '#f1f5f9', color: '#334155', fontWeight: 800, border: '1px solid #cbd5e1' }}>
                              #{c.codigoTicket || c.id}
                            </span>
                          </div>
                        </div>

                        {/* CHOFER & RUTA LOGÍSTICA */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', margin: '8px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-solid fa-user-tie" style={{ color: '#0284c7' }}></i>
                            <span>{choferNombre}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <i className="fa-solid fa-route" style={{ color: '#64748b' }}></i>
                              <strong style={{ color: '#334155' }}>Ruta: {rutaNombre}</strong>
                            </span>
                            {totalParadas > 0 && (
                              <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, border: '1px solid #bae6fd' }}>
                                <i className="fa-solid fa-location-dot mr-1"></i> {totalParadas} {totalParadas === 1 ? 'parada' : 'paradas registradas'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* LITROS RECOGIDOS & CAPACIDAD DEL CAMIÓN */}
                        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '8px 10px', margin: '6px 0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', color: '#0369a1', fontWeight: 700 }}>Litros en Camión:</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#0284c7', fontSize: '18px' }}>
                              {litrosRecogidos.toLocaleString()} <small style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Lts</small>
                            </span>
                          </div>

                          {capacidad > 0 && (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#64748b', marginBottom: '3px', fontWeight: 600 }}>
                                <span>Capacidad: {capacidad.toLocaleString()} L</span>
                                <span style={{ color: pctCapacidad > 90 ? '#b91c1c' : '#0284c7', fontWeight: 800 }}>{pctCapacidad}% ocupación</span>
                              </div>
                              <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${pctCapacidad}%`,
                                    height: '100%',
                                    background: pctCapacidad > 95 ? '#ef4444' : (pctCapacidad > 80 ? '#3b82f6' : '#0284c7'),
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease',
                                  }}
                                ></div>
                              </div>
                            </div>
                          )}

                          {c.observacion && (
                            <div style={{ marginTop: '5px', fontSize: '11px', color: '#475569', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <i className="fa-regular fa-comment-dots text-sky-600"></i>
                              <span>{c.observacion}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ACCIONES Y BOTONES */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                        {isRecepcionado ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div
                              style={{
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                color: '#15803d',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                textAlign: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                              }}
                            >
                              <i className="fa-solid fa-circle-check"></i> Descargado en Silos ({Number(c.litrosRecibidosReceptoria || c.totalLitrosReceptoria || litrosRecogidos).toLocaleString()} Lts)
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => abrirModalValidarFincas(c)}
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '5px 8px',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                color: '#475569',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                              }}
                            >
                              <i className="fa-solid fa-clipboard-list text-sky-600"></i> Ver Auditoría de Fincas ({totalParadas})
                            </button>
                          </div>
                        ) : enviadoARecep ? (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => abrirModalValidarFincas(c)}
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  padding: '6px 8px',
                                  background: ticketsFincasValidadas.has(c.id) ? '#dcfce7' : '#f0fdf4',
                                  color: ticketsFincasValidadas.has(c.id) ? '#15803d' : '#16a34a',
                                  border: `1.5px solid ${ticketsFincasValidadas.has(c.id) ? '#86efac' : '#bbf7d0'}`,
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                  cursor: 'pointer',
                                }}
                                title="Modal para validar que los litros y recibos de cada finca con litros estén correctos"
                              >
                                <i className={ticketsFincasValidadas.has(c.id) ? "fa-solid fa-circle-check text-green-600" : "fa-solid fa-clipboard-check text-emerald-600"}></i>
                                {ticketsFincasValidadas.has(c.id) ? 'Fincas Auditadas' : 'Validar Fincas'}
                              </button>

                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => abrirModalVerificarViaje(c)}
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  padding: '6px 8px',
                                  background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                                  border: 'none',
                                  color: '#ffffff',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '5px',
                                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                                  cursor: 'pointer',
                                }}
                                title="Verificar litros y Descargar en Silos o Recargar y Despachar a Compañía"
                              >
                                <i className="fa-solid fa-arrow-down-to-bracket"></i>
                                {ticketsFincasValidadas.has(c.id) ? 'Recibir Carga' : 'Verificar & Recibir'}
                              </button>
                            </div>

                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => handleDevolverTicketAlChofer(c.id)}
                              style={{
                                width: '100%',
                                fontWeight: 700,
                                fontSize: '11px',
                                background: '#fff1f2',
                                color: '#be123c',
                                border: '1px solid #fecdd3',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                                cursor: 'pointer',
                              }}
                              title="Devolver ticket al chofer para que pueda agregar o modificar fincas"
                            >
                              <i className="fa-solid fa-arrow-rotate-left"></i> Devolver Ticket al Chofer
                            </button>
                          </>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div
                              style={{
                                width: '100%',
                                fontSize: '11px',
                                fontWeight: 800,
                                padding: '7px 10px',
                                background: '#fffbeb',
                                border: '1.5px solid #fde68a',
                                color: '#b45309',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                              }}
                            >
                              <i className="fa-solid fa-clock"></i> Chofer en Recolección (Pendiente Envío)
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => handleForzarEnvioReceptoria(c)}
                              style={{
                                width: '100%',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '5px 8px',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1d4ed8',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                                cursor: 'pointer',
                              }}
                              title="Marcar llegada a planta si el chofer tuvo problemas de señal en campo"
                            >
                              <i className="fa-solid fa-bolt text-blue-600"></i> Recibir en Planta (Soporte Admin)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* BANDEJA 2: SALIDAS - DESPACHOS A COMPAÑÍAS Y QUESERAS */}
        {(segmentoActivo === 'TODOS' || segmentoActivo === 'SALIDAS') && (
          <div
            id="cardBandejaEnTransito"
            className="content-card"
            style={{
              marginBottom: '18px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              border: '1px solid #e2e8f0',
              borderLeft: '4px solid #9333ea',
              background: '#ffffff',
              padding: '16px 20px',
            }}
          >
            <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#9333ea', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-building-wheat"></i> 2. SALIDAS: DESPACHOS A COMPAÑÍAS Y QUESERAS (CONTROL COMPAÑÍAS)
                </h3>
                <span className="badge" style={{ background: '#f3e8ff', color: '#9333ea', fontWeight: 800, border: '1px solid #e9d5ff' }}>
                  {salidasTransito.length + salidasFinalizadas.length} {salidasTransito.length + salidasFinalizadas.length === 1 ? 'Salida' : 'Salidas'}
                </span>
              </div>

              {/* Sub-filtros interactivos de Salidas */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'TODAS', label: 'Todas', count: conteosSalidas.total, color: '#475569', bg: '#f1f5f9' },
                  { id: 'EN_TRANSITO', label: '🚚 En Tránsito', count: conteosSalidas.enTransito, color: '#9333ea', bg: '#f3e8ff' },
                  { id: 'FINALIZADAS', label: '🏢 Entregadas', count: conteosSalidas.finalizadas, color: '#059669', bg: '#d1fae5' },
                ].map((sf) => {
                  const sel = subFiltroSalidas === sf.id;
                  return (
                    <button
                      key={sf.id}
                      type="button"
                      onClick={() => setSubFiltroSalidas(sf.id as any)}
                      style={{
                        border: sel ? `1.5px solid ${sf.color}` : '1px solid #cbd5e1',
                        background: sel ? sf.bg : '#ffffff',
                        color: sel ? sf.color : '#64748b',
                        fontWeight: sel ? 800 : 600,
                        fontSize: '11.5px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{sf.label}</span>
                      <span style={{ fontSize: '10.5px', opacity: 0.85, fontWeight: 800 }}>({sf.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {salidasTransito.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                <i className="fa-solid fa-circle-check" style={{ color: '#10b981', marginRight: '6px' }}></i>
                No hay viajes a queseras en tránsito para la fecha seleccionada.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                {salidasTransito.map((d) => {
                  const compObj = companias.find((c) => c.id === d.companiaId);
                  const camionObj = camiones.find((c) => c.id === d.camionId);
                  const nombreComp = d.nombreCompania || d.companiaNombre || compObj?.nombre || `Planta #${d.companiaId}`;
                  const placaCamion = d.camionPlaca || camionObj?.placa || 'Cisterna Planta';
                  const despachados = Number(d.litrosDespachados || 0);

                  return (
                    <div
                      key={d.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderTop: '4px solid #9333ea',
                        borderRadius: '10px',
                        padding: '14px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <strong style={{ color: '#9333ea', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-solid fa-file-invoice"></i> Salida #{d.id}
                          </strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {hasBufala && (
                              <span
                                className="badge"
                                style={{
                                  background: (d.tipoLeche || '').toUpperCase().includes('BUFAL') ? '#f3e8ff' : '#e0f2fe',
                                  color: (d.tipoLeche || '').toUpperCase().includes('BUFAL') ? '#7e22ce' : '#0369a1',
                                  border: `1px solid ${(d.tipoLeche || '').toUpperCase().includes('BUFAL') ? '#d8b4fe' : '#bae6fd'}`,
                                  fontWeight: 800,
                                  fontSize: '10.5px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                }}
                              >
                                {(d.tipoLeche || '').toUpperCase().includes('BUFAL') ? '🐃 BÚFALA' : '🥛 VACA'}
                              </span>
                            )}
                            <span
                              className="badge"
                              style={{
                                background: '#fef3c7',
                                color: '#b45309',
                                fontWeight: 800,
                                fontSize: '11px',
                                border: '1px solid #fde68a',
                                letterSpacing: '0.04em',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <i className="fa-solid fa-clock-rotate-left"></i> ESPERANDO CHOFER
                            </span>
                          </div>
                        </div>

                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="fa-regular fa-calendar-days" style={{ color: '#9333ea' }}></i>
                          <span>Fecha: <strong style={{ color: '#0f172a' }}>{d.fecha ? new Date(d.fecha).toLocaleDateString('es-VE') : hoyStr}</strong></span>
                        </div>

                        <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <i className="fa-solid fa-user-tie" style={{ color: '#9333ea' }}></i>
                          <span>{d.nombreConductor || (d as any).conductorNombre || (d as any).choferNombre || usuarios.find(u => u.id === ((d as any).usuarioId || (d as any).conductorId))?.nombreCompleto || 'Chofer Asignado'}</span>
                          <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>• {placaCamion}</span>
                        </div>

                        {d.numeroGuiaSADA && (
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '4px' }}>
                            <i className="fa-solid fa-file-shield" style={{ color: '#9333ea', marginRight: '5px' }}></i>
                            Guía SADA: <strong style={{ color: '#1e293b' }}>{d.numeroGuiaSADA}</strong>
                          </div>
                        )}

                        <div style={{ fontSize: '12.5px', color: '#475569', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-solid fa-building-wheat" style={{ color: '#9333ea' }}></i>
                            <span>Destino: <strong style={{ color: '#1e293b' }}>{nombreComp}</strong></span>
                          </div>
                          {esReceptoriaPrincipal(nombreComp) && (
                            <span
                              className="badge"
                              style={{
                                background: '#dcfce7',
                                color: '#166534',
                                border: '1px solid #86efac',
                                fontWeight: 800,
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              🏢 PLANTA PRINCIPAL
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#faf5ff', border: '1px solid #e9d5ff', padding: '8px 10px', borderRadius: '6px', margin: '8px 0' }}>
                          <span style={{ fontSize: '12px', color: '#7e22ce', fontWeight: 600 }}>Litros Salida:</span>
                          <strong style={{ fontFamily: 'monospace', fontSize: '16px', color: '#9333ea', fontWeight: 800 }}>{despachados.toLocaleString()} Lts</strong>
                        </div>

                        {/* Aviso Operativo de Confirmación por Chofer */}
                        <div
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '8px',
                            padding: '6px 8px',
                            fontSize: '11px',
                            color: '#1e40af',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '10px',
                          }}
                        >
                          <i className="fa-solid fa-mobile-screen-button text-blue-600"></i>
                          <span>El chofer confirma litros y foto del recibo desde la App Móvil.</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {d.controlRutaId && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => abrirModalValidarFincasDesdeDespacho(d)}
                            style={{
                              width: '100%',
                              fontWeight: 700,
                              fontSize: '11.5px',
                              background: ticketsFincasValidadas.has(Number(d.controlRutaId)) ? '#dcfce7' : '#ecfdf5',
                              border: `1.5px solid ${ticketsFincasValidadas.has(Number(d.controlRutaId)) ? '#86efac' : '#a7f3d0'}`,
                              color: ticketsFincasValidadas.has(Number(d.controlRutaId)) ? '#15803d' : '#047857',
                              padding: '7px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                            title="Auditar y validar litros y recibos de cada finca antes de confirmar"
                          >
                            <i className={`fa-solid ${ticketsFincasValidadas.has(Number(d.controlRutaId)) ? 'fa-circle-check text-green-600' : 'fa-clipboard-check text-emerald-600'}`}></i>
                            {ticketsFincasValidadas.has(Number(d.controlRutaId)) ? '✅ Fincas & Recibos Auditados' : '📋 Auditar Fincas & Recibos'}
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setDespachoSeleccionado(d);
                            setLitrosConfirmadosInput(Number(d.litrosDespachados || (d as any).LitrosDespachados || 0));
                            setObsConfirmacionInput('');
                            if (d.controlRutaId && !ticketsFincasValidadas.has(Number(d.controlRutaId))) {
                              abrirModalValidarFincasDesdeDespacho(d);
                            } else {
                              setModalConfirmar(true);
                            }
                          }}
                          style={{
                            width: '100%',
                            fontWeight: 700,
                            fontSize: '11.5px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            padding: '7px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                          }}
                          title="Validar manualmente en caso de contingencia"
                        >
                          <i className="fa-solid fa-clipboard-check text-emerald-600"></i> Validar Manualmente (Soporte Admin)
                        </button>

                        {d.controlRutaId && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleDevolverTicketAlChofer(Number(d.controlRutaId))}
                            style={{
                              width: '100%',
                              fontWeight: 700,
                              fontSize: '11px',
                              background: '#fff1f2',
                              color: '#be123c',
                              border: '1px solid #fecdd3',
                              padding: '6px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                            }}
                            title="Devolver ticket al chofer para que pueda agregar o modificar fincas"
                          >
                            <i className="fa-solid fa-arrow-rotate-left"></i> Devolver Ticket al Chofer
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* SECCIÓN 2.1: SALIDAS FINALIZADAS / CON RECIBO SUBIDO POR EL CHOFER */}
            {salidasFinalizadas.length > 0 && (
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1.5px dashed #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#166534', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-circle-check text-emerald-600"></i> Salidas Finalizadas y Conciliadas en Planta ({salidasFinalizadas.length})
                  </h4>
                  <span className="badge" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800, border: '1px solid #bbf7d0' }}>
                    Confirmadas por Chofer / Báscula
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                  {salidasFinalizadas.map((f) => {
                    const desp = Number(f.litrosDespachados || 0);
                    const rec = Number(f.litrosRecibidosCompania || f.litrosConfirmados || 0);
                    const dif = rec - desp;
                    const compObj = companias.find((c) => c.id === f.companiaId);
                    const camionObj = camiones.find((c) => c.id === f.camionId);

                    return (
                      <div
                        key={`finalizada-${f.id}`}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #bbf7d0',
                          borderLeft: '4px solid #10b981',
                          borderRadius: '10px',
                          padding: '12px 14px',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <strong style={{ color: '#0f172a', fontSize: '13.5px' }}>
                            Ticket #{f.id} • {f.nombreCompania || f.companiaNombre || compObj?.nombre || 'Planta'}
                          </strong>
                          <span className="badge" style={{ background: '#ecfdf5', color: '#047857', fontWeight: 800, fontSize: '10.5px' }}>
                            FINALIZADO
                          </span>
                        </div>

                        <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
                          <i className="fa-solid fa-user-tie mr-1 text-slate-500"></i>
                          <strong>{f.nombreConductor || 'Chofer'}</strong> • {f.camionPlaca || camionObj?.placa || 'Cisterna'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', background: '#f8fafc', padding: '8px', borderRadius: '8px', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>Despacho:</span>
                            <strong style={{ fontSize: '13px', color: '#0369a1' }}>{desp.toLocaleString()} L</strong>
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>Recibido:</span>
                            <strong style={{ fontSize: '13px', color: '#15803d' }}>{rec.toLocaleString()} L</strong>
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>Merma:</span>
                            <strong style={{ fontSize: '13px', color: dif < 0 ? '#dc2626' : '#15803d' }}>
                              {dif !== 0 ? (dif > 0 ? `+${dif.toLocaleString()} L` : `${dif.toLocaleString()} L`) : '0 L'}
                            </strong>
                          </div>
                        </div>

                        {f.fotoReciboUrl ? (
                          <button
                            type="button"
                            onClick={() => setModalVerFotoRecibo(f.fotoReciboUrl!)}
                            style={{
                              width: '100%',
                              background: '#f0fdf4',
                              border: '1.5px solid #86efac',
                              color: '#15803d',
                              borderRadius: '8px',
                              padding: '7px 10px',
                              fontSize: '12px',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            <i className="fa-solid fa-camera"></i> Ver Foto del Recibo de Báscula
                          </button>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '4px' }}>
                            Sin comprobante fotográfico adjunto
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FORMULARIO DE CAPTURA RÁPIDA DE ENTREGAS */}
      {mostrarFormulario && (
        <div
          className="content-card"
          id="cardRegistroEntregaReceptoria"
          style={{
            marginBottom: '20px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #3b82f6',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            background: '#ffffff',
            padding: '18px 20px',
          }}
        >
          <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1d4ed8', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-truck-ramp-box"></i> Registrar Entrega en Planta / Compañía
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setMostrarFormulario(false)}
              style={{ height: '28px', padding: '0 8px', fontSize: '11px', borderRadius: '6px' }}
            >
              <i className="fa-solid fa-xmark"></i> Cerrar
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (formEntrega.litros === 0) {
                toast.error('Ingrese los litros entregados');
                return;
              }
              guardarEntregaMutation.mutate(formEntrega);
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
              {/* Fecha */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px', display: 'block' }}>
                  Fecha *
                </label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={formEntrega.fecha}
                  onChange={(e) => setFormEntrega({ ...formEntrega, fecha: e.target.value })}
                  style={{ height: '38px', borderRadius: '8px' }}
                />
              </div>

              {/* Conductor */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px', display: 'block' }}>
                  Conductor / Operador *
                </label>
                <ChoferSelect
                  value={formEntrega.usuarioId || undefined}
                  onChange={(val) => setFormEntrega({ ...formEntrega, usuarioId: val || 0 })}
                  placeholder="-- Seleccionar Chofer --"
                />
              </div>

              {/* Compañía / Planta */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px', display: 'block' }}>
                  Compañía / Planta *
                </label>
                <CompaniaSelect
                  value={formEntrega.companiaId || undefined}
                  onChange={(val) => setFormEntrega({ ...formEntrega, companiaId: val || 0 })}
                  placeholder="-- Seleccionar Compañía / Silo --"
                />
              </div>

              {/* Litros Entregados */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px', display: 'block' }}>
                  Litros Entregados *
                </label>
                <input
                  type="number"
                  className="form-input"
                  required
                  placeholder="Litros"
                  value={formEntrega.litros || ''}
                  onChange={(e) => setFormEntrega({ ...formEntrega, litros: Number(e.target.value) })}
                  style={{
                    height: '38px',
                    fontWeight: 800,
                    fontSize: '15px',
                    color: '#0369a1',
                    background: '#f0f9ff',
                    border: '1.5px solid #7dd3fc',
                    borderRadius: '8px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '250px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px', display: 'block' }}>
                  Observación / Ticket de Pesaje
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: Ticket #8492, Guía de recepción..."
                  value={formEntrega.observacion}
                  onChange={(e) => setFormEntrega({ ...formEntrega, observacion: e.target.value })}
                  style={{ height: '38px', borderRadius: '8px' }}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={guardarEntregaMutation.isPending}
                style={{
                  height: '38px',
                  padding: '0 24px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  cursor: 'pointer',
                }}
              >
                <i className="fa-solid fa-floppy-disk"></i>
                {guardarEntregaMutation.isPending ? 'Guardando...' : 'Guardar Entrega'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CARD 2: TABLA Y BUSCADOR DE ENTREGAS (3 FILTROS + MODERN TABLE) */}
      <div
        className="content-card"
        id="cardHistorialEntregas"
        style={{
          padding: 0,
          overflow: 'hidden',
          borderRadius: '12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          marginBottom: '24px',
        }}
      >
        {/* Cabecera Estilo Cyan Original */}
        <div
          className="card-header-styled card-header-cyan"
          style={{
            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            color: '#ffffff',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-magnifying-glass"></i> BÚSQUEDA Y CONTROL DE ENTREGAS EN RECEPTORÍA
          </span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                padding: '5px 12px',
                borderRadius: '8px',
                fontWeight: 600,
                color: '#ffffff',
              }}
            >
              Total del Día: <strong style={{ color: '#fde047', fontWeight: 800, fontSize: '15px' }}>{totalLitrosReceptoria.toLocaleString('es-VE')}</strong> Lts
            </span>
            <span
              style={{
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                padding: '5px 12px',
                borderRadius: '8px',
                fontWeight: 600,
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Diferencia:{' '}
              <strong
                style={{
                  color: diferenciaBalance === 0 ? '#34d399' : diferenciaBalance < 0 ? '#f87171' : '#60a5fa',
                  fontWeight: 800,
                  fontSize: '15px',
                }}
              >
                {diferenciaBalance > 0 ? `+${diferenciaBalance.toLocaleString('es-VE')}` : diferenciaBalance.toLocaleString('es-VE')} Lts
              </strong>
            </span>
            {totalFiltradoLts !== totalLitrosReceptoria && (
              <span
                style={{
                  background: 'rgba(15, 23, 42, 0.55)',
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  color: '#ffffff',
                }}
              >
                Total Filtrado: <strong style={{ color: '#fde047', fontWeight: 800, fontSize: '15px' }}>{totalFiltradoLts.toLocaleString('es-VE')}</strong> Lts
              </span>
            )}
          </div>
        </div>

        {/* 3 Filtros: Fecha, Chofer, Compañía */}
        <div style={{ padding: '18px 20px 0 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            {/* 1. Fecha */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                <i className="fa-regular fa-calendar"></i> 1. Fecha de Consulta
              </label>
              <input
                type="date"
                className="form-input"
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                style={{ height: '38px', fontSize: '13px', borderRadius: '8px' }}
              />
            </div>

            {/* 2. Chofer Desplegable Buscable */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                <i className="fa-solid fa-user"></i> 2. Filtrar por Chofer
              </label>
              <SearchableSelect
                options={filtroChoferOptions}
                value={filtroChoferTabla}
                onChange={(val) => {
                  setFiltroChoferTabla(val || '');
                  setCurrentPage(1);
                }}
                placeholder="TODOS LOS CHOFERES"
                searchPlaceholder="Buscar chofer en entregas..."
                allowClear={true}
              />
            </div>

            {/* 3. Compañía Desplegable Buscable */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                <i className="fa-solid fa-building"></i> 3. Filtrar por Compañía
              </label>
              <SearchableSelect
                options={filtroCompaniaOptions}
                value={filtroCompaniaTabla}
                onChange={(val) => {
                  setFiltroCompaniaTabla(val || '');
                  setCurrentPage(1);
                }}
                placeholder="TODAS LAS COMPAÑÍAS"
                searchPlaceholder="Buscar planta o silo..."
                allowClear={true}
              />
            </div>
          </div>

          {/* Barra de Resumen de Filtro Dinámico */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              marginBottom: '14px',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '13px' }}>
              <span style={{ color: '#64748b', fontWeight: 600 }}>
                <i className="fa-solid fa-list-check" style={{ marginRight: '6px' }}></i>
                {entregasFiltradas.length} {entregasFiltradas.length === 1 ? 'entrega encontrada' : 'entregas encontradas'}
              </span>
              {filtroChoferTabla && (
                <span style={{ color: '#0284c7', background: '#e0f2fe', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                  Chofer: {filtroChoferTabla}
                </span>
              )}
              {filtroCompaniaTabla && (
                <span style={{ color: '#0369a1', background: '#bae6fd', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                  Compañía: {filtroCompaniaTabla}
                </span>
              )}
            </div>

            {(filtroChoferTabla || filtroCompaniaTabla || busquedaTabla) && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setFiltroChoferTabla('');
                  setFiltroCompaniaTabla('');
                  setBusquedaTabla('');
                  setCurrentPage(1);
                }}
                style={{ fontSize: '12px', padding: '4px 12px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-filter-circle-xmark"></i> Limpiar Filtros
              </button>
            )}
          </div>

          {/* Controles de Paginación y Buscador en Vivo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
              <span>Mostrar</span>
              <select
                className="form-input"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{ width: '80px', height: '32px', padding: '2px 8px', fontSize: '13px' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={-1}>Todos</option>
              </select>
              <span>registros por página</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="buscarTablaReceptoria" style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Buscar:
              </label>
              <div style={{ position: 'relative', width: '220px' }}>
                <i className="fa-solid fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8' }}></i>
                <input
                  id="buscarTablaReceptoria"
                  type="text"
                  className="form-input"
                  placeholder="Compañía, chofer, litros..."
                  value={busquedaTabla}
                  onChange={(e) => {
                    setBusquedaTabla(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ height: '32px', fontSize: '12px', paddingLeft: '30px' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* TABLA DE ENTREGAS ORIGINAL */}
        <div className="table-responsive" style={{ margin: 0, padding: '0 20px 10px 20px', overflowX: 'auto' }}>
          <table className="modern-table" style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', marginBottom: 0 }}>
            <thead>
              <tr>
                <th
                  onClick={() => {
                    setSortColumn('fecha');
                    setSortAsc(!sortAsc);
                  }}
                  style={{ cursor: 'pointer', userSelect: 'none', width: '110px' }}
                >
                  FECHA <i className="fa-solid fa-sort" style={{ fontSize: '11px', opacity: 0.6 }}></i>
                </th>
                <th
                  onClick={() => {
                    setSortColumn('companiaNombre');
                    setSortAsc(!sortAsc);
                  }}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  DESTINO / COMPAÑÍA <i className="fa-solid fa-sort" style={{ fontSize: '11px', opacity: 0.6 }}></i>
                </th>
                <th
                  onClick={() => {
                    setSortColumn('conductorNombre');
                    setSortAsc(!sortAsc);
                  }}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  CONDUCTOR <i className="fa-solid fa-sort" style={{ fontSize: '11px', opacity: 0.6 }}></i>
                </th>
                <th style={{ textAlign: 'right', width: '120px' }}>
                  VOL. ORIGEN
                </th>
                <th
                  onClick={() => {
                    setSortColumn('litros');
                    setSortAsc(!sortAsc);
                  }}
                  style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right', width: '130px' }}
                >
                  ENTREGADO <i className="fa-solid fa-sort" style={{ fontSize: '11px', opacity: 0.6 }}></i>
                </th>
                <th style={{ textAlign: 'center', width: '140px' }}>
                  MERMA / BALANCE
                </th>
                {hasBufala && (
                  <th style={{ textAlign: 'center', width: '110px' }}>
                    TIPO LECHE
                  </th>
                )}
                <th style={{ width: '160px', maxWidth: '160px' }}>OBSERVACIÓN</th>
                <th style={{ width: '110px', minWidth: '110px', textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loadingEntregas ? (
                <tr>
                  <td colSpan={hasBufala ? 9 : 8} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '20px', marginRight: '8px' }}></i>
                    Cargando entregas de receptoría...
                  </td>
                </tr>
              ) : entregasPaginadas.length === 0 ? (
                <tr>
                  <td colSpan={hasBufala ? 9 : 8} style={{ textAlign: 'center', color: '#94a3b8', padding: '36px' }}>
                    <i className="fa-solid fa-inbox" style={{ fontSize: '28px', marginBottom: '8px', display: 'block', opacity: 0.4 }}></i>
                    No hay entregas registradas para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                entregasPaginadas.map((e) => {
                  const meta = clasificarEntrega(e);
                  const numLitros = Number(e.litros || e.Litros || 0);
                  const numOrigen = Number(e.totalLitrosOrigen != null ? e.totalLitrosOrigen : numLitros);
                  const difLitros = e.diferenciaLitros != null ? Number(e.diferenciaLitros) : null;
                  const pctMerma = e.porcentajeMerma != null ? Math.abs(Number(e.porcentajeMerma)) : (difLitros && numOrigen > 0 ? (Math.abs(difLitros) * 100) / numOrigen : 0);

                  return (
                    <tr
                      key={e.id}
                      style={{
                        background: meta.rowBg,
                        borderLeft: `4px solid ${meta.borderLeft}`,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* 1. FECHA */}
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <strong style={{ color: '#0f172a', fontSize: '13px', fontWeight: 700 }}>
                          {e.fecha ? e.fecha.split('T')[0] : ''}
                        </strong>
                      </td>

                      {/* 2. DESTINO / COMPAÑÍA */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span
                            className="badge"
                            style={{
                              background: meta.badgeBg,
                              color: meta.badgeColor,
                              border: `1px solid ${meta.badgeBorder}`,
                              fontWeight: 700,
                              fontSize: '10.5px',
                              padding: '2px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <i className={meta.icono}></i> {meta.label}
                          </span>
                          {meta.ticketId && (
                            <span
                              className="badge"
                              style={{
                                background: '#e0f2fe',
                                color: '#0369a1',
                                border: '1px solid #7dd3fc',
                                fontWeight: 800,
                                fontSize: '11px',
                                padding: '2px 7px',
                                borderRadius: '5px',
                              }}
                            >
                              <i className="fa-solid fa-ticket"></i> Ticket #{meta.ticketId}
                            </span>
                          )}
                          {meta.ctrlCompId && (
                            <span
                              className="badge"
                              style={{
                                background: '#faf5ff',
                                color: '#7e22ce',
                                border: '1px solid #d8b4fe',
                                fontWeight: 800,
                                fontSize: '11px',
                                padding: '2px 7px',
                                borderRadius: '5px',
                              }}
                            >
                              <i className="fa-solid fa-file-invoice"></i> Ctrl #{meta.ctrlCompId}
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 800, color: meta.titleColor, fontSize: '13.5px' }}>
                          {e.companiaNombre || `Compañía #${e.companiaId}`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <small style={{ color: '#475569', fontWeight: 600 }}>{e.encargado || meta.subLabel}</small>
                        </div>
                      </td>

                      {/* 3. CONDUCTOR */}
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ color: '#1e293b', fontWeight: 700, fontSize: '13px' }}>
                          <i className="fa-solid fa-user-tie" style={{ color: '#64748b', marginRight: '6px' }}></i>
                          {e.conductorNombre || 'Chofer'}
                        </div>
                      </td>

                      {/* 4. VOL. ORIGEN */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#475569' }}>
                          {numOrigen > 0 ? numOrigen.toLocaleString('es-VE') : '-'} <small style={{ fontSize: '10.5px', color: '#94a3b8' }}>Lts</small>
                        </span>
                      </td>

                      {/* 5. ENTREGADO */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <span style={{ fontWeight: 800, fontSize: '14.5px', color: meta.litrosColor }}>
                          {numLitros < 0 ? '-' : numLitros > 0 ? '+' : ''}{Math.abs(numLitros).toLocaleString('es-VE')}{' '}
                          <small style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Lts</small>
                        </span>
                      </td>

                      {/* 6. MERMA / BALANCE */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        {difLitros !== null ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <span
                              style={{
                                fontWeight: 800,
                                fontSize: '12px',
                                color: difLitros === 0 ? '#166534' : difLitros > 0 ? '#b45309' : '#047857',
                              }}
                            >
                              {difLitros > 0 ? `-${difLitros.toLocaleString('es-VE')} L` : difLitros < 0 ? `+${Math.abs(difLitros).toLocaleString('es-VE')} L` : '0 L'}
                            </span>
                            <span
                              className="badge"
                              style={{
                                background: pctMerma <= 3.0 ? '#ecfdf5' : '#fef2f2',
                                color: pctMerma <= 3.0 ? '#059669' : '#dc2626',
                                border: `1px solid ${pctMerma <= 3.0 ? '#a7f3d0' : '#fecaca'}`,
                                fontWeight: 800,
                                fontSize: '11px',
                              }}
                            >
                              {pctMerma.toFixed(2)}%
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>-</span>
                        )}
                      </td>

                      {/* TIPO DE LECHE (CONDICIONADO AL MÓDULO BÚFALA) */}
                      {hasBufala && (
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const tipo = (e.tipoLeche || 'VACA').toUpperCase();
                            const esBuf = tipo.includes('BUFAL');
                            return (
                              <span
                                className="badge"
                                style={{
                                  background: esBuf ? '#f3e8ff' : '#e0f2fe',
                                  color: esBuf ? '#7e22ce' : '#0369a1',
                                  border: `1px solid ${esBuf ? '#d8b4fe' : '#bae6fd'}`,
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                {esBuf ? '🐃 BÚFALA' : '🥛 VACA'}
                              </span>
                            );
                          })()}
                        </td>
                      )}

                      {/* 7. OBSERVACIÓN */}
                      <td style={{ verticalAlign: 'middle', width: '160px', maxWidth: '160px', paddingRight: '8px' }}>
                        <span 
                          title={e.observacion || ''}
                          style={{ 
                            color: '#475569', 
                            fontSize: '11.5px', 
                            fontWeight: 500, 
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '155px'
                          }}
                        >
                          {e.observacion || '-'}
                        </span>
                      </td>

                      {/* 8. ACCIONES */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle', width: '110px', minWidth: '110px', paddingLeft: '8px' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          {(() => {
                            const foto = (e as any).fotoReciboUrl || despachosCompanias.find((d: any) => d.id === meta.ctrlCompId || (meta.ticketId && d.controlRutaId === meta.ticketId))?.fotoReciboUrl;
                            if (!foto) return null;
                            return (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setModalVerFotoRecibo(foto)}
                                title="Ver comprobante / recibo de báscula"
                                style={{ height: '30px', width: '30px', padding: 0, borderRadius: '6px', color: '#16a34a', borderColor: '#86efac', background: '#f0fdf4', cursor: 'pointer' }}
                              >
                                <i className="fa-solid fa-camera" style={{ fontSize: '11.5px' }}></i>
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={async () => {
                              if (await confirmDeleteOrDeactivate('Eliminar el registro de entrega', `#${e.id}`)) {
                                eliminarEntregaMutation.mutate(e.id);
                              }
                            }}
                            title="Eliminar entrega"
                            style={{ height: '30px', width: '30px', padding: 0, borderRadius: '6px', color: '#ef4444', borderColor: '#fca5a5', background: '#fff' }}
                          >
                            <i className="fa-solid fa-trash-can" style={{ fontSize: '11px' }}></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación Inferior */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid #f1f5f9',
            background: '#ffffff',
            fontSize: '12.5px',
            color: '#64748b',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            Mostrando{' '}
            <strong>
              {entregasFiltradas.length === 0 ? 0 : (currentPage - 1) * (pageSize === -1 ? entregasFiltradas.length : pageSize) + 1}
            </strong>{' '}
            a{' '}
            <strong>
              {pageSize === -1 ? entregasFiltradas.length : Math.min(currentPage * pageSize, entregasFiltradas.length)}
            </strong>{' '}
            de <strong>{entregasFiltradas.length}</strong> entregas
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ height: '30px', padding: '0 10px', fontSize: '11.5px' }}
            >
              Anterior
            </button>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>
              Pág. {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ height: '30px', padding: '0 10px', fontSize: '11.5px' }}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* MODAL NUEVO TICKET SALIDA / ENVÍO */}
      {modalNuevoDespacho && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '780px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              borderRadius: '16px',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            {/* Cabecera del Modal */}
            <div
              style={{
                padding: '16px 22px',
                background: 'linear-gradient(135deg, #9333ea, #7e22ce)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-truck-arrow-right"></i> Nuevo Ticket Salida a Quesera / Compañía
                </h3>
                <span style={{ fontSize: '11.5px', color: '#e9d5ff', marginTop: '2px', display: 'block' }}>
                  Despacho desde tanques de receptoría hacia plantas procesadoras (Soporta múltiples destinos)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalNuevoDespacho(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (despachoCamionId === 0) {
                  toast.error('Debe seleccionar el camión cisterna asignado');
                  return;
                }
                const invalidDestino = destinosSalida.some((d) => d.companiaId === 0 || d.litrosDespachados <= 0);
                if (invalidDestino) {
                  toast.error('Todos los destinos deben tener planta seleccionada y litros mayores a 0');
                  return;
                }
                crearDespachosMultiMutation.mutate({
                  fecha: fechaDespacho,
                  camionId: despachoCamionId,
                  usuarioId: despachoUsuarioId,
                  destinos: destinosSalida,
                });
              }}
              style={{ padding: '20px', overflowY: 'auto', flex: 1 }}
            >
              {/* SECCIÓN 1: TRANSPORTE Y CONDUCTOR */}
              <div style={{ background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: '12px', padding: '14px 16px', marginBottom: '18px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-truck"></i> 1. Unidad de Transporte y Conductor
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '8px' }}>
                  {/* Fecha del Despacho */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Fecha del Despacho / Ticket *
                    </label>
                    <input
                      type="date"
                      value={fechaDespacho}
                      onChange={(e) => setFechaDespacho(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#1e293b',
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px'
                      }}
                    />
                  </div>

                  {/* Selector de Camión */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Camión Cisterna Asignado *
                    </label>
                    <CamionSelect
                      value={despachoCamionId || undefined}
                      onChange={(val) => {
                        const num = val || 0;
                        setDespachoCamionId(num);
                        const cMatch = camiones.find((c) => c.id === num);
                        if (cMatch && cMatch.usuarioId) {
                          setDespachoUsuarioId(cMatch.usuarioId);
                        }
                      }}
                      placeholder="-- Seleccionar Camión Cisterna --"
                    />
                  </div>

                  {/* Selector de Conductor */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Conductor Asignado *
                    </label>
                    <ChoferSelect
                      value={despachoUsuarioId || undefined}
                      onChange={(val) => setDespachoUsuarioId(val || 0)}
                      placeholder="-- Seleccionar Conductor --"
                    />
                  </div>
                </div>

                {despachoCamionId > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#7e22ce', fontWeight: 600 }}>
                    <span>
                      <i className="fa-solid fa-gauge-high"></i> Capacidad Cisterna:{' '}
                      <strong>{(camiones.find((c) => c.id === despachoCamionId)?.capacidadLitros || 0).toLocaleString()} Lts</strong>
                    </span>
                    <span>&bull;</span>
                    <span>
                      <i className="fa-solid fa-user-check"></i> Chofer Registrado:{' '}
                      <strong>{camiones.find((c) => c.id === despachoCamionId)?.choferNombre || 'Sin asignar en catálogo'}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* SECCIÓN 2: DESTINOS Y CARGAS (SOPORTE MULTI-DESTINO) */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-building-wheat" style={{ color: '#9333ea' }}></i> 2. Destinos y Plantas a Despachar
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDestinosSalida([
                        ...destinosSalida,
                        {
                          id: String(Date.now()),
                          companiaId: 0,
                          litrosDespachados: 0,
                          tipoLeche: 'VACA',
                          numeroGuiaSADA: '',
                          observacion: '',
                        },
                      ]);
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    <i className="fa-solid fa-plus"></i> + Añadir Otra Planta / Destino
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {destinosSalida.map((dest, idx) => (
                    <div
                      key={dest.id}
                      style={{
                        background: '#f8fafc',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', background: '#f3e8ff', padding: '2px 8px', borderRadius: '4px' }}>
                          Destino #{idx + 1}
                        </span>
                        {destinosSalida.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setDestinosSalida(destinosSalida.filter((d) => d.id !== dest.id));
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Quitar este destino"
                          >
                            <i className="fa-solid fa-trash-can"></i> Quitar
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', alignItems: 'end' }}>
                        {/* Compañía Destino */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                            Planta Destino *
                          </label>
                          <CompaniaSelect
                            value={dest.companiaId || undefined}
                            onChange={(val) => {
                              const updated = destinosSalida.map((d) =>
                                d.id === dest.id ? { ...d, companiaId: val || 0 } : d
                              );
                              setDestinosSalida(updated);
                            }}
                            placeholder="-- Seleccionar Planta Destino --"
                          />
                        </div>

                        {/* Litros a Despachar */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                            Litros a Despachar *
                          </label>
                          <input
                            type="number"
                            className="form-input"
                            required
                            placeholder="Litros"
                            value={dest.litrosDespachados || ''}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const updated = destinosSalida.map((d) =>
                                d.id === dest.id ? { ...d, litrosDespachados: val } : d
                              );
                              setDestinosSalida(updated);
                            }}
                            style={{ height: '38px', fontWeight: 800, fontSize: '14.5px', color: '#7e22ce' }}
                          />
                        </div>

                        {/* Tipo de Leche (Ambos tipos SIEMPRE disponibles) */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                            Tipo de Leche *
                          </label>
                          <TipoLecheSelect
                            value={dest.tipoLeche}
                            onChange={(val) => {
                              const updated = destinosSalida.map((d) =>
                                d.id === dest.id ? { ...d, tipoLeche: val || 'VACA' } : d
                              );
                              setDestinosSalida(updated);
                            }}
                            allowClear={false}
                          />
                        </div>

                        {/* N° Guía SADA */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                            Guía SADA / Observación
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Ej: SADA-89123..."
                            value={dest.numeroGuiaSADA}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = destinosSalida.map((d) =>
                                d.id === dest.id ? { ...d, numeroGuiaSADA: val } : d
                              );
                              setDestinosSalida(updated);
                            }}
                            style={{ height: '38px', fontSize: '12.5px' }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BARRA DE RESUMEN Y BALANCE DE CARGA */}
              {(() => {
                const camionSel = camiones.find((c) => c.id === despachoCamionId);
                const cap = camionSel?.capacidadLitros || 0;
                const totLitros = destinosSalida.reduce((acc, d) => acc + (Number(d.litrosDespachados) || 0), 0);
                const excede = cap > 0 && totLitros > cap;

                return (
                  <div
                    style={{
                      background: excede ? '#fef2f2' : '#f0fdf4',
                      border: `1.5px solid ${excede ? '#fca5a5' : '#86efac'}`,
                      borderRadius: '10px',
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11.5px', color: excede ? '#991b1b' : '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                        Total a Despachar:
                      </span>
                      <strong style={{ fontSize: '17px', color: excede ? '#dc2626' : '#15803d', marginLeft: '6px' }}>
                        {totLitros.toLocaleString()} Lts
                      </strong>
                      {cap > 0 && (
                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>
                          (de {cap.toLocaleString()} Lts capacidad cisterna)
                        </span>
                      )}
                    </div>
                    {excede ? (
                      <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa-solid fa-triangle-exclamation"></i> Carga excede capacidad del camión por {(totLitros - cap).toLocaleString()} Lts
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa-solid fa-circle-check"></i> Carga dentro del límite ({destinosSalida.length} destino{destinosSalida.length > 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Botones del Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setModalNuevoDespacho(false)}
                  style={{ height: '40px', padding: '0 18px', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={crearDespachosMultiMutation.isPending}
                  style={{
                    height: '40px',
                    padding: '0 24px',
                    fontWeight: 800,
                    fontSize: '13.5px',
                    background: 'linear-gradient(135deg, #9333ea, #7e22ce)',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 14px rgba(147, 51, 234, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className="fa-solid fa-paper-plane"></i>
                  {crearDespachosMultiMutation.isPending
                    ? 'Emitiendo Tickets...'
                    : `Emitir ${destinosSalida.length > 1 ? `${destinosSalida.length} Tickets de Salida` : 'Ticket de Salida'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VALIDAR ENTREGA COMPAÑÍA (1:1 V2_3_11_26) */}
      {modalConfirmar && despachoSeleccionado && (() => {
        const despachados = Number(despachoSeleccionado.litrosDespachados || 0);
        const recibidos = Number(litrosConfirmadosInput || 0);
        const dif = despachados - recibidos;
        const mermaPct = despachados > 0 ? ((Math.abs(dif) / despachados) * 100).toFixed(2) : '0.00';
        const tipoDespachoRaw = (despachoSeleccionado.tipoLeche || (despachoSeleccionado as any).TipoLeche || '').toUpperCase();
        const esBufala = tipoDespachoRaw.includes('BUFAL');
        const esAcida = tipoDespachoRaw.includes('ACID') || (despachoSeleccionado.observaciones || '').toUpperCase().includes('ACID');

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
          >
            <div
              className="content-card"
              style={{
                width: '100%',
                maxWidth: '560px',
                background: '#ffffff',
                borderRadius: '16px',
                padding: 0,
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
                border: '1px solid #cbd5e1',
              }}
            >
              {/* CABECERA */}
              <div
                style={{
                  padding: '16px 20px',
                  background: 'linear-gradient(135deg, #059669, #047857)',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-clipboard-check"></i> Validar Entrega en Queseras / Destinos
                </h3>
                <button
                  type="button"
                  onClick={() => setModalConfirmar(false)}
                  style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const ltsAConfirmar = Number(litrosConfirmadosInput) > 0
                    ? Number(litrosConfirmadosInput)
                    : Number(despachoSeleccionado.litrosDespachados || (despachoSeleccionado as any).LitrosDespachados || 0);

                  validarMutation.mutate({
                    id: despachoSeleccionado.id,
                    litros: ltsAConfirmar,
                    obs: obsConfirmacionInput,
                  });
                }}
                style={{ padding: '20px', maxHeight: '85vh', overflowY: 'auto' }}
              >
                {/* BANNER DE INFORMACIÓN DEL TICKET (PURPLE GRADIENT 1:1) */}
                <div style={{ background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', border: '1.5px solid #d8b4fe', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12.5px' }}>
                    <span><strong>Ticket de Salida:</strong> <span style={{ color: '#7e22ce', fontWeight: 800 }}>#{despachoSeleccionado.id}</span></span>
                    <span><strong>Fecha:</strong> {despachoSeleccionado.fecha ? new Date(despachoSeleccionado.fecha).toLocaleDateString('es-VE') : hoyStr}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12.5px' }}>
                    <span><strong>Conductor:</strong> <strong style={{ color: '#6b21a8' }}>{despachoSeleccionado.nombreConductor || (despachoSeleccionado as any).conductorNombre || 'Chofer'}</strong></span>
                    <span><strong>Destino Inicial:</strong> <strong>{despachoSeleccionado.nombreCompania || `Planta #${despachoSeleccionado.companiaId}`}</strong></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <strong>Tipo Despachado:</strong>
                      <span className="badge" style={{ background: esBufala ? '#faf5ff' : '#eff6ff', color: esBufala ? '#7e22ce' : '#1d4ed8', border: `1px solid ${esBufala ? '#d8b4fe' : '#bfdbfe'}`, fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                        {esBufala ? '🐃 BÚFALA' : '🥛 VACA'}
                      </span>
                      {esAcida && (
                        <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 800, padding: '2px 6px', borderRadius: '6px' }}>
                          ⚠️ ÁCIDA
                        </span>
                      )}
                    </div>
                    <span><strong>Ticket Estado:</strong> <span className="badge" style={{ background: '#faf5ff', color: '#9333ea', border: '1px solid #d8b4fe', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>EN VÍA</span></span>
                  </div>
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #d8b4fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#7e22ce', fontSize: '13px' }}>Litros Despachados:</span>
                    <strong style={{ fontSize: '18px', color: '#9333ea', fontWeight: 900 }}>{despachados.toLocaleString('es-VE')} Lts</strong>
                  </div>
                </div>

                {/* CAMPO DE LITROS CONFIRMADOS */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>
                    Litros Confirmados / Recibidos por Planta *
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    required
                    value={litrosConfirmadosInput || ''}
                    onChange={(e) => setLitrosConfirmadosInput(Number(e.target.value))}
                    style={{ height: '44px', fontWeight: 900, fontSize: '18px', color: '#059669', background: '#ecfdf5', border: '1.5px solid #a7f3d0', borderRadius: '10px' }}
                    min="0"
                    placeholder="0"
                  />
                </div>

                {/* INDICADOR EN VIVO DE DIFERENCIA / MERMA / SOBRANTE */}
                <div
                  style={{
                    marginBottom: '16px',
                    background: dif === 0 ? '#f0fdf4' : dif > 0 ? '#fffbeb' : '#eff6ff',
                    border: `1.5px solid ${dif === 0 ? '#86efac' : dif > 0 ? '#fde68a' : '#bfdbfe'}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '13px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: dif === 0 ? '#166534' : dif > 0 ? '#b45309' : '#1e40af' }}>
                      Total Recibido: <strong style={{ fontSize: '15px', color: '#0f172a' }}>{recibidos.toLocaleString('es-VE')} Lts</strong>
                    </span>
                    <strong
                      style={{
                        fontSize: '14px',
                        fontWeight: 800,
                        color: dif === 0 ? '#16a34a' : dif > 0 ? '#d97706' : '#2563eb',
                      }}
                    >
                      {dif === 0
                        ? 'Diferencia: 0 Lts (0.00%)'
                        : dif > 0
                        ? `Falla / Merma: -${dif.toLocaleString('es-VE')} Lts (${mermaPct}%)`
                        : `Sobrante: +${Math.abs(dif).toLocaleString('es-VE')} Lts (${mermaPct}%)`}
                    </strong>
                  </div>
                  <div style={{ fontSize: '12px', color: dif === 0 ? '#15803d' : dif > 0 ? '#b45309' : '#1d4ed8', marginTop: '4px', fontWeight: 600 }}>
                    {dif === 0 && (
                      <>
                        <i className="fa-solid fa-circle-check"></i> Entrega 100% exacta sin variación.
                      </>
                    )}
                    {dif > 0 && (
                      <>
                        <i className="fa-solid fa-triangle-exclamation"></i> Se registrará una merma / faltante de leche de {dif.toLocaleString('es-VE')} litros.
                      </>
                    )}
                    {dif < 0 && (
                      <>
                        <i className="fa-solid fa-circle-info"></i> Se registrará un excedente de leche de {Math.abs(dif).toLocaleString('es-VE')} litros.
                      </>
                    )}
                  </div>
                </div>

                {/* OBSERVACIONES */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    OBSERVACIÓN GENERAL / TICKET DE PESAJE QUESERA
                  </label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Ej: Pesaje conforme según ticket #..."
                    value={obsConfirmacionInput}
                    onChange={(e) => setObsConfirmacionInput(e.target.value)}
                    style={{ width: '100%', resize: 'none', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                  {despachoSeleccionado.controlRutaId ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleDevolverTicketAlChofer(Number(despachoSeleccionado.controlRutaId))}
                      disabled={devolverAlChoferMutation.isPending}
                      style={{
                        height: '40px',
                        padding: '0 16px',
                        fontWeight: 800,
                        fontSize: '12px',
                        background: '#fff1f2',
                        color: '#be123c',
                        border: '1px solid #fecdd3',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                      title="Devolver ticket al chofer para que agregue o modifique fincas"
                    >
                      <i className="fa-solid fa-arrow-rotate-left"></i>
                      {devolverAlChoferMutation.isPending ? 'Devolviendo...' : 'Devolver al Chofer'}
                    </button>
                  ) : <div />}

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setModalConfirmar(false)}
                      style={{ height: '40px', padding: '0 18px', fontWeight: 700 }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={validarMutation.isPending}
                      style={{
                        height: '40px',
                        padding: '0 22px',
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #059669, #047857)',
                        border: 'none',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 6px rgba(5,150,105,0.3)',
                      }}
                    >
                      <i className="fa-solid fa-check-double"></i>
                      {validarMutation.isPending ? 'Validando...' : 'Confirmar y Conciliar Entrega'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL EDITAR TICKET SALIDA / FECHA */}
      {modalEditarDespacho && despachoAEditar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#ffffff',
              borderRadius: '16px',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                  <i className="fa-solid fa-pen-to-square"></i> Editar Ticket de Salida #{despachoAEditar.id}
                </h3>
                <span style={{ fontSize: '11px', color: '#bfdbfe' }}>
                  Modifica la fecha de emisión o el volumen despachado
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalEditarDespacho(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (despachoAEditar.litrosDespachados <= 0) {
                  toast.error('Los litros despachados deben ser mayores a 0');
                  return;
                }
                actualizarDespachoMutation.mutate({
                  id: despachoAEditar.id,
                  fecha: despachoAEditar.fecha,
                  litrosDespachados: Number(despachoAEditar.litrosDespachados),
                  tipoLeche: despachoAEditar.tipoLeche || 'VACA',
                  observacion: despachoAEditar.observacion
                });
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Fecha de Despacho / Ticket *
                </label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={despachoAEditar.fecha}
                  onChange={(e) => setDespachoAEditar({ ...despachoAEditar, fecha: e.target.value })}
                  style={{ height: '38px', width: '100%', fontWeight: 700 }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Litros Despachados *
                </label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min={1}
                  value={despachoAEditar.litrosDespachados || ''}
                  onChange={(e) => setDespachoAEditar({ ...despachoAEditar, litrosDespachados: Number(e.target.value) })}
                  style={{ height: '38px', width: '100%', fontWeight: 800, color: '#2563eb' }}
                />
              </div>

              {hasBufala && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Tipo de Leche
                  </label>
                  <TipoLecheSelect
                    value={despachoAEditar.tipoLeche || 'VACA'}
                    onChange={(val) => setDespachoAEditar({ ...despachoAEditar, tipoLeche: val })}
                    allowClear={false}
                  />
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Observación / Motivo de Corrección
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={despachoAEditar.observacion || ''}
                  onChange={(e) => setDespachoAEditar({ ...despachoAEditar, observacion: e.target.value })}
                  placeholder="Ej: Corrección de fecha emitida por error de digitación"
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setModalEditarDespacho(false)}
                  style={{ height: '38px', padding: '0 16px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actualizarDespachoMutation.isPending}
                  style={{ height: '38px', padding: '0 18px', fontWeight: 700 }}
                >
                  {actualizarDespachoMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VISUALIZADOR DE RECIBO / COMPROBANTE SUBIDO POR EL CHOFER */}
      {modalVerFotoRecibo && (
        <div
          onClick={() => setModalVerFotoRecibo(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '650px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0f172a',
                color: '#ffffff',
              }}
            >
              <strong style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-camera text-emerald-400"></i> Comprobante / Recibo de Báscula del Chofer
              </strong>
              <button
                type="button"
                onClick={() => setModalVerFotoRecibo(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div style={{ padding: '12px', background: '#020617', display: 'flex', justifyContent: 'center', overflowY: 'auto' }}>
              <img
                src={modalVerFotoRecibo}
                alt="Recibo Chofer"
                style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
            <div style={{ padding: '12px 20px', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalVerFotoRecibo(null)}
                style={{ height: '36px', padding: '0 16px', fontWeight: 700 }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA Y VALIDACIÓN DE LITROS DE FINCAS ANTES DE RECEPTORÍA */}
      {modalValidarFincasTicket && viajeParaRecibir && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '860px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
          >
            {/* ENCABEZADO */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                color: '#ffffff',
                padding: '16px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-clipboard-check"></i>
                  Validación de Litros y Recibos por Finca — Ticket #{viajeParaRecibir.id}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#bfdbfe', fontWeight: 500 }}>
                  Cisterna: {viajeParaRecibir.camionPlaca || 'Camión Cisterna'} • Conductor: {viajeParaRecibir.choferNombre || 'Asignado'} • Reportado: {(Number(viajeParaRecibir.totalLitrosRecogidos || viajeParaRecibir.totalLitrosFinca || 0)).toLocaleString()} Lts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalValidarFincasTicket(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* CONTENIDO DEL MODAL */}
            <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Banner de instrucción obligatoria */}
              <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderLeft: '4px solid #2563eb', padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', color: '#1e40af' }}>
                <div style={{ fontWeight: 800, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-circle-info"></i> Paso 1 Obligatorio: Verificación Previa de Recibos y Litros en Fincas
                </div>
                Antes de validar los litros entregados por el chofer y dar entrada a Receptoría, revise y confirme que los litros reportados y comprobantes coincidan con los recibos físicos o digitales de campo. Puede marcar una a una o presionar <b>"Seleccionar Todas las Fincas"</b>.
              </div>

              {/* KPIs de Control */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Fincas Recolectadas</span>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>{fincasViajeVerificar.length} <small style={{ fontSize: '11px', color: '#64748b' }}>con leche</small></div>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Fincas Validadas</span>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: fincasVerificadasIds.size === fincasViajeVerificar.length && fincasViajeVerificar.length > 0 ? '#16a34a' : '#2563eb' }}>
                    {fincasVerificadasIds.size} <small style={{ fontSize: '11px', color: '#64748b' }}>de {fincasViajeVerificar.length}</small>
                  </div>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Litros Validados</span>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0284c7' }}>
                    {fincasViajeVerificar.filter((f, idx) => fincasVerificadasIds.has(Number(f.id || f.fincaId || idx))).reduce((acc, f) => acc + Number(f.litros || f.litrosLeche || 0), 0).toLocaleString()} <small style={{ fontSize: '11px', color: '#64748b' }}>Lts</small>
                  </div>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Estado Auditoría</span>
                  <div style={{ marginTop: '2px' }}>
                    {fincasVerificadasIds.size === fincasViajeVerificar.length && fincasViajeVerificar.length > 0 ? (
                      <span className="badge" style={{ background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '11.5px', fontWeight: 800 }}>
                        <i className="fa-solid fa-circle-check mr-1"></i> 100% Verificado
                      </span>
                    ) : (
                      <span className="badge" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '11.5px', fontWeight: 800 }}>
                        <i className="fa-solid fa-clock mr-1"></i> {fincasViajeVerificar.length - fincasVerificadasIds.size} Pendientes
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Barra de Acciones y Filtro */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {fincasViajeVerificar.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (fincasVerificadasIds.size === fincasViajeVerificar.length) {
                          setFincasVerificadasIds(new Set());
                        } else {
                          setFincasVerificadasIds(new Set(fincasViajeVerificar.map((f, idx) => Number(f.id || f.fincaId || idx))));
                        }
                      }}
                      className="btn btn-sm"
                      style={{
                        height: '34px',
                        padding: '0 14px',
                        fontSize: '12px',
                        fontWeight: 800,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: fincasVerificadasIds.size === fincasViajeVerificar.length ? '#f0fdf4' : '#eff6ff',
                        color: fincasVerificadasIds.size === fincasViajeVerificar.length ? '#16a34a' : '#2563eb',
                        border: fincasVerificadasIds.size === fincasViajeVerificar.length ? '1.5px solid #86efac' : '1.5px solid #bfdbfe',
                      }}
                    >
                      <i className={fincasVerificadasIds.size === fincasViajeVerificar.length ? "fa-solid fa-square-check" : "fa-regular fa-square"}></i>
                      {fincasVerificadasIds.size === fincasViajeVerificar.length ? 'Deseleccionar Todas' : 'Seleccionar Todas las Fincas'}
                    </button>
                  )}
                </div>

                <div style={{ position: 'relative', minWidth: '240px' }}>
                  <input
                    type="text"
                    placeholder="Buscar finca o productor..."
                    value={busquedaFincasValidar}
                    onChange={(e) => setBusquedaFincasValidar(e.target.value)}
                    className="form-control"
                    style={{ height: '34px', fontSize: '12px', paddingLeft: '30px' }}
                  />
                  <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontSize: '12px' }}></i>
                </div>
              </div>

              {/* Tabla de Fincas */}
              {cargandoFincasViaje ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Cargando fincas y comprobantes del ticket...
                </div>
              ) : fincasViajeVerificar.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#ffffff', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                  No hay paradas con leche recolectada en este ticket (las fincas sin litros se omiten de la validación).
                </div>
              ) : (
                <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr style={{ borderBottom: '1.5px solid #cbd5e1', textAlign: 'left' }}>
                        <th style={{ padding: '10px', width: '42px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            title="Marcar / Desmarcar Todas"
                            checked={fincasViajeVerificar.length > 0 && fincasVerificadasIds.size === fincasViajeVerificar.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFincasVerificadasIds(new Set(fincasViajeVerificar.map((f, idx) => Number(f.id || f.fincaId || idx))));
                              } else {
                                setFincasVerificadasIds(new Set());
                              }
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                          />
                        </th>
                        <th style={{ padding: '10px', fontWeight: 700, color: '#475569' }}>Finca / Productor</th>
                        <th style={{ padding: '10px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Litros Recibo</th>
                        <th style={{ padding: '10px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Tipo / Condición</th>
                        <th style={{ padding: '10px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Comprobante / Foto</th>
                        <th style={{ padding: '10px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fincasViajeVerificar
                        .filter((f) => {
                          if (!busquedaFincasValidar.trim()) return true;
                          const q = busquedaFincasValidar.toLowerCase();
                          const nF = (f.fincaNombre || f.nombre || '').toLowerCase();
                          const nP = (f.propietarioNombre || f.propietario || '').toLowerCase();
                          return nF.includes(q) || nP.includes(q);
                        })
                        .map((f, idx) => {
                          const fid = Number(f.id || f.fincaId || idx);
                          const verificado = fincasVerificadasIds.has(fid);
                          const foto = f.fotoComprobante || f.fotoReciboUrl;
                          const lts = Number(f.litros || f.litrosLeche || 0);
                          const nomFinca = f.fincaNombre || f.nombre || `Finca #${f.fincaId || fid}`;
                          const prop = f.propietarioNombre || f.propietario || '';

                          return (
                            <tr
                              key={fid}
                              onClick={() => {
                                setFincasVerificadasIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(fid)) next.delete(fid);
                                  else next.add(fid);
                                  return next;
                                });
                              }}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: verificado ? '#f0fdf4' : idx % 2 === 0 ? '#ffffff' : '#fafafa',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s',
                              }}
                            >
                              <td style={{ padding: '10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={verificado}
                                  onChange={(e) => {
                                    setFincasVerificadasIds((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(fid);
                                      else next.delete(fid);
                                      return next;
                                    });
                                  }}
                                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#16a34a' }}
                                />
                              </td>
                              <td style={{ padding: '10px' }}>
                                <div style={{ fontWeight: 800, color: '#0f172a' }}>{nomFinca}</div>
                                {prop && <div style={{ fontSize: '11px', color: '#64748b' }}>{prop}</div>}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900, color: '#0284c7', fontSize: '13px' }}>
                                {lts.toLocaleString()} Lts
                              </td>
                              <td style={{ padding: '10px', textAlign: 'center' }}>
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: f.esAcida ? '#fee2e2' : '#f1f5f9', color: f.esAcida ? '#dc2626' : '#475569', fontWeight: 700 }}>
                                  {f.tipoLeche || 'VACA'} {f.esAcida ? '(Ácida)' : ''}
                                </span>
                                {f.observacion && (
                                  <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px auto 0' }}>
                                    {f.observacion}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                {foto ? (
                                  <button
                                    type="button"
                                    onClick={() => setModalVerFotoRecibo(foto)}
                                    className="btn btn-sm"
                                    title="Ver foto del ticket / recibo"
                                    style={{
                                      padding: '3px 8px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      borderRadius: '6px',
                                      color: '#16a34a',
                                      borderColor: '#86efac',
                                      background: '#f0fdf4',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <i className="fa-solid fa-camera"></i> Ver Foto
                                  </button>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>Sin foto</span>
                                )}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'center' }}>
                                {verificado ? (
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <i className="fa-solid fa-circle-check"></i> Validado
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px' }}>
                                    Pendiente
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* PIE DEL MODAL DE VALIDACIÓN */}
            <div
              style={{
                padding: '14px 22px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                {fincasVerificadasIds.size} de {fincasViajeVerificar.length} fincas validadas
              </span>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setModalValidarFincasTicket(false);
                    handleDevolverTicketAlChofer(Number(viajeParaRecibir.id));
                  }}
                  disabled={devolverAlChoferMutation.isPending}
                  style={{
                    height: '38px',
                    padding: '0 14px',
                    fontWeight: 700,
                    fontSize: '12px',
                    background: '#fff1f2',
                    border: '1.5px solid #fecdd3',
                    borderRadius: '8px',
                    color: '#e11d48',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                  title="Devolver ticket al chofer para que agregue o modifique fincas"
                >
                  <i className="fa-solid fa-arrow-rotate-left"></i>
                  {devolverAlChoferMutation.isPending ? 'Devolviendo...' : 'Devolver al Chofer'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalValidarFincasTicket(false)}
                  style={{ height: '38px', padding: '0 16px', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmarValidacionFincas}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    fontWeight: 800,
                    fontSize: '13px',
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  <i className="fa-solid fa-check-double"></i> Confirmar Validación y Continuar a Recepción
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VERIFICAR Y RECIBIR VIAJE (CON OPCIÓN RECARGAR Y DESPACHAR A COMPAÑÍA) */}
      {modalVerificarViaje && viajeParaRecibir && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '820px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
          >
            {/* ENCABEZADO DEL MODAL */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#ffffff',
                padding: '16px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-truck-ramp-box"></i>
                  Verificación y Recepción en Planta / Receptoría
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#e0f2fe', fontWeight: 500 }}>
                  Viaje #{viajeParaRecibir.id} • {viajeParaRecibir.camionPlaca || 'Camión Cisterna'} • Conductor: {viajeParaRecibir.choferNombre || 'Asignado'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalVerificarViaje(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* CUERPO DEL MODAL */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* BANNER DE VALIDACIÓN DE FINCAS */}
              <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#15803d', fontSize: '12.5px', fontWeight: 700 }}>
                  <i className="fa-solid fa-circle-check" style={{ fontSize: '16px' }}></i>
                  <span>Fincas y Recibos Validados: {fincasVerificadasIds.size} de {fincasViajeVerificar.length} paradas auditadas</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModalVerificarViaje(false);
                    setModalValidarFincasTicket(true);
                  }}
                  className="btn btn-sm"
                  style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', background: '#ffffff', border: '1px solid #86efac', color: '#15803d', borderRadius: '6px', cursor: 'pointer' }}
                >
                  <i className="fa-solid fa-list-check mr-1"></i> Revisar Fincas y Recibos
                </button>
              </div>

              {/* COMPARATIVA DE LITROS FINCA VS RECEPTORÍA */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Litros Recogidos en Finca
                  </span>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                    {(Number(viajeParaRecibir.totalLitrosRecogidos || viajeParaRecibir.totalLitrosFinca || 0)).toLocaleString()}{' '}
                    <small style={{ fontSize: '12px', color: '#64748b' }}>Lts</small>
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Reportado por conductor</span>
                </div>

                <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: '10px', padding: '12px 14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Litros Recibidos en Planta *
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    required
                    style={{ fontSize: '18px', fontWeight: 900, color: '#0369a1', height: '38px' }}
                    value={litrosRecibidosInput || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setLitrosRecibidosInput(val);
                      if (modoRecepcion === 'RECARGAR_Y_DESPACHAR' && destinosRecarga.length === 1) {
                        setDestinosRecarga([{ ...destinosRecarga[0], litrosDespachados: val + (Number(recargaSilosInput) || 0) }]);
                      }
                    }}
                  />
                  {/* Badge de diferencia */}
                  {(() => {
                    const lFinca = Number(viajeParaRecibir.totalLitrosRecogidos || viajeParaRecibir.totalLitrosFinca || 0);
                    const dif = (Number(litrosRecibidosInput) || 0) - lFinca;
                    const pct = lFinca > 0 ? ((Math.abs(dif) * 100) / lFinca).toFixed(2) : '0.00';
                    if (dif === 0) {
                      return (
                        <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#059669' }}>
                          <i className="fa-solid fa-circle-check"></i> 100% Cuadrado (0 Lts de diferencia)
                        </div>
                      );
                    }
                    if (dif < 0) {
                      return (
                        <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#e11d48' }}>
                          <i className="fa-solid fa-triangle-exclamation"></i> Merma de Ruta: {dif.toLocaleString()} Lts (-{pct}%)
                        </div>
                      );
                    }
                    return (
                      <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#0284c7' }}>
                        <i className="fa-solid fa-circle-info"></i> Favorable: +{dif.toLocaleString()} Lts (+{pct}%)
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* TABLA DE VERIFICACIÓN DE FINCAS, LITROS Y RECIBOS */}
              <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-clipboard-check" style={{ color: '#2563eb' }}></i>
                      Verificación de Fincas y Comprobantes ({fincasVerificadasIds.size} de {fincasViajeVerificar.length} verificadas)
                    </span>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                      Verifique los litros reportados y foto del ticket/recibo de cada finca (una a una o todas):
                    </p>
                  </div>
                  {fincasViajeVerificar.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (fincasVerificadasIds.size === fincasViajeVerificar.length) {
                          setFincasVerificadasIds(new Set());
                        } else {
                          setFincasVerificadasIds(new Set(fincasViajeVerificar.map((f, idx) => Number(f.id || f.fincaId || idx))));
                        }
                      }}
                      className="btn btn-sm"
                      style={{
                        height: '30px',
                        padding: '0 12px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: fincasVerificadasIds.size === fincasViajeVerificar.length ? '#f0fdf4' : '#eff6ff',
                        color: fincasVerificadasIds.size === fincasViajeVerificar.length ? '#16a34a' : '#2563eb',
                        border: fincasVerificadasIds.size === fincasViajeVerificar.length ? '1.5px solid #86efac' : '1.5px solid #bfdbfe',
                      }}
                    >
                      <i className={fincasVerificadasIds.size === fincasViajeVerificar.length ? "fa-solid fa-square-check" : "fa-regular fa-square"}></i>
                      {fincasVerificadasIds.size === fincasViajeVerificar.length ? 'Deseleccionar Todas' : 'Verificar TODAS'}
                    </button>
                  )}
                </div>

                {cargandoFincasViaje ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Cargando fincas del ticket...
                  </div>
                ) : fincasViajeVerificar.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', background: '#ffffff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    No hay fincas individuales registradas en este ticket.
                  </div>
                ) : (
                  <div style={{ maxHeight: '210px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 2 }}>
                        <tr style={{ borderBottom: '1.5px solid #cbd5e1', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px', width: '38px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              title="Marcar / Desmarcar Todas"
                              checked={fincasViajeVerificar.length > 0 && fincasVerificadasIds.size === fincasViajeVerificar.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFincasVerificadasIds(new Set(fincasViajeVerificar.map((f, idx) => Number(f.id || f.fincaId || idx))));
                                } else {
                                  setFincasVerificadasIds(new Set());
                                }
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                          </th>
                          <th style={{ padding: '8px 10px', fontWeight: 700, color: '#475569' }}>Finca / Productor</th>
                          <th style={{ padding: '8px 10px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Litros Campo</th>
                          <th style={{ padding: '8px 10px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Tipo / Observación</th>
                          <th style={{ padding: '8px 10px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Recibo / Foto</th>
                          <th style={{ padding: '8px 10px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fincasViajeVerificar.map((f, idx) => {
                          const fid = Number(f.id || f.fincaId || idx);
                          const verificado = fincasVerificadasIds.has(fid);
                          const foto = f.fotoComprobante || f.fotoReciboUrl;
                          const lts = Number(f.litros || f.litrosLeche || 0);
                          const nomFinca = f.fincaNombre || f.nombre || `Finca #${f.fincaId || fid}`;
                          const prop = f.propietarioNombre || f.propietario || '';

                          return (
                            <tr
                              key={fid}
                              onClick={() => {
                                setFincasVerificadasIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(fid)) next.delete(fid);
                                  else next.add(fid);
                                  return next;
                                });
                              }}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: verificado ? '#f0fdf4' : idx % 2 === 0 ? '#ffffff' : '#fafafa',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s',
                              }}
                            >
                              <td style={{ padding: '8px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={verificado}
                                  onChange={(e) => {
                                    setFincasVerificadasIds((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(fid);
                                      else next.delete(fid);
                                      return next;
                                    });
                                  }}
                                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#16a34a' }}
                                />
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{nomFinca}</div>
                                {prop && <div style={{ fontSize: '10.5px', color: '#64748b' }}>{prop}</div>}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                                {lts.toLocaleString()} Lts
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: f.esAcida ? '#fee2e2' : '#f1f5f9', color: f.esAcida ? '#dc2626' : '#475569', fontWeight: 600 }}>
                                  {f.tipoLeche || 'VACA'} {f.esAcida ? '(Ácida)' : ''}
                                </span>
                                {f.observacion && (
                                  <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px auto 0' }}>
                                    {f.observacion}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                {foto ? (
                                  <button
                                    type="button"
                                    onClick={() => setModalVerFotoRecibo(foto)}
                                    className="btn btn-sm"
                                    title="Ver foto del ticket / recibo"
                                    style={{
                                      padding: '3px 8px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      borderRadius: '6px',
                                      color: '#16a34a',
                                      borderColor: '#86efac',
                                      background: '#f0fdf4',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <i className="fa-solid fa-camera"></i> Ver Foto
                                  </button>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>Sin foto</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                {verificado ? (
                                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <i className="fa-solid fa-circle-check"></i> Verificado
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px' }}>
                                    Pendiente
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SELECTOR VISUAL DE ACCIÓN */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Seleccione el proceso a realizar:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* OPCION 1: DEJAR EN RECEPTORIA */}
                  <div
                    onClick={() => setModoRecepcion('DEJAR_EN_RECEPTORIA')}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '12px',
                      padding: '14px',
                      border: modoRecepcion === 'DEJAR_EN_RECEPTORIA' ? '2.5px solid #0284c7' : '1.5px solid #e2e8f0',
                      background: modoRecepcion === 'DEJAR_EN_RECEPTORIA' ? '#eff6ff' : '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      transition: 'all 0.15s ease-in-out',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: modoRecepcion === 'DEJAR_EN_RECEPTORIA' ? '#0284c7' : '#334155' }}>
                        <i className="fa-solid fa-arrow-down-to-bracket" style={{ marginRight: '6px' }}></i>
                        Solo Descargar a Silos
                      </span>
                      <input
                        type="radio"
                        checked={modoRecepcion === 'DEJAR_EN_RECEPTORIA'}
                        onChange={() => setModoRecepcion('DEJAR_EN_RECEPTORIA')}
                        style={{ accentColor: '#0284c7', width: '16px', height: '16px' }}
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.3 }}>
                      La leche se queda almacenada en los silos de la receptoría. Cierre del viaje.
                    </p>
                  </div>

                  {/* OPCION 2: RECARGAR Y DESPACHAR */}
                  <div
                    onClick={() => {
                      setModoRecepcion('RECARGAR_Y_DESPACHAR');
                      if (destinosRecarga.length === 1 && destinosRecarga[0].litrosDespachados === 0) {
                        setDestinosRecarga([{ ...destinosRecarga[0], litrosDespachados: Number(litrosRecibidosInput) || 0 }]);
                      }
                    }}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '12px',
                      padding: '14px',
                      border: modoRecepcion === 'RECARGAR_Y_DESPACHAR' ? '2.5px solid #9333ea' : '1.5px solid #e2e8f0',
                      background: modoRecepcion === 'RECARGAR_Y_DESPACHAR' ? '#faf5ff' : '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      transition: 'all 0.15s ease-in-out',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: modoRecepcion === 'RECARGAR_Y_DESPACHAR' ? '#9333ea' : '#334155' }}>
                        <i className="fa-solid fa-truck-fast" style={{ marginRight: '6px' }}></i>
                        RECARGAR Y DESPACHAR
                      </span>
                      <input
                        type="radio"
                        checked={modoRecepcion === 'RECARGAR_Y_DESPACHAR'}
                        onChange={() => {
                          setModoRecepcion('RECARGAR_Y_DESPACHAR');
                          if (destinosRecarga.length === 1 && destinosRecarga[0].litrosDespachados === 0) {
                            setDestinosRecarga([{ ...destinosRecarga[0], litrosDespachados: Number(litrosRecibidosInput) || 0 }]);
                          }
                        }}
                        style={{ accentColor: '#9333ea', width: '16px', height: '16px' }}
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.3 }}>
                      El camión continúa a planta/compañía. Permite recargar silos y añadir multi-destinos.
                    </p>
                  </div>
                </div>
              </div>

              {/* CONTENIDO EXCLUSIVO: RECARGAR Y DESPACHAR */}
              {modoRecepcion === 'RECARGAR_Y_DESPACHAR' && (
                <div
                  style={{
                    background: '#faf5ff',
                    border: '1.5px solid #d8b4fe',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  {/* SECCIÓN 1: RECARGA DESDE SILOS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#6b21a8', marginBottom: '4px' }}>
                        <i className="fa-solid fa-gas-pump" style={{ marginRight: '4px' }}></i>
                        Litros adicionales desde Silos (Recarga)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        placeholder="0 (Si solo traslada lo de ruta)"
                        value={recargaSilosInput || ''}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          setRecargaSilosInput(val);
                          const total = (Number(litrosRecibidosInput) || 0) + val;
                          if (destinosRecarga.length === 1) {
                            setDestinosRecarga([{ ...destinosRecarga[0], litrosDespachados: total }]);
                          }
                        }}
                        style={{ height: '36px', fontSize: '14px', fontWeight: 700 }}
                      />
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '10px 14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase' }}>
                        Total Disponible en Cisterna:
                      </span>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#6b21a8' }}>
                        {((Number(litrosRecibidosInput) || 0) + (Number(recargaSilosInput) || 0)).toLocaleString()}{' '}
                        <small style={{ fontSize: '11px', color: '#9333ea' }}>Lts para despacho</small>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 2: MULTI-DESTINOS (COMPAÑÍAS / QUESERAS) */}
                  <div style={{ borderTop: '1px solid #e9d5ff', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#581c87', textTransform: 'uppercase' }}>
                        <i className="fa-solid fa-building-wheat" style={{ marginRight: '6px' }}></i>
                        Destinos del Despacho ({destinosRecarga.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDestinosRecarga([
                            ...destinosRecarga,
                            {
                              id: String(Date.now()),
                              companiaId: 0,
                              litrosDespachados: 0,
                              tipoLeche: 'VACA',
                              numeroGuiaSADA: '',
                              observacion: '',
                            },
                          ]);
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          border: 'none',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '11.5px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                        }}
                      >
                        <i className="fa-solid fa-plus"></i> + Añadir Destino
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {destinosRecarga.map((dest, idx) => (
                        <div
                          key={dest.id}
                          style={{
                            background: '#ffffff',
                            border: '1.5px solid #e9d5ff',
                            borderRadius: '10px',
                            padding: '12px 14px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', background: '#f3e8ff', padding: '2px 8px', borderRadius: '4px' }}>
                              Destino #{idx + 1}
                            </span>
                            {destinosRecarga.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setDestinosRecarga(destinosRecarga.filter((d) => d.id !== dest.id))}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                              >
                                <i className="fa-solid fa-trash-can"></i> Quitar
                              </button>
                            )}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', alignItems: 'end' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                Planta / Compañía *
                              </label>
                              <CompaniaSelect
                                value={dest.companiaId || undefined}
                                onChange={(val) => {
                                  const updated = destinosRecarga.map((d) => (d.id === dest.id ? { ...d, companiaId: val || 0 } : d));
                                  setDestinosRecarga(updated);
                                }}
                                placeholder="-- Seleccionar Planta --"
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                Litros a Despachar *
                              </label>
                              <input
                                type="number"
                                className="form-input"
                                required
                                placeholder="Litros"
                                value={dest.litrosDespachados || ''}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  const updated = destinosRecarga.map((d) => (d.id === dest.id ? { ...d, litrosDespachados: val } : d));
                                  setDestinosRecarga(updated);
                                }}
                                style={{ height: '36px', fontSize: '13px', fontWeight: 700 }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                Tipo de Leche
                              </label>
                              <TipoLecheSelect
                                value={dest.tipoLeche}
                                onChange={(val) => {
                                  const updated = destinosRecarga.map((d) => (d.id === dest.id ? { ...d, tipoLeche: val } : d));
                                  setDestinosRecarga(updated);
                                }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                Guía SADA
                              </label>
                              <input
                                type="text"
                                className="form-input"
                                placeholder="N° Guía SADA"
                                value={dest.numeroGuiaSADA}
                                onChange={(e) => {
                                  const updated = destinosRecarga.map((d) => (d.id === dest.id ? { ...d, numeroGuiaSADA: e.target.value } : d));
                                  setDestinosRecarga(updated);
                                }}
                                style={{ height: '36px', fontSize: '12px' }}
                              />
                            </div>
                          </div>

                          <div style={{ marginTop: '8px' }}>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Observación del destino (opcional)"
                              value={dest.observacion}
                              onChange={(e) => {
                                const updated = destinosRecarga.map((d) => (d.id === dest.id ? { ...d, observacion: e.target.value } : d));
                                setDestinosRecarga(updated);
                              }}
                              style={{ height: '32px', fontSize: '12px' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* BALANCE DE DESTINOS VS TOTAL CISTERNA */}
                    {(() => {
                      const totalCisterna = (Number(litrosRecibidosInput) || 0) + (Number(recargaSilosInput) || 0);
                      const sumaDest = destinosRecarga.reduce((acc, d) => acc + (Number(d.litrosDespachados) || 0), 0);
                      const difDest = totalCisterna - sumaDest;
                      return (
                        <div
                          style={{
                            marginTop: '10px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: difDest === 0 ? '#ecfdf5' : '#fffbeb',
                            border: `1px solid ${difDest === 0 ? '#a7f3d0' : '#fde68a'}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          <span style={{ color: difDest === 0 ? '#065f46' : '#92400e' }}>
                            {difDest === 0 ? (
                              <>
                                <i className="fa-solid fa-circle-check" style={{ marginRight: '6px' }}></i>
                                Cuadre exacto: {sumaDest.toLocaleString()} Lts asignados a los destinos
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '6px' }}></i>
                                Asignados {sumaDest.toLocaleString()} Lts de {totalCisterna.toLocaleString()} Lts en cisterna (Dif: {difDest > 0 ? `+${difDest}` : difDest} Lts)
                              </>
                            )}
                          </span>
                          <span style={{ color: '#6b21a8' }}>Total Cisterna: {totalCisterna.toLocaleString()} Lts</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* OBSERVACIÓN GENERAL */}
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Observaciones Generales de la Recepción:
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Detalles sobre temperatura, acidez, condiciones de la leche, etc."
                  value={obsRecepcionInput}
                  onChange={(e) => setObsRecepcionInput(e.target.value)}
                  style={{ fontSize: '12.5px', resize: 'vertical' }}
                />
              </div>
            </div>

            {/* BOTONES DEL MODAL */}
            <div
              style={{
                padding: '14px 22px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalVerificarViaje(false)}
                style={{ height: '38px', padding: '0 16px', fontWeight: 600 }}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn btn-primary"
                disabled={recibirViajeMutation.isPending || (Number(litrosRecibidosInput) <= 0)}
                onClick={() => recibirViajeMutation.mutate()}
                style={{
                  height: '38px',
                  padding: '0 20px',
                  fontWeight: 800,
                  fontSize: '13px',
                  background: modoRecepcion === 'RECARGAR_Y_DESPACHAR' ? 'linear-gradient(135deg, #9333ea, #7e22ce)' : '#0284c7',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: modoRecepcion === 'RECARGAR_Y_DESPACHAR' ? '0 4px 12px rgba(147, 51, 234, 0.3)' : '0 4px 12px rgba(2, 132, 199, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                {recibirViajeMutation.isPending ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i> Procesando...
                  </>
                ) : modoRecepcion === 'RECARGAR_Y_DESPACHAR' ? (
                  <>
                    <i className="fa-solid fa-paper-plane"></i> Confirmar Recarga y Despacho a Compañía
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-arrow-down-to-bracket"></i> Confirmar Descarga en Silos
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
