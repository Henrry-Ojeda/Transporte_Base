import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mantenimientoApi } from '@/api/mantenimiento.api';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import Swal from 'sweetalert2';
import type {
  MantenimientoCamionDto,
  CrearMantenimientoCamionDto,
  AlertaPreventivaDto,
  CamionDto,
} from '@/types';

export const MantenimientoPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = useModulePermissions('HISTORIAL_CAMIONES');

  const [activeTab, setActiveTab] = useState<'tareas_mecanico' | 'tareas_completadas' | 'mantenimientos' | 'alertas'>('tareas_mecanico');
  const [modalNuevaTarea, setModalNuevaTarea] = useState(false);
  const [formNuevaTarea, setFormNuevaTarea] = useState({
    camionId: '',
    urgencia: 'ALTA',
    titulo: '',
    descripcion: '',
    odometroKm: '',
  });
  const [filtroCamion, setFiltroCamion] = useState<string>('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');

  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);

  const initialForm: CrearMantenimientoCamionDto = {
    camionId: 0,
    tipoEvento: 'PREVENTIVO',
    titulo: '',
    descripcion: '',
    fechaEvento: new Date().toISOString().split('T')[0],
    odometroKm: undefined,
    proximoKmSugerido: undefined,
    proximaFechaSugerida: undefined,
    tallerOMecanico: '',
    estado: 'RESUELTO',
    costoTotalUSD: 0,
  };
  const [form, setForm] = useState<CrearMantenimientoCamionDto>(initialForm);

  // Queries
  const { data: mantenimientos = [], isLoading: loadingMants, refetch: refetchMants } = useQuery<MantenimientoCamionDto[]>({
    queryKey: ['mantenimientos', filtroCamion, filtroTipo, filtroEstado],
    queryFn: () =>
      mantenimientoApi.getMantenimientos(
        filtroCamion ? Number(filtroCamion) : undefined,
        filtroTipo || undefined,
        filtroEstado || undefined
      ),
  });

  const { data: incidentes = [], isLoading: loadingIncidentes, refetch: refetchIncidentes } = useQuery<MantenimientoCamionDto[]>({
    queryKey: ['mantenimientos-incidentes'],
    queryFn: () => mantenimientoApi.getIncidentes(),
  });

  const { data: alertas = [], isLoading: loadingAlertas } = useQuery<AlertaPreventivaDto[]>({
    queryKey: ['mantenimientos-alertas'],
    queryFn: () => mantenimientoApi.getAlertas(),
  });

  const { data: camiones = [] } = useQuery<CamionDto[]>({
    queryKey: ['camiones-mantenimiento'],
    queryFn: () => catalogosApi.getCamiones(false),
  });

  const camionOptions: SelectOption[] = useMemo(
    () =>
      camiones.map((c) => ({
        value: c.id,
        label: `${c.placa} - ${c.marca || 'Cisterna'} ${c.modelo || ''}`.trim(),
        subLabel: `Chofer: ${c.choferNombre || 'Sin chofer'} | Estado: ${c.estado || 'ACTIVO'}`,
        badge: (c.estado || '').toUpperCase() === 'MANTENIMIENTO' ? 'TALLER' : undefined,
      })),
    [camiones]
  );

  const tipoEventoOptions: SelectOption[] = [
    { value: 'CAMBIO_ACEITE', label: 'Cambio de Aceite / Filtros' },
    { value: 'CAUCHOS', label: 'Cambio / Rotación de Cauchos' },
    { value: 'PREVENTIVO', label: 'Mantenimiento Preventivo General' },
    { value: 'CORRECTIVO', label: 'Reparación Correctiva' },
    { value: 'SINIESTRO_CHOFER', label: 'Siniestro / Incidente Chofer' },
    { value: 'INCIDENTE', label: 'Incidente Reportado' },
  ];

  const estadoOptions: SelectOption[] = [
    { value: 'RESUELTO', label: 'Resuelto / Listo para rodar' },
    { value: 'EN_TALLER', label: 'En Taller / En proceso de reparación' },
    { value: 'PENDIENTE', label: 'Pendiente / Reportado' },
    { value: 'REPORTADO_CHOFER', label: 'Reportado por Chofer' },
  ];

  // Mutación: Crear Nueva Tarea / Notificar al Mecánico (Admin -> Taller)
  const mutationReportarTarea = useMutation({
    mutationFn: (dto: { camionId: number; titulo: string; descripcion: string; urgencia: string; odometroKm?: number }) =>
      mantenimientoApi.reportarIncidente(dto),
    onSuccess: (data) => {
      toast.success(data?.message || 'Tarea enviada al mecánico / taller exitosamente');
      setModalNuevaTarea(false);
      setFormNuevaTarea({ camionId: '', urgencia: 'ALTA', titulo: '', descripcion: '', odometroKm: '' });
      queryClient.invalidateQueries({ queryKey: ['mantenimientos-incidentes'] });
      queryClient.invalidateQueries({ queryKey: ['mantenimientos'] });
      queryClient.invalidateQueries({ queryKey: ['camiones-mant'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Error al notificar la tarea al mecánico');
    },
  });

  // Mutación: Cambiar Estado de Incidente (Taller <-> Chofer)
  const mutationCambiarEstadoIncidente = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { estado: string; tallerOMecanico?: string; costoTotalUSD?: number; solucionAplicada?: string } }) =>
      mantenimientoApi.actualizarEstadoIncidente(id, dto),
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Estado del incidente actualizado correctamente');
      queryClient.invalidateQueries({ queryKey: ['mantenimientos-incidentes'] });
      queryClient.invalidateQueries({ queryKey: ['mantenimientos'] });
      queryClient.invalidateQueries({ queryKey: ['camiones'] });
      queryClient.invalidateQueries({ queryKey: ['camiones-catalogos'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar el estado del incidente');
    },
  });

  // Mutaciones
  const mutationGuardar = useMutation({
    mutationFn: (dto: CrearMantenimientoCamionDto) =>
      modoEdicionId ? mantenimientoApi.actualizar(modoEdicionId, dto) : mantenimientoApi.crear(dto),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Mantenimiento registrado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['mantenimientos'] });
      queryClient.invalidateQueries({ queryKey: ['mantenimientos-alertas'] });
      queryClient.invalidateQueries({ queryKey: ['mantenimientos-incidentes'] });
      queryClient.invalidateQueries({ queryKey: ['camiones'] });
      queryClient.invalidateQueries({ queryKey: ['camiones-catalogos'] });
      queryClient.invalidateQueries({ queryKey: ['camiones-mantenimiento'] });
      cerrarModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar mantenimiento');
    },
  });

  const mutationEliminar = useMutation({
    mutationFn: (id: number) => mantenimientoApi.eliminar(id),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Registro de mantenimiento eliminado');
      queryClient.invalidateQueries({ queryKey: ['mantenimientos'] });
      queryClient.invalidateQueries({ queryKey: ['mantenimientos-alertas'] });
      queryClient.invalidateQueries({ queryKey: ['mantenimientos-incidentes'] });
      queryClient.invalidateQueries({ queryKey: ['camiones'] });
      queryClient.invalidateQueries({ queryKey: ['camiones-catalogos'] });
      queryClient.invalidateQueries({ queryKey: ['camiones-mantenimiento'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al eliminar mantenimiento');
    },
  });

  const abrirModalCrear = () => {
    setModoEdicionId(null);
    setForm(initialForm);
    setModalAbierto(true);
  };

  const abrirModalEditar = (item: MantenimientoCamionDto) => {
    setModoEdicionId(item.id);
    setForm({
      camionId: item.camionId,
      tipoEvento: item.tipoEvento,
      titulo: item.titulo,
      descripcion: item.descripcion || '',
      fechaEvento: item.fechaEvento ? item.fechaEvento.split('T')[0] : new Date().toISOString().split('T')[0],
      odometroKm: item.odometroKm,
      proximoKmSugerido: item.proximoKmSugerido,
      proximaFechaSugerida: item.proximaFechaSugerida ? item.proximaFechaSugerida.split('T')[0] : undefined,
      tallerOMecanico: item.tallerOMecanico || '',
      estado: item.estado,
      costoTotalUSD: item.costoTotalUSD || 0,
    });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setModoEdicionId(null);
  };

  // Métricas
  const totalEnTaller = mantenimientos.filter((m) => m.estado === 'EN_TALLER').length;
  const totalReportados = mantenimientos.filter((m) => m.estado === 'REPORTADO_CHOFER' || m.estado === 'PENDIENTE').length;
  const totalAlertasCriticas = alertas.filter(
    (a) => a.proximoKmSugerido != null && a.odometroActualKm >= a.proximoKmSugerido
  ).length;
  const costoTotalUSD = mantenimientos.reduce((acc, m) => acc + (m.costoTotalUSD || 0), 0);

  const columns: ColumnDef<MantenimientoCamionDto>[] = [
    {
      header: 'FECHA',
      accessorKey: 'fechaEvento',
      sortable: true,
      width: '105px',
      cell: (row) => (
        <strong style={{ color: '#0f172a', fontSize: '13px', fontWeight: 700 }}>
          {row.fechaEvento ? row.fechaEvento.split('T')[0] : '-'}
        </strong>
      ),
    },
    {
      header: 'CAMIÓN',
      accessorKey: 'camionPlaca',
      sortable: true,
      width: '130px',
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-truck" style={{ color: '#2563eb' }}></i>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.camionPlaca || `ID #${row.camionId}`}</div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{row.choferNombre || 'Chofer'}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'TIPO SERVICIO',
      accessorKey: 'tipoEvento',
      sortable: true,
      width: '150px',
      cell: (row) => {
        const tipos: Record<string, { label: string; bg: string; color: string; border: string; icon: string }> = {
          CAMBIO_ACEITE: { label: 'Cambio de Aceite', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: 'fa-oil-can' },
          CAUCHOS: { label: 'Cauchos / Neumáticos', bg: '#fdf4ff', color: '#a21caf', border: '#f0abfc', icon: 'fa-circle-dot' },
          PREVENTIVO: { label: 'Preventivo', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: 'fa-wrench' },
          CORRECTIVO: { label: 'Correctivo', bg: '#fffbeb', color: '#b45309', border: '#fde68a', icon: 'fa-triangle-exclamation' },
          SINIESTRO_CHOFER: { label: 'Siniestro / Incidente', bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: 'fa-car-burst' },
        };
        const t = tipos[row.tipoEvento] || { label: row.tipoEvento, bg: '#f8fafc', color: '#475569', border: '#cbd5e1', icon: 'fa-wrench' };
        return (
          <span
            className="badge"
            style={{
              background: t.bg,
              color: t.color,
              border: `1px solid ${t.border}`,
              fontWeight: 800,
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <i className={`fa-solid ${t.icon}`}></i> {t.label}
          </span>
        );
      },
    },
    {
      header: 'DESCRIPCIÓN DEL EVENTO',
      accessorKey: 'titulo',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.titulo}</div>
          {row.descripcion && (
            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
              {row.descripcion}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'KM / PRÓXIMO',
      accessorKey: 'odometroKm',
      width: '130px',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
            {row.odometroKm != null ? `${row.odometroKm.toLocaleString()} Km` : '-'}
          </div>
          {row.proximoKmSugerido && (
            <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>
              Próx: {row.proximoKmSugerido.toLocaleString()} Km
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'TALLER / MECÁNICO',
      accessorKey: 'tallerOMecanico',
      cell: (row) => (
        <span style={{ fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>
          {row.tallerOMecanico || 'Taller Interno Base'}
        </span>
      ),
    },
    {
      header: 'COSTO (USD)',
      accessorKey: 'costoTotalUSD',
      sortable: true,
      width: '115px',
      cell: (row) => (
        <span style={{ fontWeight: 900, color: '#059669', fontFamily: 'monospace', fontSize: '13.5px' }}>
          ${Number(row.costoTotalUSD || 0).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'ESTADO',
      accessorKey: 'estado',
      sortable: true,
      width: '120px',
      cell: (row) => {
        const esResuelto = row.estado === 'RESUELTO';
        const esTaller = row.estado === 'EN_TALLER';
        return (
          <span
            className="badge"
            style={{
              background: esResuelto ? '#ecfdf5' : esTaller ? '#fef3c7' : '#fef2f2',
              color: esResuelto ? '#059669' : esTaller ? '#d97706' : '#dc2626',
              border: `1px solid ${esResuelto ? '#a7f3d0' : esTaller ? '#fde68a' : '#fecaca'}`,
              fontWeight: 800,
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <i className={`fa-solid ${esResuelto ? 'fa-check' : esTaller ? 'fa-screwdriver-wrench' : 'fa-clock'}`}></i>
            {esResuelto ? 'Resuelto' : esTaller ? 'En Taller' : 'Pendiente'}
          </span>
        );
      },
    },
    {
      header: 'ACCIONES',
      width: '90px',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          {canEdit && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => abrirModalEditar(row)}
              title="Editar servicio"
              style={{ height: '30px', width: '30px', padding: 0, borderRadius: '6px' }}
            >
              <i className="fa-solid fa-pen-to-square" style={{ fontSize: '11px' }}></i>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={async () => {
                if (await confirmDeleteOrDeactivate('Eliminar registro de mantenimiento', `#${row.id}`)) {
                  mutationEliminar.mutate(row.id);
                }
              }}
              title="Eliminar"
              style={{ height: '30px', width: '30px', padding: 0, borderRadius: '6px', color: '#ef4444', borderColor: '#fca5a5' }}
            >
              <i className="fa-solid fa-trash-can" style={{ fontSize: '11px' }}></i>
            </button>
          )}
        </div>
      ),
    },
  ];

  const columnsIncidentes: ColumnDef<MantenimientoCamionDto>[] = [
    {
      header: 'FECHA REPORTE',
      accessorKey: 'fechaEvento',
      sortable: true,
      width: '115px',
      cell: (row) => (
        <strong style={{ color: '#0f172a', fontSize: '12.5px', fontWeight: 700 }}>
          {row.fechaEvento ? row.fechaEvento.split('T')[0] : '-'}
        </strong>
      ),
    },
    {
      header: 'CAMIÓN & CHOFER',
      accessorKey: 'camionPlaca',
      sortable: true,
      width: '160px',
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-truck" style={{ color: '#2563eb' }}></i>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
              {row.camionPlaca || `Camión #${row.camionId}`}
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {row.choferNombre || 'Chofer asignado'}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'URGENCIA',
      accessorKey: 'urgencia',
      sortable: true,
      width: '110px',
      cell: (row) => {
        const urg = (row.urgencia || 'MEDIA').toUpperCase();
        if (urg === 'ALTA' || urg === 'CRITICA') {
          return (
            <span
              className="badge"
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1.5px solid #fecaca',
                fontWeight: 800,
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <i className="fa-solid fa-fire text-red-500"></i> ALTA
            </span>
          );
        }
        if (urg === 'BAJA') {
          return (
            <span
              className="badge"
              style={{
                background: '#f8fafc',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              BAJA
            </span>
          );
        }
        return (
          <span
            className="badge"
            style={{
              background: '#fffbeb',
              color: '#d97706',
              border: '1px solid #fde68a',
              fontWeight: 800,
              fontSize: '11px',
            }}
          >
            MEDIA
          </span>
        );
      },
    },
    {
      header: 'AVERÍA / TAREA REPORTADA',
      accessorKey: 'titulo',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>{row.titulo}</div>
          {row.descripcion && (
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px', lineHeight: 1.35 }}>
              {row.descripcion}
            </div>
          )}
          {row.solucionAplicada && (
            <div style={{ fontSize: '11.5px', color: '#059669', marginTop: '4px', fontWeight: 600 }}>
              <i className="fa-solid fa-wrench" style={{ marginRight: '4px' }}></i>
              Solución: {row.solucionAplicada}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'ESTADO TALLER',
      accessorKey: 'estado',
      sortable: true,
      width: '140px',
      cell: (row) => {
        const est = (row.estado || '').toUpperCase();
        if (est === 'EN_TALLER') {
          return (
            <span
              className="badge"
              style={{
                background: '#fffbeb',
                color: '#b45309',
                border: '1.5px solid #fde68a',
                fontWeight: 800,
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <i className="fa-solid fa-wrench"></i> EN TALLER
            </span>
          );
        }
        if (est === 'RESUELTO') {
          return (
            <span
              className="badge"
              style={{
                background: '#ecfdf5',
                color: '#059669',
                border: '1.5px solid #a7f3d0',
                fontWeight: 800,
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <i className="fa-solid fa-circle-check"></i> RESUELTO
            </span>
          );
        }
        return (
          <span
            className="badge"
            style={{
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1.5px solid #fecaca',
              fontWeight: 800,
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <i className="fa-solid fa-bell"></i> REPORTADO
          </span>
        );
      },
    },
    {
      header: 'ACCIONES MECÁNICO',
      width: '180px',
      cell: (row) => {
        const est = (row.estado || '').toUpperCase();
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {est !== 'EN_TALLER' && est !== 'RESUELTO' && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  Swal.fire({
                    title: '¿Ingresar camión a Taller?',
                    text: `El camión ${row.camionPlaca} pasará a estado MANTENIMIENTO y no estará disponible para planificaciones de ruta.`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, ingresar a Taller',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#d97706',
                  }).then((res) => {
                    if (res.isConfirmed) {
                      mutationCambiarEstadoIncidente.mutate({
                        id: row.id,
                        dto: { estado: 'EN_TALLER', tallerOMecanico: 'Taller Central' },
                      });
                    }
                  });
                }}
                style={{
                  height: '30px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#b45309',
                  borderColor: '#fde68a',
                  background: '#fffbeb',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Pasa el camión a mantenimiento y lo inhabilita en rutas"
              >
                <i className="fa-solid fa-wrench"></i> A Taller
              </button>
            )}

            {est !== 'RESUELTO' && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  Swal.fire({
                    title: 'Completar Reparación',
                    html: `
                      <div style="text-align: left; font-size: 13px;">
                        <label style="font-weight: 700; display: block; margin-bottom: 4px;">Solución / Tareas Realizadas:</label>
                        <textarea id="swal-solucion" class="swal2-textarea" placeholder="Ej: Cambio de aceite y filtro 15W40, ajuste de frenos..." style="width: 100%; margin: 0 0 10px 0; height: 70px;"></textarea>
                        <label style="font-weight: 700; display: block; margin-bottom: 4px;">Costo Total Invertido (USD):</label>
                        <input id="swal-costo" type="number" step="0.01" class="swal2-input" placeholder="0.00" style="width: 100%; margin: 0;" />
                      </div>
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: '✅ Reparado (Habilitar Camión)',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#059669',
                    preConfirm: () => {
                      const sol = (document.getElementById('swal-solucion') as HTMLTextAreaElement)?.value || '';
                      const costo = parseFloat((document.getElementById('swal-costo') as HTMLInputElement)?.value || '0');
                      return { solucionAplicada: sol, costoTotalUSD: isNaN(costo) ? 0 : costo };
                    },
                  }).then((res) => {
                    if (res.isConfirmed && res.value) {
                      mutationCambiarEstadoIncidente.mutate({
                        id: row.id,
                        dto: {
                          estado: 'RESUELTO',
                          solucionAplicada: res.value.solucionAplicada,
                          costoTotalUSD: res.value.costoTotalUSD,
                        },
                      });
                    }
                  });
                }}
                style={{
                  height: '30px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#059669',
                  borderColor: '#a7f3d0',
                  background: '#ecfdf5',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Marca como resuelto y devuelve el camión a estado ACTIVO"
              >
                <i className="fa-solid fa-check"></i> Listo
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const urgenciaPeso = (u?: string) => {
    const up = (u || 'MEDIA').toUpperCase();
    if (up === 'CRITICA') return 4;
    if (up === 'ALTA') return 3;
    if (up === 'MEDIA') return 2;
    return 1;
  };

  const tareasPendientesMecanico = useMemo(
    () =>
      [...incidentes]
        .filter((i) => {
          const est = (i.estado || '').toUpperCase();
          return est !== 'RESUELTO' && est !== 'COMPLETADO';
        })
        .sort((a, b) => urgenciaPeso(b.urgencia) - urgenciaPeso(a.urgencia)),
    [incidentes]
  );

  const tareasCompletadasMecanico = useMemo(
    () =>
      incidentes.filter((i) => {
        const est = (i.estado || '').toUpperCase();
        return est === 'RESUELTO' || est === 'COMPLETADO';
      }),
    [incidentes]
  );

  const columnsCompletadas: ColumnDef<MantenimientoCamionDto>[] = [
    {
      header: 'FECHA',
      accessorKey: 'fechaEvento',
      sortable: true,
      width: '110px',
      cell: (row) => (
        <strong style={{ color: '#0f172a', fontSize: '12.5px' }}>
          {row.fechaEvento ? row.fechaEvento.split('T')[0] : '-'}
        </strong>
      ),
    },
    {
      header: 'CAMIÓN',
      accessorKey: 'camionPlaca',
      sortable: true,
      width: '150px',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
            {row.camionPlaca || `Camión #${row.camionId}`}
          </div>
          <span style={{ fontSize: '11px', color: '#64748b' }}>{row.choferNombre || 'Flota'}</span>
        </div>
      ),
    },
    {
      header: 'TAREA & SOLUCIÓN APLICADA',
      accessorKey: 'titulo',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>{row.titulo}</div>
          {row.descripcion && (
            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>{row.descripcion}</div>
          )}
          <div style={{ fontSize: '12px', color: '#059669', fontWeight: 700, marginTop: '4px' }}>
            <i className="fa-solid fa-circle-check" style={{ marginRight: '5px' }}></i>
            Solución: {row.solucionAplicada || 'Reparación completada'}
          </div>
        </div>
      ),
    },
    {
      header: 'MECÁNICO / TALLER',
      accessorKey: 'tallerOMecanico',
      sortable: true,
      width: '150px',
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#334155', fontSize: '12.5px' }}>
          {row.tallerOMecanico || 'Taller Interno'}
        </span>
      ),
    },
    {
      header: 'COSTO (USD)',
      accessorKey: 'costoTotalUSD',
      sortable: true,
      width: '110px',
      cell: (row) => (
        <strong style={{ color: '#0f172a', fontSize: '13px' }}>
          ${Number(row.costoTotalUSD || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </strong>
      ),
    },
  ];

  return (
    <section id="tab-historial-camiones" className="tab-content" style={{ display: 'block' }}>
      {/* CABECERA VISTA */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <i className="fa-solid fa-truck-wrench" style={{ color: '#2563eb', marginRight: '10px' }}></i>
            Historial de Mantenimiento y Flota
          </h1>
          <p className="view-subtitle">
            Control preventivo de servicios mecánicos, cambios de aceite, reemplazo de cauchos y alertas por kilometraje
          </p>
        </div>
        <div className="view-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              refetchMants();
              queryClient.invalidateQueries({ queryKey: ['mantenimientos-alertas'] });
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <i className="fa-solid fa-arrows-rotate"></i> Actualizar
          </button>
          {canCreate && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setModalNuevaTarea(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', borderColor: '#dc2626', color: '#dc2626', fontWeight: 700 }}
            >
              <i className="fa-solid fa-bell"></i> Notificar Tarea al Mecánico
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={abrirModalCrear}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', borderColor: '#2563eb' }}
            >
              <i className="fa-solid fa-plus"></i> Registrar Mantenimiento
            </button>
          )}
        </div>
      </div>

      {/* TARJETAS DE INDICADORES (KPIS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div className="kpi-card glass-amber">
          <div className="kpi-icon-wrap">
            <i className="fa-solid fa-wrench"></i>
          </div>
          <div className="kpi-content">
            <span className="kpi-title">En Taller / Activos</span>
            <div className="kpi-value">{totalEnTaller}</div>
            <span className="kpi-foot">{totalReportados} averías reportadas</span>
          </div>
        </div>

        <div className="kpi-card glass-red">
          <div className="kpi-icon-wrap">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Alertas Preventivas</span>
            <div className="kpi-value">{alertas.length}</div>
            <span className="kpi-foot" style={{ color: '#dc2626', fontWeight: 700 }}>
              {totalAlertasCriticas} críticas próximas
            </span>
          </div>
        </div>

        <div className="kpi-card glass-emerald">
          <div className="kpi-icon-wrap">
            <i className="fa-solid fa-dollar-sign"></i>
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Costo Invertido (USD)</span>
            <div className="kpi-value">${costoTotalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <span className="kpi-foot">{mantenimientos.length} eventos registrados</span>
          </div>
        </div>

        <div className="kpi-card glass-blue">
          <div className="kpi-icon-wrap">
            <i className="fa-solid fa-truck"></i>
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Camiones Operativos</span>
            <div className="kpi-value">{camiones.length}</div>
            <span className="kpi-foot">Flota bajo monitoreo</span>
          </div>
        </div>
      </div>

      {/* SUB-PESTAÑAS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '2px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('tareas_mecanico')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'tareas_mecanico' ? '3px solid #dc2626' : 'none',
            background: 'transparent',
            fontWeight: 800,
            fontSize: '13.5px',
            color: activeTab === 'tareas_mecanico' ? '#dc2626' : '#64748b',
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-wrench" style={{ color: '#dc2626' }}></i>
          Tareas del Mecánico ({tareasPendientesMecanico.length})
          {tareasPendientesMecanico.length > 0 && (
            <span
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '10.5px',
                fontWeight: 900,
              }}
            >
              {tareasPendientesMecanico.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tareas_completadas')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'tareas_completadas' ? '3px solid #059669' : 'none',
            background: 'transparent',
            fontWeight: 800,
            fontSize: '13.5px',
            color: activeTab === 'tareas_completadas' ? '#059669' : '#64748b',
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-circle-check" style={{ color: '#059669' }}></i>
          Tareas Completadas ({tareasCompletadasMecanico.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('mantenimientos')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'mantenimientos' ? '3px solid #2563eb' : 'none',
            background: 'transparent',
            fontWeight: 800,
            fontSize: '13.5px',
            color: activeTab === 'mantenimientos' ? '#2563eb' : '#64748b',
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-clipboard-list"></i> Bitácora General ({mantenimientos.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('alertas')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'alertas' ? '3px solid #f59e0b' : 'none',
            background: 'transparent',
            fontWeight: 800,
            fontSize: '13.5px',
            color: activeTab === 'alertas' ? '#d97706' : '#64748b',
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f59e0b' }}></i> Alertas Preventivas ({alertas.length})
        </button>
      </div>

      {activeTab === 'tareas_mecanico' ? (
        <DataTable
          data={tareasPendientesMecanico}
          columns={columnsIncidentes}
          isLoading={loadingIncidentes}
          searchPlaceholder="Buscar tarea pendiente del mecánico por camión, chofer o avería..."
          exportFileName="tareas_pendientes_mecanico"
        />
      ) : activeTab === 'tareas_completadas' ? (
        <DataTable
          data={tareasCompletadasMecanico}
          columns={columnsCompletadas}
          isLoading={loadingIncidentes}
          searchPlaceholder="Buscar tarea completada por camión, mecánico o solución aplicada..."
          exportFileName="historial_tareas_completadas_taller"
        />
      ) : activeTab === 'mantenimientos' ? (
        /* TABLA PRINCIPAL DE MANTENIMIENTOS */
        <DataTable
          data={mantenimientos}
          columns={columns}
          isLoading={loadingMants}
          searchPlaceholder="Buscar por placa, título de servicio, taller..."
          exportFileName="mantenimiento_flota"
          searchFilter={(row, term) =>
            Boolean(
              (row.camionPlaca && row.camionPlaca.toLowerCase().includes(term)) ||
              (row.titulo && row.titulo.toLowerCase().includes(term)) ||
              (row.tallerOMecanico && row.tallerOMecanico.toLowerCase().includes(term)) ||
              (row.tipoEvento && row.tipoEvento.toLowerCase().includes(term))
            )
          }
          actions={
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '210px' }}>
                <SearchableSelect
                  options={[{ value: '', label: '-- Todos los Camiones --' }, ...camionOptions]}
                  value={filtroCamion}
                  onChange={(val) => setFiltroCamion(String(val || ''))}
                  placeholder="-- Todos los Camiones --"
                  allowClear={true}
                />
              </div>

              <div style={{ minWidth: '190px' }}>
                <SearchableSelect
                  options={[{ value: '', label: '-- Todos los Eventos --' }, ...tipoEventoOptions]}
                  value={filtroTipo}
                  onChange={(val) => setFiltroTipo(String(val || ''))}
                  placeholder="-- Todos los Eventos --"
                  allowClear={true}
                />
              </div>

              <div style={{ minWidth: '185px' }}>
                <SearchableSelect
                  options={[{ value: '', label: '-- Todos los Estados --' }, ...estadoOptions]}
                  value={filtroEstado}
                  onChange={(val) => setFiltroEstado(String(val || ''))}
                  placeholder="-- Todos los Estados --"
                  allowClear={true}
                />
              </div>
            </div>
          }
        />
      ) : (
        /* PANEL DE ALERTAS PREVENTIVAS POR CAMIÓN */
        <div style={{ marginBottom: '24px' }}>
          {loadingAlertas ? (
            <div className="content-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '20px', marginRight: '8px' }}></i>
              Evaluando odómetros y alertas de servicio...
            </div>
          ) : alertas.length === 0 ? (
            <div className="content-card" style={{ padding: '36px', textAlign: 'center', color: '#059669' }}>
              <i className="fa-solid fa-circle-check" style={{ fontSize: '32px', marginBottom: '8px', display: 'block' }}></i>
              <strong style={{ fontSize: '15px' }}>Flota al día</strong>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                Todos los camiones se encuentran dentro de los rangos de kilometraje permitidos.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {alertas.map((a, idx) => {
                const esCritica = a.proximoKmSugerido != null && a.odometroActualKm >= a.proximoKmSugerido;
                return (
                  <div
                    key={idx}
                    className="content-card"
                    style={{
                      borderLeft: `5px solid ${esCritica ? '#ef4444' : '#f59e0b'}`,
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '14.5px' }}>
                        <i className="fa-solid fa-truck" style={{ color: '#2563eb', marginRight: '6px' }}></i>
                        {a.placa} ({a.marcaModelo})
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: esCritica ? '#fef2f2' : '#fffbeb',
                          color: esCritica ? '#dc2626' : '#b45309',
                          border: `1px solid ${esCritica ? '#fecaca' : '#fde68a'}`,
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        {esCritica ? 'CRÍTICA' : 'PRÓXIMA'}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#334155', fontSize: '13px', marginBottom: '4px' }}>
                      {a.titulo || a.tipoEvento || 'Servicio Mecánico'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                      Odómetro: <strong>{a.odometroActualKm?.toLocaleString()} Km</strong> | Límite: <strong>{a.proximoKmSugerido?.toLocaleString()} Km</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setModoEdicionId(null);
                          setForm({
                            ...initialForm,
                            camionId: a.camionId,
                            titulo: `Servicio preventivo: ${a.titulo || a.tipoEvento}`,
                            odometroKm: a.odometroActualKm,
                          });
                          setModalAbierto(true);
                        }}
                        style={{ fontSize: '12px', padding: '4px 12px' }}
                      >
                        <i className="fa-solid fa-wrench"></i> Programar Taller
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL REGISTRAR / EDITAR MANTENIMIENTO */}
      {modalAbierto && (
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
              maxWidth: '580px',
              background: '#ffffff',
              borderRadius: '16px',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-wrench"></i>
                {modoEdicionId ? 'Editar Evento de Mantenimiento' : 'Registrar Mantenimiento'}
              </h3>
              <button
                type="button"
                onClick={cerrarModal}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '16px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (form.camionId === 0 || !form.titulo.trim()) {
                  toast.error('Complete el camión y título del evento');
                  return;
                }
                mutationGuardar.mutate(form);
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Camión Cisterna *
                  </label>
                  <SearchableSelect
                    options={camionOptions}
                    value={form.camionId || ''}
                    onChange={(val) => setForm({ ...form, camionId: Number(val) || 0 })}
                    placeholder="-- Seleccionar Camión Cisterna --"
                    allowClear={false}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Tipo de Evento *
                  </label>
                  <SearchableSelect
                    options={tipoEventoOptions}
                    value={form.tipoEvento}
                    onChange={(val) => setForm({ ...form, tipoEvento: String(val || 'PREVENTIVO') })}
                    allowClear={false}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Título del Servicio *
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ej: Cambio de aceite 15W40 y filtros de diésel"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  style={{ height: '38px', fontWeight: 600 }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Descripción / Detalles Técnicos
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Detalles del trabajo realizado, repuestos usados, etc."
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  style={{ height: '38px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Fecha del Evento *
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    required
                    value={form.fechaEvento}
                    onChange={(e) => setForm({ ...form, fechaEvento: e.target.value })}
                    style={{ height: '38px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Odómetro Actual (Km)
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Ej: 145000"
                    value={form.odometroKm || ''}
                    onChange={(e) => setForm({ ...form, odometroKm: e.target.value ? Number(e.target.value) : undefined })}
                    style={{ height: '38px', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Próximo Servicio (Km)
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Ej: 155000"
                    value={form.proximoKmSugerido || ''}
                    onChange={(e) => setForm({ ...form, proximoKmSugerido: e.target.value ? Number(e.target.value) : undefined })}
                    style={{ height: '38px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Próxima Fecha Sugerida
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.proximaFechaSugerida || ''}
                    onChange={(e) => setForm({ ...form, proximaFechaSugerida: e.target.value || undefined })}
                    style={{ height: '38px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Taller / Mecánico
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Taller Central El Vigía"
                    value={form.tallerOMecanico || ''}
                    onChange={(e) => setForm({ ...form, tallerOMecanico: e.target.value })}
                    style={{ height: '38px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Costo Total (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={form.costoTotalUSD || ''}
                    onChange={(e) => setForm({ ...form, costoTotalUSD: Number(e.target.value) || 0 })}
                    style={{ height: '38px', fontWeight: 800, color: '#059669' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Estado del Mantenimiento *
                </label>
                <SearchableSelect
                  options={estadoOptions}
                  value={form.estado}
                  onChange={(val) => setForm({ ...form, estado: String(val || 'RESUELTO') })}
                  allowClear={false}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={cerrarModal}
                  style={{ height: '38px', padding: '0 16px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={mutationGuardar.isPending}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    fontWeight: 700,
                    background: '#2563eb',
                    border: 'none',
                  }}
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  {mutationGuardar.isPending ? 'Guardando...' : modoEdicionId ? 'Actualizar' : 'Guardar Mantenimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL NOTIFICAR NUEVA TAREA / AVERÍA AL MECÁNICO (ADMIN -> TALLER) */}
      {modalNuevaTarea && (
        <div className="modal-backdrop" onClick={() => setModalNuevaTarea(false)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fa-solid fa-bell" style={{ color: '#dc2626', marginRight: '8px' }}></i>
                Notificar Tarea / Avería al Mecánico
              </h3>
              <button type="button" className="btn-close" onClick={() => setModalNuevaTarea(false)}>
                ×
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formNuevaTarea.camionId || !formNuevaTarea.titulo.trim()) {
                  toast.error('Selecciona un camión e ingresa el título de la tarea.');
                  return;
                }
                mutationReportarTarea.mutate({
                  camionId: Number(formNuevaTarea.camionId),
                  titulo: formNuevaTarea.titulo.trim(),
                  descripcion: formNuevaTarea.descripcion.trim() || formNuevaTarea.titulo.trim(),
                  urgencia: formNuevaTarea.urgencia,
                  odometroKm: formNuevaTarea.odometroKm ? Number(formNuevaTarea.odometroKm) : undefined,
                });
              }}
            >
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="form-label">Camión / Unidad *</label>
                  <SearchableSelect
                    options={camionOptions}
                    value={formNuevaTarea.camionId}
                    onChange={(val) => setFormNuevaTarea((p) => ({ ...p, camionId: String(val || '') }))}
                    placeholder="Buscar placa o chofer..."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="form-label">Urgencia *</label>
                    <SearchableSelect
                      options={[
                        { value: 'CRITICA', label: 'CRÍTICA (Urgente)' },
                        { value: 'ALTA', label: 'ALTA' },
                        { value: 'MEDIA', label: 'MEDIA' },
                        { value: 'BAJA', label: 'BAJA' },
                      ]}
                      value={formNuevaTarea.urgencia}
                      onChange={(val) => setFormNuevaTarea((p) => ({ ...p, urgencia: String(val || 'ALTA') }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Odómetro actual (Km)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formNuevaTarea.odometroKm}
                      onChange={(e) => setFormNuevaTarea((p) => ({ ...p, odometroKm: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">Título de la Tarea / Avería *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formNuevaTarea.titulo}
                    onChange={(e) => setFormNuevaTarea((p) => ({ ...p, titulo: e.target.value }))}
                    placeholder="Ej: Revisión de frenos delanteros / Fuga de gasoil"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Detalle / Instrucciones para el Mecánico</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={formNuevaTarea.descripcion}
                    onChange={(e) => setFormNuevaTarea((p) => ({ ...p, descripcion: e.target.value }))}
                    placeholder="Describe el problema, prioridad o repuestos a revisar..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setModalNuevaTarea(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#dc2626', borderColor: '#dc2626' }}
                  disabled={mutationReportarTarea.isPending}
                >
                  {mutationReportarTarea.isPending ? 'Enviando...' : 'Enviar al Mecánico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
