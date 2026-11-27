import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { ChoferSelect } from '@/components/selectors';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import type { CamionDto, GuardarCamionDto, ChoferDto } from '@/types';

export const CamionesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = useModulePermissions('CAMIONES');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);

  const initialForm: GuardarCamionDto = {
    placa: '',
    marca: '',
    modelo: '',
    año: new Date().getFullYear(),
    capacidadLitros: 10000,
    odometroActualKm: 0,
    usuarioId: undefined,
    activo: true,
    estado: 'ACTIVO',
  };
  const [form, setForm] = useState<GuardarCamionDto>(initialForm);

  // Queries
  const { data: camiones = [], isLoading } = useQuery<CamionDto[]>({
    queryKey: ['camiones'],
    queryFn: () => catalogosApi.getCamiones(false),
  });

  const { data: choferes = [] } = useQuery<ChoferDto[]>({
    queryKey: ['choferes'],
    queryFn: () => catalogosApi.getChoferes(),
  });

  // Mutaciones
  const guardarMutation = useMutation({
    mutationFn: (dto: GuardarCamionDto) =>
      modoEdicionId ? catalogosApi.actualizarCamion(modoEdicionId, dto) : catalogosApi.crearCamion(dto),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Camión guardado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['camiones'] });
      cerrarModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar camión');
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => catalogosApi.eliminarCamion(id),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Camión desactivado');
      queryClient.invalidateQueries({ queryKey: ['camiones'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al eliminar');
    },
  });

  const abrirModalCrear = () => {
    setModoEdicionId(null);
    setForm(initialForm);
    setModalAbierto(true);
  };

  const abrirModalEditar = (item: CamionDto) => {
    setModoEdicionId(item.id);
    setForm({
      placa: item.placa,
      marca: item.marca,
      modelo: item.modelo,
      año: item.año || new Date().getFullYear(),
      capacidadLitros: item.capacidadLitros,
      odometroActualKm: item.odometroActualKm,
      usuarioId: item.usuarioId,
      activo: item.activo,
      estado: (item.estado as any) || (item.activo ? 'ACTIVO' : 'INACTIVO'),
    });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setModoEdicionId(null);
  };

  const columns: ColumnDef<CamionDto>[] = [
    {
      header: 'Placa & Vehículo',
      accessorKey: 'placa',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              fontSize: '15px',
              flexShrink: 0,
            }}
          >
            <i className="fa-solid fa-truck-front"></i>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              {row.placa}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              {row.marca} {row.modelo} {row.año ? `(${row.año})` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Capacidad Cisterna',
      accessorKey: 'capacidadLitros',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 800, color: '#0284c7', fontSize: '13.5px' }}>
          {row.capacidadLitros?.toLocaleString()} <small style={{ color: '#64748b', fontWeight: 600 }}>Litros</small>
        </span>
      ),
    },
    {
      header: 'Odómetro Actual',
      accessorKey: 'odometroActualKm',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#334155' }}>
          <i className="fa-solid fa-gauge" style={{ color: '#64748b', fontSize: '11px' }}></i>
          <span>{row.odometroActualKm ? `${row.odometroActualKm.toLocaleString()} Km` : '0 Km'}</span>
        </div>
      ),
    },
    {
      header: 'Chofer Asignado',
      cell: (row) => {
        const chofer = choferes.find((c) => c.id === row.usuarioId);
        const nombre = chofer ? chofer.nombreCompleto : row.choferNombre;
        return nombre ? (
          <span
            className="badge"
            style={{
              background: '#f8fafc',
              color: '#334155',
              border: '1px solid #e2e8f0',
              fontWeight: 700,
              padding: '4px 8px',
            }}
          >
            <i className="fa-solid fa-user" style={{ color: '#64748b', marginRight: '4px' }}></i>
            {nombre}
          </span>
        ) : (
          <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Sin chofer asignado</span>
        );
      },
    },
    {
      header: 'Estado Operativo',
      accessorKey: 'estado',
      sortable: true,
      cell: (row) => {
        const est = (row.estado || (row.activo ? 'ACTIVO' : 'INACTIVO')).toUpperCase();
        if (est === 'MANTENIMIENTO') {
          return (
            <span
              className="badge"
              style={{
                background: '#fffbeb',
                color: '#b45309',
                border: '1px solid #fde68a',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <i className="fa-solid fa-wrench" style={{ color: '#d97706' }}></i> En Taller
            </span>
          );
        }
        if (est === 'INACTIVO' || !row.activo) {
          return (
            <span
              className="badge"
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <i className="fa-solid fa-circle-xmark"></i> Inactivo
            </span>
          );
        }
        return (
          <span
            className="badge"
            style={{
              background: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <i className="fa-solid fa-check-circle"></i> Activo (Operativo)
          </span>
        );
      },
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (row) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
          {canEdit && (
            <button
              type="button"
              onClick={() => abrirModalEditar(row)}
              className="btn btn-sm btn-outline"
              style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
              title="Editar Camión"
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={async () => {
                if (await confirmDeleteOrDeactivate('Desactivar el vehículo', row.placa)) {
                  eliminarMutation.mutate(row.id);
                }
              }}
              className="btn btn-sm btn-outline"
              style={{ height: '30px', padding: '0 8px', fontSize: '12px', color: '#dc2626', borderColor: '#fecaca' }}
              title="Desactivar"
            >
              <i className="fa-solid fa-trash-can"></i>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* VISTA HEADER 1:1 */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <i className="fa-solid fa-truck-front" style={{ color: '#2563eb', marginRight: '8px' }}></i>
            Gestión de Camiones (Flota)
          </h1>
          <p className="view-subtitle">
            Catálogo de vehículos cisterna, compartimientos, capacidad en litros y chofer asignado
          </p>
        </div>

        <div className="view-actions">
          {canCreate && (
            <button
              type="button"
              onClick={abrirModalCrear}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                padding: '9px 18px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
              }}
            >
              <i className="fa-solid fa-plus"></i> + Nuevo Camión
            </button>
          )}
        </div>
      </div>

      {/* Tabla Principal */}
      <DataTable
        data={camiones}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por placa, marca o chofer..."
        exportFileName="camiones_flota"
        searchFilter={(row, term) =>
          Boolean(
            row.placa.toLowerCase().includes(term) ||
            row.marca.toLowerCase().includes(term) ||
            row.modelo.toLowerCase().includes(term) ||
            (row.choferNombre && row.choferNombre.toLowerCase().includes(term))
          )
        }
      />

      {/* Modal Camión */}
      {modalAbierto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '640px',
              padding: '0',
              overflow: 'visible',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              backgroundColor: '#ffffff',
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#ffffff',
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="fa-solid fa-truck-droplet" style={{ fontSize: '18px' }}></i>
                {modoEdicionId ? 'Editar Camión Cisterna' : 'Registrar Nuevo Camión Cisterna'}
              </h3>
              <button
                type="button"
                onClick={cerrarModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '20px',
                  lineHeight: 1,
                  padding: '4px',
                }}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.placa.trim()) {
                  toast.error('La placa es obligatoria');
                  return;
                }
                guardarMutation.mutate(form);
              }}
              style={{ padding: '24px', overflow: 'visible' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Placa del Vehículo *
                  </label>
                  <input
                    type="text"
                    value={form.placa}
                    onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
                    placeholder="Ej: A84DE3A"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '8px', fontFamily: 'monospace', fontWeight: 700, fontSize: '14px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Capacidad (Litros) *
                  </label>
                  <input
                    type="number"
                    value={form.capacidadLitros}
                    onChange={(e) => setForm({ ...form, capacidadLitros: Number(e.target.value) })}
                    placeholder="10000"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: 700, fontSize: '14px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Marca
                  </label>
                  <input
                    type="text"
                    value={form.marca}
                    onChange={(e) => setForm({ ...form, marca: e.target.value })}
                    placeholder="Mack, Ford..."
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={form.modelo}
                    onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                    placeholder="CH613, Cargo..."
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Año
                  </label>
                  <input
                    type="number"
                    value={form.año || ''}
                    onChange={(e) => setForm({ ...form, año: Number(e.target.value) })}
                    placeholder="2026"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '8px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Odómetro Actual (Km)
                  </label>
                  <input
                    type="number"
                    value={form.odometroActualKm || 0}
                    onChange={(e) => setForm({ ...form, odometroActualKm: Number(e.target.value) })}
                    placeholder="0"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Chofer Habitual <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Busca escribiendo)</span>
                  </label>
                  <ChoferSelect
                    value={form.usuarioId}
                    onChange={(val) => setForm({ ...form, usuarioId: val })}
                    placeholder="-- Seleccionar o buscar chofer --"
                    allowClear
                  />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  Estado Operativo del Camión *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, estado: 'ACTIVO', activo: true })}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: form.estado === 'ACTIVO' ? '2px solid #10b981' : '1.5px solid #e2e8f0',
                      background: form.estado === 'ACTIVO' ? '#ecfdf5' : '#ffffff',
                      color: form.estado === 'ACTIVO' ? '#065f46' : '#64748b',
                      fontWeight: 700,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <i className="fa-solid fa-check-circle" style={{ color: form.estado === 'ACTIVO' ? '#10b981' : '#94a3b8' }}></i>
                    ACTIVO (Apto)
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, estado: 'MANTENIMIENTO', activo: false })}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: form.estado === 'MANTENIMIENTO' ? '2px solid #f59e0b' : '1.5px solid #e2e8f0',
                      background: form.estado === 'MANTENIMIENTO' ? '#fffbeb' : '#ffffff',
                      color: form.estado === 'MANTENIMIENTO' ? '#92400e' : '#64748b',
                      fontWeight: 700,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <i className="fa-solid fa-wrench" style={{ color: form.estado === 'MANTENIMIENTO' ? '#f59e0b' : '#94a3b8' }}></i>
                    EN TALLER
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, estado: 'INACTIVO', activo: false })}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: form.estado === 'INACTIVO' ? '2px solid #ef4444' : '1.5px solid #e2e8f0',
                      background: form.estado === 'INACTIVO' ? '#fef2f2' : '#ffffff',
                      color: form.estado === 'INACTIVO' ? '#991b1b' : '#64748b',
                      fontWeight: 700,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <i className="fa-solid fa-circle-xmark" style={{ color: form.estado === 'INACTIVO' ? '#ef4444' : '#94a3b8' }}></i>
                    INACTIVO
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="btn btn-outline"
                  style={{ height: '40px', padding: '0 20px', borderRadius: '8px', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarMutation.isPending}
                  className="btn btn-primary"
                  style={{
                    height: '40px',
                    padding: '0 24px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    border: 'none',
                    fontWeight: 700,
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                  }}
                >
                  {guardarMutation.isPending ? 'Guardando...' : (modoEdicionId ? 'Guardar Cambios' : 'Registrar Camión')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CamionesPage;
