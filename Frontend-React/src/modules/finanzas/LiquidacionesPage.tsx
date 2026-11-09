import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { finanzasApi } from '@/api/finanzas.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import type { PreliquidacionFincaDto, CicloSemanalDto } from '@/types';

export const LiquidacionesPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [cicloSeleccionadoId, setCicloSeleccionadoId] = useState<number | undefined>(undefined);
  const [modalPagar, setModalPagar] = useState(false);
  const [fincaPago, setFincaPago] = useState<PreliquidacionFincaDto | null>(null);
  const [referenciaPago, setReferenciaPago] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroBanco, setFiltroBanco] = useState<string>('TODOS');
  const [modoAgrupacion, setModoAgrupacion] = useState<'FINCA' | 'PROPIETARIO'>('FINCA');

  // Modal Comprobante Oficial / Recibo
  const [modalRecibo, setModalRecibo] = useState(false);
  const [fincaRecibo, setFincaRecibo] = useState<PreliquidacionFincaDto | null>(null);
  const [tabRecibo, setTabRecibo] = useState<'voucher' | 'whatsapp'>('voucher');

  // Queries
  const { data: ciclos = [] } = useQuery<CicloSemanalDto[]>({
    queryKey: ['ciclos-semanas'],
    queryFn: () => finanzasApi.getCiclos(),
  });

  // Ciclos ordenados descendente
  const ciclosOrdenados = useMemo(() => {
    return [...ciclos].sort((a, b) => (b.id || 0) - (a.id || 0));
  }, [ciclos]);

  const cicloActivo = useMemo(() => {
    return (
      ciclos.find((c) => c.id === cicloSeleccionadoId) ||
      ciclos.find(
        (c) =>
          c.estado?.toUpperCase() === 'ABIERTO' ||
          c.estado?.toUpperCase() === 'ACTIVO' ||
          (c as any).Estado === 'ABIERTO' ||
          (c as any).Estado === 'ACTIVO'
      ) ||
      ciclosOrdenados[0]
    );
  }, [ciclos, cicloSeleccionadoId, ciclosOrdenados]);

  const { data: preliquidacion = [], isLoading } = useQuery<PreliquidacionFincaDto[]>({
    queryKey: ['preliquidacion', cicloSeleccionadoId || cicloActivo?.id],
    queryFn: () => finanzasApi.getPreliquidacion(cicloSeleccionadoId || cicloActivo?.id),
    enabled: !!(cicloSeleccionadoId || cicloActivo?.id),
  });

  // Mutación Pago
  const pagarMutation = useMutation({
    mutationFn: (dto: { fincaId: number; cicloId: number; referenciaPago: string; montoUSD: number; montoBs: number; tasaBCV: number }) =>
      finanzasApi.pagarPreliquidacion(dto),
    onSuccess: (data) => {
      toast.success(data.message || 'Pago registrado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['preliquidacion'] });
      setModalPagar(false);
      setReferenciaPago('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    },
  });

  // Bancos únicos para filtro
  const listaBancos = useMemo(() => {
    const setBancos = new Set<string>();
    preliquidacion.forEach((p) => {
      if (p.bancoNombre && p.bancoNombre.trim()) {
        setBancos.add(p.bancoNombre.trim().toUpperCase());
      }
    });
    return Array.from(setBancos).sort();
  }, [preliquidacion]);

  // Métricas
  const totalLitros = preliquidacion.reduce((acc, p) => acc + (p.totalLitros || 0), 0);
  const totalNetoUSD = preliquidacion.reduce((acc, p) => acc + (p.totalNetoUSD || 0), 0);
  const totalNetoBs = preliquidacion.reduce((acc, p) => acc + (p.totalNetoBs || 0), 0);

  const pagados = useMemo(() => preliquidacion.filter((p) => p.pagado), [preliquidacion]);
  const pendientes = useMemo(() => preliquidacion.filter((p) => !p.pagado), [preliquidacion]);

  const pagadoUSD = pagados.reduce((acc, p) => acc + (p.totalNetoUSD || 0), 0);
  const pagadoBs = pagados.reduce((acc, p) => acc + (p.totalNetoBs || 0), 0);

  const pendienteUSD = pendientes.reduce((acc, p) => acc + (p.totalNetoUSD || 0), 0);
  const pendienteBs = pendientes.reduce((acc, p) => acc + (p.totalNetoBs || 0), 0);

  const totalPagados = pagados.length;
  const porcentajeProgreso = preliquidacion.length > 0 ? Math.round((totalPagados / preliquidacion.length) * 100) : 0;

  // Formato texto semana
  const semanaTextoFormateada = useMemo(() => {
    if (!cicloActivo) return 'Semana Operativa Activa';
    const fIni = cicloActivo.fechaInicio ? new Date(cicloActivo.fechaInicio).toLocaleDateString('es-VE') : '';
    const fFin = cicloActivo.fechaFin ? new Date(cicloActivo.fechaFin).toLocaleDateString('es-VE') : '';
    return `Semana #${cicloActivo.numeroSemana || cicloActivo.id} (${fIni} al ${fFin})`;
  }, [cicloActivo]);

  // Generador de texto formateado para WhatsApp
  const generarTextoWhatsApp = (row: PreliquidacionFincaDto) => {
    const tasaBcv = row.tasaBCV || cicloActivo?.tasaBCVCierre || 0;
    const fIni = cicloActivo?.fechaInicio ? new Date(cicloActivo.fechaInicio).toLocaleDateString('es-VE') : '';
    const fFin = cicloActivo?.fechaFin ? new Date(cicloActivo.fechaFin).toLocaleDateString('es-VE') : '';
    const semanaStr = cicloActivo ? `Semana #${cicloActivo.numeroSemana || cicloActivo.id} (${fIni} al ${fFin})` : 'Semana Operativa';

    let txt = `🥛 *DETALLE DE COMPRA DE LECHE* 🥛\n`;
    txt += `🏢 *TRANSPORTE VERGEL & CARRILLO*\n`;
    txt += `👤 *Productor:* ${row.propietarioNombre || 'Productor'}\n`;
    txt += `🏡 *Finca:* ${row.fincaNombre}\n`;
    txt += `📅 *${semanaStr}*\n`;
    txt += `💵 *Tasa BCV:* Bs. ${tasaBcv.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $\n\n`;
    txt += `📊 *RESUMEN DE LECHE:*\n`;
    txt += `• *Total Litros:* ${(row.totalLitros || 0).toLocaleString('es-VE')} Lts\n`;
    txt += `• *Precio/Litro:* $${(row.precioLitroUSD || 0).toFixed(4)}\n`;
    txt += `• *Total Bruto:* $${(row.totalBrutoUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} (Bs. ${((row.totalBrutoUSD || 0) * (tasaBcv || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })})\n`;

    if (row.totalAdelantosUSD && row.totalAdelantosUSD > 0) {
      const adelantosBs = (row.totalAdelantosUSD || 0) * (tasaBcv || 1);
      txt += `\n💳 *DEDUCCIONES / ADELANTOS:*\n`;
      txt += `• (-) Adelantos/Préstamos: -$${row.totalAdelantosUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD (-Bs. ${adelantosBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})\n`;
    }

    txt += `\n────────────────────────\n`;
    txt += `💰 *TOTAL NETO A PAGAR:*\n`;
    txt += `👉 *$${(row.totalNetoUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD*\n`;
    txt += `👉 *Bs. ${(row.totalNetoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}*\n`;
    txt += `────────────────────────\n`;

    if (row.bancoNombre || row.numeroCuenta || row.pagoMovil) {
      txt += `🏦 *DATOS BANCARIOS:*\n`;
      if (row.bancoNombre) txt += `• Banco: ${row.bancoNombre}\n`;
      if (row.numeroCuenta) txt += `• Cuenta: ${row.numeroCuenta}\n`;
      if (row.pagoMovil) txt += `• Pago Móvil: ${row.pagoMovil}\n`;
    }

    if (row.referenciaPago) {
      txt += `🔖 *Ref. Pago:* ${row.referenciaPago}\n`;
      txt += `✅ *Estado:* LIQUIDACIÓN PAGADA / CONFORME\n`;
    } else {
      txt += `⏳ *Estado:* PENDIENTE DE PAGO\n`;
    }

    txt += `\n_¡Muchas gracias por su valiosa producción y confianza!_`;
    return txt;
  };

  // Enviar directo a WhatsApp Web / App
  const enviarWhatsAppDirecto = (row: PreliquidacionFincaDto) => {
    const texto = generarTextoWhatsApp(row);
    let phone = (row.pagoMovil || (row as any).telefono || '').replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '58' + phone.substring(1);
    } else if (phone.length === 10) {
      phone = '58' + phone;
    }

    const url = phone.length >= 10
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(texto)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;

    window.open(url, '_blank');
  };

  // Copiar al portapapeles con confirmación visual
  const copiarTextoWhatsApp = async (row: PreliquidacionFincaDto) => {
    const texto = generarTextoWhatsApp(row);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = texto;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }

      Swal.fire({
        icon: 'success',
        title: '¡Copiado para WhatsApp!',
        text: `La relación de compra de leche de ${row.fincaNombre} se copió con emojis al portapapeles.`,
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
      });
    } catch {
      toast.success('Relación copiada al portapapeles');
    }
  };

  // Menú de opciones de WhatsApp
  const abrirMenuWhatsApp = (row: PreliquidacionFincaDto) => {
    Swal.fire({
      title: `<i class="fa-brands fa-whatsapp" style="color: #25d366;"></i> WhatsApp - ${row.fincaNombre}`,
      html: `
        <div style="text-align: left; font-size: 13px; color: #475569; margin-bottom: 12px;">
          <p style="margin-bottom: 6px;"><strong>Productor:</strong> ${row.propietarioNombre}</p>
          <p style="margin-bottom: 6px;"><strong>Neto a Pagar:</strong> $${(row.totalNetoUSD || 0).toFixed(2)} (Bs. ${(row.totalNetoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })})</p>
          <p style="color: #64748b; font-size: 11.5px;">Seleccione cómo desea enviar la relación de compra de leche:</p>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: '<i class="fa-brands fa-whatsapp"></i> Abrir en WhatsApp',
      denyButtonText: '<i class="fa-regular fa-copy"></i> Copiar Texto con Emojis',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#25d366',
      denyButtonColor: '#0284c7',
    }).then((result) => {
      if (result.isConfirmed) {
        enviarWhatsAppDirecto(row);
      } else if (result.isDenied) {
        copiarTextoWhatsApp(row);
      }
    });
  };

  const handleActualizarTasaPendientes = async () => {
    const { value: nuevaTasa } = await Swal.fire({
      title: 'Actualizar Tasa BCV (Pendientes)',
      text: 'Ingresa la nueva tasa BCV que se aplicará a todas las fincas con estado PENDIENTE de pago:',
      input: 'number',
      inputAttributes: {
        step: '0.01',
        min: '1',
      },
      inputValue: preliquidacion[0]?.tasaBCV || '',
      showCancelButton: true,
      confirmButtonText: 'Actualizar Tasa',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d97706',
    });

    if (nuevaTasa && Number(nuevaTasa) > 0) {
      try {
        const res = await finanzasApi.actualizarTasaPendientes(cicloSeleccionadoId || cicloActivo?.id || 0, Number(nuevaTasa));
        Swal.fire({
          icon: 'success',
          title: '¡Tasa Actualizada!',
          text: res.message || 'Se actualizó la tasa BCV para las fincas pendientes.',
          confirmButtonColor: '#059669',
        });
        queryClient.invalidateQueries({ queryKey: ['preliquidacion'] });
      } catch (err: any) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err.response?.data?.message || 'Error al actualizar tasa',
          confirmButtonColor: '#ef4444',
        });
      }
    }
  };

  const preliquidacionVisual = useMemo(() => {
    const filtrados = preliquidacion.filter((p) => {
      if (filtroEstado === 'PENDIENTE' && p.pagado) return false;
      if (filtroEstado === 'PAGADO' && !p.pagado) return false;
      if (filtroBanco !== 'TODOS' && p.bancoNombre?.trim().toUpperCase() !== filtroBanco) return false;
      return true;
    });

    if (modoAgrupacion === 'FINCA') {
      return filtrados;
    }

    // Agrupación Consolidada por Productor
    const map = new Map<string, PreliquidacionFincaDto>();
    filtrados.forEach((item) => {
      const key = item.propietarioNombre || 'Sin Productor';
      if (!map.has(key)) {
        map.set(key, {
          ...item,
          fincaNombre: `Consolidado (${item.fincaNombre})`,
          totalLitros: item.totalLitros,
          totalBrutoUSD: item.totalBrutoUSD,
          totalAdelantosUSD: item.totalAdelantosUSD,
          totalNetoUSD: item.totalNetoUSD,
          totalNetoBs: item.totalNetoBs,
        });
      } else {
        const exist = map.get(key)!;
        exist.fincaNombre = `${exist.fincaNombre}, ${item.fincaNombre}`;
        exist.totalLitros += item.totalLitros;
        exist.totalBrutoUSD += item.totalBrutoUSD;
        exist.totalAdelantosUSD += item.totalAdelantosUSD;
        exist.totalNetoUSD += item.totalNetoUSD;
        exist.totalNetoBs += item.totalNetoBs;
        exist.pagado = exist.pagado && item.pagado;
      }
    });

    return Array.from(map.values());
  }, [preliquidacion, filtroEstado, filtroBanco, modoAgrupacion]);

  // Selección múltiple para Unificación de Pagos (1:1 con V2_3_11_26)
  const [fincasSeleccionadas, setFincasSeleccionadas] = useState<number[]>([]);
  const [procesandoLote, setProcesandoLote] = useState(false);

  const fincasPorProductor = useMemo(() => {
    const map: Record<string, PreliquidacionFincaDto[]> = {};
    preliquidacion.forEach((p) => {
      const key = (p.propietarioNombre || '').trim().toUpperCase();
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [preliquidacion]);

  const toggleFinca = (fincaId: number) => {
    setFincasSeleccionadas((prev) =>
      prev.includes(fincaId) ? prev.filter((id) => id !== fincaId) : [...prev, fincaId]
    );
  };

  const toggleTodos = (checked: boolean) => {
    if (checked) {
      const idsPendientes = preliquidacionVisual.filter((f) => !f.pagado).map((f) => f.fincaId);
      setFincasSeleccionadas(idsPendientes);
    } else {
      setFincasSeleccionadas([]);
    }
  };

  const seleccionarFincasDeProductor = (propietarioNombre: string) => {
    const key = (propietarioNombre || '').trim().toUpperCase();
    const fincas = fincasPorProductor[key] || [];
    const idsPendientes = fincas.filter((f) => !f.pagado).map((f) => f.fincaId);
    if (idsPendientes.length === 0) {
      toast.info(`Todas las fincas de ${propietarioNombre} ya se encuentran pagadas.`);
      return;
    }
    setFincasSeleccionadas((prev) => Array.from(new Set([...prev, ...idsPendientes])));
    toast.success(`Se seleccionaron ${idsPendientes.length} finca(s) de ${propietarioNombre}`);
  };

  const cancelarSeleccion = () => {
    setFincasSeleccionadas([]);
  };

  const fincasSeleccionadasObjetos = useMemo(() => {
    return preliquidacion.filter((f) => fincasSeleccionadas.includes(f.fincaId));
  }, [preliquidacion, fincasSeleccionadas]);

  const resumenSeleccion = useMemo(() => {
    const totalLitros = fincasSeleccionadasObjetos.reduce((acc, f) => acc + (f.totalLitros || 0), 0);
    const totalUSD = fincasSeleccionadasObjetos.reduce((acc, f) => acc + (f.totalBrutoUSD || 0), 0);
    const totalAdelantosUSD = fincasSeleccionadasObjetos.reduce((acc, f) => acc + (f.totalAdelantosUSD || 0), 0);
    const totalNetoUSD = fincasSeleccionadasObjetos.reduce((acc, f) => acc + (f.totalNetoUSD || 0), 0);
    const totalNetoBs = fincasSeleccionadasObjetos.reduce((acc, f) => acc + (f.totalNetoBs || 0), 0);
    return { totalLitros, totalUSD, totalAdelantosUSD, totalNetoUSD, totalNetoBs };
  }, [fincasSeleccionadasObjetos]);

  const ejecutarPagoUnificado = async () => {
    if (fincasSeleccionadasObjetos.length === 0) return;

    const { value: referencia, isConfirmed } = await Swal.fire({
      title: '¿Confirmar Pago Unificado / Por Lote?',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.5; color: #cbd5e1;">
          <p style="margin-bottom: 8px;">Se registrará el pago para <strong>${fincasSeleccionadasObjetos.length} fincas</strong> seleccionadas:</p>
          <div style="background: rgba(255,255,255,0.06); padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #334155;">
            <div><strong>Fincas:</strong> ${fincasSeleccionadasObjetos.map((f) => f.fincaNombre).join(', ')}</div>
            <div><strong>Total Litros:</strong> ${resumenSeleccion.totalLitros.toLocaleString()} Lts</div>
            <div><strong>Total Bruto:</strong> $${resumenSeleccion.totalUSD.toFixed(2)}</div>
            <div><strong>Total Adelantos:</strong> -$${resumenSeleccion.totalAdelantosUSD.toFixed(2)}</div>
            <div style="font-size: 15px; font-weight: 800; color: #34d399; margin-top: 4px;">
              Total Neto a Pagar: Bs. ${resumenSeleccion.totalNetoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ($${resumenSeleccion.totalNetoUSD.toFixed(2)} USD)
            </div>
          </div>
          <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">N° Referencia Bancaria (Opcional):</label>
        </div>
      `,
      input: 'text',
      inputPlaceholder: 'Ej: REF-9823412',
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-credit-card"></i> Confirmar y Registrar Pagos',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      background: '#1e293b',
      color: '#fff',
    });

    if (!isConfirmed) return;

    setProcesandoLote(true);
    let exitos = 0;
    try {
      const cicloId = cicloSeleccionadoId || cicloActivo?.id || 0;
      for (const f of fincasSeleccionadasObjetos) {
        await finanzasApi.pagarPreliquidacion({
          fincaId: f.fincaId,
          cicloId,
          referenciaPago: referencia || 'PAGO-LOTE-UNIFICADO',
          montoUSD: f.totalNetoUSD,
          montoBs: f.totalNetoBs,
          tasaBCV: f.tasaBCV || cicloActivo?.tasaBCVCierre || 0,
        });
        exitos++;
      }
      toast.success(`Se procesaron exitosamente ${exitos} pagos.`);
      setFincasSeleccionadas([]);
      queryClient.invalidateQueries({ queryKey: ['preliquidacion'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al procesar pagos en lote');
    } finally {
      setProcesandoLote(false);
    }
  };

  // Columnas para DataTable (Master Rule #2)
  const columns: ColumnDef<PreliquidacionFincaDto>[] = [
    {
      header: (
        <div style={{ textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={
              preliquidacionVisual.filter((f) => !f.pagado).length > 0 &&
              preliquidacionVisual.filter((f) => !f.pagado).every((f) => fincasSeleccionadas.includes(f.fincaId))
            }
            onChange={(e) => toggleTodos(e.target.checked)}
            title="Seleccionar todas las fincas pendientes para unificar"
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
          />
        </div>
      ),
      width: '44px',
      cell: (row) => (
        <div style={{ textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={fincasSeleccionadas.includes(row.fincaId)}
            disabled={row.pagado}
            onChange={() => toggleFinca(row.fincaId)}
            title={row.pagado ? 'Finca ya pagada' : 'Seleccionar para unificar o pagar en lote'}
            style={{
              width: '18px',
              height: '18px',
              cursor: row.pagado ? 'not-allowed' : 'pointer',
              accentColor: '#2563eb',
              opacity: row.pagado ? 0.35 : 1,
            }}
          />
        </div>
      ),
    },
    {
      header: 'FINCA / PRODUCTOR',
      accessorKey: 'fincaNombre',
      sortable: true,
      cell: (row) => {
        const propKey = (row.propietarioNombre || '').trim().toUpperCase();
        const fincasProp = propKey ? fincasPorProductor[propKey] || [] : [];
        const tieneVarias = fincasProp.length > 1;

        return (
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>{row.fincaNombre}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '1px' }}>
              <span style={{ fontSize: '11px', color: '#0284c7', fontFamily: 'monospace', fontWeight: 700 }}>
                {row.fincaCodigo ? `#${row.fincaCodigo}` : `ID #${row.fincaId}`}
              </span>
              <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                <i className="fa-regular fa-user" style={{ color: '#64748b', marginRight: '3px' }}></i>
                {row.propietarioNombre}
              </span>
            </div>
            {tieneVarias && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  seleccionarFincasDeProductor(row.propietarioNombre);
                }}
                className="btn btn-sm"
                style={{
                  marginTop: '4px',
                  padding: '2px 7px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  background: '#eff6ff',
                  color: '#2563eb',
                  border: '1.5px solid #bfdbfe',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Seleccionar todas las fincas de este productor para unificar pago"
              >
                <i className="fa-solid fa-link"></i> Unir Pagos ({fincasProp.length} Fincas)
              </button>
            )}
          </div>
        );
      },
    },
    {
      header: 'LITROS TOTALES',
      accessorKey: 'totalLitros',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 800, color: '#0284c7', fontSize: '13.5px', fontFamily: 'monospace' }}>
          {(row.totalLitros || 0).toLocaleString()} <small style={{ color: '#64748b' }}>Lts</small>
        </span>
      ),
    },
    {
      header: 'PRECIO ($/L)',
      accessorKey: 'precioLitroUSD',
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#475569', fontFamily: 'monospace' }}>
          ${(row.precioLitroUSD || 0).toFixed(4)}
        </span>
      ),
    },
    {
      header: 'TOTAL BRUTO ($)',
      accessorKey: 'totalBrutoUSD',
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#334155', fontFamily: 'monospace' }}>
          ${(row.totalBrutoUSD || 0).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'ADELANTOS ($)',
      accessorKey: 'totalAdelantosUSD',
      cell: (row) => (
        <span style={{ fontWeight: 700, color: row.totalAdelantosUSD ? '#dc2626' : '#94a3b8', fontFamily: 'monospace' }}>
          {row.totalAdelantosUSD ? `-$${row.totalAdelantosUSD.toFixed(2)}` : '$0.00'}
        </span>
      ),
    },
    {
      header: 'TOTAL NETO ($)',
      accessorKey: 'totalNetoUSD',
      sortable: true,
      cell: (row) => (
        <span style={{ fontWeight: 800, color: '#059669', fontSize: '14px', fontFamily: 'monospace' }}>
          ${(row.totalNetoUSD || 0).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'MONTO BS (TASA BCV)',
      accessorKey: 'totalNetoBs',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: '#b45309', fontSize: '13px', fontFamily: 'monospace' }}>
            Bs. {(row.totalNetoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Tasa: {row.tasaBCV || 0}</span>
        </div>
      ),
    },
    {
      header: 'ESTADO',
      accessorKey: 'pagado',
      sortable: true,
      cell: (row) => (
        <span
          className="badge"
          style={{
            background: row.pagado ? '#ecfdf5' : '#fffbeb',
            color: row.pagado ? '#047857' : '#b45309',
            border: `1px solid ${row.pagado ? '#a7f3d0' : '#fde68a'}`,
            fontWeight: 800,
            fontSize: '11px',
            padding: '3px 8px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
          }}
        >
          <i className={`fa-solid ${row.pagado ? 'fa-circle-check' : 'fa-clock'}`} style={{ marginRight: '4px' }}></i>
          {row.pagado ? 'Pagado' : 'Pendiente'}
        </span>
      ),
    },
    {
      header: 'ACCIONES',
      className: 'text-right',
      cell: (row) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
          {/* BOTÓN WHATSAPP SOLICITADO */}
          <button
            type="button"
            onClick={() => abrirMenuWhatsApp(row)}
            className="btn btn-sm"
            style={{
              height: '32px',
              padding: '0 10px',
              fontSize: '11.5px',
              fontWeight: 800,
              background: '#25d366',
              color: '#ffffff',
              border: 'none',
              borderRadius: '7px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)',
            }}
            title="Enviar o copiar relación para WhatsApp"
          >
            <i className="fa-brands fa-whatsapp" style={{ fontSize: '14px' }}></i> WhatsApp
          </button>

          {/* BOTÓN RECIBO OFICIAL */}
          <button
            type="button"
            onClick={() => {
              setFincaRecibo(row);
              setTabRecibo('voucher');
              setModalRecibo(true);
            }}
            className="btn btn-sm"
            style={{
              height: '32px',
              padding: '0 9px',
              fontSize: '11.5px',
              fontWeight: 700,
              background: '#eff6ff',
              color: '#0284c7',
              border: '1px solid #bfdbfe',
              borderRadius: '7px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            title="Ver / Imprimir Comprobante Oficial"
          >
            <i className="fa-solid fa-file-invoice"></i> Recibo
          </button>

          {/* BOTÓN PAGAR */}
          {!row.pagado && (
            <button
              type="button"
              onClick={() => {
                setFincaPago(row);
                setReferenciaPago('');
                setModalPagar(true);
              }}
              className="btn btn-sm"
              style={{
                height: '32px',
                padding: '0 10px',
                fontSize: '11.5px',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #059669, #047857)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '7px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
              title="Registrar pago bancario"
            >
              <i className="fa-solid fa-money-bill-wave"></i> Pagar
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section id="tab-liquidacion" className="tab-content active" style={{ display: 'block' }}>
      {/* CABECERA VISTA 1:1 */}
      <div
        className="view-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 className="view-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>
            Liquidación y Nómina de Productores
          </h1>
          <p className="view-subtitle" style={{ color: '#64748b', fontSize: '13.5px', margin: '4px 0 0 0' }}>
            Corte semanal (Martes a Lunes), deducción de adelantos y nómina bancaria
          </p>
        </div>

        <div className="view-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Selector de Semana */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              padding: '4px 10px',
              borderRadius: '8px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            }}
          >
            <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap' }}>
              <i className="fa-solid fa-calendar-week" style={{ color: '#0284c7', marginRight: '6px' }}></i> Semana:
            </label>
            <select
              value={cicloSeleccionadoId || ''}
              onChange={(e) => setCicloSeleccionadoId(e.target.value ? Number(e.target.value) : undefined)}
              className="form-input"
              style={{
                height: '36px',
                padding: '0 10px',
                fontSize: '13px',
                fontWeight: 700,
                borderRadius: '6px',
                minWidth: '240px',
                border: '1px solid #94a3b8',
                color: '#0f172a',
                background: '#f8fafc',
              }}
            >
              {ciclosOrdenados.map((c) => {
                const esActivo =
                  c.estado?.toUpperCase() === 'ABIERTO' ||
                  c.estado?.toUpperCase() === 'ACTIVO' ||
                  (c as any).Estado === 'ABIERTO' ||
                  (c as any).Estado === 'ACTIVO';
                const fIni = c.fechaInicio ? new Date(c.fechaInicio).toLocaleDateString('es-VE') : '';
                const fFin = c.fechaFin ? new Date(c.fechaFin).toLocaleDateString('es-VE') : '';
                return (
                  <option key={c.id} value={c.id}>
                    Semana #{c.numeroSemana || c.id} ({fIni} al {fFin}) {esActivo ? '★ [ACTIVA]' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Badge Ciclo Activo */}
          <div
            className="badge"
            style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1.5px solid #93c5fd',
              fontSize: '13px',
              fontWeight: 800,
              padding: '8px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(37,99,235,0.12)',
            }}
          >
            <i className="fa-solid fa-calendar-check" style={{ color: '#0284c7', fontSize: '15px' }}></i>
            <span>{semanaTextoFormateada}</span>
          </div>
        </div>
      </div>

      {/* CARD PRINCIPAL */}
      <div className="content-card" style={{ padding: '20px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
        {/* CARD HEAD CON SUBTEXT Y FILTROS */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '16.5px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-calculator" style={{ color: '#0284c7' }}></i> Pre-Liquidación de la Semana
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '12px',
                  color: '#0284c7',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  padding: '3px 10px',
                  borderRadius: '6px',
                }}
              >
                <i className="fa-solid fa-calendar-days"></i> {semanaTextoFormateada}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#ecfdf5',
                  border: '1.5px solid #6ee7b7',
                  color: '#047857',
                  padding: '3px 10px',
                  borderRadius: '6px',
                }}
              >
                <i className="fa-solid fa-circle-check"></i>
                Fincas Pagadas: {totalPagados} / {preliquidacion.length}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Toggle Modo: Por Finca vs Consolidado */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => setModoAgrupacion('FINCA')}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  borderRadius: '6px',
                  background: modoAgrupacion === 'FINCA' ? '#0284c7' : 'transparent',
                  color: modoAgrupacion === 'FINCA' ? '#ffffff' : '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-leaf"></i> Por Finca
              </button>
              <button
                type="button"
                onClick={() => setModoAgrupacion('PROPIETARIO')}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  borderRadius: '6px',
                  background: modoAgrupacion === 'PROPIETARIO' ? '#0284c7' : 'transparent',
                  color: modoAgrupacion === 'PROPIETARIO' ? '#ffffff' : '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-users"></i> Consolidado por Productor
              </button>
            </div>

            {/* Filtro Estado */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
              <label style={{ whiteSpace: 'nowrap' }}>
                <i className="fa-solid fa-filter" style={{ color: '#10b981', marginRight: '4px' }}></i> Estado:
              </label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="form-input"
                style={{ height: '36px', padding: '0 8px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', minWidth: '120px' }}
              >
                <option value="TODOS">Todos</option>
                <option value="PENDIENTE">⏳ Pendientes</option>
                <option value="PAGADO">✅ Pagados</option>
              </select>
            </div>

            {/* Filtro Banco */}
            {listaBancos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                <label style={{ whiteSpace: 'nowrap' }}>
                  <i className="fa-solid fa-building-columns" style={{ color: '#0284c7', marginRight: '4px' }}></i> Banco:
                </label>
                <select
                  value={filtroBanco}
                  onChange={(e) => setFiltroBanco(e.target.value)}
                  className="form-input"
                  style={{ height: '36px', padding: '0 8px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', minWidth: '140px' }}
                >
                  <option value="TODOS">Todos los Bancos</option>
                  {listaBancos.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Botón Actualizar BCV */}
            <button
              type="button"
              onClick={handleActualizarTasaPendientes}
              className="btn"
              style={{
                height: '36px',
                padding: '0 13px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                boxShadow: '0 2px 5px rgba(217, 119, 6, 0.3)',
                whiteSpace: 'nowrap',
              }}
              title="Actualizar Tasa BCV a todas las fincas NO PAGADAS (Pendientes)"
            >
              <i className="fa-solid fa-arrows-rotate"></i> Actualizar BCV (Pendientes)
            </button>
          </div>
        </div>

        {/* PANEL RESUMEN FINANCIERO DE PAGO (1:1 con index.html) */}
        <div
          id="panelResumenFinanciero"
          style={{
            marginBottom: '20px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1a2744 100%)',
            borderRadius: '14px',
            border: '1.5px solid #334155',
            padding: '16px 20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fa-solid fa-chart-pie" style={{ color: '#38bdf8', fontSize: '18px' }}></i>
              <span style={{ color: '#94a3b8', fontSize: '12.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Resumen de Pago del Ciclo
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flex: 1, justifyContent: 'flex-end' }}>
              {/* TOTAL NÓMINA */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  minWidth: '150px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                  <i className="fa-solid fa-sigma"></i> TOTAL NÓMINA
                </div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#e2e8f0', fontFamily: 'monospace' }}>
                  $ {totalNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', fontFamily: 'monospace' }}>
                  Bs. {totalNetoBs.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                </div>
              </div>

              {/* YA PAGADO */}
              <div
                style={{
                  background: 'rgba(4,120,87,0.15)',
                  border: '1.5px solid #065f46',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  minWidth: '150px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10.5px', color: '#6ee7b7', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                  <i className="fa-solid fa-circle-check"></i> YA PAGADO
                </div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#34d399', fontFamily: 'monospace' }}>
                  $ {pagadoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#6ee7b7', fontFamily: 'monospace' }}>
                  Bs. {pagadoBs.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                </div>
              </div>

              {/* POR PAGAR */}
              <div
                style={{
                  background: 'rgba(180,83,9,0.15)',
                  border: '1.5px solid #92400e',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  minWidth: '150px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10.5px', color: '#fde68a', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                  <i className="fa-solid fa-clock"></i> POR PAGAR
                </div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace' }}>
                  $ {pendienteUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#fde68a', fontFamily: 'monospace' }}>
                  Bs. {pendienteBs.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                </div>
              </div>

              {/* PROGRESO */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  minWidth: '130px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                  <i className="fa-solid fa-percent"></i> PROGRESO
                </div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#38bdf8' }}>{porcentajeProgreso}%</div>
                <div style={{ background: '#1e293b', borderRadius: '4px', height: '6px', marginTop: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      background: 'linear-gradient(90deg, #10b981, #34d399)',
                      height: '100%',
                      width: `${porcentajeProgreso}%`,
                      borderRadius: '4px',
                      transition: 'width 0.5s ease',
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TABLA USANDO DATATABLE CON BUSCADOR, PAGINADOR Y EXPORTACIÓN (MASTER RULE #2) */}
        <DataTable
          data={preliquidacionVisual}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Buscar por finca, propietario, código o banco..."
          exportFileName={`nomina_liquidacion_${cicloActivo?.codigo || 'semana'}`}
          searchFilter={(row, term) => {
            const t = term.toLowerCase();
            return (
              row.fincaNombre.toLowerCase().includes(t) ||
              row.propietarioNombre.toLowerCase().includes(t) ||
              (row.fincaCodigo || '').toLowerCase().includes(t) ||
              (row.bancoNombre || '').toLowerCase().includes(t) ||
              (row.numeroCuenta || '').toLowerCase().includes(t) ||
              (row.pagoMovil || '').toLowerCase().includes(t)
            );
          }}
        />

        {/* PANEL FLOTANTE DE UNIFICACIÓN / PAGOS EN LOTE 1:1 CON V2_3_11_26 */}
        {fincasSeleccionadas.length > 0 && (
          <div
            id="panelBarraUnificarPagos"
            style={{
              marginTop: '16px',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '16px 20px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
              border: '1.5px solid #3b82f6',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span
                    className="badge"
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    <i className="fa-solid fa-link"></i> UNIFICACIÓN DE PAGOS
                  </span>
                  <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#93c5fd' }}>
                    {fincasSeleccionadas.length} Finca{fincasSeleccionadas.length > 1 ? 's' : ''} Seleccionada{fincasSeleccionadas.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px', color: '#cbd5e1' }}>
                  <span>
                    Litros: <strong style={{ color: '#38bdf8' }}>{resumenSeleccion.totalLitros.toLocaleString()} Lts</strong>
                  </span>
                  <span>
                    Bruto: <strong style={{ color: '#38bdf8' }}>${resumenSeleccion.totalUSD.toFixed(2)}</strong>
                  </span>
                  <span>
                    Adelantos:{' '}
                    <strong style={{ color: resumenSeleccion.totalAdelantosUSD > 0 ? '#ef4444' : '#94a3b8' }}>
                      -${resumenSeleccion.totalAdelantosUSD.toFixed(2)}
                    </strong>
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>TOTAL NETO A PAGAR:</span>
                  <strong style={{ fontSize: '18px', color: '#34d399' }}>
                    Bs. {resumenSeleccion.totalNetoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </strong>
                  <small style={{ color: '#6ee7b7', display: 'block', fontSize: '11px' }}>
                    (${resumenSeleccion.totalNetoUSD.toFixed(2)} USD)
                  </small>
                </div>
                <button
                  type="button"
                  onClick={cancelarSeleccion}
                  className="btn btn-outline"
                  style={{
                    color: '#cbd5e1',
                    border: '1px solid #475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-xmark"></i> Desmarcar
                </button>
                <button
                  type="button"
                  onClick={ejecutarPagoUnificado}
                  disabled={procesandoLote}
                  className="btn btn-primary"
                  style={{
                    background: '#10b981',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 800,
                    padding: '9px 18px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                    cursor: procesandoLote ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className={procesandoLote ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-credit-card'}></i>{' '}
                  {procesandoLote ? 'Procesando...' : `Realizar Pago Unificado (${fincasSeleccionadas.length} Fincas)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL COMPROBANTE OFICIAL DE PAGO Y WHATSAPP */}
      {modalRecibo && fincaRecibo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            padding: '16px',
            overflowY: 'auto',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '680px',
              padding: '0',
              overflow: 'hidden',
              borderRadius: '16px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
            }}
          >
            {/* Header Modal */}
            <div
              style={{
                padding: '16px 20px',
                background: '#0f172a',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="fa-solid fa-file-invoice-dollar" style={{ color: '#38bdf8', fontSize: '18px' }}></i>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>
                  Comprobante Oficial de Liquidación
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalRecibo(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px' }}
              >
                &times;
              </button>
            </div>

            {/* Selector de sub-vista dentro del modal */}
            <div style={{ display: 'flex', gap: '8px', padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setTabRecibo('voucher')}
                style={{
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 800,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: tabRecibo === 'voucher' ? '#0f172a' : '#ffffff',
                  color: tabRecibo === 'voucher' ? '#ffffff' : '#64748b',
                  boxShadow: tabRecibo === 'voucher' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                <i className="fa-solid fa-receipt" style={{ marginRight: '5px' }}></i> 1. Comprobante / Recibo
              </button>
              <button
                type="button"
                onClick={() => setTabRecibo('whatsapp')}
                style={{
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 800,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: tabRecibo === 'whatsapp' ? '#25d366' : '#ffffff',
                  color: tabRecibo === 'whatsapp' ? '#ffffff' : '#64748b',
                  boxShadow: tabRecibo === 'whatsapp' ? '0 2px 6px rgba(37,211,102,0.25)' : 'none',
                }}
              >
                <i className="fa-brands fa-whatsapp" style={{ marginRight: '5px' }}></i> 2. Formato WhatsApp
              </button>
            </div>

            {/* Contenido del Modal con Scroll */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {tabRecibo === 'voucher' ? (
                <div
                  id="areaImpresionReciboPago"
                  style={{
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '24px',
                    background: '#ffffff',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  {/* Membrete Oficial */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '18px' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>
                        Transporte Vergel & Carrillo
                      </h2>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                        RIF: J-50000000-0 • Recolección &amp; Transporte de Leche
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ background: '#0f172a', color: '#ffffff', fontWeight: 900, fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}>
                        RECIBO #{String(fincaRecibo.fincaId).padStart(5, '0')}
                      </span>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{semanaTextoFormateada}</div>
                    </div>
                  </div>

                  {/* Datos Productor & Finca */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{fincaRecibo.fincaNombre}</div>
                    <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px' }}>
                      <strong>Productor:</strong> {fincaRecibo.propietarioNombre}
                    </div>
                    {fincaRecibo.numeroCuenta && (
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', fontFamily: 'monospace' }}>
                        <strong>Cuenta:</strong> {fincaRecibo.bancoNombre ? `${fincaRecibo.bancoNombre} - ` : ''}{fincaRecibo.numeroCuenta}
                      </div>
                    )}
                  </div>

                  {/* Detalle Financiero */}
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>Total Litros Recolectados:</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace' }}>
                            {(fincaRecibo.totalLitros || 0).toLocaleString()} Lts
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>Precio por Litro:</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                            ${(fincaRecibo.precioLitroUSD || 0).toFixed(4)} USD
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>Total Bruto:</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                            ${(fincaRecibo.totalBrutoUSD || 0).toFixed(2)} USD
                          </td>
                        </tr>
                        {fincaRecibo.totalAdelantosUSD ? (
                          <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fff5f5' }}>
                            <td style={{ padding: '8px 12px', color: '#dc2626', fontWeight: 700 }}>(-) Deducción Adelantos / Préstamos:</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 800, fontFamily: 'monospace' }}>
                              -${fincaRecibo.totalAdelantosUSD.toFixed(2)} USD
                            </td>
                          </tr>
                        ) : null}
                        <tr style={{ background: '#f8fafc', fontWeight: 900 }}>
                          <td style={{ padding: '10px 12px', color: '#0f172a', fontSize: '13.5px' }}>NETO A PAGAR:</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669', fontSize: '15px', fontFamily: 'monospace' }}>
                            ${(fincaRecibo.totalNetoUSD || 0).toFixed(2)} USD
                          </td>
                        </tr>
                        <tr style={{ background: '#f8fafc', fontWeight: 900 }}>
                          <td style={{ padding: '6px 12px 10px 12px', color: '#64748b', fontSize: '11px' }}>
                            Tasa BCV: {fincaRecibo.tasaBCV || 0}
                          </td>
                          <td style={{ padding: '6px 12px 10px 12px', textAlign: 'right', color: '#b45309', fontSize: '14px', fontFamily: 'monospace' }}>
                            Bs. {(fincaRecibo.totalNetoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {fincaRecibo.referenciaPago && (
                    <div style={{ fontSize: '11.5px', color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '6px 10px', borderRadius: '6px', marginBottom: '14px', fontWeight: 700 }}>
                      <i className="fa-solid fa-receipt" style={{ marginRight: '4px' }}></i>
                      Ref. de Pago Bancario: {fincaRecibo.referenciaPago}
                    </div>
                  )}

                  <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                    Documento informativo de liquidación generado por el Sistema de Rutas y Transporte.
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                    Texto formateado para WhatsApp (con emojis y datos de pago):
                  </label>
                  <textarea
                    readOnly
                    value={generarTextoWhatsApp(fincaRecibo)}
                    style={{
                      width: '100%',
                      height: '280px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#0f172a',
                      lineHeight: '1.5',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Footer Modal con Botones */}
            <div
              style={{
                padding: '14px 20px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => enviarWhatsAppDirecto(fincaRecibo)}
                  className="btn"
                  style={{
                    background: '#25d366',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37,211,102,0.3)',
                  }}
                >
                  <i className="fa-brands fa-whatsapp"></i> Enviar a WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => copiarTextoWhatsApp(fincaRecibo)}
                  className="btn btn-outline"
                  style={{
                    fontWeight: 700,
                    fontSize: '12.5px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-regular fa-copy"></i> Copiar Texto
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn btn-outline"
                  style={{
                    fontWeight: 700,
                    fontSize: '12.5px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-print"></i> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setModalRecibo(false)}
                  className="btn btn-outline"
                  style={{
                    fontWeight: 700,
                    fontSize: '12.5px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PAGAR */}
      {modalPagar && fincaPago && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div
            className="content-card"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              borderRadius: '16px',
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
                <i className="fa-solid fa-money-bill-wave" style={{ color: '#059669', marginRight: '8px' }}></i>
                Registrar Pago de Liquidación
              </h3>
              <button
                type="button"
                onClick={() => setModalPagar(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div style={{ marginBottom: '16px', padding: '14px', background: '#f8fafc', borderRadius: '10px', fontSize: '13px' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '15px' }}>{fincaPago.fincaNombre}</div>
              <div style={{ color: '#64748b', marginTop: '2px' }}>Propietario: {fincaPago.propietarioNombre}</div>
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                <span style={{ fontWeight: 700, color: '#059669', fontSize: '16px', fontFamily: 'monospace' }}>
                  Total: ${(fincaPago.totalNetoUSD || 0).toFixed(2)} USD
                </span>
                <span style={{ fontWeight: 800, color: '#b45309', fontSize: '14px', fontFamily: 'monospace' }}>
                  Bs. {(fincaPago.totalNetoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                pagarMutation.mutate({
                  fincaId: fincaPago.fincaId,
                  cicloId: cicloSeleccionadoId || cicloActivo?.id || 0,
                  referenciaPago,
                  montoUSD: fincaPago.totalNetoUSD,
                  montoBs: fincaPago.totalNetoBs,
                  tasaBCV: fincaPago.tasaBCV,
                });
              }}
            >
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Referencia Bancaria / Comprobante de Pago *
                </label>
                <input
                  type="text"
                  value={referenciaPago}
                  onChange={(e) => setReferenciaPago(e.target.value)}
                  className="form-input"
                  placeholder="Ej: REF-84920491"
                  style={{ width: '100%', height: '38px', fontWeight: 700 }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalPagar(false)}
                  className="btn btn-outline"
                  style={{ height: '38px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pagarMutation.isPending}
                  className="btn btn-primary"
                  style={{ height: '38px', background: 'linear-gradient(135deg, #059669, #047857)', fontWeight: 800 }}
                >
                  {pagarMutation.isPending ? 'Guardando...' : 'Confirmar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default LiquidacionesPage;
