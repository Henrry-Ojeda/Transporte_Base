import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import type { CompaniaDto, GuardarCompaniaDto } from '@/types';

export const CompaniasPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalPrecio, setModalPrecio] = useState(false);
  const [companiaSeleccionada, setCompaniaSeleccionada] = useState<CompaniaDto | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState<number>(0.45);
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);

  const initialForm: GuardarCompaniaDto = {
    nombre: '',
    rif: '',
    direccion: '',
    telefono: '',
    contacto: '',
    precioLitroUSD: 0.45,
    activo: true,
    esPrincipal: false,
  };
  const [form, setForm] = useState<GuardarCompaniaDto>(initialForm);

  // Queries
  const { data: companias = [], isLoading } = useQuery<CompaniaDto[]>({
    queryKey: ['companias'],
    queryFn: () => catalogosApi.getCompanias(false),
  });

  // Mutaciones
  const guardarMutation = useMutation({
    mutationFn: (dto: GuardarCompaniaDto) =>
      modoEdicionId ? catalogosApi.actualizarCompania(modoEdicionId, dto) : catalogosApi.crearCompania(dto),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Compañía guardada');
      queryClient.invalidateQueries({ queryKey: ['companias'] });
      cerrarModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar compañía');
    },
  });

  const precioMutation = useMutation({
    mutationFn: ({ id, precio }: { id: number; precio: number }) =>
      catalogosApi.actualizarPrecioCompania(id, precio),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Precio de compra actualizado');
      queryClient.invalidateQueries({ queryKey: ['companias'] });
      setModalPrecio(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar precio');
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => catalogosApi.eliminarCompania(id),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Compañía desactivada');
      queryClient.invalidateQueries({ queryKey: ['companias'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al desactivar');
    },
  });

  const abrirModalCrear = () => {
    setModoEdicionId(null);
    setForm(initialForm);
    setModalAbierto(true);
  };

  const abrirModalEditar = (item: CompaniaDto) => {
    setModoEdicionId(item.id);
    setForm({
      nombre: item.nombre,
      rif: item.rif || '',
      direccion: item.direccion || '',
      telefono: item.telefono || '',
      contacto: item.contacto || '',
      precioLitroUSD: item.precioLitroUSD || 0.45,
      activo: item.activo,
      esPrincipal: (item as any).esPrincipal ?? false,
    });
    setModalAbierto(true);
  };

  const abrirModalCambiarPrecio = (item: CompaniaDto) => {
    setCompaniaSeleccionada(item);
    setNuevoPrecio(item.precioLitroUSD || 0.45);
    setModalPrecio(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setModoEdicionId(null);
  };

  const columns: ColumnDef<CompaniaDto>[] = [
    {
      header: 'ID',
      accessorKey: 'id',
      sortable: true,
      cell: (row) => <span style={{ fontWeight: 800, color: '#64748b', fontFamily: 'monospace' }}>#{row.id}</span>,
    },
    {
      header: 'Compañía / Planta Receptora',
      accessorKey: 'nombre',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '15px',
              flexShrink: 0,
            }}
          >
            <i className="fa-solid fa-building-wheat"></i>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, color: '#0f172a' }}>{row.nombre}</span>
              {row.esPrincipal && (
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
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              {row.rif ? `RIF: ${row.rif}` : (row.direccion || 'Planta de acopio')}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Contacto & Teléfono',
      cell: (row) => (
        <div>
          {row.contacto && (
            <div style={{ fontWeight: 600, color: '#334155', fontSize: '12.5px' }}>
              <i className="fa-solid fa-user-tie" style={{ color: '#64748b', marginRight: '5px' }}></i>
              {row.contacto}
            </div>
          )}
          {row.telefono ? (
            <div style={{ fontSize: '11.5px', color: '#0284c7' }}>
              <i className="fa-solid fa-phone" style={{ marginRight: '5px' }}></i>
              {row.telefono}
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Sin teléfono</span>
          )}
        </div>
      ),
    },
    {
      header: 'Precio Base ($/Lt)',
      accessorKey: 'precioLitroUSD',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 800, color: '#059669', fontSize: '14px', fontFamily: 'monospace' }}>
          ${Number(row.precioLitroUSD || 0).toFixed(4)}
        </span>
      ),
    },
    {
      header: 'Estado',
      accessorKey: 'activo',
      cell: (row) =>
        row.activo ? (
          <span
            className="badge"
            style={{
              background: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0',
              fontWeight: 700,
            }}
          >
            <i className="fa-solid fa-check-circle" style={{ marginRight: '4px' }}></i>
            Operativa
          </span>
        ) : (
          <span
            className="badge"
            style={{
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              fontWeight: 700,
            }}
          >
            <i className="fa-solid fa-ban" style={{ marginRight: '4px' }}></i>
            Inactiva
          </span>
        ),
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (row) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
          <button
            type="button"
            onClick={() => abrirModalCambiarPrecio(row)}
            className="btn btn-sm btn-outline"
            style={{ height: '30px', padding: '0 8px', fontSize: '12px', color: '#059669', borderColor: '#a7f3d0' }}
            title="Cambiar Precio $/Lt"
          >
            <i className="fa-solid fa-hand-holding-dollar"></i>
          </button>
          <button
            type="button"
            onClick={() => abrirModalEditar(row)}
            className="btn btn-sm btn-outline"
            style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
            title="Editar Compañía"
          >
            <i className="fa-solid fa-pen-to-square"></i>
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await confirmDeleteOrDeactivate('Desactivar la compañía', row.nombre)) {
                eliminarMutation.mutate(row.id);
              }
            }}
            className="btn btn-sm btn-outline"
            style={{ height: '30px', padding: '0 8px', fontSize: '12px', color: '#dc2626', borderColor: '#fecaca' }}
            title="Desactivar"
          >
            <i className="fa-solid fa-trash-can"></i>
          </button>
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
            <i className="fa-solid fa-building-wheat" style={{ color: '#059669', marginRight: '8px' }}></i>
            Compañías & Plantas Receptoras
          </h1>
          <p className="view-subtitle">
            Centros de acopio, industrias lácteas y empresas receptoras de leche
          </p>
        </div>

        <div className="view-actions">
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
              background: 'linear-gradient(135deg, #059669, #047857)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(5,150,105,0.25)',
            }}
          >
            <i className="fa-solid fa-building-circle-arrow-right"></i> + Nueva Compañía
          </button>
        </div>
      </div>

      {/* Tabla Principal */}
      <DataTable
        data={companias}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por nombre, RIF, contacto o dirección..."
        exportFileName="companias_receptoras"
        searchFilter={(row, term) =>
          Boolean(
            row.nombre.toLowerCase().includes(term) ||
            (row.rif && row.rif.toLowerCase().includes(term)) ||
            (row.contacto && row.contacto.toLowerCase().includes(term))
          )
        }
      />

      {/* Modal Compañía */}
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
              maxWidth: '520px',
              padding: '0',
              overflow: 'hidden',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-building" style={{ color: '#059669' }}></i>
                {modoEdicionId ? 'Editar Compañía Receptora' : 'Registrar Nueva Compañía'}
              </h3>
              <button
                type="button"
                onClick={cerrarModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '18px',
                }}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.nombre.trim()) {
                  toast.error('El nombre de la compañía es obligatorio');
                  return;
                }
                guardarMutation.mutate(form);
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Nombre de la Compañía / Planta *
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Lácteos Los Andes C.A."
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px', fontWeight: 600 }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    RIF
                  </label>
                  <input
                    type="text"
                    value={form.rif}
                    onChange={(e) => setForm({ ...form, rif: e.target.value.toUpperCase() })}
                    placeholder="J-12345678-0"
                    className="form-input"
                    style={{ width: '100%', height: '38px', borderRadius: '8px', fontFamily: 'monospace' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Precio Base Litro ($) *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.precioLitroUSD}
                    onChange={(e) => setForm({ ...form, precioLitroUSD: Number(e.target.value) })}
                    placeholder="0.45"
                    className="form-input"
                    style={{ width: '100%', height: '38px', borderRadius: '8px', fontWeight: 700, color: '#059669' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Persona de Contacto
                  </label>
                  <input
                    type="text"
                    value={form.contacto}
                    onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                    placeholder="Lic. María Gómez"
                    className="form-input"
                    style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    placeholder="0276-7654321"
                    className="form-input"
                    style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Dirección / Ubicación Planta
                </label>
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  placeholder="Zona Industrial, Galpón 4..."
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                />
              </div>

              {/* Checkbox Planta Matriz / Receptoría Principal */}
              <div style={{ marginBottom: '16px', background: '#ecfdf5', border: '1.5px solid #a7f3d0', borderRadius: '10px', padding: '12px 14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={form.esPrincipal || false}
                    onChange={(e) => setForm({ ...form, esPrincipal: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#059669', cursor: 'pointer' }}
                  />
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#065f46', display: 'block' }}>
                      🏢 Es Planta Matriz / Receptoría Principal de Silos
                    </span>
                    <span style={{ fontSize: '11px', color: '#047857', display: 'block' }}>
                      Identifica esta compañía como el destino receptor principal para descargas y balances de silos del sistema.
                    </span>
                  </div>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="btn btn-outline"
                  style={{ height: '38px', padding: '0 16px', borderRadius: '8px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarMutation.isPending}
                  className="btn btn-primary"
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    background: '#059669',
                    border: 'none',
                    fontWeight: 700,
                  }}
                >
                  {guardarMutation.isPending ? 'Guardando...' : (modoEdicionId ? 'Guardar Cambios' : 'Registrar')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cambiar Precio Rápido */}
      {modalPrecio && companiaSeleccionada && (
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
              maxWidth: '420px',
              padding: '0',
              overflow: 'hidden',
              borderRadius: '16px',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                <i className="fa-solid fa-hand-holding-dollar" style={{ color: '#059669', marginRight: '8px' }}></i>
                Actualizar Precio Litro ($)
              </h3>
              <button
                type="button"
                onClick={() => setModalPrecio(false)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                precioMutation.mutate({ id: companiaSeleccionada.id, precio: nuevoPrecio });
              }}
              style={{ padding: '20px' }}
            >
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#475569' }}>
                Actualizar tarifa por litro despachado para la compañía <strong>{companiaSeleccionada.nombre}</strong>:
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Nuevo Precio ($ / Litro)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={nuevoPrecio}
                  onChange={(e) => setNuevoPrecio(Number(e.target.value))}
                  className="form-input"
                  style={{ width: '100%', height: '42px', fontSize: '16px', fontWeight: 800, color: '#059669', borderRadius: '8px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalPrecio(false)}
                  className="btn btn-outline"
                  style={{ height: '36px', padding: '0 14px', borderRadius: '8px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={precioMutation.isPending}
                  className="btn btn-primary"
                  style={{ height: '36px', padding: '0 18px', borderRadius: '8px', background: '#059669', border: 'none', fontWeight: 700 }}
                >
                  {precioMutation.isPending ? 'Actualizando...' : 'Guardar Precio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompaniasPage;
