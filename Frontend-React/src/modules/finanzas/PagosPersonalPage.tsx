import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { finanzasApi } from '@/api/finanzas.api';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { ChoferSelect } from '@/components/selectors';
import type { PagoPersonalDto, ChoferDto } from '@/types';

export const PagosPersonalPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [modalNuevo, setModalNuevo] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroChofer, setFiltroChofer] = useState<string>('');

  const initialForm = {
    usuarioId: 0,
    fecha: new Date().toISOString().split('T')[0],
    montoUSD: 0,
    tipoPago: 'COMISION_LITROS',
    descripcion: '',
    referenciaBancaria: '',
  };
  const [form, setForm] = useState(initialForm);

  const { data: pagos = [], isLoading, refetch } = useQuery<PagoPersonalDto[]>({
    queryKey: ['pagos-personal'],
    queryFn: () => finanzasApi.getPagosPersonal(),
  });

  const { data: choferes = [] } = useQuery<ChoferDto[]>({
    queryKey: ['choferes'],
    queryFn: () => catalogosApi.getChoferes(),
  });

  const crearMutation = useMutation({
    mutationFn: (dto: typeof initialForm) => finanzasApi.crearPagoPersonal(dto),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Pago a personal registrado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['pagos-personal'] });
      setModalNuevo(false);
      setForm(initialForm);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    },
  });

  const totalUSD = pagos.reduce((acc, p) => acc + (p.montoUSD || 0), 0);
  const totalComisiones = pagos.filter(p => p.tipoPago === 'COMISION_LITROS').reduce((acc, p) => acc + (p.montoUSD || 0), 0);
  const totalSueldos = pagos.filter(p => p.tipoPago !== 'COMISION_LITROS').reduce((acc, p) => acc + (p.montoUSD || 0), 0);

  const pagosFiltrados = pagos.filter((p) => {
    if (filtroTipo && p.tipoPago !== filtroTipo) return false;
    if (filtroChofer && p.usuarioId?.toString() !== filtroChofer) return false;
    return true;
  });

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(pagosFiltrados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PagosPersonal');
    XLSX.writeFile(wb, `Nomina_Personal_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const columns: ColumnDef<PagoPersonalDto>[] = [
    {
      header: 'Fecha & Ref.',
      accessorKey: 'fecha',
      sortable: true,
      cell: (row) => (
        <div>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>
            {row.fecha ? new Date(row.fecha).toLocaleDateString('es-VE') : '-'}
          </span>
          <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
            Ref: {row.referenciaBancaria || 'Efectivo/Zelle'}
          </div>
        </div>
      ),
    },
    {
      header: 'Trabajador / Beneficiario',
      accessorKey: 'nombreUsuario',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#e0f2fe',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '12px',
              flexShrink: 0,
            }}
          >
            <i className="fa-solid fa-user"></i>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              {row.usuarioNombre || `Personal #${row.usuarioId}`}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>Chofer / Operador</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Concepto / Modalidad',
      accessorKey: 'tipoPago',
      cell: (row) => (
        <span
          className="badge"
          style={{
            background: row.tipoPago === 'COMISION_LITROS' ? '#e0f2fe' : '#fef3c7',
            color: row.tipoPago === 'COMISION_LITROS' ? '#0369a1' : '#92400e',
            border: `1px solid ${row.tipoPago === 'COMISION_LITROS' ? '#bae6fd' : '#fde68a'}`,
            fontWeight: 800,
          }}
        >
          <i className="fa-solid fa-tag" style={{ marginRight: '4px' }}></i>
          {row.tipoPago || 'Comisión'}
        </span>
      ),
    },
    {
      header: 'Monto Liquidado ($)',
      accessorKey: 'montoUSD',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 900, color: '#059669', fontSize: '14px', fontFamily: 'monospace' }}>
          ${Number(row.montoUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      header: 'Descripción / Detalle',
      accessorKey: 'descripcion',
      cell: (row) => (
        <span style={{ color: '#475569', fontSize: '12.5px' }}>
          {row.descripcion || 'Liquidación operativa semanal'}
        </span>
      ),
    },
  ];

  return (
    <div>
      {/* VISTA HEADER 1:1 */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <i className="fa-solid fa-money-check-dollar" style={{ color: '#0284c7', marginRight: '8px' }}></i>
            Pagos Choferes, Materas & Personal
          </h1>
          <p className="view-subtitle">
            Liquidación de fletes por litros transportados, jornales de campo/matera, anticipos y sueldos
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={exportarExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              borderColor: '#10b981',
              color: '#047857',
              background: '#ecfdf5',
            }}
          >
            <i className="fa-solid fa-file-excel"></i> Exportar Nómina
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalNuevo(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
            }}
          >
            <i className="fa-solid fa-plus"></i> + Registrar Pago
          </button>
        </div>
      </div>

      {/* TARJETAS KPIS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>
                Total Pagado Nómina
              </span>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', fontFamily: 'monospace', marginTop: '4px' }}>
                ${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
              <i className="fa-solid fa-dollar-sign"></i>
            </div>
          </div>
        </div>

        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
                Comisiones por Flete
              </span>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#0369a1', fontFamily: 'monospace', marginTop: '4px' }}>
                ${totalComisiones.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
              <i className="fa-solid fa-truck-moving"></i>
            </div>
          </div>
        </div>

        <div className="content-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>
                Sueldos Fijos & Jornales
              </span>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#5b21b6', fontFamily: 'monospace', marginTop: '4px' }}>
                ${totalSueldos.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
              <i className="fa-solid fa-wallet"></i>
            </div>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="content-card" style={{ padding: '16px 20px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '210px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              <i className="fa-solid fa-filter" style={{ color: '#0284c7', marginRight: '4px' }}></i> Modalidad:
            </label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todas las modalidades' },
                { value: 'COMISION_LITROS', label: 'Comisión por Litros' },
                { value: 'SUELDO_FIJO', label: 'Sueldo Fijo' },
                { value: 'BONO', label: 'Bono Operativo' },
                { value: 'JORNAL', label: 'Jornal de Campo' },
              ]}
              value={filtroTipo}
              onChange={(val) => setFiltroTipo(val || '')}
              placeholder="Todas las modalidades"
              searchPlaceholder="Buscar modalidad..."
              allowClear
            />
          </div>

          <div style={{ minWidth: '240px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              <i className="fa-solid fa-user" style={{ color: '#64748b', marginRight: '4px' }}></i> Chofer / Trabajador:
            </label>
            <SearchableSelect
              options={[
                { value: '', label: 'Todos los trabajadores' },
                ...choferes.map((c) => ({ value: String(c.id), label: `${c.nombreCompleto} (${c.cedula})` })),
              ]}
              value={filtroChofer}
              onChange={(val) => setFiltroChofer(val || '')}
              placeholder="Todos los trabajadores"
              searchPlaceholder="Buscar trabajador..."
              allowClear
            />
          </div>
        </div>
      </div>

      {/* Tabla Principal */}
      <DataTable
        data={pagosFiltrados}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por trabajador, referencia, concepto..."
        exportFileName="pagos_personal"
        searchFilter={(row, term) =>
          Boolean(
            (row.usuarioNombre && row.usuarioNombre.toLowerCase().includes(term)) ||
            (row.referenciaBancaria && row.referenciaBancaria.toLowerCase().includes(term)) ||
            (row.descripcion && row.descripcion.toLowerCase().includes(term))
          )
        }
      />

      {/* Modal Registrar Pago */}
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
          <div className="content-card" style={{ width: '100%', maxWidth: '480px', padding: '0', overflow: 'hidden', borderRadius: '16px' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                <i className="fa-solid fa-money-check-dollar" style={{ color: '#0284c7', marginRight: '8px' }}></i>
                Registrar Pago a Trabajador
              </h3>
              <button type="button" onClick={() => setModalNuevo(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}>
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.usuarioId || form.usuarioId === 0) {
                  toast.error('Debe seleccionar el trabajador');
                  return;
                }
                if (form.montoUSD <= 0) {
                  toast.error('El monto debe ser mayor a 0');
                  return;
                }
                crearMutation.mutate(form);
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Trabajador / Chofer *
                </label>
                <ChoferSelect
                  value={form.usuarioId}
                  onChange={(id) => setForm({ ...form, usuarioId: id })}
                  placeholder="-- Seleccionar Trabajador / Chofer --"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Fecha de Pago *
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

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Monto a Pagar ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.montoUSD || ''}
                    onChange={(e) => setForm({ ...form, montoUSD: Number(e.target.value) })}
                    placeholder="0.00"
                    className="form-input"
                    style={{ width: '100%', height: '38px', borderRadius: '8px', fontWeight: 800, color: '#059669' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Modalidad
                  </label>
                  <SearchableSelect
                    options={[
                      { value: 'COMISION_LITROS', label: 'Comisión Litros' },
                      { value: 'SUELDO_FIJO', label: 'Sueldo Fijo' },
                      { value: 'BONO', label: 'Bono Operativo' },
                      { value: 'JORNAL', label: 'Jornal Campo' },
                    ]}
                    value={form.tipoPago}
                    onChange={(val) => setForm({ ...form, tipoPago: val || 'COMISION_LITROS' })}
                    placeholder="Modalidad de pago"
                    searchPlaceholder="Buscar modalidad..."
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Referencia Bancaria
                  </label>
                  <input
                    type="text"
                    value={form.referenciaBancaria}
                    onChange={(e) => setForm({ ...form, referenciaBancaria: e.target.value })}
                    placeholder="123456"
                    className="form-input"
                    style={{ width: '100%', height: '38px', borderRadius: '8px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Descripción / Observaciones
                </label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Detalle de fletes o bono..."
                  className="form-input"
                  style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setModalNuevo(false)} className="btn btn-outline" style={{ height: '38px', padding: '0 16px', borderRadius: '8px' }}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={crearMutation.isPending}
                  className="btn btn-primary"
                  style={{ height: '38px', padding: '0 20px', borderRadius: '8px', background: '#0284c7', border: 'none', fontWeight: 700 }}
                >
                  {crearMutation.isPending ? 'Registrando...' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PagosPersonalPage;
