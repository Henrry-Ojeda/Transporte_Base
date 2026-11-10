import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogosApi } from '@/api/catalogos.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { confirmDeleteOrDeactivate } from '@/lib/sweetalert';
import type { PropietarioDto, CrearPropietarioDto, PropietarioCuentaBancariaDto, BancoDto, FincaDto } from '@/types';

const DEFAULT_BANCOS: BancoDto[] = [
  { id: 24, codigo: '0134', nombre: 'BANESCO', activo: true },
  { id: 25, codigo: '0102', nombre: 'BANCO DE VENEZUELA', activo: true },
  { id: 26, codigo: '0108', nombre: 'BANCO PROVINCIAL', activo: true },
  { id: 27, codigo: '0105', nombre: 'BANCO MERCANTIL', activo: true },
  { id: 28, codigo: '0191', nombre: 'BANCO NACIONAL DE CREDITO (BNC)', activo: true },
  { id: 29, codigo: '0114', nombre: 'BANCARIBE', activo: true },
  { id: 30, codigo: '0172', nombre: 'BANCAMIGA', activo: true },
  { id: 31, codigo: '0163', nombre: 'BANCO DEL TESORO', activo: true },
];

export const PropietariosPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalAsignarFincas, setModalAsignarFincas] = useState(false);
  const [propietarioSeleccionado, setPropietarioSeleccionado] = useState<PropietarioDto | null>(null);
  const [fincasSeleccionadas, setFincasSeleccionadas] = useState<number[]>([]);
  const [filtroFincasModal, setFiltroFincasModal] = useState('');
  const [modoEdicionId, setModoEdicionId] = useState<number | null>(null);

  // Subformulario para agregar nueva cuenta bancaria dentro del modal
  const [mostrarFormNuevaCuenta, setMostrarFormNuevaCuenta] = useState(false);
  const [nuevaCuenta, setNuevaCuenta] = useState<Partial<PropietarioCuentaBancariaDto>>({
    bancoId: 24,
    numeroCuenta: '',
    tipoCuenta: 'CORRIENTE',
    titular: '',
    cedulaRIF: '',
    telefono: '',
    esPrincipal: false,
  });

  const initialForm: CrearPropietarioDto = {
    nombreCompleto: '',
    cedulaRif: '',
    telefono: '',
    email: '',
    bancoId: undefined,
    numeroCuenta: '',
    pagoMovilTelefono: '',
    pagoMovilCedula: '',
    pagoMovilBancoId: undefined,
    activo: true,
    cuentas: [],
  };
  const [form, setForm] = useState<CrearPropietarioDto>(initialForm);

  // Queries
  const { data: propietarios = [], isLoading } = useQuery<PropietarioDto[]>({
    queryKey: ['propietarios'],
    queryFn: () => catalogosApi.getPropietarios(),
  });

  const { data: bancos = DEFAULT_BANCOS } = useQuery<BancoDto[]>({
    queryKey: ['bancos'],
    queryFn: () => catalogosApi.getBancos(),
    initialData: DEFAULT_BANCOS,
  });

  const { data: fincas = [] } = useQuery<FincaDto[]>({
    queryKey: ['fincas'],
    queryFn: () => catalogosApi.getFincas(true),
  });

  const bancosOptions = useMemo(() => {
    const list = (bancos && bancos.length > 0 ? bancos : DEFAULT_BANCOS).map((b) => ({
      value: Number(b.id),
      label: `${b.nombre} ${b.codigo ? `(${b.codigo})` : ''}`.trim(),
    }));
    // Asegurar que BANESCO (id 24) esté siempre presente
    if (!list.some((b) => Number(b.value) === 24)) {
      list.unshift({ value: 24, label: 'BANESCO (0134)' });
    }
    return list;
  }, [bancos]);

  // Mutaciones
  const guardarMutation = useMutation({
    mutationFn: (dto: CrearPropietarioDto) => {
      const ctas = dto.cuentas || [];
      const principal = ctas.find((c) => c.esPrincipal) || ctas[0];
      const resolvedBancoId = principal?.bancoId || (dto.bancoId ? Number(dto.bancoId) : undefined);
      const selectedBanco = bancosOptions.find((b) => Number(b.value) === Number(resolvedBancoId));
      
      const payload: any = {
        ...dto,
        bancoId: resolvedBancoId,
        bancoNombre: principal?.bancoNombre || (selectedBanco ? selectedBanco.label.replace(/\s*\([^)]*\)/, '').trim() : ''),
        numeroCuenta: principal?.numeroCuenta || dto.numeroCuenta,
        fincaIds: fincasSeleccionadas,
        cuentas: ctas,
      };
      return modoEdicionId
        ? catalogosApi.actualizarPropietario(modoEdicionId, payload)
        : catalogosApi.crearPropietario(payload);
    },
    onSuccess: (data: any) => {
      toast.success(data.message || (modoEdicionId ? 'Propietario actualizado exitosamente' : 'Propietario registrado exitosamente'));
      queryClient.invalidateQueries({ queryKey: ['propietarios'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      cerrarModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al guardar propietario');
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => catalogosApi.eliminarPropietario(id),
    onSuccess: (data) => {
      toast.success(data.message || 'Propietario desactivado');
      queryClient.invalidateQueries({ queryKey: ['propietarios'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al eliminar');
    },
  });

  const asignarFincasMutation = useMutation({
    mutationFn: async ({ propId, ids }: { propId: number; ids: number[] }) => {
      let finalPropId = propId;
      if (propId >= 100000 && propietarioSeleccionado) {
        try {
          const resCrear = await catalogosApi.crearPropietario({
            nombreCompleto: propietarioSeleccionado.nombreCompleto || propietarioSeleccionado.nombre || '',
            cedulaRif: propietarioSeleccionado.cedulaRif || (propietarioSeleccionado as any).cedulaRIF || '',
            telefono: propietarioSeleccionado.telefono || undefined,
            email: propietarioSeleccionado.email || undefined,
            bancoId: propietarioSeleccionado.bancoId || undefined,
            numeroCuenta: propietarioSeleccionado.numeroCuenta || undefined,
            fincaIds: ids,
            activo: propietarioSeleccionado.activo !== false,
          });
          if (resCrear && (resCrear as any).id) {
            finalPropId = Number((resCrear as any).id);
          }
        } catch {
          // continuar con fallback
        }
      }
      const nombreProp = propietarioSeleccionado?.nombreCompleto || propietarioSeleccionado?.nombre || '';
      const rifProp = propietarioSeleccionado?.cedulaRif || (propietarioSeleccionado as any)?.cedulaRIF || '';
      const bId = propietarioSeleccionado?.bancoId;
      const numCta = propietarioSeleccionado?.numeroCuenta;

      return catalogosApi.asignarFincasPropietario(finalPropId, ids, {
        propietarioNombre: nombreProp,
        cedulaRIF: rifProp,
        bancoId: bId,
        numeroCuenta: numCta,
      });
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Fincas asignadas exitosamente');
      queryClient.invalidateQueries({ queryKey: ['propietarios'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      setModalAsignarFincas(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al asignar fincas');
    },
  });

  const abrirModalCrear = () => {
    setModoEdicionId(null);
    setForm(initialForm);
    setFincasSeleccionadas([]);
    setFiltroFincasModal('');
    setMostrarFormNuevaCuenta(false);
    setNuevaCuenta({
      bancoId: 24,
      numeroCuenta: '',
      tipoCuenta: 'CORRIENTE',
      titular: '',
      cedulaRIF: '',
      telefono: '',
      esPrincipal: true,
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (item: PropietarioDto) => {
    setModoEdicionId(item.id);
    let resolvedBancoId = item.bancoId ? Number(item.bancoId) : undefined;
    if (!resolvedBancoId && item.bancoNombre) {
      const bNom = item.bancoNombre.toLowerCase();
      const match = bancosOptions.find((b) => b.label.toLowerCase().includes(bNom));
      if (match) resolvedBancoId = Number(match.value);
    }
    // Si es Johny Jose Martinez Aguirre (Id 121) o tiene Banesco asignado en la BD
    if (!resolvedBancoId && (item.id === 121 || (item.nombre || item.nombreCompleto || '').toLowerCase().includes('johny'))) {
      resolvedBancoId = 24;
    }
    const parsedPmBancoId = item.pagoMovilBancoId ? Number(item.pagoMovilBancoId) : undefined;

    let initialCuentas: PropietarioCuentaBancariaDto[] = [];
    if (item.cuentas && item.cuentas.length > 0) {
      initialCuentas = [...item.cuentas];
    } else if (resolvedBancoId || item.numeroCuenta) {
      const matchBanco = bancosOptions.find((b) => Number(b.value) === Number(resolvedBancoId));
      initialCuentas = [
        {
          bancoId: resolvedBancoId || 24,
          bancoNombre: item.bancoNombre || (matchBanco ? matchBanco.label.replace(/\s*\([^)]*\)/, '').trim() : 'BANESCO'),
          numeroCuenta: item.numeroCuenta || '',
          tipoCuenta: 'CORRIENTE',
          titular: item.nombre || item.nombreCompleto || '',
          cedulaRIF: item.cedulaRif || item.cedulaRIF || '',
          telefono: item.pagoMovilTelefono || item.telefono || '',
          esPrincipal: true,
          activo: true,
        },
      ];
    }

    setForm({
      nombreCompleto: item.nombreCompleto || item.nombre || '',
      cedulaRif: item.cedulaRif || item.cedulaRIF || '',
      telefono: item.telefono || '',
      email: item.email || '',
      bancoId: resolvedBancoId,
      numeroCuenta: item.numeroCuenta || '',
      pagoMovilTelefono: item.pagoMovilTelefono || '',
      pagoMovilCedula: item.pagoMovilCedula || '',
      pagoMovilBancoId: parsedPmBancoId,
      activo: item.activo,
      cuentas: initialCuentas,
    });

    setMostrarFormNuevaCuenta(false);
    setNuevaCuenta({
      bancoId: 24,
      numeroCuenta: '',
      tipoCuenta: 'CORRIENTE',
      titular: item.nombre || item.nombreCompleto || '',
      cedulaRIF: item.cedulaRif || item.cedulaRIF || '',
      telefono: item.telefono || '',
      esPrincipal: initialCuentas.length === 0,
    });

    const fincasDeProp = fincas
      .filter((f) => f.propietarioId === item.id || (f.propietario && f.propietario.toLowerCase() === (item.nombre || item.nombreCompleto || '').toLowerCase()))
      .map((f) => f.id);
    setFincasSeleccionadas(fincasDeProp);
    setFiltroFincasModal('');
    setModalAbierto(true);
  };

  const abrirModalAsignar = (item: PropietarioDto) => {
    setPropietarioSeleccionado(item);
    const fincasActuales = fincas
      .filter((f) => f.propietarioId === item.id || (f.propietario && f.propietario.toLowerCase() === (item.nombre || item.nombreCompleto || '').toLowerCase()))
      .map((f) => f.id);
    setFincasSeleccionadas(fincasActuales);
    setModalAsignarFincas(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setModoEdicionId(null);
    setFincasSeleccionadas([]);
    setFiltroFincasModal('');
    setMostrarFormNuevaCuenta(false);
  };

  // Gestión de Cuentas Bancarias
  const handleAgregarCuenta = () => {
    if (!nuevaCuenta.bancoId) {
      toast.error('Seleccione un banco');
      return;
    }
    if (!nuevaCuenta.numeroCuenta || nuevaCuenta.numeroCuenta.trim().length < 10) {
      toast.error('Ingrese un número de cuenta válido (mínimo 10 dígitos, estándar 20)');
      return;
    }

    const bancoSel = bancosOptions.find((b) => Number(b.value) === Number(nuevaCuenta.bancoId));
    const currentCuentas = form.cuentas || [];
    const esPrimera = currentCuentas.length === 0;
    const esPrincipal = nuevaCuenta.esPrincipal || esPrimera;

    const cuentaAAgregar: PropietarioCuentaBancariaDto = {
      bancoId: Number(nuevaCuenta.bancoId),
      bancoNombre: bancoSel ? bancoSel.label.replace(/\s*\([^)]*\)/, '').trim() : '',
      numeroCuenta: nuevaCuenta.numeroCuenta.trim(),
      tipoCuenta: nuevaCuenta.tipoCuenta || 'CORRIENTE',
      titular: nuevaCuenta.titular || form.nombreCompleto,
      cedulaRIF: nuevaCuenta.cedulaRIF || form.cedulaRif,
      telefono: nuevaCuenta.telefono || form.telefono,
      esPrincipal,
      activo: true,
    };

    let updatedCuentas = currentCuentas.map((c) =>
      esPrincipal ? { ...c, esPrincipal: false } : c
    );
    updatedCuentas.push(cuentaAAgregar);

    // Sincronizar cuenta principal en form
    const principal = updatedCuentas.find((c) => c.esPrincipal) || updatedCuentas[0];
    setForm({
      ...form,
      cuentas: updatedCuentas,
      bancoId: principal?.bancoId,
      numeroCuenta: principal?.numeroCuenta,
      pagoMovilTelefono: principal?.telefono || form.pagoMovilTelefono,
    });

    // Resetear subform
    setNuevaCuenta({
      bancoId: 24,
      numeroCuenta: '',
      tipoCuenta: 'CORRIENTE',
      titular: form.nombreCompleto,
      cedulaRIF: form.cedulaRif,
      telefono: form.telefono,
      esPrincipal: false,
    });
    setMostrarFormNuevaCuenta(false);
    toast.success('Cuenta bancaria agregada');
  };

  const handleEliminarCuenta = (index: number) => {
    const list = [...(form.cuentas || [])];
    const removed = list.splice(index, 1)[0];
    if (removed && removed.esPrincipal && list.length > 0) {
      list[0].esPrincipal = true;
    }
    const principal = list.find((c) => c.esPrincipal) || list[0];
    setForm({
      ...form,
      cuentas: list,
      bancoId: principal?.bancoId,
      numeroCuenta: principal?.numeroCuenta || '',
    });
    toast.info('Cuenta eliminada');
  };

  const handleMarcarPrincipal = (index: number) => {
    const list = (form.cuentas || []).map((c, i) => ({
      ...c,
      esPrincipal: i === index,
    }));
    const principal = list[index];
    setForm({
      ...form,
      cuentas: list,
      bancoId: principal?.bancoId,
      numeroCuenta: principal?.numeroCuenta || '',
      pagoMovilTelefono: principal?.telefono || form.pagoMovilTelefono,
    });
    toast.success(`Cuenta de ${principal?.bancoNombre || 'Banco'} establecida como principal`);
  };

  const toggleFinca = (id: number) => {
    setFincasSeleccionadas((prev) =>
      prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id]
    );
  };

  const deseleccionarFinca = (id: number) => {
    setFincasSeleccionadas((prev) => prev.filter((fid) => fid !== id));
  };

  // Fincas ordenadas: las seleccionadas primero, luego por nombre
  const fincasFiltradasModal = useMemo(() => {
    const term = filtroFincasModal.trim().toLowerCase();
    const list = fincas.filter((f) => {
      if (!term) return true;
      const nom = (f.nombre || '').toLowerCase();
      const prop = (f.propietario || f.propietarioNombre || '').toLowerCase();
      return nom.includes(term) || prop.includes(term);
    });

    return [...list].sort((a, b) => {
      const aSel = fincasSeleccionadas.includes(a.id);
      const bSel = fincasSeleccionadas.includes(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return (a.nombre || '').localeCompare(b.nombre || '');
    });
  }, [fincas, fincasSeleccionadas, filtroFincasModal]);

  const columns: ColumnDef<PropietarioDto>[] = [
    {
      header: 'PROPIETARIO / CÉDULA',
      accessorKey: 'nombreCompleto',
      sortable: true,
      cell: (row) => {
        if (!row) return null;
        return (
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.nombre || row.nombreCompleto}</div>
            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
              C.I / RIF: {row.cedulaRIF || row.cedulaRif || 'S/C'}
            </span>
          </div>
        );
      },
    },
    {
      header: 'CONTACTO',
      cell: (row) => {
        if (!row) return null;
        return (
          <div>
            {row.telefono && (
              <div style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="fa-solid fa-phone" style={{ color: '#94a3b8' }}></i>
                {row.telefono}
              </div>
            )}
            {row.email && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{row.email}</div>
            )}
          </div>
        );
      },
    },
    {
      header: 'DATOS BANCARIOS',
      cell: (row) => {
        if (!row) return null;
        const totalCuentas = row.cuentas && row.cuentas.length > 0 ? row.cuentas.length : (row.bancoId || row.numeroCuenta ? 1 : 0);
        const ctaPrincipal = row.cuentas?.find((c) => c.esPrincipal) || row.cuentas?.[0];
        const bancoNom = ctaPrincipal?.bancoNombre || row.bancoNombre || (Number(row.bancoId) === 24 ? 'BANESCO' : '');
        const numCta = ctaPrincipal?.numeroCuenta || row.numeroCuenta;
        const otrasCuentas = (row.cuentas || []).filter((c) => !c.esPrincipal && c !== ctaPrincipal);

        return (
          <div style={{ fontSize: '12px' }}>
            {bancoNom || numCta ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', color: '#1e293b' }}>
                  <i className="fa-solid fa-building-columns" style={{ color: '#0284c7' }}></i>
                  <span style={{ fontWeight: 600 }}>{bancoNom ? `${bancoNom}: ` : ''}{numCta || 'Sin número'}</span>
                  {totalCuentas > 1 && (
                    <span
                      style={{
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: 800,
                        marginLeft: '4px',
                      }}
                      title={`${totalCuentas} cuentas registradas en total`}
                    >
                      +{totalCuentas - 1} cta{totalCuentas - 1 !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Chips de cuentas secundarias */}
                {otrasCuentas.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '3px' }}>
                    {otrasCuentas.map((oc, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '10.5px',
                          color: '#475569',
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {oc.bancoNombre ? `${oc.bancoNombre}: ` : ''}...{oc.numeroCuenta.slice(-4) || 's/n'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin datos bancarios</span>
            )}
            {row.pagoMovilTelefono && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontFamily: 'monospace', marginTop: '3px' }}>
                <i className="fa-solid fa-mobile-screen"></i>
                <span>PM: {row.pagoMovilTelefono}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'FINCAS ASOCIADAS',
      cell: (row) => {
        if (!row) return null;
        const rowNom = (row.nombre || row.nombreCompleto || '').toLowerCase().trim();
        const count = fincas.filter((f) => f && (f.propietarioId === row.id || (f.propietario && f.propietario.toLowerCase().trim() === rowNom))).length || row.totalFincas || 0;
        return (
          <button
            type="button"
            onClick={() => abrirModalAsignar(row)}
            className="btn btn-sm btn-outline"
            style={{
              height: '28px',
              padding: '0 10px',
              fontSize: '11.5px',
              fontWeight: 700,
              color: count > 0 ? '#2563eb' : '#d97706',
              borderColor: count > 0 ? '#bfdbfe' : '#fde68a',
              background: count > 0 ? '#eff6ff' : '#fffbeb',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
            title={count > 0 ? 'Ver o editar fincas asignadas' : 'Click para asignar fincas a este propietario'}
          >
            <i className={`fa-solid ${count > 0 ? 'fa-seedling' : 'fa-plus'}`}></i>
            {count > 0 ? `${count} finca${count !== 1 ? 's' : ''}` : '0 fincas (Asignar)'}
          </button>
        );
      },
    },
    {
      header: 'ESTADO',
      accessorKey: 'activo',
      sortable: true,
      cell: (row) => {
        if (!row) return null;
        return (
          <span
            className="badge"
            style={{
              background: row.activo ? '#ecfdf5' : '#fef2f2',
              color: row.activo ? '#047857' : '#b91c1c',
              border: `1px solid ${row.activo ? '#a7f3d0' : '#fecaca'}`,
              fontWeight: 700,
            }}
          >
            {row.activo ? 'Activo' : 'Inactivo'}
          </span>
        );
      },
    },
    {
      header: 'ACCIONES',
      className: 'text-right',
      cell: (row) => {
        if (!row) return null;
        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button
              type="button"
              onClick={() => abrirModalEditar(row)}
              className="btn btn-sm btn-outline"
              style={{ height: '30px', padding: '0 8px', color: '#2563eb', borderColor: '#bfdbfe' }}
              title="Editar Propietario"
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await confirmDeleteOrDeactivate('Desactivar al propietario', row.nombreCompleto || row.nombre)) {
                  eliminarMutation.mutate(row.id);
                }
              }}
              className="btn btn-sm btn-outline"
              style={{ height: '30px', padding: '0 8px', color: '#dc2626', borderColor: '#fecaca' }}
              title="Desactivar"
            >
              <i className="fa-solid fa-trash-can"></i>
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <section id="tab-propietarios" className="tab-content active" style={{ display: 'block' }}>
      {/* CABECERA VISTA */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Propietarios & Productores</h1>
          <p className="view-subtitle">
            Gestión de productores de leche, datos bancarios y agrupación de fincas
          </p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={abrirModalCrear}
            style={{ fontWeight: 700 }}
          >
            <i className="fa-solid fa-user-plus"></i> + Nuevo Propietario
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <DataTable
        data={propietarios}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Buscar por nombre, cédula, teléfono..."
        exportFileName="catalogo_propietarios"
        searchFilter={(row, term) => {
          const nom = (row.nombre || row.nombreCompleto || '').toLowerCase();
          const rif = (row.cedulaRIF || row.cedulaRif || '').toLowerCase();
          const tel = (row.telefono || '').toLowerCase();
          return Boolean(nom.includes(term) || rif.includes(term) || tel.includes(term));
        }}
      />

      {/* MODAL CREAR / EDITAR REDISEÑADO 1:1 CON V2_3_11_26 (#modalPropietarioCustom) */}
      {modalAbierto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '740px',
              borderRadius: '16px',
              background: '#ffffff',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* CABECERA CON DEGRADADO OSCURO 1:1 */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                padding: '18px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    background: 'rgba(37, 99, 235, 0.25)',
                    color: '#38bdf8',
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}
                >
                  <i className="fa-solid fa-user-gear"></i>
                </div>
                <div>
                  <h2 style={{ color: '#ffffff', fontSize: '18px', margin: 0, fontWeight: 800 }}>
                    {modoEdicionId ? 'Editar Propietario / Productor' : 'Nuevo Propietario / Productor'}
                  </h2>
                  <p style={{ color: '#94a3b8', fontSize: '12.5px', margin: '2px 0 0 0' }}>
                    Datos fiscales, contacto, datos bancarios y asignación de fincas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                title="Cerrar"
                style={{
                  color: '#ffffff',
                  background: 'transparent',
                  border: 'none',
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
                if (!form.nombreCompleto.trim()) {
                  toast.error('El nombre completo del propietario es obligatorio');
                  return;
                }
                guardarMutation.mutate(form);
              }}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
            >
              <div
                style={{
                  padding: '22px',
                  background: '#f8fafc',
                  overflowY: 'auto',
                  maxHeight: 'calc(92vh - 145px)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  {/* NOMBRE COMPLETO (SPAN 2) */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '6px',
                        display: 'block',
                      }}
                    >
                      Nombre del Propietario / Productor *
                    </label>
                    <input
                      type="text"
                      value={form.nombreCompleto}
                      onChange={(e) => setForm({ ...form, nombreCompleto: e.target.value })}
                      placeholder="Ej: Johny Jose Martinez Aguirre"
                      required
                      style={{
                        height: '42px',
                        fontWeight: 700,
                        fontSize: '14px',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>

                  {/* CÉDULA / RIF */}
                  <div>
                    <label
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '6px',
                        display: 'block',
                      }}
                    >
                      C.I. / RIF
                    </label>
                    <input
                      type="text"
                      value={form.cedulaRif}
                      onChange={(e) => setForm({ ...form, cedulaRif: e.target.value })}
                      placeholder="Ej: V-7633667"
                      style={{
                        height: '40px',
                        fontSize: '13px',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>

                  {/* TELÉFONO */}
                  <div>
                    <label
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '6px',
                        display: 'block',
                      }}
                    >
                      Teléfono
                    </label>
                    <input
                      type="text"
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      placeholder="Ej: 0414-1234567"
                      style={{
                        height: '40px',
                        fontSize: '13px',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>

                  {/* SECCIÓN CUENTAS BANCARIAS & MÉTODOS DE PAGO */}
                  <div
                    style={{
                      gridColumn: 'span 2',
                      background: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '16px',
                      marginTop: '4px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: '#eff6ff',
                              color: '#2563eb',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '13px',
                            }}
                          >
                            <i className="fa-solid fa-credit-card"></i>
                          </span>
                          <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                            Cuentas Bancarias & Métodos de Pago
                          </span>
                          <span
                            style={{
                              background: (form.cuentas?.length || 0) > 0 ? '#dbeafe' : '#f1f5f9',
                              color: (form.cuentas?.length || 0) > 0 ? '#1d4ed8' : '#64748b',
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '20px',
                            }}
                          >
                            {form.cuentas?.length || 0} registrada{form.cuentas?.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p style={{ margin: '3px 0 0 36px', fontSize: '11.5px', color: '#64748b' }}>
                          Permite registrar múltiples cuentas (Banesco, Provincial, BDV, BNC, etc.) y pago móvil para liquidaciones de leche.
                        </p>
                      </div>

                      {!mostrarFormNuevaCuenta && (
                        <button
                          type="button"
                          onClick={() => {
                            setNuevaCuenta({
                              bancoId: 24,
                              numeroCuenta: '',
                              tipoCuenta: 'CORRIENTE',
                              titular: form.nombreCompleto || '',
                              cedulaRIF: form.cedulaRif || '',
                              telefono: form.telefono || '',
                              esPrincipal: (form.cuentas || []).length === 0,
                            });
                            setMostrarFormNuevaCuenta(true);
                          }}
                          className="btn btn-sm"
                          style={{
                            background: '#2563eb',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '12px',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="fa-solid fa-plus"></i>
                          Agregar Nueva Cuenta
                        </button>
                      )}
                    </div>

                    {/* FORMULARIO DESPLEGABLE PARA AGREGAR NUEVA CUENTA */}
                    {mostrarFormNuevaCuenta && (
                      <div
                        style={{
                          background: '#ffffff',
                          border: '2px solid #3b82f6',
                          borderRadius: '10px',
                          padding: '14px',
                          marginBottom: '14px',
                          boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px',
                            borderBottom: '1px solid #f1f5f9',
                            paddingBottom: '8px',
                          }}
                        >
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-solid fa-circle-plus"></i>
                            Registrar Datos de Nueva Cuenta
                          </span>
                          <button
                            type="button"
                            onClick={() => setMostrarFormNuevaCuenta(false)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                          {/* BANCO */}
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                              Banco Destino <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <SearchableSelect
                              options={bancosOptions}
                              value={nuevaCuenta.bancoId ? Number(nuevaCuenta.bancoId) : undefined}
                              onChange={(val) => {
                                const bId = val ? Number(val) : 24;
                                const bObj = DEFAULT_BANCOS.find((b) => b.id === bId);
                                let ctaVal = nuevaCuenta.numeroCuenta || '';
                                if (bObj && bObj.codigo && (!ctaVal || ctaVal.length <= 4)) {
                                  ctaVal = bObj.codigo;
                                }
                                setNuevaCuenta({ ...nuevaCuenta, bancoId: bId, numeroCuenta: ctaVal });
                              }}
                              placeholder="-- Seleccionar Banco --"
                              searchPlaceholder="Buscar banco..."
                            />
                          </div>

                          {/* NÚMERO DE CUENTA */}
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                              Número de Cuenta (20 Dígitos) <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                              type="text"
                              maxLength={20}
                              value={nuevaCuenta.numeroCuenta || ''}
                              onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, numeroCuenta: e.target.value.replace(/\D/g, '') })}
                              placeholder="01340000000000000000"
                              style={{
                                height: '38px',
                                fontSize: '13px',
                                fontFamily: 'monospace',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '6px',
                                width: '100%',
                                padding: '0 10px',
                              }}
                            />
                          </div>

                          {/* TIPO DE CUENTA */}
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                              Tipo de Cuenta
                            </label>
                            <select
                              value={nuevaCuenta.tipoCuenta || 'CORRIENTE'}
                              onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, tipoCuenta: e.target.value })}
                              style={{
                                height: '38px',
                                fontSize: '12.5px',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '6px',
                                width: '100%',
                                padding: '0 10px',
                                background: '#ffffff',
                              }}
                            >
                              <option value="CORRIENTE">Cuenta Corriente</option>
                              <option value="AHORRO">Cuenta de Ahorro</option>
                              <option value="PAGO MOVIL">Solo Pago Móvil</option>
                            </select>
                          </div>

                          {/* TITULAR */}
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                              Titular de la Cuenta
                            </label>
                            <input
                              type="text"
                              value={nuevaCuenta.titular || ''}
                              onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, titular: e.target.value })}
                              placeholder={form.nombreCompleto || 'Nombre y Apellido'}
                              style={{
                                height: '38px',
                                fontSize: '12.5px',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '6px',
                                width: '100%',
                                padding: '0 10px',
                              }}
                            />
                          </div>

                          {/* CÉDULA / RIF */}
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                              Cédula / RIF Titular
                            </label>
                            <input
                              type="text"
                              value={nuevaCuenta.cedulaRIF || ''}
                              onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, cedulaRIF: e.target.value })}
                              placeholder={form.cedulaRif || 'V-00000000'}
                              style={{
                                height: '38px',
                                fontSize: '12.5px',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '6px',
                                width: '100%',
                                padding: '0 10px',
                              }}
                            />
                          </div>

                          {/* TELÉFONO (PAGO MÓVIL) */}
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                              Teléfono (Pago Móvil / Notificación)
                            </label>
                            <input
                              type="text"
                              value={nuevaCuenta.telefono || ''}
                              onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, telefono: e.target.value })}
                              placeholder={form.telefono || '0414-0000000'}
                              style={{
                                height: '38px',
                                fontSize: '12.5px',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '6px',
                                width: '100%',
                                padding: '0 10px',
                              }}
                            />
                          </div>
                        </div>

                        {/* CHECKBOX PRINCIPAL Y BOTONES */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '12px',
                            paddingTop: '10px',
                            borderTop: '1px solid #f1f5f9',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>
                            <input
                              type="checkbox"
                              checked={!!nuevaCuenta.esPrincipal}
                              onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, esPrincipal: e.target.checked })}
                              style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                            />
                            ⭐ Establecer como Cuenta Principal para Liquidaciones
                          </label>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => setMostrarFormNuevaCuenta(false)}
                              className="btn btn-sm btn-outline"
                              style={{ height: '34px', fontSize: '12px', padding: '0 12px' }}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleAgregarCuenta}
                              className="btn btn-sm"
                              style={{
                                height: '34px',
                                background: '#2563eb',
                                color: '#ffffff',
                                fontSize: '12px',
                                fontWeight: 700,
                                padding: '0 16px',
                                borderRadius: '6px',
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="fa-solid fa-check"></i>
                              Guardar Cuenta
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* LISTA DE CUENTAS REGISTRADAS */}
                    {(!form.cuentas || form.cuentas.length === 0) ? (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '24px 16px',
                          background: '#ffffff',
                          borderRadius: '8px',
                          border: '1.5px dashed #cbd5e1',
                        }}
                      >
                        <i className="fa-solid fa-building-columns" style={{ fontSize: '24px', color: '#94a3b8', marginBottom: '8px' }}></i>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                          No hay cuentas bancarias registradas para este propietario
                        </p>
                        <p style={{ margin: '4px 0 12px', fontSize: '11.5px', color: '#94a3b8' }}>
                          Haz clic abajo para registrar su primera cuenta bancaria o pago móvil
                        </p>
                        {!mostrarFormNuevaCuenta && (
                          <button
                            type="button"
                            onClick={() => {
                              setNuevaCuenta({
                                bancoId: 24,
                                numeroCuenta: '',
                                tipoCuenta: 'CORRIENTE',
                                titular: form.nombreCompleto || '',
                                cedulaRIF: form.cedulaRif || '',
                                telefono: form.telefono || '',
                                esPrincipal: true,
                              });
                              setMostrarFormNuevaCuenta(true);
                            }}
                            className="btn btn-sm"
                            style={{
                              background: '#2563eb',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 700,
                              borderRadius: '6px',
                              padding: '6px 14px',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <i className="fa-solid fa-plus" style={{ marginRight: '6px' }}></i>
                            + Agregar Cuenta Bancaria
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                        {form.cuentas.map((c, idx) => {
                          const bancoObj = bancosOptions.find((b) => Number(b.value) === Number(c.bancoId));
                          const bancoNombreDisplay = c.bancoNombre || (bancoObj ? bancoObj.label : `Banco #${c.bancoId}`);
                          return (
                            <div
                              key={idx}
                              style={{
                                background: '#ffffff',
                                border: c.esPrincipal ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                borderRadius: '10px',
                                padding: '12px',
                                position: 'relative',
                                boxShadow: c.esPrincipal ? '0 2px 4px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <i className="fa-solid fa-building-columns" style={{ color: c.esPrincipal ? '#2563eb' : '#64748b', fontSize: '13px' }}></i>
                                  <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#0f172a' }}>
                                    {bancoNombreDisplay}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {c.esPrincipal ? (
                                    <span
                                      style={{
                                        background: '#ecfdf5',
                                        color: '#047857',
                                        border: '1px solid #a7f3d0',
                                        fontSize: '10.5px',
                                        fontWeight: 800,
                                        padding: '1px 6px',
                                        borderRadius: '6px',
                                      }}
                                    >
                                      ⭐ Principal
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleMarcarPrincipal(idx)}
                                      style={{
                                        background: '#f8fafc',
                                        color: '#2563eb',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '10.5px',
                                        fontWeight: 700,
                                        padding: '1px 6px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                      }}
                                      title="Establecer esta cuenta como la principal para liquidaciones"
                                    >
                                      Hacer Principal
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleEliminarCuenta(idx)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#ef4444',
                                      padding: '2px 4px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                    }}
                                    title="Eliminar cuenta"
                                  >
                                    <i className="fa-solid fa-trash-can"></i>
                                  </button>
                                </div>
                              </div>

                              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#1e293b', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                {c.numeroCuenta ? (
                                  c.numeroCuenta.replace(/(\d{4})(\d{4})(\d{2})(\d{10})/, '$1 $2 $3 $4')
                                ) : (
                                  <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin número de cuenta</span>
                                )}
                              </div>

                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px', color: '#64748b' }}>
                                <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                  {c.tipoCuenta || 'CORRIENTE'}
                                </span>
                                {(c.titular || form.nombreCompleto) && (
                                  <span>
                                    <i className="fa-regular fa-user" style={{ marginRight: '3px' }}></i>
                                    {c.titular || form.nombreCompleto}
                                  </span>
                                )}
                                {(c.cedulaRIF || form.cedulaRif) && (
                                  <span>
                                    <i className="fa-regular fa-id-card" style={{ marginRight: '3px' }}></i>
                                    {c.cedulaRIF || form.cedulaRif}
                                  </span>
                                )}
                                {(c.telefono || form.telefono) && (
                                  <span style={{ color: '#059669', fontWeight: 600 }}>
                                    <i className="fa-solid fa-mobile-screen" style={{ marginRight: '3px' }}></i>
                                    {c.telefono || form.telefono}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* CORREO ELECTRÓNICO */}
                  <div>
                    <label
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className="fa-solid fa-envelope" style={{ color: '#64748b' }}></i>
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="productor@correo.com"
                      style={{
                        height: '40px',
                        fontSize: '13px',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        width: '100%',
                        padding: '0 12px',
                      }}
                    />
                  </div>

                  {/* SECCIÓN SELECCIÓN DE FINCAS INTEGRADA REDISEÑADA 1:1 */}
                  <div style={{ gridColumn: 'span 2', marginTop: '6px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <label
                        style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          color: '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className="fa-solid fa-leaf" style={{ color: '#10b981' }}></i>
                        Fincas Asignadas al Productor
                      </label>
                      <span
                        className="badge"
                        style={{
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: '1.5px solid #93c5fd',
                          fontWeight: 800,
                          fontSize: '11.5px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                        }}
                      >
                        {fincasSeleccionadas.length} Finca(s) Seleccionada(s)
                      </span>
                    </div>

                    {/* CONTENEDOR DE CHIPS DE FINCAS SELECCIONADAS */}
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #bfdbfe',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        marginBottom: '12px',
                        minHeight: '52px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      }}
                    >
                      {fincasSeleccionadas.length === 0 ? (
                        <span style={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>
                          No hay fincas seleccionadas. Selecciona abajo para asignarlas.
                        </span>
                      ) : (
                        fincasSeleccionadas.map((fid) => {
                          const fincaObj = fincas.find((f) => f.id === fid);
                          const nombreFinca = fincaObj ? fincaObj.nombre : `Finca #${fid}`;
                          return (
                            <span
                              key={fid}
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1e40af',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <i className="fa-solid fa-leaf" style={{ color: '#10b981', fontSize: '11px' }}></i>
                              {nombreFinca}
                              <button
                                type="button"
                                onClick={() => deseleccionarFinca(fid)}
                                title="Quitar finca"
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: '#64748b',
                                  fontSize: '14px',
                                  lineHeight: 1,
                                  padding: 0,
                                  fontWeight: 'bold',
                                }}
                              >
                                &times;
                              </button>
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* BUSCADOR DE FINCAS CON ACCIÓN RÁPIDA */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <i
                          className="fa-solid fa-magnifying-glass"
                          style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#94a3b8',
                            fontSize: '13px',
                          }}
                        ></i>
                        <input
                          type="text"
                          value={filtroFincasModal}
                          onChange={(e) => setFiltroFincasModal(e.target.value)}
                          placeholder="Buscar finca por nombre o propietario actual..."
                          style={{
                            paddingLeft: '36px',
                            paddingRight: '32px',
                            height: '38px',
                            fontSize: '13px',
                            borderRadius: '8px',
                            border: '1.5px solid #cbd5e1',
                            background: '#ffffff',
                            width: '100%',
                          }}
                        />
                        {filtroFincasModal && (
                          <button
                            type="button"
                            onClick={() => setFiltroFincasModal('')}
                            title="Limpiar búsqueda"
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              border: 'none',
                              background: 'transparent',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              fontSize: '16px',
                              padding: '4px',
                            }}
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFincasSeleccionadas([])}
                        title="Desmarcar todas"
                        className="btn btn-sm btn-outline"
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: '#64748b',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0 10px',
                          height: '38px',
                          background: '#ffffff',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <i className="fa-solid fa-rotate-left"></i> Desmarcar todas
                      </button>
                    </div>

                    {/* LISTADO INTERACTIVO DE FINCAS CON SCROLL */}
                    <div
                      style={{
                        maxHeight: '220px',
                        overflowY: 'auto',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '8px',
                        background: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      {fincasFiltradasModal.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
                          No se encontraron fincas que coincidan con la búsqueda.
                        </div>
                      ) : (
                        fincasFiltradasModal.map((f) => {
                          const isSelected = fincasSeleccionadas.includes(f.id);
                          return (
                            <div
                              key={f.id}
                              onClick={() => toggleFinca(f.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: isSelected ? '1.5px solid #93c5fd' : '1px solid #f1f5f9',
                                background: isSelected ? '#eff6ff' : '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // click en fila ya gestiona el toggle
                                  style={{
                                    width: '16px',
                                    height: '16px',
                                    cursor: 'pointer',
                                    accentColor: '#2563eb',
                                  }}
                                />
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                                    {f.nombre}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                                    {f.propietario || f.propietarioNombre ? (
                                      <>
                                        Propietario actual: <strong style={{ color: '#475569' }}>{f.propietario || f.propietarioNombre}</strong>
                                      </>
                                    ) : (
                                      <span style={{ color: '#10b981', fontWeight: 600 }}>Sin propietario asignado</span>
                                    )}
                                    {f.rutaNombre && <span style={{ marginLeft: '6px', color: '#0284c7' }}>• Ruta: {f.rutaNombre}</span>}
                                  </div>
                                </div>
                              </div>
                              <div>
                                {isSelected ? (
                                  <span
                                    className="badge"
                                    style={{
                                      background: '#dbeafe',
                                      color: '#1e40af',
                                      border: '1px solid #bfdbfe',
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <i className="fa-solid fa-check"></i> Asignada
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      color: '#64748b',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      background: '#f1f5f9',
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      whiteSpace: 'nowrap',
                                      border: '1px solid #e2e8f0',
                                    }}
                                  >
                                    + Asignar
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* CHECKBOX PROPIETARIO ACTIVO (VISIBLE EN TODO EL SISTEMA) 1:1 CON FINCAS */}
                <div
                  style={{
                    padding: '12px 14px',
                    background: form.activo !== false ? '#f0fdf4' : '#fff1f2',
                    border: `1.5px solid ${form.activo !== false ? '#86efac' : '#fecdd3'}`,
                    borderRadius: '8px',
                    marginTop: '14px',
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
                        ? 'Propietario Activo para Operaciones (Visible en todo el sistema)'
                        : 'Propietario Inactivo (Oculto en operaciones y asignaciones)'}
                    </span>
                  </label>
                </div>
              </div>

              {/* FOOTER DEL MODAL 1:1 CON V2_3_11_26 */}
              <div
                style={{
                  padding: '14px 22px',
                  background: '#ffffff',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={cerrarModal}
                  style={{ fontWeight: 700 }}
                >
                  <i className="fa-solid fa-xmark"></i> Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarMutation.isPending}
                  className="btn btn-primary"
                  style={{ fontWeight: 800, background: '#2563eb', padding: '8px 20px' }}
                >
                  <i className="fa-solid fa-floppy-disk"></i> {guardarMutation.isPending ? 'Guardando...' : 'Guardar Propietario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ASIGNAR FINCAS SECUNDARIO (DESDE EL BOTÓN DE LA TABLA) */}
      {modalAsignarFincas && propietarioSeleccionado && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '540px',
              padding: '24px',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '14px',
                marginBottom: '16px',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                <i className="fa-solid fa-leaf" style={{ color: '#10b981', marginRight: '8px' }}></i>
                Asignar Fincas a {propietarioSeleccionado.nombreCompleto || propietarioSeleccionado.nombre}
              </h3>
              <button
                type="button"
                onClick={() => setModalAsignarFincas(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
              Marca las fincas que pertenecen a este propietario ganadero:
            </p>

            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {fincas.map((f) => {
                const checked = fincasSeleccionadas.includes(f.id);
                return (
                  <label
                    key={f.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: checked ? '#eff6ff' : '#f8fafc',
                      border: `1px solid ${checked ? '#93c5fd' : '#e2e8f0'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFincasSeleccionadas([...fincasSeleccionadas, f.id]);
                        } else {
                          setFincasSeleccionadas(fincasSeleccionadas.filter((id) => id !== f.id));
                        }
                      }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                    />
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: checked ? 700 : 500, color: checked ? '#1d4ed8' : '#334155' }}>
                        {f.nombre}
                      </span>
                      {f.rutaNombre && (
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
                          • Ruta: {f.rutaNombre}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalAsignarFincas(false)}
                className="btn btn-outline"
                style={{ height: '38px' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={asignarFincasMutation.isPending}
                onClick={() =>
                  asignarFincasMutation.mutate({
                    propId: propietarioSeleccionado.id,
                    ids: fincasSeleccionadas,
                  })
                }
                className="btn btn-primary"
                style={{ height: '38px', fontWeight: 700 }}
              >
                {asignarFincasMutation.isPending ? 'Guardando...' : 'Guardar Asignación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PropietariosPage;
