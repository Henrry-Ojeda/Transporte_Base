import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { combustibleApi } from '@/api/combustible.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { CamionSelect } from '@/components/selectors';
import type {
  CombustibleHistorialDto,
  RegistrarDespachoCombustibleDto,
  RegistrarCompraCombustibleDto,
  AjustarStockCombustibleDto,
} from '@/types';

export const CombustiblePage: React.FC = () => {
  const queryClient = useQueryClient();

  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroCombustible, setFiltroCombustible] = useState<string>('');
  const [filtroCamion, setFiltroCamion] = useState<string>('');

  // Modales
  const [modalDespacho, setModalDespacho] = useState(false);
  const [modalCompra, setModalCompra] = useState(false);
  const [modalAjuste, setModalAjuste] = useState(false);

  // Formularios
  const [formDespacho, setFormDespacho] = useState<RegistrarDespachoCombustibleDto>({
    camionId: 0,
    tipoCombustible: 'GASOIL',
    litros: 0,
    odometroKm: undefined,
    fecha: new Date().toISOString().split('T')[0],
    observaciones: '',
  });

  const [formCompra, setFormCompra] = useState<RegistrarCompraCombustibleDto>({
    tipoCombustible: 'GASOIL',
    litros: 0,
    costoPorLitroUSD: 0.5,
    proveedor: '',
    fecha: new Date().toISOString().split('T')[0],
    observaciones: '',
  });

  const [formAjuste, setFormAjuste] = useState<AjustarStockCombustibleDto>({
    tipoCombustible: 'GASOIL',
    nuevoStock: 0,
    nuevaCapacidad: 10000,
    motivo: '',
  });

  // Queries
  const { data: inventario = [], isLoading: cargandoInventario, refetch: recargarInventario } = useQuery({
    queryKey: ['combustible-inventario'],
    queryFn: combustibleApi.getInventario,
  });

  const { data: historial = [], isLoading: cargandoHistorial, refetch: recargarHistorial } = useQuery({
    queryKey: ['combustible-historial', filtroTipo, filtroCombustible, filtroCamion],
    queryFn: () =>
      combustibleApi.getHistorial(
        filtroCombustible || undefined,
        filtroCamion ? Number(filtroCamion) : undefined,
        100,
        filtroTipo || undefined
      ),
  });

  // Mutaciones
  const mutationDespacho = useMutation({
    mutationFn: combustibleApi.registrarDespacho,
    onSuccess: (data) => {
      toast.success(data.message || 'Despacho registrado correctamente.');
      queryClient.invalidateQueries({ queryKey: ['combustible-inventario'] });
      queryClient.invalidateQueries({ queryKey: ['combustible-historial'] });
      setModalDespacho(false);
      setFormDespacho({
        camionId: 0,
        tipoCombustible: 'GASOIL',
        litros: 0,
        odometroKm: undefined,
        fecha: new Date().toISOString().split('T')[0],
        observaciones: '',
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Error al registrar el despacho.');
    },
  });

  const mutationCompra = useMutation({
    mutationFn: combustibleApi.registrarCompra,
    onSuccess: (data) => {
      toast.success(data.message || 'Compra registrada.');
      queryClient.invalidateQueries({ queryKey: ['combustible-inventario'] });
      queryClient.invalidateQueries({ queryKey: ['combustible-historial'] });
      setModalCompra(false);
      setFormCompra({
        tipoCombustible: 'GASOIL',
        litros: 0,
        costoPorLitroUSD: 0.5,
        proveedor: '',
        fecha: new Date().toISOString().split('T')[0],
        observaciones: '',
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Error al registrar la compra.');
    },
  });

  const mutationAjuste = useMutation({
    mutationFn: combustibleApi.ajustarStock,
    onSuccess: (data) => {
      toast.success(data.message || 'Ajuste de inventario aplicado.');
      queryClient.invalidateQueries({ queryKey: ['combustible-inventario'] });
      queryClient.invalidateQueries({ queryKey: ['combustible-historial'] });
      setModalAjuste(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Error al ajustar el stock.');
    },
  });

  const mutationEliminarMovimiento = useMutation({
    mutationFn: (id: number) => combustibleApi.eliminarMovimiento(id),
    onSuccess: (data) => {
      toast.success(data.message || 'Movimiento revertido y eliminado.');
      queryClient.invalidateQueries({ queryKey: ['combustible-inventario'] });
      queryClient.invalidateQueries({ queryKey: ['combustible-historial'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Error al eliminar el movimiento.');
    },
  });

  // Tanques de inventario directamente desde la BD
  const gasoil = inventario.find((i) => i.tipoCombustible.toUpperCase().includes('GASOIL')) || {
    tipoCombustible: 'GASOIL',
    stockActualLitros: 0,
    capacidadTanqueAlmacen: 10000,
    capacidadTanqueLitros: 10000,
    porcentajeOcupado: 0,
    costoPromedioPorLitroUSD: 0.5,
  };

  const gasolina = inventario.find((i) => i.tipoCombustible.toUpperCase().includes('GASOLINA')) || {
    tipoCombustible: 'GASOLINA',
    stockActualLitros: 0,
    capacidadTanqueAlmacen: 5000,
    capacidadTanqueLitros: 5000,
    porcentajeOcupado: 0,
    costoPromedioPorLitroUSD: 0.5,
  };

  const capGasoil = gasoil.capacidadTanqueAlmacen || gasoil.capacidadTanqueLitros || 10000;
  const capGasolina = gasolina.capacidadTanqueAlmacen || gasolina.capacidadTanqueLitros || 5000;

  const pctGasoil = typeof gasoil.porcentajeOcupado === 'number' && gasoil.porcentajeOcupado > 0
    ? gasoil.porcentajeOcupado
    : Math.min(100, Math.max(0, ((gasoil.stockActualLitros || 0) / capGasoil) * 100));

  const pctGasolina = typeof gasolina.porcentajeOcupado === 'number' && gasolina.porcentajeOcupado > 0
    ? gasolina.porcentajeOcupado
    : Math.min(100, Math.max(0, ((gasolina.stockActualLitros || 0) / capGasolina) * 100));

  const abrirModalAjuste = (tipo: 'GASOIL' | 'GASOLINA' = 'GASOIL') => {
    const tanque = tipo === 'GASOIL' ? gasoil : gasolina;
    const cap = tipo === 'GASOIL' ? capGasoil : capGasolina;
    setFormAjuste({
      tipoCombustible: tipo,
      nuevoStock: tanque.stockActualLitros || 0,
      nuevaCapacidad: cap,
      motivo: '',
    });
    setModalAjuste(true);
  };

  const handleCambioTanqueAjuste = (nuevoTipo: string) => {
    const t = nuevoTipo === 'GASOIL' ? gasoil : gasolina;
    const cap = nuevoTipo === 'GASOIL' ? capGasoil : capGasolina;
    setFormAjuste((prev) => ({
      ...prev,
      tipoCombustible: nuevoTipo,
      nuevoStock: t.stockActualLitros || 0,
      nuevaCapacidad: cap,
    }));
  };

  const columns: ColumnDef<CombustibleHistorialDto>[] = [
    {
      header: 'FECHA',
      accessorKey: 'fecha',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#0f172a' }}>
          {row.fecha ? row.fecha.split('T')[0].split('-').reverse().join('/') : '-'}
        </span>
      ),
    },
    {
      header: 'TIPO MOVIMIENTO',
      accessorKey: 'tipoMovimiento',
      sortable: true,
      cell: (row) => {
        const esDespacho = row.tipoMovimiento === 'DESPACHO_CAMION';
        const esCompra = row.tipoMovimiento === 'COMPRA_INGRESO';
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '11.5px',
              fontWeight: 800,
              background: esDespacho ? '#eff6ff' : esCompra ? '#ecfdf5' : '#fef3c7',
              color: esDespacho ? '#1d4ed8' : esCompra ? '#047857' : '#b45309',
              border: `1px solid ${esDespacho ? '#bfdbfe' : esCompra ? '#a7f3d0' : '#fde68a'}`,
            }}
          >
            <i className={`fa-solid ${esDespacho ? 'fa-truck-arrow-right' : esCompra ? 'fa-cart-arrow-down' : 'fa-sliders'}`}></i>
            {esDespacho ? 'Despacho Camión' : esCompra ? 'Ingreso Compra' : 'Ajuste Stock'}
          </span>
        );
      },
    },
    {
      header: 'COMBUSTIBLE',
      accessorKey: 'tipoCombustible',
      cell: (row) => (
        <span
          style={{
            fontWeight: 800,
            fontSize: '12px',
            color: row.tipoCombustible.toUpperCase().includes('GASOIL') ? '#0284c7' : '#d97706',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <i className={row.tipoCombustible.toUpperCase().includes('GASOIL') ? 'fa-solid fa-oil-well' : 'fa-solid fa-gas-pump'}></i>
          {row.tipoCombustible}
        </span>
      ),
    },
    {
      header: 'VOLUMEN (L)',
      accessorKey: 'litros',
      sortable: true,
      cell: (row) => {
        const esDespacho = row.tipoMovimiento === 'DESPACHO_CAMION';
        return (
          <span style={{ fontWeight: 800, color: esDespacho ? '#dc2626' : '#059669', fontSize: '13.5px' }}>
            {esDespacho ? '-' : '+'}
            {(row.litros || 0).toLocaleString()} <small style={{ fontSize: '11px' }}>L</small>
          </span>
        );
      },
    },
    {
      header: 'STOCK RESULTANTE',
      accessorKey: 'stockNuevoLitros',
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#334155' }}>
          {(row.stockNuevoLitros || 0).toLocaleString()} L
        </span>
      ),
    },
    {
      header: 'DESTINO / VEHÍCULO / PROV',
      cell: (row) => (
        <div>
          {row.camionPlaca ? (
            <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-truck" style={{ color: '#0284c7' }}></i>
              {row.camionPlaca}
            </div>
          ) : row.proveedor ? (
            <div style={{ fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-building"></i>
              {row.proveedor}
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>Ajuste de inventario</span>
          )}
          {row.choferNombre && (
            <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '2px' }}>
              Chofer: {row.choferNombre}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'ODÓMETRO',
      accessorKey: 'odometroKm',
      cell: (row) => (
        <span style={{ color: '#475569', fontFamily: 'monospace', fontWeight: 600 }}>
          {row.odometroKm ? `${row.odometroKm.toLocaleString()} Km` : '-'}
        </span>
      ),
    },
    {
      header: 'DETALLES / OBSERVACIÓN',
      accessorKey: 'observaciones',
      cell: (row) => (
        <span style={{ fontSize: '12px', color: '#64748b' }}>{row.observaciones || '-'}</span>
      ),
    },
    {
      header: 'ACCIONES',
      width: '80px',
      cell: (row) => (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={async () => {
              if (await confirmDeleteOrDeactivate('Revertir y eliminar movimiento', `${row.tipoCombustible} (${row.litros} L)`)) {
                mutationEliminarMovimiento.mutate(row.id);
              }
            }}
            title="Revertir y eliminar movimiento"
            style={{ height: '30px', width: '30px', padding: 0, borderRadius: '6px', color: '#ef4444', borderColor: '#fca5a5' }}
          >
            <i className="fa-solid fa-trash-can" style={{ fontSize: '11px' }}></i>
          </button>
        </div>
      ),
    },
  ];

  return (
    <section id="tab-combustible" className="tab-content active" style={{ display: 'block' }}>
      {/* CABECERA VISTA */}
      <div className="view-header" style={{ marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Flota &amp; Logística / Gestión de Combustible
            </span>
          </div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-gas-pump" style={{ color: '#0284c7' }}></i>
            Gestión y Control de Combustible
          </h1>
          <p className="view-subtitle">
            Control de niveles en tanques de almacenamiento, registro de compras y suministros a la flota cisterna
          </p>
        </div>
        <div className="view-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => abrirModalAjuste('GASOIL')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
          >
            <i className="fa-solid fa-sliders"></i> Ajustar Tanque
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalCompra(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#059669',
              borderColor: '#059669',
              fontWeight: 700,
            }}
          >
            <i className="fa-solid fa-cart-plus"></i> Registrar Compra / Ingreso
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalDespacho(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#0284c7',
              borderColor: '#0284c7',
              fontWeight: 700,
            }}
          >
            <i className="fa-solid fa-truck-droplet"></i> Despachar a Camión
          </button>
        </div>
      </div>

      {/* TARJETAS DE NIVELES DE TANQUE (REDiseñadas sin conflicto de flexbox) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '20px',
          marginBottom: '26px',
        }}
      >
        {/* TANQUE GASOIL */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #bfdbfe',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.08)',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Barra decorativa superior */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #0284c7, #38bdf8)' }} />

          {/* Cabecera del Tanque */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  flexShrink: 0,
                }}
              >
                <i className="fa-solid fa-oil-well"></i>
              </div>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'block' }}>
                  Tanque GASOIL (Diésel)
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Combustible Principal Flota Cisterna</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <span
                style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontWeight: 800,
                  fontSize: '11.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                }}
              >
                <i className="fa-solid fa-database"></i> Cap: {capGasoil.toLocaleString()} L
              </span>
              <button
                type="button"
                onClick={() => abrirModalAjuste('GASOIL')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <i className="fa-solid fa-pen-to-square"></i> Calibrar Tanque
              </button>
            </div>
          </div>

          {/* Métrica principal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '4px' }}>
            <div>
              <span style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                {(gasoil.stockActualLitros || 0).toLocaleString()}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#64748b', marginLeft: '6px' }}>Litros</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 900,
                  color: pctGasoil > 20 ? '#0284c7' : '#dc2626',
                }}
              >
                {pctGasoil.toFixed(1)}%
              </span>
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Nivel de Llenado</span>
            </div>
          </div>

          {/* Barra de Progreso */}
          <div
            style={{
              width: '100%',
              height: '10px',
              background: '#f1f5f9',
              borderRadius: '999px',
              overflow: 'hidden',
              padding: '2px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                width: `${pctGasoil}%`,
                height: '100%',
                background: pctGasoil > 20 ? 'linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)' : '#ef4444',
                borderRadius: '999px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          {/* Métricas secundarias en pie de tarjeta */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '8px',
              borderTop: '1px dashed #e2e8f0',
              fontSize: '12px',
              color: '#64748b',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="fa-solid fa-gauge-high" style={{ color: '#0284c7' }}></i>
              Disponible: <strong style={{ color: '#0f172a' }}>{Math.max(0, capGasoil - (gasoil.stockActualLitros || 0)).toLocaleString()} L</strong> libres
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="fa-solid fa-tag" style={{ color: '#059669' }}></i>
              Costo Prom: <strong style={{ color: '#0f172a' }}>${(gasoil.costoPromedioPorLitroUSD || 0.5).toFixed(2)}/L</strong>
            </span>
          </div>
        </div>

        {/* TANQUE GASOLINA */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #fde68a',
            boxShadow: '0 4px 14px rgba(217, 119, 6, 0.08)',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Barra decorativa superior */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #f59e0b, #d97706)' }} />

          {/* Cabecera del Tanque */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  flexShrink: 0,
                }}
              >
                <i className="fa-solid fa-gas-pump"></i>
              </div>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'block' }}>
                  Tanque GASOLINA
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Vehículos de Supervisión &amp; Apoyo</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <span
                style={{
                  background: '#fffbeb',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontWeight: 800,
                  fontSize: '11.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                }}
              >
                <i className="fa-solid fa-database"></i> Cap: {capGasolina.toLocaleString()} L
              </span>
              <button
                type="button"
                onClick={() => abrirModalAjuste('GASOLINA')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#d97706',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <i className="fa-solid fa-pen-to-square"></i> Calibrar Tanque
              </button>
            </div>
          </div>

          {/* Métrica principal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '4px' }}>
            <div>
              <span style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                {(gasolina.stockActualLitros || 0).toLocaleString()}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#64748b', marginLeft: '6px' }}>Litros</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 900,
                  color: pctGasolina > 20 ? '#d97706' : '#dc2626',
                }}
              >
                {pctGasolina.toFixed(1)}%
              </span>
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Nivel de Llenado</span>
            </div>
          </div>

          {/* Barra de Progreso */}
          <div
            style={{
              width: '100%',
              height: '10px',
              background: '#f1f5f9',
              borderRadius: '999px',
              overflow: 'hidden',
              padding: '2px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                width: `${pctGasolina}%`,
                height: '100%',
                background: pctGasolina > 20 ? 'linear-gradient(90deg, #fbbf24 0%, #d97706 100%)' : '#ef4444',
                borderRadius: '999px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          {/* Métricas secundarias en pie de tarjeta */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '8px',
              borderTop: '1px dashed #e2e8f0',
              fontSize: '12px',
              color: '#64748b',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="fa-solid fa-gauge-high" style={{ color: '#d97706' }}></i>
              Disponible: <strong style={{ color: '#0f172a' }}>{Math.max(0, capGasolina - (gasolina.stockActualLitros || 0)).toLocaleString()} L</strong> libres
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="fa-solid fa-tag" style={{ color: '#059669' }}></i>
              Costo Prom: <strong style={{ color: '#0f172a' }}>${(gasolina.costoPromedioPorLitroUSD || 0.5).toFixed(2)}/L</strong>
            </span>
          </div>
        </div>
      </div>

      {/* TABLA DE HISTORIAL DE MOVIMIENTOS */}
      <div className="content-card" style={{ padding: '24px', borderRadius: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '20px',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#eff6ff',
                color: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              <i className="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                Historial de Movimientos de Combustible
              </h3>
              <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '12.5px' }}>
                Despachos a vehículos cisterna, ingresos por compra y ajustes de calibración
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '200px' }}>
              <SearchableSelect
                options={[
                  { value: '', label: '-- Todos los Movimientos --' },
                  { value: 'DESPACHO_CAMION', label: 'Despachos a Camión' },
                  { value: 'COMPRA_INGRESO', label: 'Compras / Ingresos' },
                  { value: 'AJUSTE', label: 'Ajustes de Inventario' },
                ]}
                value={filtroTipo}
                onChange={(val) => setFiltroTipo(String(val || ''))}
                placeholder="-- Todos los Movimientos --"
                allowClear={true}
              />
            </div>

            <div style={{ minWidth: '170px' }}>
              <SearchableSelect
                options={[
                  { value: '', label: '-- Combustible --' },
                  { value: 'GASOIL', label: 'GASOIL (Diésel)' },
                  { value: 'GASOLINA', label: 'GASOLINA' },
                ]}
                value={filtroCombustible}
                onChange={(val) => setFiltroCombustible(String(val || ''))}
                placeholder="-- Combustible --"
                allowClear={true}
              />
            </div>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                recargarInventario();
                recargarHistorial();
                toast.success('Datos de combustible sincronizados');
              }}
              title="Refrescar datos"
              style={{ height: '38px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <i className={`fa-solid fa-arrows-rotate ${cargandoHistorial || cargandoInventario ? 'fa-spin' : ''}`}></i>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Actualizar</span>
            </button>
          </div>
        </div>

        <DataTable
          data={historial.filter((h) => {
            if (filtroCombustible && !h.tipoCombustible.toUpperCase().includes(filtroCombustible.toUpperCase())) {
              return false;
            }
            return true;
          })}
          columns={columns}
          isLoading={cargandoHistorial}
          searchPlaceholder="Buscar por camión, chofer, proveedor u observación..."
          exportFileName="historial_combustible"
        />
      </div>

      {/* MODAL DESPACHO A CAMIÓN */}
      {modalDespacho && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#ffffff',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Cabecera Modal Premium */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                padding: '20px 24px',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'rgba(2, 132, 199, 0.25)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  <i className="fa-solid fa-truck-droplet"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f8fafc' }}>
                    Despachar Combustible a Vehículo
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    Suministro directo desde el tanque de almacenamiento
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalDespacho(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formDespacho.camionId || formDespacho.litros <= 0) {
                  toast.error('Selecciona un vehículo cisterna y una cantidad de litros válida');
                  return;
                }
                const tanqueSel = formDespacho.tipoCombustible === 'GASOIL' ? gasoil : gasolina;
                if (formDespacho.litros > (tanqueSel.stockActualLitros || 0)) {
                  toast.error(`Stock insuficiente en tanque ${formDespacho.tipoCombustible} (${(tanqueSel.stockActualLitros || 0).toLocaleString()} L disponibles)`);
                  return;
                }
                mutationDespacho.mutate(formDespacho);
              }}
              style={{ padding: '24px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Vehículo / Camión Cisterna *
                  </label>
                  <CamionSelect
                    value={formDespacho.camionId || undefined}
                    onChange={(val) => setFormDespacho({ ...formDespacho, camionId: val || 0 })}
                    placeholder="-- Seleccionar Unidad Cisterna --"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Tipo de Combustible *
                    </label>
                    <SearchableSelect
                      options={[
                        { value: 'GASOIL', label: 'GASOIL (Diésel)' },
                        { value: 'GASOLINA', label: 'GASOLINA' },
                      ]}
                      value={formDespacho.tipoCombustible}
                      onChange={(val) => setFormDespacho({ ...formDespacho, tipoCombustible: String(val || 'GASOIL') })}
                      allowClear={false}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Litros Despachados *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={formDespacho.litros || ''}
                        onChange={(e) => setFormDespacho({ ...formDespacho, litros: Number(e.target.value) })}
                        className="form-input"
                        placeholder="Ej: 150"
                        style={{ width: '100%', height: '42px', fontWeight: 800, fontSize: '15px', color: '#0284c7', paddingRight: '35px' }}
                        required
                      />
                      <span style={{ position: 'absolute', right: '12px', top: '11px', color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>
                        L
                      </span>
                    </div>
                  </div>
                </div>

                {/* Info de stock disponible */}
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Stock disponible en tanque {formDespacho.tipoCombustible}:</span>
                  <strong style={{ color: '#0284c7' }}>
                    {((formDespacho.tipoCombustible === 'GASOIL' ? gasoil.stockActualLitros : gasolina.stockActualLitros) || 0).toLocaleString()} L
                  </strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Fecha Despacho *
                    </label>
                    <input
                      type="date"
                      value={formDespacho.fecha}
                      onChange={(e) => setFormDespacho({ ...formDespacho, fecha: e.target.value })}
                      className="form-input"
                      style={{ width: '100%', height: '42px' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Odómetro Actual (Km)
                    </label>
                    <input
                      type="number"
                      value={formDespacho.odometroKm || ''}
                      onChange={(e) => setFormDespacho({ ...formDespacho, odometroKm: e.target.value ? Number(e.target.value) : undefined })}
                      className="form-input"
                      placeholder="Ej: 145000"
                      style={{ width: '100%', height: '42px', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Observaciones / Nota
                  </label>
                  <input
                    type="text"
                    value={formDespacho.observaciones || ''}
                    onChange={(e) => setFormDespacho({ ...formDespacho, observaciones: e.target.value })}
                    className="form-input"
                    placeholder="Turno, surtidor, chofer u observaciones adicionales"
                    style={{ width: '100%', height: '42px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setModalDespacho(false)}
                  className="btn btn-outline"
                  style={{ height: '40px', padding: '0 18px', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={mutationDespacho.isPending}
                  className="btn btn-primary"
                  style={{ height: '40px', padding: '0 22px', background: '#0284c7', borderColor: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {mutationDespacho.isPending ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Despachando...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i> Confirmar Despacho
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL COMPRA / INGRESO */}
      {modalCompra && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#ffffff',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Cabecera Modal Premium */}
            <div
              style={{
                background: 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)',
                padding: '20px 24px',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.25)',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    color: '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  <i className="fa-solid fa-cart-plus"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f8fafc' }}>
                    Registrar Compra / Ingreso de Combustible
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#a7f3d0' }}>
                    Ingreso a tanques de almacenamiento y actualización de costo promedio
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalCompra(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (formCompra.litros <= 0) {
                  toast.error('Ingresa una cantidad de litros válida');
                  return;
                }
                mutationCompra.mutate(formCompra);
              }}
              style={{ padding: '24px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Tanque de Destino *
                    </label>
                    <SearchableSelect
                      options={[
                        { value: 'GASOIL', label: 'Tanque GASOIL (Diésel)' },
                        { value: 'GASOLINA', label: 'Tanque GASOLINA' },
                      ]}
                      value={formCompra.tipoCombustible}
                      onChange={(val) => setFormCompra({ ...formCompra, tipoCombustible: String(val || 'GASOIL') })}
                      allowClear={false}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Litros Comprados *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={formCompra.litros || ''}
                        onChange={(e) => setFormCompra({ ...formCompra, litros: Number(e.target.value) })}
                        className="form-input"
                        placeholder="Ej: 5000"
                        style={{ width: '100%', height: '42px', fontWeight: 800, fontSize: '15px', color: '#059669', paddingRight: '35px' }}
                        required
                      />
                      <span style={{ position: 'absolute', right: '12px', top: '11px', color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>
                        L
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Costo / Litro ($ USD) *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '11px', color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>
                        $
                      </span>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={formCompra.costoPorLitroUSD}
                        onChange={(e) => setFormCompra({ ...formCompra, costoPorLitroUSD: Number(e.target.value) })}
                        className="form-input"
                        style={{ width: '100%', height: '42px', paddingLeft: '28px', fontWeight: 700 }}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Proveedor / Distribuidor
                    </label>
                    <input
                      type="text"
                      value={formCompra.proveedor || ''}
                      onChange={(e) => setFormCompra({ ...formCompra, proveedor: e.target.value })}
                      className="form-input"
                      placeholder="PDVSA / Cisterna Mayorista"
                      style={{ width: '100%', height: '42px' }}
                    />
                  </div>
                </div>

                {/* Subtotal estimado */}
                <div style={{ background: '#ecfdf5', padding: '12px 16px', borderRadius: '10px', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#047857' }}>Inversión Total Estimada:</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#047857' }}>
                    ${((formCompra.litros || 0) * (formCompra.costoPorLitroUSD || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Fecha de Ingreso *
                    </label>
                    <input
                      type="date"
                      value={formCompra.fecha}
                      onChange={(e) => setFormCompra({ ...formCompra, fecha: e.target.value })}
                      className="form-input"
                      style={{ width: '100%', height: '42px' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Observaciones / Factura
                    </label>
                    <input
                      type="text"
                      value={formCompra.observaciones || ''}
                      onChange={(e) => setFormCompra({ ...formCompra, observaciones: e.target.value })}
                      className="form-input"
                      placeholder="Nro Factura / Guía de despacho"
                      style={{ width: '100%', height: '42px' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setModalCompra(false)}
                  className="btn btn-outline"
                  style={{ height: '40px', padding: '0 18px', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={mutationCompra.isPending}
                  className="btn btn-primary"
                  style={{ height: '40px', padding: '0 22px', background: '#059669', borderColor: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {mutationCompra.isPending ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Guardando...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i> Registrar Ingreso
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL AJUSTE / CALIBRACIÓN DE TANQUE */}
      {modalAjuste && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              background: '#ffffff',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Cabecera Modal Premium */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                padding: '20px 24px',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'rgba(56, 189, 248, 0.2)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  <i className="fa-solid fa-sliders"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f8fafc' }}>
                    Calibrar / Ajustar Tanque
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    Ajuste de inventario físico y capacidad en Base de Datos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAjuste(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (formAjuste.nuevoStock < 0) {
                  toast.error('El stock físico no puede ser negativo');
                  return;
                }
                if (!formAjuste.motivo.trim()) {
                  toast.error('Indica el motivo del ajuste');
                  return;
                }
                mutationAjuste.mutate(formAjuste);
              }}
              style={{ padding: '24px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Tanque a Calibrar *
                  </label>
                  <SearchableSelect
                    options={[
                      { value: 'GASOIL', label: 'Tanque GASOIL (Diésel)' },
                      { value: 'GASOLINA', label: 'Tanque GASOLINA' },
                    ]}
                    value={formAjuste.tipoCombustible}
                    onChange={(val) => handleCambioTanqueAjuste(String(val || 'GASOIL'))}
                    allowClear={false}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Capacidad del Tanque (L)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={formAjuste.nuevaCapacidad || ''}
                      onChange={(e) => setFormAjuste({ ...formAjuste, nuevaCapacidad: Number(e.target.value) })}
                      className="form-input"
                      placeholder="Ej: 10000"
                      style={{ width: '100%', height: '42px', fontWeight: 700, color: '#0284c7' }}
                    />
                    <small style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '3px' }}>
                      Capacidad máxima en BD
                    </small>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Nuevo Stock Físico (L) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formAjuste.nuevoStock}
                      onChange={(e) => setFormAjuste({ ...formAjuste, nuevoStock: Number(e.target.value) })}
                      className="form-input"
                      placeholder="Ej: 8500"
                      style={{ width: '100%', height: '42px', fontWeight: 800, fontSize: '15px', color: '#0f172a' }}
                      required
                    />
                    <small style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '3px' }}>
                      Lectura de varilla o sensor
                    </small>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Motivo / Justificación del Ajuste *
                  </label>
                  <input
                    type="text"
                    value={formAjuste.motivo}
                    onChange={(e) => setFormAjuste({ ...formAjuste, motivo: e.target.value })}
                    className="form-input"
                    placeholder="Ej: Calibración mensual con varilla, evaporación, etc."
                    style={{ width: '100%', height: '42px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setModalAjuste(false)}
                  className="btn btn-outline"
                  style={{ height: '40px', padding: '0 18px', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={mutationAjuste.isPending}
                  className="btn btn-primary"
                  style={{ height: '40px', padding: '0 22px', background: '#0284c7', borderColor: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {mutationAjuste.isPending ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Guardando...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i> Aplicar Ajuste
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default CombustiblePage;
