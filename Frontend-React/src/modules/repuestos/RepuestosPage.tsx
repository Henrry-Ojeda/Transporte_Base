import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { repuestosApi } from '@/api/repuestos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { CamionSelect } from '@/components/selectors';
import type {
  RepuestoDto,
  GuardarRepuestoDto,
  MovimientoRepuestoDto,
  RegistrarMovimientoRepuestoDto,
} from '@/types';

export const RepuestosPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'catalogo' | 'movimientos'>('catalogo');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [modalRepuesto, setModalRepuesto] = useState(false);
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);
  const [modalMovimiento, setModalMovimiento] = useState(false);

  // Form Repuesto
  const initialFormRepuesto: GuardarRepuestoDto = {
    codigo: '',
    nombre: '',
    categoria: 'FILTROS',
    stockActual: 0,
    stockMinimo: 2,
    costoUnitarioUSD: 0,
    ubicacionAlmacen: 'ESTANTE A-1',
    activo: true,
  };
  const [formRepuesto, setFormRepuesto] = useState<GuardarRepuestoDto>(initialFormRepuesto);

  // Form Movimiento
  const initialFormMovimiento: RegistrarMovimientoRepuestoDto = {
    repuestoId: 0,
    tipoMovimiento: 'SALIDA_MANTENIMIENTO',
    cantidad: 1,
    costoUnitarioUSD: 0,
    camionId: undefined,
    fecha: new Date().toISOString().split('T')[0],
    observaciones: '',
  };
  const [formMovimiento, setFormMovimiento] = useState<RegistrarMovimientoRepuestoDto>(initialFormMovimiento);

  // Queries
  const { data: repuestos = [], isLoading: loadingRepuestos, refetch: refetchRepuestos } = useQuery<RepuestoDto[]>({
    queryKey: ['repuestos', filtroCategoria],
    queryFn: () => repuestosApi.getRepuestos(filtroCategoria || undefined),
  });

  const { data: movimientos = [], isLoading: loadingMovimientos } = useQuery<MovimientoRepuestoDto[]>({
    queryKey: ['repuestos-movimientos'],
    queryFn: () => repuestosApi.getMovimientos(),
  });

  const categoriaOptions: SelectOption[] = [
    { value: 'LUBRICANTES', label: 'Lubricantes / Aceites' },
    { value: 'FILTROS', label: 'Filtros (Aceite, Diésel, Aire)' },
    { value: 'CAUCHOS', label: 'Cauchos / Neumáticos' },
    { value: 'MOTOR', label: 'Motor / Inyección' },
    { value: 'FRENOS', label: 'Frenos y Suspensión' },
    { value: 'ELECTRICIDAD', label: 'Electricidad / Baterías' },
    { value: 'OTROS', label: 'Otros Repuestos' },
  ];

  const repuestoOptions: SelectOption[] = useMemo(
    () =>
      repuestos.map((r) => ({
        value: r.id,
        label: `${r.codigo} - ${r.nombre}`,
        subLabel: `Categoría: ${r.categoria} | Ubicación: ${r.ubicacionAlmacen || 'Almacén'}`,
        badge: `Stock: ${r.stockActual}`,
      })),
    [repuestos]
  );

  // Mutaciones
  const mutationGuardarRepuesto = useMutation({
    mutationFn: (dto: GuardarRepuestoDto) =>
      modoEdicionId ? repuestosApi.actualizar(modoEdicionId, dto) : repuestosApi.crear(dto),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Repuesto guardado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['repuestos'] });
      cerrarModalRepuesto();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar repuesto');
    },
  });

  const mutationEliminarRepuesto = useMutation({
    mutationFn: (id: number) => repuestosApi.eliminar(id),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Repuesto eliminado');
      queryClient.invalidateQueries({ queryKey: ['repuestos'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al eliminar repuesto');
    },
  });

  const mutationMovimiento = useMutation({
    mutationFn: (dto: RegistrarMovimientoRepuestoDto) => repuestosApi.registrarMovimiento(dto),
    onSuccess: (data) => {
      toast.success(data.message || 'Movimiento de repuesto registrado');
      queryClient.invalidateQueries({ queryKey: ['repuestos'] });
      queryClient.invalidateQueries({ queryKey: ['repuestos-movimientos'] });
      setModalMovimiento(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al registrar movimiento');
    },
  });

  const abrirModalCrearRepuesto = () => {
    setModoEdicionId(null);
    setFormRepuesto(initialFormRepuesto);
    setModalRepuesto(true);
  };

  const abrirModalEditarRepuesto = (item: RepuestoDto) => {
    setModoEdicionId(item.id);
    setFormRepuesto({
      codigo: item.codigo,
      nombre: item.nombre,
      categoria: item.categoria,
      stockActual: item.stockActual,
      stockMinimo: item.stockMinimo,
      costoUnitarioUSD: item.costoUnitarioUSD,
      ubicacionAlmacen: item.ubicacionAlmacen || '',
      activo: item.activo,
    });
    setModalRepuesto(true);
  };

  const cerrarModalRepuesto = () => {
    setModalRepuesto(false);
    setModoEdicionId(null);
  };

  const abrirModalMovimientoConTipo = (tipo: 'ENTRADA_COMPRA' | 'SALIDA_MANTENIMIENTO' | 'AJUSTE') => {
    setFormMovimiento({
      ...initialFormMovimiento,
      tipoMovimiento: tipo,
      repuestoId: repuestos[0]?.id || 0,
      costoUnitarioUSD: repuestos[0]?.costoUnitarioUSD || 0,
    });
    setModalMovimiento(true);
  };

  // KPIs
  const totalRepuestos = repuestos.length;
  const stockCriticoCount = repuestos.filter((r) => r.stockActual <= r.stockMinimo).length;
  const valorizadoAlmacenUSD = repuestos.reduce((acc, r) => acc + (r.stockActual * (r.costoUnitarioUSD || 0)), 0);

  const columnsCatalogo: ColumnDef<RepuestoDto>[] = [
    {
      header: 'CÓDIGO',
      accessorKey: 'codigo',
      sortable: true,
      width: '130px',
      cell: (row) => (
        <span style={{ fontWeight: 800, fontFamily: 'monospace', color: '#2563eb' }}>
          {row.codigo}
        </span>
      ),
    },
    {
      header: 'NOMBRE / CATEGORÍA',
      accessorKey: 'nombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.nombre}</div>
          <span style={{ fontSize: '11px', color: '#64748b' }}>{row.categoria}</span>
        </div>
      ),
    },
    {
      header: 'CATEGORÍA',
      accessorKey: 'categoria',
      sortable: true,
      width: '140px',
      cell: (row) => (
        <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 800 }}>
          {row.categoria}
        </span>
      ),
    },
    {
      header: 'STOCK',
      accessorKey: 'stockActual',
      sortable: true,
      width: '110px',
      cell: (row) => {
        const esBajo = row.stockActual <= row.stockMinimo;
        return (
          <span
            style={{
              fontWeight: 900,
              fontFamily: 'monospace',
              fontSize: '14px',
              color: esBajo ? '#dc2626' : '#059669',
            }}
          >
            {row.stockActual}
            {esBajo && <i className="fa-solid fa-triangle-exclamation" style={{ marginLeft: '6px', color: '#f59e0b', fontSize: '12px' }}></i>}
          </span>
        );
      },
    },
    {
      header: 'MÍNIMO',
      accessorKey: 'stockMinimo',
      width: '100px',
      cell: (row) => <span style={{ color: '#64748b', fontWeight: 600 }}>{row.stockMinimo}</span>,
    },
    {
      header: 'COSTO (USD)',
      accessorKey: 'costoUnitarioUSD',
      sortable: true,
      width: '120px',
      cell: (row) => (
        <span style={{ fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
          ${Number(row.costoUnitarioUSD || 0).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'UBICACIÓN',
      accessorKey: 'ubicacionAlmacen',
      cell: (row) => <span style={{ color: '#475569', fontSize: '12px' }}>{row.ubicacionAlmacen || 'Almacén Central'}</span>,
    },
    {
      header: 'ACCIONES',
      width: '90px',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => abrirModalEditarRepuesto(row)}
            title="Editar repuesto"
            style={{ height: '30px', width: '30px', padding: 0, borderRadius: '6px' }}
          >
            <i className="fa-solid fa-pen-to-square" style={{ fontSize: '11px' }}></i>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={async () => {
              if (await confirmDeleteOrDeactivate('Eliminar el repuesto', row.nombre)) {
                mutationEliminarRepuesto.mutate(row.id);
              }
            }}
            title="Eliminar"
            style={{ height: '30px', width: '30px', padding: 0, borderRadius: '6px', color: '#ef4444', borderColor: '#fca5a5' }}
          >
            <i className="fa-solid fa-trash-can" style={{ fontSize: '11px' }}></i>
          </button>
        </div>
      ),
    },
  ];

  const columnsMovimientos: ColumnDef<MovimientoRepuestoDto>[] = [
    {
      header: 'FECHA',
      accessorKey: 'fecha',
      sortable: true,
      width: '105px',
      cell: (row) => (
        <strong style={{ color: '#0f172a', fontSize: '13px', fontWeight: 700 }}>
          {row.fecha ? row.fecha.split('T')[0] : '-'}
        </strong>
      ),
    },
    {
      header: 'TIPO',
      accessorKey: 'tipoMovimiento',
      sortable: true,
      width: '140px',
      cell: (row) => {
        const esEntrada = row.tipoMovimiento === 'ENTRADA_COMPRA';
        return (
          <span
            className="badge"
            style={{
              background: esEntrada ? '#ecfdf5' : '#fef2f2',
              color: esEntrada ? '#059669' : '#dc2626',
              border: `1px solid ${esEntrada ? '#a7f3d0' : '#fecaca'}`,
              fontWeight: 800,
            }}
          >
            <i className={`fa-solid ${esEntrada ? 'fa-arrow-down' : 'fa-arrow-up'}`} style={{ marginRight: '4px' }}></i>
            {esEntrada ? 'Compra / Ingreso' : 'Salida a Camión'}
          </span>
        );
      },
    },
    {
      header: 'REPUESTO',
      accessorKey: 'repuestoNombre',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.repuestoNombre}</div>
          <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{row.repuestoCodigo}</span>
        </div>
      ),
    },
    {
      header: 'CANTIDAD',
      accessorKey: 'cantidad',
      sortable: true,
      width: '110px',
      cell: (row) => (
        <span style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', fontSize: '14px' }}>
          {row.cantidad} unid.
        </span>
      ),
    },
    {
      header: 'DESTINO / CAMIÓN',
      accessorKey: 'camionPlaca',
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#334155' }}>
          {row.camionPlaca ? (
            <span>
              <i className="fa-solid fa-truck" style={{ color: '#2563eb', marginRight: '6px' }}></i>
              {row.camionPlaca}
            </span>
          ) : (
            'Almacén General'
          )}
        </span>
      ),
    },
    {
      header: 'COSTO TOTAL',
      cell: (row) => {
        const total = (row.cantidad || 0) * (row.costoUnitarioUSD || 0);
        return (
          <span style={{ fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
            ${total.toFixed(2)}
          </span>
        );
      },
    },
    {
      header: 'OBSERVACIÓN',
      accessorKey: 'observaciones',
      cell: (row) => <span style={{ color: '#475569', fontSize: '12px' }}>{row.observaciones || '-'}</span>,
    },
  ];

  return (
    <section id="tab-repuestos" className="tab-content" style={{ display: 'block' }}>
      {/* CABECERA VISTA */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <i className="fa-solid fa-boxes-stacked" style={{ color: '#10b981', marginRight: '10px' }}></i>
            Inventario de Repuestos y Almacén
          </h1>
          <p className="view-subtitle">
            Control de existencias, alerta de stock crítico y suministro de piezas para el mantenimiento de camiones
          </p>
        </div>
        <div className="view-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => abrirModalMovimientoConTipo('SALIDA_MANTENIMIENTO')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' }}
          >
            <i className="fa-solid fa-arrow-up-from-bracket"></i> Salida a Camión
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => abrirModalMovimientoConTipo('ENTRADA_COMPRA')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', borderColor: '#86efac', background: '#f0fdf4' }}
          >
            <i className="fa-solid fa-cart-plus"></i> Entrada / Compra
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={abrirModalCrearRepuesto}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#10b981', borderColor: '#10b981' }}
          >
            <i className="fa-solid fa-plus"></i> Nuevo Repuesto
          </button>
        </div>
      </div>

      {/* KPIS DE STOCK */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div className="kpi-card glass-emerald">
          <div className="kpi-icon-wrap">
            <i className="fa-solid fa-boxes-packing"></i>
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Total Repuestos</span>
            <div className="kpi-value">{totalRepuestos}</div>
            <span className="kpi-foot">Ítems catalogados</span>
          </div>
        </div>

        <div className="kpi-card glass-amber">
          <div className="kpi-icon-wrap">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Stock Mínimo / Alerta</span>
            <div className="kpi-value" style={{ color: stockCriticoCount > 0 ? '#d97706' : '#059669' }}>
              {stockCriticoCount}
            </div>
            <span className="kpi-foot" style={{ color: stockCriticoCount > 0 ? '#b45309' : '#059669', fontWeight: 700 }}>
              {stockCriticoCount > 0 ? 'Requieren reposición' : 'Existencias saludables'}
            </span>
          </div>
        </div>

        <div className="kpi-card glass-blue">
          <div className="kpi-icon-wrap">
            <i className="fa-solid fa-dollar-sign"></i>
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Valorizado Almacén</span>
            <div className="kpi-value">${valorizadoAlmacenUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <span className="kpi-foot">Capital en existencias</span>
          </div>
        </div>
      </div>

      {/* SUB-PESTAÑAS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '2px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('catalogo')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'catalogo' ? '3px solid #10b981' : 'none',
            background: 'transparent',
            fontWeight: 800,
            fontSize: '13.5px',
            color: activeTab === 'catalogo' ? '#10b981' : '#64748b',
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-list-check"></i> Catálogo y Stock Actual ({repuestos.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('movimientos')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'movimientos' ? '3px solid #10b981' : 'none',
            background: 'transparent',
            fontWeight: 800,
            fontSize: '13.5px',
            color: activeTab === 'movimientos' ? '#10b981' : '#64748b',
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-clock-rotate-left"></i> Historial de Movimientos (Kárdex) ({movimientos.length})
        </button>
      </div>

      {activeTab === 'catalogo' ? (
        <DataTable
          data={repuestos}
          columns={columnsCatalogo}
          isLoading={loadingRepuestos}
          searchPlaceholder="Buscar repuesto por código, nombre o ubicación..."
          exportFileName="catalogo_repuestos"
          searchFilter={(row, term) =>
            Boolean(
              row.codigo.toLowerCase().includes(term) ||
              row.nombre.toLowerCase().includes(term) ||
              row.categoria.toLowerCase().includes(term) ||
              (row.ubicacionAlmacen && row.ubicacionAlmacen.toLowerCase().includes(term))
            )
          }
          actions={
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ minWidth: '220px' }}>
                <SearchableSelect
                  options={[{ value: '', label: '-- Todas las Categorías --' }, ...categoriaOptions]}
                  value={filtroCategoria}
                  onChange={(val) => setFiltroCategoria(String(val || ''))}
                  placeholder="-- Todas las Categorías --"
                  allowClear={true}
                />
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => refetchRepuestos()}
                style={{ height: '38px', padding: '0 12px' }}
                title="Refrescar"
              >
                <i className="fa-solid fa-arrows-rotate"></i>
              </button>
            </div>
          }
        />
      ) : (
        <DataTable
          data={movimientos}
          columns={columnsMovimientos}
          isLoading={loadingMovimientos}
          searchPlaceholder="Buscar por repuesto, código, camión u observaciones..."
          exportFileName="kardex_repuestos"
          searchFilter={(row, term) =>
            Boolean(
              (row.repuestoNombre && row.repuestoNombre.toLowerCase().includes(term)) ||
              (row.repuestoCodigo && row.repuestoCodigo.toLowerCase().includes(term)) ||
              (row.camionPlaca && row.camionPlaca.toLowerCase().includes(term)) ||
              (row.observaciones && row.observaciones.toLowerCase().includes(term))
            )
          }
        />
      )}

      {/* MODAL CREAR / EDITAR REPUESTO */}
      {modalRepuesto && (
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
              maxWidth: '540px',
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
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-boxes-stacked"></i>
                {modoEdicionId ? 'Editar Repuesto' : 'Nuevo Repuesto'}
              </h3>
              <button
                type="button"
                onClick={cerrarModalRepuesto}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '16px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formRepuesto.codigo || !formRepuesto.nombre) {
                  toast.error('Complete código y nombre del repuesto');
                  return;
                }
                mutationGuardarRepuesto.mutate(formRepuesto);
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Código de Repuesto *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="Ej: FIL-001"
                    value={formRepuesto.codigo}
                    onChange={(e) => setFormRepuesto({ ...formRepuesto, codigo: e.target.value.toUpperCase() })}
                    style={{ height: '38px', fontWeight: 800, fontFamily: 'monospace' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Categoría *
                  </label>
                  <SearchableSelect
                    options={categoriaOptions}
                    value={formRepuesto.categoria}
                    onChange={(val) => setFormRepuesto({ ...formRepuesto, categoria: String(val || 'OTROS') })}
                    allowClear={false}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Nombre del Repuesto / Pieza *
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ej: Filtro de Aceite LF16015 Fleetguard"
                  value={formRepuesto.nombre}
                  onChange={(e) => setFormRepuesto({ ...formRepuesto, nombre: e.target.value })}
                  style={{ height: '38px', fontWeight: 600 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    {modoEdicionId ? 'Stock Actual' : 'Stock Inicial'}
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={formRepuesto.stockActual}
                    onChange={(e) => setFormRepuesto({ ...formRepuesto, stockActual: Number(e.target.value) || 0 })}
                    style={{ height: '38px', fontWeight: 800 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Stock Mínimo
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={formRepuesto.stockMinimo}
                    onChange={(e) => setFormRepuesto({ ...formRepuesto, stockMinimo: Number(e.target.value) || 0 })}
                    style={{ height: '38px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Costo USD ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={formRepuesto.costoUnitarioUSD}
                    onChange={(e) => setFormRepuesto({ ...formRepuesto, costoUnitarioUSD: Number(e.target.value) || 0 })}
                    style={{ height: '38px', fontWeight: 800, color: '#059669' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Ubicación en Almacén
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: Estante B-3, Pasillo Central"
                  value={formRepuesto.ubicacionAlmacen}
                  onChange={(e) => setFormRepuesto({ ...formRepuesto, ubicacionAlmacen: e.target.value })}
                  style={{ height: '38px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={cerrarModalRepuesto}
                  style={{ height: '38px', padding: '0 16px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={mutationGuardarRepuesto.isPending}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    fontWeight: 700,
                    background: '#10b981',
                    border: 'none',
                  }}
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  {mutationGuardarRepuesto.isPending ? 'Guardando...' : modoEdicionId ? 'Actualizar' : 'Guardar Repuesto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOVIMIENTO REPUESTO (ENTRADA / SALIDA) */}
      {modalMovimiento && (
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
              maxWidth: '520px',
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
                background: formMovimiento.tipoMovimiento === 'ENTRADA_COMPRA' ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className={`fa-solid ${formMovimiento.tipoMovimiento === 'ENTRADA_COMPRA' ? 'fa-cart-plus' : 'fa-arrow-up-from-bracket'}`}></i>
                {formMovimiento.tipoMovimiento === 'ENTRADA_COMPRA' ? 'Registrar Entrada / Compra de Repuesto' : 'Registrar Salida de Repuesto a Camión'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMovimiento(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '16px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (formMovimiento.repuestoId === 0 || formMovimiento.cantidad <= 0) {
                  toast.error('Seleccione un repuesto y una cantidad válida');
                  return;
                }
                if (formMovimiento.tipoMovimiento === 'SALIDA_MANTENIMIENTO' && !formMovimiento.camionId) {
                  toast.error('Seleccione el camión cisterna receptor');
                  return;
                }
                mutationMovimiento.mutate(formMovimiento);
              }}
              style={{ padding: '20px' }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Repuesto a mover *
                </label>
                <SearchableSelect
                  options={repuestoOptions}
                  value={formMovimiento.repuestoId || ''}
                  onChange={(val) => {
                    const rId = Number(val) || 0;
                    const rep = repuestos.find((r) => r.id === rId);
                    setFormMovimiento({
                      ...formMovimiento,
                      repuestoId: rId,
                      costoUnitarioUSD: rep?.costoUnitarioUSD || 0,
                    });
                  }}
                  placeholder="-- Seleccionar Repuesto --"
                  allowClear={false}
                  required
                />
              </div>

              {formMovimiento.tipoMovimiento === 'SALIDA_MANTENIMIENTO' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Camión Cisterna Receptor *
                  </label>
                  <CamionSelect
                    value={formMovimiento.camionId}
                    onChange={(id) => setFormMovimiento({ ...formMovimiento, camionId: id })}
                    placeholder="-- Seleccionar Camión Cisterna --"
                    required
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Cantidad *
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    required
                    value={formMovimiento.cantidad}
                    onChange={(e) => setFormMovimiento({ ...formMovimiento, cantidad: Number(e.target.value) || 1 })}
                    style={{ height: '38px', fontWeight: 800, fontSize: '15px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Costo Unitario ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={formMovimiento.costoUnitarioUSD}
                    onChange={(e) => setFormMovimiento({ ...formMovimiento, costoUnitarioUSD: Number(e.target.value) || 0 })}
                    style={{ height: '38px', fontWeight: 800, color: '#059669' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Observaciones / Justificación
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: Cambio de filtro preventivo de ruta #..."
                  value={formMovimiento.observaciones}
                  onChange={(e) => setFormMovimiento({ ...formMovimiento, observaciones: e.target.value })}
                  style={{ height: '38px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setModalMovimiento(false)}
                  style={{ height: '38px', padding: '0 16px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={mutationMovimiento.isPending}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    fontWeight: 700,
                    background: formMovimiento.tipoMovimiento === 'ENTRADA_COMPRA' ? '#059669' : '#dc2626',
                    border: 'none',
                  }}
                >
                  <i className="fa-solid fa-check"></i>
                  {mutationMovimiento.isPending ? 'Registrando...' : 'Confirmar Movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
