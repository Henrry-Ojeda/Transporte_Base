import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import type { BancoDto } from '@/types';

export const BancosPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = useModulePermissions('BANCOS');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);

  const initialForm = { codigo: '', nombre: '' };
  const [form, setForm] = useState(initialForm);

  // Queries
  const { data: bancos = [], isLoading } = useQuery<BancoDto[]>({
    queryKey: ['bancos'],
    queryFn: () => catalogosApi.getBancos(),
  });

  // Mutaciones
  const guardarMutation = useMutation({
    mutationFn: (dto: typeof initialForm) =>
      modoEdicionId ? catalogosApi.actualizarBanco(modoEdicionId, dto) : catalogosApi.crearBanco(dto),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Banco guardado');
      queryClient.invalidateQueries({ queryKey: ['bancos'] });
      cerrarModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar banco');
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => catalogosApi.eliminarBanco(id),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Banco eliminado');
      queryClient.invalidateQueries({ queryKey: ['bancos'] });
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

  const abrirModalEditar = (item: BancoDto) => {
    setModoEdicionId(item.id);
    setForm({
      codigo: item.codigo,
      nombre: item.nombre,
    });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setModoEdicionId(null);
  };

  const columns: ColumnDef<BancoDto>[] = [
    {
      header: 'Código Bancario',
      accessorKey: 'codigo',
      sortable: true,
      cell: (row) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 800,
            fontSize: '13px',
            background: '#f1f5f9',
            padding: '3px 8px',
            borderRadius: '6px',
            color: '#0f172a',
          }}
        >
          {row.codigo}
        </span>
      ),
    },
    {
      header: 'Nombre de la Entidad Bancaria',
      accessorKey: 'nombre',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: '#eff6ff',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              flexShrink: 0,
            }}
          >
            <i className="fa-solid fa-building-columns"></i>
          </div>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.nombre}</span>
        </div>
      ),
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
              title="Editar Banco"
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={async () => {
                if (await confirmDeleteOrDeactivate('Eliminar la entidad bancaria', row.nombre)) {
                  eliminarMutation.mutate(row.id);
                }
              }}
              className="btn btn-sm btn-outline"
              style={{ height: '30px', padding: '0 8px', fontSize: '12px', color: '#dc2626', borderColor: '#fecaca' }}
              title="Eliminar"
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
            <i className="fa-solid fa-building-columns" style={{ color: '#2563eb', marginRight: '8px' }}></i>
            Bancos & Cuentas Receptoras
          </h1>
          <p className="view-subtitle">
            Gestión de entidades bancarias nacionales y validación de códigos de cuenta para pagos a productores
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
              <i className="fa-solid fa-building-columns"></i> + Nuevo Banco
            </button>
          )}
        </div>
      </div>

      {/* Tabla Principal */}
      <DataTable
        data={bancos}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por código (ej: 0102) o nombre de banco..."
        exportFileName="bancos_nacionales"
        searchFilter={(row, term) =>
          row.nombre.toLowerCase().includes(term) || row.codigo.toLowerCase().includes(term)
        }
      />

      {/* Modal Banco */}
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
              maxWidth: '440px',
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
                <i className="fa-solid fa-building-columns" style={{ color: '#0284c7' }}></i>
                {modoEdicionId ? 'Editar Entidad Bancaria' : 'Registrar Nuevo Banco'}
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
                if (!form.codigo.trim() || !form.nombre.trim()) {
                  toast.error('Código y nombre del banco son requeridos');
                  return;
                }
                guardarMutation.mutate(form);
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Código Bancario (4 Dígitos) *
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value.replace(/\D/g, '') })}
                  placeholder="Ej: 0102"
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px', fontFamily: 'monospace', fontWeight: 700 }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Nombre de la Entidad Bancaria *
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Banco de Venezuela"
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px', fontWeight: 600 }}
                  required
                />
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
                    background: '#0284c7',
                    border: 'none',
                    fontWeight: 700,
                  }}
                >
                  {guardarMutation.isPending ? 'Guardando...' : (modoEdicionId ? 'Guardar Cambios' : 'Registrar Banco')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BancosPage;
