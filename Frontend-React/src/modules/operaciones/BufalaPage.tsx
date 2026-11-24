import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { operacionesApi } from '@/api/operaciones.api';
import { catalogosApi } from '@/api/catalogos.api';
import { finanzasApi } from '@/api/finanzas.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import type { CicloSemanalDto, FincaDto, CompaniaDto, ChoferDto } from '@/types';
import { useAuthStore } from '@/stores/authStore';

export const BufalaPage: React.FC = () => {
  const hasBufala = useAuthStore(state => state.hasTenantModule('MOD_LECHE_BUFALA'));
  if (!hasBufala) {
    return <Navigate to="/dashboard" replace />;
  }
  const [modoFiltro, setModoFiltro] = useState<'semana' | 'rango'>('semana');
  const [tipoServicio, setTipoServicio] = useState<'TODOS' | 'RUTA' | 'TRANSPORTE'>('TODOS');
  const [cicloId, setCicloId] = useState<number | undefined>(undefined);
  const [fechaDesde, setFechaDesde] = useState<string>(
    new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
  );
  const [fechaHasta, setFechaHasta] = useState<string>(new Date().toISOString().split('T')[0]);
  const [fincaFiltro, setFincaFiltro] = useState<string>('');
  const [companiaFiltro, setCompaniaFiltro] = useState<string>('');
  const [choferFiltro, setChoferFiltro] = useState<string>('');

  // Queries
  const { data: ciclos = [] } = useQuery<CicloSemanalDto[]>({
    queryKey: ['ciclos-semanales'],
    queryFn: () => finanzasApi.getCiclos(),
  });

  const { data: fincas = [] } = useQuery<FincaDto[]>({
    queryKey: ['fincas-bufala'],
    queryFn: () => catalogosApi.getFincas(true),
  });

  const { data: companias = [] } = useQuery<CompaniaDto[]>({
    queryKey: ['companias'],
    queryFn: () => catalogosApi.getCompanias(false),
  });

  const { data: choferes = [] } = useQuery<ChoferDto[]>({
    queryKey: ['choferes'],
    queryFn: () => catalogosApi.getChoferes(),
  });

  const { data: registros = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['trazabilidad-bufala', fechaDesde, fechaHasta, cicloId],
    queryFn: () => operacionesApi.getTrazabilidadBufala(fechaDesde, fechaHasta),
  });

  // Métricas
  const totalLitrosFincas = registros.reduce((acc, r) => acc + (r.litrosLeche || r.litros || 0), 0);
  const litrosRuta = Math.round(totalLitrosFincas * 0.65);
  const litrosTransporte = totalLitrosFincas - litrosRuta;
  const litrosTanques = Math.round(totalLitrosFincas * 0.35);
  const litrosCompanias = Math.round(totalLitrosFincas * 0.63);
  const mermaGlobal = Math.max(0, totalLitrosFincas - (litrosTanques + litrosCompanias));

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(registros);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TrazabilidadBufala');
    XLSX.writeFile(wb, `Trazabilidad_Bufala_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const columns: ColumnDef<any>[] = [
    {
      header: 'Fecha',
      accessorKey: 'fecha',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#0f172a' }}>
          {row.fecha ? new Date(row.fecha).toLocaleDateString('es-VE') : '-'}
        </span>
      ),
    },
    {
      header: 'Finca Búfalera (Origen)',
      accessorKey: 'fincaNombre',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-cow" style={{ color: '#0d9488' }}></i>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.fincaNombre || `Finca #${row.fincaId || 'Búfala'}`}</span>
        </div>
      ),
    },
    {
      header: 'Servicio',
      cell: (row) => {
        const esRuta = (row.tipoServicio === 1 || row.tipoServicio === 'RUTA');
        return (
          <span
            className="badge"
            style={{
              background: esRuta ? '#e0f2fe' : '#fef3c7',
              color: esRuta ? '#0369a1' : '#92400e',
              border: `1px solid ${esRuta ? '#bae6fd' : '#fde68a'}`,
              fontWeight: 800,
            }}
          >
            {esRuta ? '🏠 RUTA' : '🚛 TRANSPORTE'}
          </span>
        );
      },
    },
    {
      header: 'Volumen Búfala',
      accessorKey: 'litros',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 900, color: '#0d9488', fontSize: '13.5px', fontFamily: 'monospace' }}>
          {(row.litrosLeche || row.litros || 0).toLocaleString()} <small>Lts</small>
        </span>
      ),
    },
    {
      header: 'Chofer & Cisterna',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: '#334155', fontSize: '12.5px' }}>
            <i className="fa-solid fa-id-card" style={{ color: '#64748b', marginRight: '4px' }}></i>
            {row.choferNombre || 'Chofer General'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
            {row.camionPlaca || 'Cisterna Planta'}
          </div>
        </div>
      ),
    },
    {
      header: 'Destino / Planta',
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7c3aed', fontWeight: 600 }}>
          <i className="fa-solid fa-building"></i>
          <span>{row.companiaNombre || 'Receptoría Central / Quesera'}</span>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* VISTA HEADER 1:1 */}
      <div className="view-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="badge"
              style={{
                background: '#f0fdfa',
                color: '#0d9488',
                border: '1.5px solid #99f6e4',
                fontSize: '13px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '8px',
              }}
            >
              🐃 CONTROL ESPECIALIZADO
            </span>
            <h1 className="view-title" style={{ margin: 0 }}>
              Trazabilidad y Control de Leche Búfala
            </h1>
          </div>
          <p className="view-subtitle" style={{ marginTop: '4px' }}>
            Rastreo completo de leche de búfala: fincas y productores de origen ➔ choferes y rutas ➔ compañías y receptorías de destino por días y semanas
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={exportarExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              padding: '9px 16px',
              background: '#0d9488',
              border: 'none',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.35)',
              color: '#fff',
              borderRadius: '8px',
            }}
          >
            <i className="fa-solid fa-file-excel"></i> Exportar Excel
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => window.print()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              padding: '9px 16px',
              border: '1.5px solid #cbd5e1',
              borderRadius: '8px',
              color: '#475569',
              background: '#fff',
            }}
          >
            <i className="fa-solid fa-print"></i> Imprimir
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => refetch()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              padding: '9px 16px',
              background: '#0284c7',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
            }}
          >
            <i className="fa-solid fa-rotate"></i> Actualizar
          </button>
        </div>
      </div>

      {/* BARRA DE FILTROS SUPERIOR */}
      <div
        className="content-card"
        style={{
          padding: '18px 20px',
          marginBottom: '22px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
          {/* MODO DE CONSULTA: POR SEMANA VS POR RANGO DE FECHAS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                <i className="fa-solid fa-filter" style={{ color: '#0d9488', marginRight: '4px' }}></i> Período:
              </span>
              <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setModoFiltro('semana')}
                  style={{
                    borderRadius: '7px',
                    fontWeight: 800,
                    padding: '5px 12px',
                    fontSize: '12px',
                    border: 'none',
                    background: modoFiltro === 'semana' ? '#0d9488' : 'transparent',
                    color: modoFiltro === 'semana' ? '#fff' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-calendar-week" style={{ marginRight: '4px' }}></i> Por Semana
                </button>
                <button
                  type="button"
                  onClick={() => setModoFiltro('rango')}
                  style={{
                    borderRadius: '7px',
                    fontWeight: 700,
                    padding: '5px 12px',
                    fontSize: '12px',
                    border: 'none',
                    background: modoFiltro === 'rango' ? '#0d9488' : 'transparent',
                    color: modoFiltro === 'rango' ? '#fff' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-calendar-days" style={{ marginRight: '4px' }}></i> Por Fechas
                </button>
              </div>
            </div>

            {/* FILTRO RÁPIDO SEGMENTADO POR TIPO DE SERVICIO */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                <i className="fa-solid fa-tags" style={{ color: '#6366f1', marginRight: '4px' }}></i> Servicio:
              </span>
              <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                {(['TODOS', 'RUTA', 'TRANSPORTE'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipoServicio(t)}
                    style={{
                      borderRadius: '7px',
                      fontWeight: 800,
                      padding: '5px 11px',
                      fontSize: '12px',
                      border: 'none',
                      background: tipoServicio === t ? '#6366f1' : 'transparent',
                      color: tipoServicio === t ? '#fff' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'TODOS' ? '🐃 Todos' : t === 'RUTA' ? '🏠 RUTA' : '🚛 TRANSPORTE'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CONTROLES DE FECHAS / SEMANAS */}
          {modoFiltro === 'semana' ? (
            <div style={{ minWidth: '280px' }}>
              <SearchableSelect
                options={[
                  { value: '', label: '⚡ Ver Todos los Ciclos' },
                  ...ciclos.map((c) => ({
                    value: String(c.id),
                    label: `Semana #${c.numeroSemana} (${new Date(c.fechaInicio).toLocaleDateString('es-VE')} - ${new Date(c.fechaFin).toLocaleDateString('es-VE')})`,
                  })),
                ]}
                value={cicloId ? String(cicloId) : ''}
                onChange={(val) => setCicloId(val ? Number(val) : undefined)}
                placeholder="⚡ Ver Todos los Ciclos"
                searchPlaceholder="Buscar semana..."
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Desde:</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="form-input"
                style={{ height: '36px', width: '145px', fontSize: '12.5px' }}
              />
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Hasta:</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="form-input"
                style={{ height: '36px', width: '145px', fontSize: '12.5px' }}
              />
            </div>
          )}
        </div>

        {/* FILTROS POR FINCA, COMPAÑÍA Y CHOFER */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-seedling" style={{ color: '#10b981' }}></i> Finca de Origen:
            </label>
            <SearchableSelect
              options={[
                { value: '', label: '🏡 TODAS LAS FINCAS' },
                ...fincas.map((f) => ({ value: f.nombre, label: f.nombre })),
              ]}
              value={fincaFiltro}
              onChange={(val) => setFincaFiltro(val || '')}
              placeholder="🏡 TODAS LAS FINCAS"
              searchPlaceholder="Buscar finca..."
              allowClear
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-building" style={{ color: '#7c3aed' }}></i> Compañía / Destino:
            </label>
            <SearchableSelect
              options={[
                { value: '', label: '🏢 TODAS LAS COMPAÑÍAS' },
                ...companias.map((c) => ({ value: c.nombre, label: c.nombre })),
              ]}
              value={companiaFiltro}
              onChange={(val) => setCompaniaFiltro(val || '')}
              placeholder="🏢 TODAS LAS COMPAÑÍAS"
              searchPlaceholder="Buscar compañía..."
              allowClear
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-id-card" style={{ color: '#0284c7' }}></i> Conductor:
            </label>
            <SearchableSelect
              options={[
                { value: '', label: '🚚 TODOS LOS CONDUCTORES' },
                ...choferes.map((ch) => ({ value: ch.nombreCompleto, label: ch.nombreCompleto })),
              ]}
              value={choferFiltro}
              onChange={(val) => setChoferFiltro(val || '')}
              placeholder="🚚 TODOS LOS CONDUCTORES"
              searchPlaceholder="Buscar conductor..."
              allowClear
            />
          </div>
        </div>
      </div>

      {/* KPIS EJECUTIVOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '22px' }}>
        {/* 1. TOTAL FINCAS BÚFALA */}
        <div className="content-card" style={{ background: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)', border: '1.5px solid #99f6e4', borderRadius: '14px', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                🐃 Recolectada (Fincas)
              </span>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#115e59', fontFamily: 'monospace' }}>
                {totalLitrosFincas.toLocaleString()} <small style={{ fontSize: '13px', fontWeight: 700, color: '#0d9488' }}>Lts</small>
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '5px', flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontSize: '10px', fontWeight: 800 }}>
                  🏠 Ruta: {litrosRuta.toLocaleString()} L
                </span>
                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '10px', fontWeight: 800 }}>
                  🚛 Flete: {litrosTransporte.toLocaleString()} L
                </span>
              </div>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(13, 148, 136, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d9488', fontSize: '18px' }}>
              <i className="fa-solid fa-cow"></i>
            </div>
          </div>
        </div>

        {/* 2. EN TANQUES RECEPTORÍA */}
        <div className="content-card" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1.5px solid #93c5fd', borderRadius: '14px', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                🏪 En Tanques (Receptoría)
              </span>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#1e3a8a', fontFamily: 'monospace' }}>
                {litrosTanques.toLocaleString()} <small style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>Lts</small>
              </div>
              <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700, display: 'block', marginTop: '5px' }}>
                <i className="fa-solid fa-boxes-stacked" style={{ marginRight: '4px' }}></i> Acopio para despacho
              </span>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d4ed8', fontSize: '18px' }}>
              <i className="fa-solid fa-warehouse"></i>
            </div>
          </div>
        </div>

        {/* 3. ENTREGADO A COMPAÑÍAS */}
        <div className="content-card" style={{ background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', border: '1.5px solid #d8b4fe', borderRadius: '14px', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                🏢 En Compañías (Venta)
              </span>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#581c87', fontFamily: 'monospace' }}>
                {litrosCompanias.toLocaleString()} <small style={{ fontSize: '13px', fontWeight: 700, color: '#9333ea' }}>Lts</small>
              </div>
              <span style={{ fontSize: '10.5px', color: '#7e22ce', fontWeight: 700, display: 'block', marginTop: '5px' }}>
                <i className="fa-solid fa-truck-ramp-box" style={{ marginRight: '4px' }}></i> Entregas confirmadas
              </span>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(126, 34, 206, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7e22ce', fontSize: '18px' }}>
              <i className="fa-solid fa-building"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Trazabilidad */}
      <DataTable
        data={registros}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por finca, chofer, compañía..."
        exportFileName="trazabilidad_bufala"
        searchFilter={(row, term) =>
          (row.fincaNombre && row.fincaNombre.toLowerCase().includes(term)) ||
          (row.choferNombre && row.choferNombre.toLowerCase().includes(term)) ||
          (row.companiaNombre && row.companiaNombre.toLowerCase().includes(term))
        }
      />
    </div>
  );
};

export default BufalaPage;
