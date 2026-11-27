import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import type { ChoferDto, CamionDto } from '@/types';

export const ConductoresPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = useModulePermissions('CONDUCTORES');

  // Modal informativo para Ficha Detallada
  const [modalFicha, setModalFicha] = useState(false);
  const [choferSeleccionado, setChoferSeleccionado] = useState<ChoferDto | null>(null);

  // Queries
  const { data: choferes = [], isLoading } = useQuery<ChoferDto[]>({
    queryKey: ['choferes'],
    queryFn: () => catalogosApi.getChoferes(),
  });

  const { data: camiones = [] } = useQuery<CamionDto[]>({
    queryKey: ['camiones'],
    queryFn: () => catalogosApi.getCamiones(false),
  });

  // Métricas informativas de la flota
  const totalChoferes = choferes.length;
  const activosCount = choferes.filter(c => c.activo !== false).length;
  const conCamionCount = choferes.filter(c => c.camionPlaca || c.vehiculoPlaca || camiones.some(cam => cam.usuarioId === c.id)).length;
  const sinCamionCount = totalChoferes - conCamionCount;

  const verFicha = (item: ChoferDto) => {
    setChoferSeleccionado(item);
    setModalFicha(true);
  };

  const columns: ColumnDef<ChoferDto>[] = [
    {
      header: 'Conductor / Chofer',
      accessorKey: 'nombreCompleto',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #e0f2fe, #bae6fd)',
              color: '#0284c7',
              border: '1.5px solid #7dd3fc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '14px',
              flexShrink: 0,
            }}
          >
            {row.nombreCompleto?.charAt(0).toUpperCase() || 'C'}
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13.5px' }}>{row.nombreCompleto}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '11px', color: '#475569', fontFamily: 'monospace', fontWeight: 600 }}>
                C.I: {row.cedula || 'S/C'}
              </span>
              {row.username && (
                <span
                  style={{
                    fontSize: '10.5px',
                    color: '#2563eb',
                    background: '#eff6ff',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    border: '1px solid #dbeafe',
                    fontWeight: 700,
                  }}
                >
                  @{row.username}
                </span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Contacto',
      accessorKey: 'telefono',
      cell: (row) => (
        <div>
          {row.telefono ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#1e293b' }}>
              <i className="fa-solid fa-phone" style={{ color: '#0284c7', fontSize: '11px' }}></i>
              <a
                href={`tel:${row.telefono}`}
                style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}
                title="Llamar"
              >
                {row.telefono}
              </a>
              <a
                href={`https://wa.me/${row.telefono.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#16a34a', marginLeft: '4px' }}
                title="Enviar WhatsApp"
              >
                <i className="fa-brands fa-whatsapp"></i>
              </a>
            </div>
          ) : (
            <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>Sin teléfono</span>
          )}
          {row.email && (
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              <i className="fa-regular fa-envelope" style={{ marginRight: '4px', fontSize: '10px' }}></i>
              {row.email}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Cisterna / Camión Asignado',
      cell: (row) => {
        const camionAsignado = camiones.find((c) => c.usuarioId === row.id);
        const placa = row.camionPlaca || row.vehiculoPlaca || camionAsignado?.placa;
        const modelo = row.camionModelo || camionAsignado?.modelo || camionAsignado?.marca;
        const capacidad = row.capacidadLitros || camionAsignado?.capacidadLitros;

        return placa ? (
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
            <span
              className="badge"
              style={{
                background: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                fontWeight: 800,
                padding: '4px 9px',
                fontSize: '12px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                width: 'fit-content',
              }}
            >
              <i className="fa-solid fa-truck-droplet" style={{ color: '#16a34a' }}></i>
              {placa}
            </span>
            {(modelo || capacidad) && (
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                {modelo ? `${modelo} ` : ''}
                {capacidad ? `• ${capacidad.toLocaleString()} Lts` : ''}
              </span>
            )}
          </div>
        ) : (
          <span
            className="badge"
            style={{
              background: '#f8fafc',
              color: '#94a3b8',
              border: '1px solid #e2e8f0',
              fontWeight: 600,
              fontSize: '11.5px',
              padding: '3px 8px',
              fontStyle: 'italic',
            }}
          >
            <i className="fa-solid fa-circle-exclamation" style={{ marginRight: '4px', color: '#cbd5e1' }}></i>
            Sin cisterna asignada
          </span>
        );
      },
    },
    {
      header: 'Esquema de Pago',
      cell: (row) => (
        <div>
          {row.tarifaPorLitro !== undefined && row.tarifaPorLitro > 0 ? (
            <div style={{ fontWeight: 800, color: '#047857', fontSize: '12.5px' }}>
              ${Number(row.tarifaPorLitro).toFixed(4)} <span style={{ fontSize: '10.5px', fontWeight: 600 }}>$/Lt</span>
            </div>
          ) : (
            <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Tarifa no fijada</span>
          )}
          {row.sueldoBase !== undefined && row.sueldoBase > 0 && (
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, marginTop: '2px' }}>
              Sueldo: ${Number(row.sueldoBase).toFixed(2)} ({row.frecuenciaPago || 'Semanal'})
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Datos Bancarios',
      cell: (row) => {
        const tieneBanco = Boolean(row.bancoNombre || row.numeroCuenta);
        const tienePagoMovil = Boolean(row.cedulaPagoMovil || row.telefonoPagoMovil);

        if (!tieneBanco && !tienePagoMovil) {
          return <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>Sin registrar</span>;
        }

        return (
          <div style={{ fontSize: '11.5px', color: '#334155' }}>
            {tieneBanco && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                <i className="fa-solid fa-building-columns" style={{ color: '#0284c7', fontSize: '10px' }}></i>
                <span>{row.bancoNombre || 'Banco'}</span>
                {row.numeroCuenta && (
                  <span style={{ fontFamily: 'monospace', color: '#64748b', fontWeight: 500 }}>
                    ...{row.numeroCuenta.slice(-4)}
                  </span>
                )}
              </div>
            )}
            {tienePagoMovil && (
              <div style={{ color: '#16a34a', fontSize: '10.5px', fontWeight: 600, marginTop: '2px' }}>
                <i className="fa-solid fa-mobile-screen-button" style={{ marginRight: '4px' }}></i>
                P. Móvil: {row.telefonoPagoMovil || row.cedulaPagoMovil}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Estado',
      accessorKey: 'activo',
      sortable: true,
      cell: (row) => {
        const esActivo = row.activo !== false;
        return esActivo ? (
          <span
            className="badge"
            style={{
              background: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0',
              fontWeight: 800,
              padding: '3px 8px',
              fontSize: '11.5px',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <i className="fa-solid fa-circle-check" style={{ fontSize: '10px' }}></i>
            Activo
          </span>
        ) : (
          <span
            className="badge"
            style={{
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              fontWeight: 800,
              padding: '3px 8px',
              fontSize: '11.5px',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <i className="fa-solid fa-circle-xmark" style={{ fontSize: '10px' }}></i>
            Inactivo
          </span>
        );
      },
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (row) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={() => verFicha(row)}
            className="btn btn-sm btn-primary"
            style={{
              height: '32px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '6px',
              background: '#2563eb',
              border: 'none',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
            title="Ver Ficha Detallada del Conductor"
          >
            <i className="fa-solid fa-id-badge"></i> Ver Ficha
          </button>
          <button
            type="button"
            onClick={() => navigate('/usuarios')}
            className="btn btn-sm btn-outline"
            style={{
              height: '32px',
              padding: '0 10px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '6px',
              color: '#475569',
            }}
            title="Ir a Usuarios para editar credenciales o datos"
          >
            <i className="fa-solid fa-user-pen"></i>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* HEADER DE LA VISTA */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <i className="fa-solid fa-id-card" style={{ color: '#2563eb', marginRight: '10px' }}></i>
            Conductores & Choferes
          </h1>
          <p className="view-subtitle">
            Directorio operativo e informativo de la flota de choferes, unidades cisternas y condiciones de liquidación.
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => navigate('/usuarios')}
            className="btn btn-outline"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              padding: '9px 16px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              color: '#1e293b',
            }}
          >
            <i className="fa-solid fa-users-gear" style={{ color: '#2563eb' }}></i>
            Gestión de Usuarios
          </button>
          <button
            type="button"
            onClick={() => navigate('/camiones')}
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
            <i className="fa-solid fa-truck-front"></i>
            Parque de Camiones
          </button>
        </div>
      </div>

      {/* BANNER INFORMATIVO CLAVE (Explica la regla de negocio) */}
      <div
        style={{
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          border: '1.5px solid #bae6fd',
          borderRadius: '12px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#0284c7',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0,
            }}
          >
            <i className="fa-solid fa-circle-info"></i>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0369a1', fontSize: '13.5px' }}>
              Gestión Centralizada de Personal
            </div>
            <div style={{ fontSize: '12px', color: '#0c4a6e', marginTop: '1px' }}>
              Los choferes son usuarios del sistema con credenciales de acceso creados en{' '}
              <strong style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/usuarios')}>
                Configuración ➔ Usuarios
              </strong>{' '}
              con el rol <strong>CONDUCTOR / CHOFER</strong>. Esta vista consolida su información operativa y de despacho.
            </div>
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => navigate('/usuarios')}
            style={{
              background: '#ffffff',
              border: '1.5px solid #0284c7',
              color: '#0284c7',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="fa-solid fa-user-plus"></i> Registrar Usuario Chofer
          </button>
        )}
      </div>

      {/* METRICAS DE FLOTA (KPI CARDS) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div
          className="content-card"
          style={{
            padding: '16px 20px',
            borderLeft: '4px solid #2563eb',
            borderRadius: '10px',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Total Conductores
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
              {totalChoferes}
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            <i className="fa-solid fa-id-card"></i>
          </div>
        </div>

        <div
          className="content-card"
          style={{
            padding: '16px 20px',
            borderLeft: '4px solid #16a34a',
            borderRadius: '10px',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Conductores Activos
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#16a34a', marginTop: '4px' }}>
              {activosCount}
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#f0fdf4',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            <i className="fa-solid fa-circle-check"></i>
          </div>
        </div>

        <div
          className="content-card"
          style={{
            padding: '16px 20px',
            borderLeft: '4px solid #0284c7',
            borderRadius: '10px',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Con Cisterna Asignada
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0284c7', marginTop: '4px' }}>
              {conCamionCount}
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#e0f2fe',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            <i className="fa-solid fa-truck-moving"></i>
          </div>
        </div>

        <div
          className="content-card"
          style={{
            padding: '16px 20px',
            borderLeft: `4px solid ${sinCamionCount > 0 ? '#f59e0b' : '#94a3b8'}`,
            borderRadius: '10px',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Sin Cisterna Asignada
            </div>
            <div
              style={{
                fontSize: '26px',
                fontWeight: 900,
                color: sinCamionCount > 0 ? '#d97706' : '#64748b',
                marginTop: '4px',
              }}
            >
              {sinCamionCount}
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: sinCamionCount > 0 ? '#fef3c7' : '#f1f5f9',
              color: sinCamionCount > 0 ? '#d97706' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE CONDUCTORES */}
      <DataTable
        data={choferes}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por nombre, cédula, usuario o placa..."
        exportFileName="directorio_conductores_flota"
        searchFilter={(row, term) => {
          const t = term.toLowerCase();
          return Boolean(
            row.nombreCompleto?.toLowerCase().includes(t) ||
              row.cedula?.toLowerCase().includes(t) ||
              row.username?.toLowerCase().includes(t) ||
              row.vehiculoPlaca?.toLowerCase().includes(t) ||
              row.camionPlaca?.toLowerCase().includes(t) ||
              row.telefono?.includes(t)
          );
        }}
      />

      {/* MODAL INFORMATIVO: FICHA INTEGRAL DEL CONDUCTOR */}
      {modalFicha && choferSeleccionado && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '0',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
              background: '#ffffff',
            }}
          >
            {/* CABECERA DE LA FICHA */}
            <div
              style={{
                padding: '20px 24px',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    color: '#ffffff',
                    border: '2px solid rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '18px',
                  }}
                >
                  {choferSeleccionado.nombreCompleto?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                    {choferSeleccionado.nombreCompleto}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      C.I: {choferSeleccionado.cedula || 'Sin Cédula'}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        background: choferSeleccionado.activo !== false ? '#065f46' : '#991b1b',
                        color: choferSeleccionado.activo !== false ? '#6ee7b7' : '#fca5a5',
                      }}
                    >
                      {choferSeleccionado.activo !== false ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalFicha(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '24px',
                  cursor: 'pointer',
                }}
              >
                &times;
              </button>
            </div>

            {/* CUERPO DE LA FICHA */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* SECCIÓN 1: DATOS PERSONALES Y USUARIO */}
              <div>
                <h4
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#2563eb',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-user"></i> Datos Personales & Acceso al Sistema
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    background: '#f8fafc',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Usuario de Acceso</span>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                      @{choferSeleccionado.username || 'Sin usuario'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Teléfono Móvil</span>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                      {choferSeleccionado.telefono || 'No registrado'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Correo Electrónico</span>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                      {choferSeleccionado.email || 'No registrado'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Rol en Sistema</span>
                    <strong style={{ fontSize: '13px', color: '#2563eb' }}>CONDUCTOR / CHOFER</strong>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 2: CISTERNA / CAMIÓN ASIGNADO */}
              <div>
                <h4
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#059669',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-truck"></i> Unidad Cisterna Asignada
                </h4>
                {(() => {
                  const camAsig = camiones.find((c) => c.usuarioId === choferSeleccionado.id);
                  const placa = choferSeleccionado.camionPlaca || choferSeleccionado.vehiculoPlaca || camAsig?.placa;
                  const modelo = choferSeleccionado.camionModelo || camAsig?.modelo || camAsig?.marca;
                  const capacidad = choferSeleccionado.capacidadLitros || camAsig?.capacidadLitros;

                  return (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        background: placa ? '#f0fdf4' : '#f8fafc',
                        padding: '14px',
                        borderRadius: '8px',
                        border: placa ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Placa de la Unidad</span>
                        <strong style={{ fontSize: '14px', color: placa ? '#15803d' : '#94a3b8' }}>
                          {placa || 'Sin Asignar'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Modelo / Marca</span>
                        <strong style={{ fontSize: '13px', color: '#0f172a' }}>{modelo || 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Capacidad de Carga</span>
                        <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                          {capacidad ? `${capacidad.toLocaleString()} Litros` : 'N/A'}
                        </strong>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* SECCIÓN 3: ESQUEMA DE PAGO Y CONDICIONES */}
              <div>
                <h4
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#d97706',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-file-invoice-dollar"></i> Condiciones Económicas & Liquidación
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    background: '#fffbeb',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid #fde68a',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '11px', color: '#78350f', display: 'block' }}>Tarifa por Litro</span>
                    <strong style={{ fontSize: '14px', color: '#b45309' }}>
                      {choferSeleccionado.tarifaPorLitro !== undefined && choferSeleccionado.tarifaPorLitro > 0
                        ? `$${Number(choferSeleccionado.tarifaPorLitro).toFixed(4)} $/Lt`
                        : 'No fijada'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#78350f', display: 'block' }}>Sueldo Base ($ USD)</span>
                    <strong style={{ fontSize: '13px', color: '#78350f' }}>
                      {choferSeleccionado.sueldoBase ? `$${Number(choferSeleccionado.sueldoBase).toFixed(2)}` : '$0.00'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#78350f', display: 'block' }}>Frecuencia de Pago</span>
                    <strong style={{ fontSize: '13px', color: '#78350f' }}>
                      {choferSeleccionado.frecuenciaPago || 'Semanal'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 4: INFORMACIÓN BANCARIA Y PAGO MÓVIL */}
              <div>
                <h4
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-building-columns"></i> Cuentas Bancarias & Pago Móvil
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    background: '#f8fafc',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Banco Receptor</span>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                      {choferSeleccionado.bancoNombre || 'No especificado'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Número de Cuenta</span>
                    <strong style={{ fontSize: '12.5px', fontFamily: 'monospace', color: '#0f172a' }}>
                      {choferSeleccionado.numeroCuenta || 'No especificada'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Cédula Pago Móvil</span>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                      {choferSeleccionado.cedulaPagoMovil || choferSeleccionado.cedula || 'No especificada'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Teléfono Pago Móvil</span>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                      {choferSeleccionado.telefonoPagoMovil || choferSeleccionado.telefono || 'No especificado'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* FOOTER DE LA FICHA */}
            <div
              style={{
                padding: '16px 24px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setModalFicha(false);
                  navigate('/usuarios');
                }}
                className="btn btn-outline"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#2563eb',
                  borderColor: '#bfdbfe',
                }}
              >
                <i className="fa-solid fa-user-pen"></i> Editar en Módulo de Usuarios
              </button>

              <button
                type="button"
                onClick={() => setModalFicha(false)}
                className="btn btn-primary"
                style={{
                  height: '38px',
                  padding: '0 20px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  background: '#0f172a',
                  border: 'none',
                }}
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConductoresPage;
