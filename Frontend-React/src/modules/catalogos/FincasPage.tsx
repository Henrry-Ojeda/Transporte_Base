import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { PropietarioSelect, CompaniaSelect } from '@/components/selectors';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import { useAuthStore } from '@/stores/authStore';
import { LeafletMapPicker } from '@/components/maps/LeafletMapPicker';
import type { FincaDto, GuardarFincaDto, PropietarioDto } from '@/types';

export const FincasPage: React.FC = () => {
  const queryClient = useQueryClient();
  const hasBufala = useAuthStore((state) => state.hasTenantModule('MOD_LECHE_BUFALA'));
  const hasMapaRutas = useAuthStore((state) => state.hasTenantModule('MOD_MAPA_RUTAS'));

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalPrecioMasivo, setModalPrecioMasivo] = useState(false);
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);
  const [nuevoPrecioMasivo, setNuevoPrecioMasivo] = useState<number>(0.35);

  const initialForm: GuardarFincaDto = {
    codigo: '',
    nombre: '',
    propietarioId: undefined,
    rutaId: undefined,
    tipoServicioId: 1,
    companiaId: undefined,
    precioLitroUSD: 0.35,
    precioLitroAcidaUSD: 0.20,
    tieneDosTiposLeche: false,
    precioBufalaLitroUSD: 0.40,
    tipoLeche: 'VACA',
    telefono: '',
    ubicacion: '',
    latitud: null,
    longitud: null,
    activo: true,
  };
  const [form, setForm] = useState<GuardarFincaDto>(initialForm);

  // Queries (En el módulo Fincas se muestran TODAS: activas e inactivas)
  const { data: fincas = [], isLoading } = useQuery<FincaDto[]>({
    queryKey: ['fincas-catalogo-completo'],
    queryFn: () => catalogosApi.getFincas(false),
  });

  const { data: propietarios = [] } = useQuery<PropietarioDto[]>({
    queryKey: ['propietarios-selector'],
    queryFn: () => catalogosApi.getPropietarios(),
  });

  const invalidarCachesFincas = () => {
    queryClient.invalidateQueries({ queryKey: ['fincas-catalogo-completo'] });
    queryClient.invalidateQueries({ queryKey: ['fincas'] });
    queryClient.invalidateQueries({ queryKey: ['fincas-catalogos'] });
    queryClient.invalidateQueries({ queryKey: ['fincas-evolucion'] });
    queryClient.invalidateQueries({ queryKey: ['fincas-bufala'] });
    queryClient.invalidateQueries({ queryKey: ['rutas-logistica'] });
    queryClient.invalidateQueries({ queryKey: ['propietarios'] });
    queryClient.invalidateQueries({ queryKey: ['propietarios-selector'] });
  };

  // Mutaciones
  const guardarMutation = useMutation({
    mutationFn: (dto: GuardarFincaDto) => {
      const propObj = propietarios.find((p) => Number(p.id) === Number(dto.propietarioId));
      const propNombre = propObj
        ? propObj.nombre || propObj.nombreCompleto || ''
        : (dto as any).propietario || (dto as any).propietarioNombre || '';
      
      const esDual = hasBufala && (dto.tipoLeche === 'AMBOS' || Boolean(dto.tieneDosTiposLeche));
      const esSoloBufala = hasBufala && dto.tipoLeche === 'BUFALA';

      const payload: any = {
        ...dto,
        tipoServicioId: Number(dto.tipoServicioId) || 1,
        companiaId: Number(dto.tipoServicioId) === 2 ? (dto.companiaId ? Number(dto.companiaId) : null) : null,
        propietario: propNombre,
        propietarioNombre: propNombre,
        rutaId: dto.activo === false ? undefined : dto.rutaId,
        tipoLeche: !hasBufala ? 'VACA' : (esDual ? 'AMBOS' : (esSoloBufala ? 'BUFALA' : 'VACA')),
        tieneDosTiposLeche: esDual,
        precioLitroUSD: Number(dto.precioLitroUSD || 0),
        precioLitroAcidaUSD: dto.precioLitroAcidaUSD !== undefined && (dto.precioLitroAcidaUSD as any) !== '' ? Number(dto.precioLitroAcidaUSD) : 0,
        precioBufalaLitroUSD: (hasBufala && (esDual || esSoloBufala)) ? Number(dto.precioBufalaLitroUSD || 0.40) : 0,
      };
      return modoEdicionId ? catalogosApi.actualizarFinca(modoEdicionId, payload) : catalogosApi.crearFinca(payload);
    },
    onSuccess: (data: any) => {
      toast.success(data.message || 'Finca guardada exitosamente');
      invalidarCachesFincas();
      cerrarModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar finca');
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => catalogosApi.eliminarFinca(id),
    onSuccess: (data) => {
      toast.success(data.message || 'Finca desactivada');
      invalidarCachesFincas();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al desactivar finca');
    },
  });

  const precioMasivoMutation = useMutation({
    mutationFn: (precio: number) => catalogosApi.actualizarPreciosMasivo(precio),
    onSuccess: (data) => {
      toast.success(data.message || 'Precios actualizados en lote');
      invalidarCachesFincas();
      setModalPrecioMasivo(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al actualizar precios');
    },
  });

  const abrirModalCrear = () => {
    setModoEdicionId(null);
    setForm(initialForm);
    setModalAbierto(true);
  };

  const abrirModalEditar = (item: FincaDto) => {
    setModoEdicionId(item.id);
    const propNameRaw = String((item as any).propietario || item.propietarioNombre || '').trim().toLowerCase();
    const matchedProp =
      propietarios.find((p) => Number(p.id) === Number(item.propietarioId)) ||
      (propNameRaw
        ? propietarios.find(
            (p) => String(p.nombre || p.nombreCompleto || '').trim().toLowerCase() === propNameRaw
          )
        : undefined);

    setForm({
      codigo: item.codigo,
      nombre: item.nombre,
      propietarioId: matchedProp ? matchedProp.id : item.propietarioId,
      rutaId: item.activo !== false ? item.rutaId : undefined,
      tipoServicioId: item.tipoServicioId || 1,
      companiaId: item.companiaId || undefined,
      precioLitroUSD: item.precioLitroUSD ?? 0.35,
      precioLitroAcidaUSD: item.precioLitroAcidaUSD ?? 0,
      tieneDosTiposLeche: Boolean(item.tieneDosTiposLeche),
      precioBufalaLitroUSD: item.precioBufalaLitroUSD ?? 0.40,
      tipoLeche: item.tieneDosTiposLeche ? 'AMBOS' : (item.tipoLeche || 'VACA'),
      telefono: item.telefono || '',
      ubicacion: item.ubicacion || '',
      latitud: item.latitud ?? null,
      longitud: item.longitud ?? null,
      activo: item.activo !== false,
    });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setModoEdicionId(null);
  };

  // Columnas de la tabla
  const columns: ColumnDef<FincaDto>[] = [
    {
      header: 'CÓDIGO',
      accessorKey: 'codigo',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 800, fontFamily: 'monospace', color: '#4f46e5' }}>
          {row.codigo || 'S/C'}
        </span>
      ),
    },
    {
      header: 'NOMBRE FINCA',
      accessorKey: 'nombre',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-seedling" style={{ color: '#10b981' }}></i>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.nombre}</span>
        </div>
      ),
    },
    {
      header: 'SERVICIO',
      accessorKey: 'tipoServicioId',
      sortable: true,
      cell: (row: FincaDto) => {
        const tipoServId = Number(row.tipoServicioId) || 1;
        if (tipoServId === 2) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
              <span
                className="badge"
                style={{
                  background: '#faf5ff',
                  color: '#7e22ce',
                  border: '1.5px solid #d8b4fe',
                  fontWeight: 800,
                  fontSize: '11px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="fa-solid fa-truck"></i> TRANSPORTE
              </span>
              {row.companiaNombre && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#9333ea',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                  title={`Compañía destino: ${row.companiaNombre}`}
                >
                  <i className="fa-solid fa-building" style={{ fontSize: '10px' }}></i>
                  {row.companiaNombre}
                </span>
              )}
            </div>
          );
        }
        return (
          <span
            className="badge"
            style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1.5px solid #bfdbfe',
              fontWeight: 800,
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <i className="fa-solid fa-road"></i> RUTA
          </span>
        );
      },
    },
    ...(hasBufala
      ? [
          {
            header: 'TIPO LECHE',
            accessorKey: 'tipoLeche',
            sortable: true,
            cell: (row: FincaDto) => {
              const esDual = Boolean(row.tieneDosTiposLeche);
              const esBufala = row.tipoLeche === 'BUFALA';
              if (esDual) {
                return (
                  <span
                    className="badge"
                    style={{
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      fontWeight: 700,
                    }}
                  >
                    <i className="fa-solid fa-code-fork" style={{ marginRight: '4px' }}></i>
                    DUAL (VACA + BÚFALA)
                  </span>
                );
              }
              return (
                <span
                  className="badge"
                  style={{
                    background: esBufala ? '#f3e8ff' : '#e0f2fe',
                    color: esBufala ? '#7e22ce' : '#0369a1',
                    border: `1px solid ${esBufala ? '#d8b4fe' : '#bae6fd'}`,
                    fontWeight: 700,
                  }}
                >
                  <i className={`fa-solid ${esBufala ? 'fa-gem' : 'fa-cow'}`} style={{ marginRight: '4px' }}></i>
                  {esBufala ? 'BÚFALA' : 'VACA'}
                </span>
              );
            },
          } as ColumnDef<FincaDto>,
        ]
      : []),
    {
      header: 'PROPIETARIO / CÉDULA',
      accessorKey: 'propietarioNombre',
      sortable: true,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: '#334155' }}>
            <i className="fa-regular fa-user" style={{ color: '#64748b', marginRight: '6px' }}></i>
            {row.propietarioNombre || 'Sin asignar'}
          </div>
          {row.ubicacion && (
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              <i className="fa-solid fa-location-dot" style={{ marginRight: '4px' }}></i>
              {row.ubicacion}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'RUTA LOGÍSTICA',
      accessorKey: 'rutaNombre',
      sortable: true,
      cell: (row) => (
        <div>
          {row.rutaNombre ? (
            <span
              style={{
                background: '#f5f3ff',
                color: '#6d28d9',
                border: '1px solid #ddd6fe',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <i className="fa-solid fa-route" style={{ color: '#8b5cf6' }}></i>
              {row.rutaNombre}
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '11.5px', fontStyle: 'italic' }}>
              Sin ruta asignada
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'PRECIO NORMAL',
      accessorKey: 'precioLitroUSD',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 800, color: '#059669', fontSize: '13.5px' }}>
          ${(row.precioLitroUSD || 0).toFixed(4)} <small>/L</small>
        </span>
      ),
    },
    {
      header: 'PRECIO ÁCIDA',
      accessorKey: 'precioLitroAcidaUSD',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 800, color: '#d97706', fontSize: '12.5px' }}>
          ${(row.precioLitroAcidaUSD || 0).toFixed(4)} <small>/L</small>
        </span>
      ),
    },
    ...(hasBufala
      ? [
          {
            header: 'PRECIO BÚFALA',
            accessorKey: 'precioBufalaLitroUSD',
            sortable: true,
            cell: (row: FincaDto) =>
              row.tieneDosTiposLeche || row.tipoLeche === 'BUFALA' ? (
                <span style={{ fontWeight: 800, color: '#0284c7', fontSize: '12.5px' }}>
                  ${(row.precioBufalaLitroUSD || 0).toFixed(4)} <small>/L</small>
                </span>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>N/A</span>
              ),
          } as ColumnDef<FincaDto>,
        ]
      : []),
    {
      header: 'ESTADO',
      accessorKey: 'activo',
      sortable: true,
      cell: (row) => (
        <button
          type="button"
          onClick={async () => {
            const nuevoEstado = !row.activo;
            try {
              await catalogosApi.actualizarFinca(row.id, {
                codigo: row.codigo,
                nombre: row.nombre,
                propietarioId: row.propietarioId,
                rutaId: nuevoEstado ? row.rutaId : undefined,
                precioLitroUSD: row.precioLitroUSD ?? 0.35,
                precioLitroAcidaUSD: row.precioLitroAcidaUSD ?? 0,
                tieneDosTiposLeche: Boolean(row.tieneDosTiposLeche),
                precioBufalaLitroUSD: row.precioBufalaLitroUSD ?? 0.4,
                tipoLeche: row.tipoLeche || 'VACA',
                telefono: row.telefono || '',
                ubicacion: row.ubicacion || '',
                activo: nuevoEstado,
                ...( { propietario: (row as any).propietario || row.propietarioNombre || '' } as any ),
              });
              toast.success(
                nuevoEstado
                  ? `Finca "${row.nombre}" activada exitosamente`
                  : `Finca "${row.nombre}" marcada como INACTIVA (oculta en rutas y operaciones)`
              );
              invalidarCachesFincas();
            } catch {
              toast.error('No se pudo cambiar el estado de la finca');
            }
          }}
          title="Clic para cambiar entre Activo / Inactivo"
          className="badge"
          style={{
            background: row.activo ? '#ecfdf5' : '#fff1f2',
            color: row.activo ? '#047857' : '#e11d48',
            border: `1.5px solid ${row.activo ? '#a7f3d0' : '#fecdd3'}`,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontWeight: 800,
            padding: '4px 10px',
          }}
        >
          <i className={`fa-solid ${row.activo ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i>
          {row.activo ? 'ACTIVO' : 'INACTIVO'}
        </button>
      ),
    },
    {
      header: 'ACCIONES',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => abrirModalEditar(row)}
            className="btn btn-sm btn-outline"
            title="Editar Finca"
            style={{ padding: '4px 8px' }}
          >
            <i className="fa-solid fa-pen-to-square" style={{ color: '#4f46e5' }}></i>
          </button>
          <button
            onClick={async () => {
              if (await confirmDeleteOrDeactivate('Desactivar la finca', row.nombre)) {
                eliminarMutation.mutate(row.id);
              }
            }}
            className="btn btn-sm btn-outline"
            title="Desactivar Finca"
            style={{ padding: '4px 8px' }}
          >
            <i className="fa-solid fa-trash-can" style={{ color: '#e11d48' }}></i>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="catalogos-page">
      {/* HEADER DE LA VISTA */}
      <div className="view-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-seedling" style={{ color: '#10b981' }}></i>
            Fincas Ganaderas
          </h1>
          <p className="view-subtitle">
            Catálogo maestro de unidades de producción de leche, precios por litro y asignación de productores
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setModalPrecioMasivo(true)}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#ecfdf5',
              color: '#059669',
              border: '1.5px solid #a7f3d0',
              fontWeight: 700,
            }}
          >
            <i className="fa-solid fa-tags"></i>
            Actualizar Precios en Lote
          </button>

          <button
            onClick={abrirModalCrear}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
            }}
          >
            <i className="fa-solid fa-plus"></i>
            Nueva Finca
          </button>
        </div>
      </div>

      {/* MÉTRICAS RÁPIDAS SUPERIORES */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div
          className="dashboard-card"
          style={{
            padding: '16px 20px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#eef2ff',
              color: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            <i className="fa-solid fa-cow"></i>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Total Fincas
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{fincas.length}</div>
          </div>
        </div>

        <div
          className="dashboard-card"
          style={{
            padding: '16px 20px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Fincas Activas
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669' }}>
              {fincas.filter((f) => f.activo).length}
            </div>
          </div>
        </div>

        <div
          className="dashboard-card"
          style={{
            padding: '16px 20px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#f0fdf4',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            <i className="fa-solid fa-dollar-sign"></i>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Precio Promedio Vaca
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
              $
              {fincas.length > 0
                ? (fincas.reduce((acc, f) => acc + (f.precioLitroUSD || 0), 0) / fincas.length).toFixed(4)
                : '0.0000'}
            </div>
          </div>
        </div>

        {hasBufala && (
          <div
            className="dashboard-card"
            style={{
              padding: '16px 20px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                background: '#f5f3ff',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
            >
              <i className="fa-solid fa-gem"></i>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Fincas con Búfala / Dual
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#7c3aed' }}>
                {fincas.filter((f) => f.tipoLeche === 'BUFALA' || f.tieneDosTiposLeche).length}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TABLA PRINCIPAL DE DATOS */}
      <DataTable
        data={fincas}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por código, nombre de finca o propietario..."
        exportFileName="Catalogo_Fincas_Ganaderas"
      />

      {/* MODAL CREAR / EDITAR FINCA (DISEÑO 1:1 CON V2_3_11_26) */}
      {modalAbierto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '92vh',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            {/* CABECERA OSCURA 1:1 CON V2_3_11_26 */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                padding: '18px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.25)',
                    color: '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                  }}
                >
                  <i className="fa-solid fa-cow"></i>
                </div>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
                    {modoEdicionId ? 'Editar Finca Ganadera' : 'Registrar Nueva Finca'}
                  </h2>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Datos de la finca, productor ganadero, precios de leche y ubicación
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                title="Cerrar"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '26px',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: '4px 8px',
                }}
              >
                &times;
              </button>
            </div>

            {/* FORMULARIO BODY CON FONDO #f8fafc Y SCROLL */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.nombre.trim()) {
                  toast.error('El nombre de la finca es obligatorio');
                  return;
                }
                if (Number(form.tipoServicioId) === 2 && (!form.companiaId || Number(form.companiaId) <= 0)) {
                  toast.error('Para fincas de servicio TRANSPORTE debe seleccionar la compañía a la que pertenece');
                  return;
                }
                guardarMutation.mutate(form);
              }}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
            >
              <div
                style={{
                  padding: '22px 24px',
                  background: '#f8fafc',
                  overflowY: 'auto',
                  maxHeight: 'calc(92vh - 145px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                {/* 1. Código (Auto) y Nombre de la Finca */}
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Código <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Auto)</span>
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={modoEdicionId ? form.codigo || 'S/C' : '(Auto)'}
                        disabled
                        readOnly
                        style={{
                          width: '100%',
                          height: '42px',
                          backgroundColor: '#f1f5f9',
                          color: '#0369a1',
                          fontWeight: 800,
                          cursor: 'not-allowed',
                          paddingLeft: '32px',
                          border: '1.5px dashed #93c5fd',
                          borderRadius: '8px',
                          fontFamily: 'monospace',
                          fontSize: '13.5px',
                        }}
                      />
                      <i
                        className="fa-solid fa-lock"
                        style={{
                          position: 'absolute',
                          left: '12px',
                          fontSize: '12px',
                          color: '#0284c7',
                          pointerEvents: 'none',
                        }}
                      ></i>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Nombre de la Finca <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      placeholder="Ej: Hacienda El Progreso"
                      style={{
                        width: '100%',
                        height: '42px',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: '#0f172a',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '0 12px',
                        background: '#ffffff',
                      }}
                      required
                    />
                  </div>
                </div>

                {/* 2. Propietario Ganadero */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Propietario Ganadero <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Busca escribiendo)</span>
                  </label>
                  <PropietarioSelect
                    value={form.propietarioId}
                    onChange={(val) => setForm({ ...form, propietarioId: val })}
                    placeholder="-- Seleccionar o buscar ganadero --"
                  />
                </div>

                {/* 3. Tipo de Servicio y Compañía Destino Habitual (1:1 V2_3_11_26) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: Number(form.tipoServicioId) === 2 ? '1fr 1fr' : '1fr',
                    gap: '14px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '6px',
                      }}
                    >
                      <i className="fa-solid fa-truck-ramp-box" style={{ color: '#2563eb' }}></i> Tipo de Servicio{' '}
                      <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <select
                      value={form.tipoServicioId || 1}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setForm({
                          ...form,
                          tipoServicioId: val,
                          companiaId: val === 2 ? form.companiaId : undefined,
                        });
                      }}
                      className="form-input"
                      style={{
                        width: '100%',
                        height: '42px',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        color: '#0f172a',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                      }}
                      required
                    >
                      <option value={1}>RUTA</option>
                      <option value={2}>TRANSPORTE</option>
                    </select>
                  </div>

                  {Number(form.tipoServicioId) === 2 && (
                    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#86198f',
                          marginBottom: '6px',
                        }}
                      >
                        <i className="fa-solid fa-building" style={{ color: '#9333ea' }}></i> Compañía / Destino Habitual (Transporte){' '}
                        <span style={{ color: '#e11d48' }}>*</span>
                      </label>
                      <CompaniaSelect
                        value={form.companiaId}
                        onChange={(val) => setForm({ ...form, companiaId: val })}
                        placeholder="-- Seleccionar Compañía (ej. COLONA) --"
                        required
                      />
                    </div>
                  )}
                </div>

                {/* 3. Selector Tipo de Leche (SOLO SI EL TENANT TIENE BÚFALA HABILITADA) */}
                {hasBufala && (
                  <div
                    style={{
                      padding: '12px 14px',
                      background: '#eff6ff',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: '10px',
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                      <i className="fa-solid fa-code-fork" style={{ color: '#2563eb', marginRight: '6px' }}></i>
                      ¿Qué tipo de leche maneja esta finca? <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setForm({ ...form, tipoLeche: 'VACA', tieneDosTiposLeche: false });
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: form.tipoLeche === 'VACA' && !form.tieneDosTiposLeche ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: form.tipoLeche === 'VACA' && !form.tieneDosTiposLeche ? '#ffffff' : '#f8fafc',
                          color: form.tipoLeche === 'VACA' && !form.tieneDosTiposLeche ? '#1d4ed8' : '#64748b',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: form.tipoLeche === 'VACA' && !form.tieneDosTiposLeche ? '0 2px 4px rgba(37,99,235,0.15)' : 'none',
                        }}
                      >
                        🥛 Solo Vaca
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setForm({ ...form, tipoLeche: 'BUFALA', tieneDosTiposLeche: false });
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: form.tipoLeche === 'BUFALA' && !form.tieneDosTiposLeche ? '2px solid #9333ea' : '1px solid #cbd5e1',
                          background: form.tipoLeche === 'BUFALA' && !form.tieneDosTiposLeche ? '#ffffff' : '#f8fafc',
                          color: form.tipoLeche === 'BUFALA' && !form.tieneDosTiposLeche ? '#7e22ce' : '#64748b',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: form.tipoLeche === 'BUFALA' && !form.tieneDosTiposLeche ? '0 2px 4px rgba(147,51,234,0.15)' : 'none',
                        }}
                      >
                        🐃 Solo Búfala
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setForm({ ...form, tipoLeche: 'AMBOS', tieneDosTiposLeche: true });
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: form.tieneDosTiposLeche || form.tipoLeche === 'AMBOS' ? '2px solid #0d9488' : '1px solid #cbd5e1',
                          background: form.tieneDosTiposLeche || form.tipoLeche === 'AMBOS' ? '#ffffff' : '#f8fafc',
                          color: form.tieneDosTiposLeche || form.tipoLeche === 'AMBOS' ? '#0f766e' : '#64748b',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: form.tieneDosTiposLeche || form.tipoLeche === 'AMBOS' ? '0 2px 4px rgba(13,148,136,0.15)' : 'none',
                        }}
                      >
                        🥛+🐃 Dual (Ambas)
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Precios de Leche */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      hasBufala && (form.tieneDosTiposLeche || form.tipoLeche === 'AMBOS')
                        ? '1fr 1fr 1fr'
                        : '1fr 1fr',
                    gap: '12px',
                  }}
                >
                  {/* Precio Vaca */}
                  {(!hasBufala || form.tipoLeche !== 'BUFALA' || form.tieneDosTiposLeche) && (
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                        🥛 Precio Leche Vaca ($/Lt) <span style={{ color: '#e11d48' }}>*</span>
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={form.precioLitroUSD ?? ''}
                        onChange={(e) => setForm({ ...form, precioLitroUSD: e.target.value as any })}
                        style={{
                          width: '100%',
                          height: '42px',
                          fontWeight: 800,
                          fontSize: '14.5px',
                          color: '#047857',
                          background: '#f0fdf4',
                          border: '1.5px solid #86efac',
                          borderRadius: '8px',
                          padding: '0 12px',
                        }}
                        required
                      />
                    </div>
                  )}

                  {/* Precio Búfala */}
                  {hasBufala && (form.tipoLeche === 'BUFALA' || form.tieneDosTiposLeche || form.tipoLeche === 'AMBOS') && (
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#0369a1', marginBottom: '6px' }}>
                        🐃 Precio Búfala ($/Lt) <span style={{ color: '#e11d48' }}>*</span>
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={form.precioBufalaLitroUSD ?? ''}
                        onChange={(e) => setForm({ ...form, precioBufalaLitroUSD: e.target.value as any })}
                        style={{
                          width: '100%',
                          height: '42px',
                          fontWeight: 800,
                          fontSize: '14.5px',
                          color: '#0369a1',
                          background: '#f0f9ff',
                          border: '1.5px solid #7dd3fc',
                          borderRadius: '8px',
                          padding: '0 12px',
                        }}
                        required
                      />
                    </div>
                  )}

                  {/* Precio Leche Ácida */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#b45309', marginBottom: '6px' }}>
                      <i className="fa-solid fa-flask" style={{ color: '#d97706', marginRight: '4px' }}></i>
                      Precio Leche Ácida ($/Lt)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={form.precioLitroAcidaUSD ?? ''}
                      onChange={(e) => setForm({ ...form, precioLitroAcidaUSD: e.target.value as any })}
                      placeholder="0.2000"
                      style={{
                        width: '100%',
                        height: '42px',
                        fontWeight: 800,
                        fontSize: '14.5px',
                        color: '#b45309',
                        background: '#fffbeb',
                        border: '1.5px solid #fde68a',
                        borderRadius: '8px',
                        padding: '0 12px',
                      }}
                    />
                  </div>
                </div>

                {/* 5. Ubicación / Sector (TELÉFONO RETIRADO POR SOLICITUD - RESIDE EN PROPIETARIO) */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    <i className="fa-solid fa-location-dot" style={{ color: '#0284c7', marginRight: '6px' }}></i>
                    Ubicación / Sector Geográfico
                  </label>
                  <input
                    type="text"
                    value={form.ubicacion}
                    onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                    placeholder="Ej: Sector La Esperanza, Carretera Principal Km 14"
                    style={{
                      width: '100%',
                      height: '42px',
                      fontSize: '13.5px',
                      color: '#0f172a',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '0 12px',
                      background: '#ffffff',
                    }}
                  />
                </div>

                {hasMapaRutas && (
                  <div style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Latitud (GPS)</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={form.latitud ?? ''}
                          onChange={(e) => setForm({ ...form, latitud: e.target.value ? Number(e.target.value) : null })}
                          placeholder="Ej: 8.620000"
                          style={{ width: '100%', height: '38px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#fff' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Longitud (GPS)</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={form.longitud ?? ''}
                          onChange={(e) => setForm({ ...form, longitud: e.target.value ? Number(e.target.value) : null })}
                          placeholder="Ej: -71.150000"
                          style={{ width: '100%', height: '38px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#fff' }}
                        />
                      </div>
                    </div>
                    <LeafletMapPicker
                      latitud={form.latitud}
                      longitud={form.longitud}
                      onChange={(lat, lng) => setForm((prev) => ({ ...prev, latitud: lat, longitud: lng }))}
                      height="220px"
                    />
                  </div>
                )}

                {/* 6. Checkbox Finca Activa */}
                <div
                  style={{
                    padding: '12px 14px',
                    background: form.activo !== false ? '#f0fdf4' : '#fff1f2',
                    border: `1.5px solid ${form.activo !== false ? '#86efac' : '#fecdd3'}`,
                    borderRadius: '8px',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      color: form.activo !== false ? '#065f46' : '#9f1239',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      margin: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.activo !== false}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          activo: e.target.checked,
                          rutaId: e.target.checked ? form.rutaId : undefined,
                        })
                      }
                      style={{
                        width: '18px',
                        height: '18px',
                        accentColor: form.activo !== false ? '#059669' : '#e11d48',
                        cursor: 'pointer',
                      }}
                    />
                    <span>
                      <i
                        className={`fa-solid ${form.activo !== false ? 'fa-circle-check' : 'fa-ban'}`}
                        style={{ marginRight: '6px' }}
                      ></i>
                      {form.activo !== false
                        ? 'Finca Activa para Recolecciones (Visible en todo el sistema)'
                        : 'Finca Inactiva (Solo visible en catálogo de Fincas, sin ruta asociada)'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Botones del Modal Footer */}
              <div
                style={{
                  padding: '16px 24px',
                  background: '#ffffff',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={cerrarModal}
                  style={{
                    height: '42px',
                    padding: '0 20px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className="fa-solid fa-xmark"></i> Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarMutation.isPending}
                  style={{
                    height: '42px',
                    padding: '0 22px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.3)',
                  }}
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  {guardarMutation.isPending ? 'Guardando...' : modoEdicionId ? 'Actualizar Finca' : 'Registrar Finca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRECIOS MASIVO */}
      {modalPrecioMasivo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #cbd5e1',
            }}
          >
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <i className="fa-solid fa-tags" style={{ color: '#059669' }}></i>
              Actualizar Precio en Lote
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              Este valor se aplicará de forma global a todas las fincas activas registradas en el sistema.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                precioMasivoMutation.mutate(nuevoPrecioMasivo);
              }}
            >
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Nuevo Precio por Litro ($/Lt)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={nuevoPrecioMasivo}
                  onChange={(e) => setNuevoPrecioMasivo(Number(e.target.value))}
                  className="form-input"
                  style={{
                    width: '100%',
                    height: '42px',
                    fontSize: '16px',
                    fontWeight: 800,
                    color: '#059669',
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                  }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalPrecioMasivo(false)}
                  className="btn btn-outline"
                  style={{ height: '38px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={precioMasivoMutation.isPending}
                  className="btn btn-primary"
                  style={{ height: '38px', background: '#059669', borderColor: '#059669' }}
                >
                  {precioMasivoMutation.isPending ? 'Actualizando...' : 'Confirmar y Aplicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FincasPage;
