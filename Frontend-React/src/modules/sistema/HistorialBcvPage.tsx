import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { bcvApi, type BcvHistoricoDto } from '@/api/bcv.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';

export const HistorialBcvPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [itemEditar, setItemEditar] = useState<BcvHistoricoDto | null>(null);

  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    tasa: 889.25,
    fuente: 'BANCO CENTRAL DE VENEZUELA (BCV)',
    observacion: 'Registro oficial',
  });

  const [formEditar, setFormEditar] = useState({
    fecha: '',
    tasa: 0,
    fuente: '',
    observacion: '',
  });

  const { data: historial = [], isLoading } = useQuery<BcvHistoricoDto[]>({
    queryKey: ['bcv-historial'],
    queryFn: () => bcvApi.getHistorial(1000),
  });

  const { data: tasaHoy, refetch: refetchTasa } = useQuery({
    queryKey: ['bcv-rate'],
    queryFn: () => bcvApi.getTasaHoy(),
  });

  const registrarMutation = useMutation({
    mutationFn: (payload: { fecha: string; tasa: number; tasaDolarBs: number; fuente?: string; observacion?: string }) =>
      bcvApi.registrarTasa(payload),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Tasa oficial registrada exitosamente');
      queryClient.invalidateQueries({ queryKey: ['bcv-historial'] });
      queryClient.invalidateQueries({ queryKey: ['bcv-rate'] });
      queryClient.invalidateQueries({ queryKey: ['bcv-hoy'] });
      setModalNuevo(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al registrar tasa');
    },
  });

  const editarMutation = useMutation({
    mutationFn: (payload: { id: number; data: { fecha: string; tasaDolarBs: number; fuente?: string; observacion?: string } }) =>
      bcvApi.editarTasa(payload.id, payload.data),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Tasa oficial actualizada exitosamente');
      queryClient.invalidateQueries({ queryKey: ['bcv-historial'] });
      queryClient.invalidateQueries({ queryKey: ['bcv-rate'] });
      queryClient.invalidateQueries({ queryKey: ['bcv-hoy'] });
      setModalEditar(false);
      setItemEditar(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar tasa');
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => bcvApi.eliminarTasa(id),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Tasa oficial eliminada');
      queryClient.invalidateQueries({ queryKey: ['bcv-historial'] });
      queryClient.invalidateQueries({ queryKey: ['bcv-rate'] });
      queryClient.invalidateQueries({ queryKey: ['bcv-hoy'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al eliminar tasa');
    },
  });

  const sincronizarMutation = useMutation({
    mutationFn: () => bcvApi.sincronizarTasaBcvLive(),
    onSuccess: (res: any) => {
      toast.success(`Tasa sincronizada: Bs. ${res.tasa?.toLocaleString('es-VE')}`);
      queryClient.invalidateQueries({ queryKey: ['bcv-historial'] });
      queryClient.invalidateQueries({ queryKey: ['bcv-rate'] });
      queryClient.invalidateQueries({ queryKey: ['bcv-hoy'] });
    },
    onError: (err: any) => {
      let msg = err.response?.data?.message || err.message || '';
      if (typeof err.response?.data === 'string' && err.response.data.includes('<html')) {
        msg = 'Servicio temporalmente no disponible (502). Intente nuevamente.';
      }
      toast.error(msg || 'Error al sincronizar con DolarAPI');
    },
  });

  const columns: ColumnDef<BcvHistoricoDto>[] = [
    {
      header: 'Fecha Oficial',
      accessorKey: 'fecha',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#0f172a' }}>
          {row.fecha ? new Date(row.fecha).toLocaleDateString('es-VE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
        </span>
      ),
    },
    {
      header: 'Tasa de Cambio Oficial (Bs. / USD)',
      accessorKey: 'tasaDolarBs',
      sortable: true,
      cell: (row) => {
        const val = Number(row.tasaDolarBs ?? row.tasa ?? (row as any).TasaDolarBs ?? 0);
        return (
          <span style={{ fontWeight: 900, color: '#059669', fontSize: '15px', fontFamily: 'monospace' }}>
            Bs. {!isNaN(val) && val > 0 ? val.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '---'}
          </span>
        );
      },
    },
    {
      header: 'Moneda / Par',
      cell: () => (
        <span className="badge" style={{ background: '#f1f5f9', color: '#334155', fontWeight: 800, border: '1px solid #cbd5e1' }}>
          USD / VES
        </span>
      ),
    },
    {
      header: 'Fuente & Certificación',
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
          <i className="fa-solid fa-building-columns" style={{ color: '#0284c7' }}></i>
          <span>{row.fuente || 'Banco Central de Venezuela (BCV)'}</span>
        </div>
      ),
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (row) => {
        const id = row.id ?? (row as any).Id;
        const val = Number(row.tasaDolarBs ?? row.tasa ?? (row as any).TasaDolarBs ?? 0);
        const fechaStr = row.fecha ? String(row.fecha).split('T')[0] : '';
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
            <button
              type="button"
              onClick={() => {
                setItemEditar(row);
                setFormEditar({
                  fecha: fechaStr,
                  tasa: val,
                  fuente: row.fuente || 'BANCO CENTRAL DE VENEZUELA (BCV)',
                  observacion: row.observacion || '',
                });
                setModalEditar(true);
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#2563eb',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Editar Tasa BCV"
            >
              <i className="fa-solid fa-pen-to-square" style={{ fontSize: '13px' }}></i>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!id) return;
                const confirmacion = await confirmDeleteOrDeactivate(
                  'Eliminar Tasa BCV',
                  `¿Está seguro de eliminar el registro de tasa del ${row.fecha ? new Date(row.fecha).toLocaleDateString('es-VE') : ''} (${val.toFixed(4)} Bs.)?`
                );
                if (confirmacion) {
                  eliminarMutation.mutate(id);
                }
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#ef4444',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Eliminar Tasa BCV"
            >
              <i className="fa-solid fa-trash-can" style={{ fontSize: '13px' }}></i>
            </button>
          </div>
        );
      },
    },
  ];

  const tasaActual = Number(
    tasaHoy?.tasaDolarBs ?? 
    (tasaHoy as any)?.data?.tasaDolarBs ?? 
    (tasaHoy as any)?.tasa ?? 
    (historial[0]?.tasaDolarBs) ?? 
    (historial[0]?.tasa) ?? 
    0
  );

  return (
    <div>
      {/* VISTA HEADER 1:1 */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <i className="fa-solid fa-chart-line" style={{ color: '#2563eb', marginRight: '8px' }}></i>
            Historial de Tasas Oficiales BCV
          </h1>
          <p className="view-subtitle">
            Registro, consulta, edición y control de tasas oficiales USD/VES publicadas por el Banco Central de Venezuela
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => sincronizarMutation.mutate()}
            disabled={sincronizarMutation.isPending}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              padding: '9px 16px',
            }}
          >
            <i className={`fa-solid fa-arrows-rotate ${sincronizarMutation.isPending ? 'fa-spin' : ''}`}></i>
            Sincronizar en Vivo (DolarAPI)
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalNuevo(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              padding: '9px 18px',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
            }}
          >
            <i className="fa-solid fa-plus"></i> Registrar Nueva Tasa
          </button>
        </div>
      </div>

      {/* MINI RESUMEN / KPIS BCV */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div
          className="kpi-card"
          style={{
            borderRadius: '12px',
            padding: '16px 20px',
            border: '1px solid var(--t-border)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            <i className="fa-solid fa-sack-dollar" style={{ color: 'var(--t-accent)', marginRight: '6px' }}></i> Tasa Oficial Actual
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: '#059669', letterSpacing: '-0.5px' }}>
              Bs. {!isNaN(tasaActual) && tasaActual > 0 ? tasaActual.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '---'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--t-muted)', fontWeight: 700 }}>VES/USD</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--t-muted)', marginTop: '4px', fontWeight: 600 }}>
            <i className="fa-regular fa-clock" style={{ marginRight: '4px' }}></i> Vigencia: {tasaHoy?.fecha ? new Date(tasaHoy.fecha).toLocaleDateString('es-VE') : 'Actual'}
          </div>
        </div>

        <div
          className="kpi-card"
          style={{
            borderRadius: '12px',
            padding: '16px 20px',
            border: '1px solid var(--t-border)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            <i className="fa-solid fa-building-columns" style={{ color: '#d97706', marginRight: '6px' }}></i> Fuente de la Tasa
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            BANCO CENTRAL DE VENEZUELA
          </div>
          <div style={{ fontSize: '12px', color: 'var(--t-muted)', marginTop: '4px', fontWeight: 500 }}>
            Publicación oficial para liquidaciones
          </div>
        </div>

        <div
          className="kpi-card"
          style={{
            borderRadius: '12px',
            padding: '16px 20px',
            border: '1px solid var(--t-border)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            <i className="fa-solid fa-database" style={{ color: '#7c3aed', marginRight: '6px' }}></i> Registros en Historial
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--t-accent)' }}>
            {historial.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--t-muted)', marginTop: '4px', fontWeight: 500 }}>
            Tasas registradas en la base de datos
          </div>
        </div>
      </div>

      {/* Tabla Principal */}
      <DataTable
        data={historial}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por fecha, tasa..."
        exportFileName="historial_bcv"
        searchFilter={(row, term) => {
          const val = (row.tasaDolarBs ?? row.tasa ?? '').toString();
          const fechaStr = row.fecha ? new Date(row.fecha).toLocaleDateString('es-VE') : '';
          return val.toLowerCase().includes(term.toLowerCase()) || fechaStr.toLowerCase().includes(term.toLowerCase());
        }}
      />

      {/* Modal Nueva Tasa */}
      {modalNuevo && (
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
          <div className="content-card" style={{ width: '100%', maxWidth: '420px', padding: '0', overflow: 'hidden', borderRadius: '16px' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                <i className="fa-solid fa-sack-dollar" style={{ color: '#0284c7', marginRight: '8px' }}></i>
                Registrar Tasa Oficial BCV
              </h3>
              <button type="button" onClick={() => setModalNuevo(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}>
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (form.tasa <= 0) {
                  toast.error('La tasa debe ser mayor a 0');
                  return;
                }
                registrarMutation.mutate({
                  fecha: form.fecha,
                  tasa: form.tasa,
                  tasaDolarBs: form.tasa,
                });
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Fecha Oficial *
                </label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Tasa de Cambio Oficial (Bs. / USD) *
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={form.tasa || ''}
                  onChange={(e) => setForm({ ...form, tasa: Number(e.target.value) })}
                  placeholder="Ej: 36.5000"
                  className="form-input"
                  style={{ width: '100%', height: '42px', fontSize: '16px', fontWeight: 800, color: '#059669', borderRadius: '8px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setModalNuevo(false)} className="btn btn-outline" style={{ height: '36px', padding: '0 14px', borderRadius: '8px' }}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={registrarMutation.isPending}
                  className="btn btn-primary"
                  style={{ height: '36px', padding: '0 18px', borderRadius: '8px', background: '#0284c7', border: 'none', fontWeight: 700 }}
                >
                  {registrarMutation.isPending ? 'Guardando...' : 'Guardar Tasa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Tasa */}
      {modalEditar && itemEditar && (
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
          <div className="content-card" style={{ width: '100%', maxWidth: '440px', padding: '0', overflow: 'hidden', borderRadius: '16px' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                <i className="fa-solid fa-pen-to-square" style={{ color: '#2563eb', marginRight: '8px' }}></i>
                Editar Tasa Oficial BCV
              </h3>
              <button type="button" onClick={() => setModalEditar(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}>
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const id = itemEditar.id ?? (itemEditar as any).Id;
                if (!id) return;
                if (formEditar.tasa <= 0) {
                  toast.error('La tasa debe ser mayor a 0');
                  return;
                }
                editarMutation.mutate({
                  id,
                  data: {
                    fecha: formEditar.fecha,
                    tasaDolarBs: formEditar.tasa,
                    fuente: formEditar.fuente,
                    observacion: formEditar.observacion,
                  },
                });
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Fecha Oficial *
                </label>
                <input
                  type="date"
                  value={formEditar.fecha}
                  onChange={(e) => setFormEditar({ ...formEditar, fecha: e.target.value })}
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Tasa de Cambio Oficial (Bs. / USD) *
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={formEditar.tasa || ''}
                  onChange={(e) => setFormEditar({ ...formEditar, tasa: Number(e.target.value) })}
                  placeholder="Ej: 36.5000"
                  className="form-input"
                  style={{ width: '100%', height: '42px', fontSize: '16px', fontWeight: 800, color: '#059669', borderRadius: '8px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Fuente & Certificación
                </label>
                <input
                  type="text"
                  value={formEditar.fuente}
                  onChange={(e) => setFormEditar({ ...formEditar, fuente: e.target.value })}
                  placeholder="BANCO CENTRAL DE VENEZUELA (BCV)"
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Observación
                </label>
                <input
                  type="text"
                  value={formEditar.observacion}
                  onChange={(e) => setFormEditar({ ...formEditar, observacion: e.target.value })}
                  placeholder="Ej: Corrección manual de tasa oficial"
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setModalEditar(false)} className="btn btn-outline" style={{ height: '36px', padding: '0 14px', borderRadius: '8px' }}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editarMutation.isPending}
                  className="btn btn-primary"
                  style={{ height: '36px', padding: '0 18px', borderRadius: '8px', background: '#2563eb', border: 'none', fontWeight: 700 }}
                >
                  {editarMutation.isPending ? 'Guardando...' : 'Actualizar Tasa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistorialBcvPage;
