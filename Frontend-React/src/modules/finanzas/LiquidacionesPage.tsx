import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { finanzasApi } from '@/api/finanzas.api';
import { useAuthStore } from '@/stores/authStore';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import type { PreliquidacionFincaDto, CicloSemanalDto } from '@/types';

export const LiquidacionesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const empresaNombre = user?.empresaNombre || (typeof window !== 'undefined' && window.location.hostname.includes('campoverde') ? 'Lácteos Campo Verde' : 'Transporte Vergel & Carrillo');

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

  // Menú de opciones de WhatsApp (Image 3 Redesign)
  const abrirMenuWhatsApp = (row: PreliquidacionFincaDto) => {
    const productor = (row.propietarioNombre || (row as any).propietario || (row as any).Propietario || '').trim() || row.fincaNombre;
    const brutoUSD = Number(row.totalBrutoUSD ?? (row as any).totalUSD ?? (row as any).TotalUSD ?? ((row.totalLitros || 0) * (row.precioLitroUSD || 0)));
    const adelantoUSD = Number(row.totalAdelantosUSD ?? (row as any).TotalAdelantosUSD ?? 0);
    const netoUSD = Number(row.totalNetoUSD !== undefined && row.totalNetoUSD !== null ? row.totalNetoUSD : Math.max(0, brutoUSD - adelantoUSD));
    const tasa = Number(row.tasaBCV || (row as any).tasaBcv || (row as any).TasaBcv || cicloActivo?.tasaBCVCierre || (brutoUSD > 0 && (row as any).totalBrutoBs ? ((row as any).totalBrutoBs / brutoUSD) : 1));
    const netoBs = Number(row.totalNetoBs || (row as any).TotalNetoBs || (netoUSD * tasa));

    Swal.fire({
      title: `<div style="display: flex; align-items: center; justify-content: center; gap: 8px;"><i class="fa-brands fa-whatsapp" style="color: #25d366; font-size: 28px;"></i> <span style="font-weight: 800; font-size: 20px; color: #1e293b;">WhatsApp - ${row.fincaNombre}</span></div>`,
      html: `
        <div style="text-align: left; font-size: 13.5px; color: #334155; padding: 6px 12px;">
          <div style="margin-bottom: 8px;">
            <strong style="color: #1e293b;">Productor:</strong> <span style="color: #475569;">${productor}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #1e293b;">Neto a Pagar:</strong> <span style="color: #059669; font-weight: 800;">$${netoUSD.toFixed(2)}</span> <span style="color: #b45309; font-weight: 700;">(Bs. ${netoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
          </div>
          <p style="color: #64748b; font-size: 12.5px; margin: 0 0 6px 0;">
            Seleccione cómo desea enviar la relación de compra de leche:
          </p>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: '<i class="fa-brands fa-whatsapp"></i> Abrir en WhatsApp',
      denyButtonText: '<i class="fa-regular fa-copy"></i> Copiar Texto con Emojis',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#22c55e',
      denyButtonColor: '#0284c7',
      cancelButtonColor: '#64748b',
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
    let totalLitros = 0;
    let totalUSD = 0;
    let totalBrutoBs = 0;
    let totalAdelantosUSD = 0;
    let totalAdelantosBs = 0;

    fincasSeleccionadasObjetos.forEach((f) => {
      const bUSD = Number(f.totalBrutoUSD ?? (f as any).totalUSD ?? (f as any).TotalUSD ?? ((f.totalLitros || 0) * (f.precioLitroUSD || 0)));
      const adUSD = Number(f.totalAdelantosUSD ?? (f as any).TotalAdelantosUSD ?? 0);
      const tasa = Number(f.tasaBCV || (f as any).tasaBcv || cicloActivo?.tasaBCVCierre || (bUSD > 0 && (f as any).totalBrutoBs ? ((f as any).totalBrutoBs / bUSD) : 1));
      const bBs = Number((f as any).totalBrutoBs ?? (bUSD * tasa));
      const adBs = Number((f as any).totalAdelantosBs ?? (adUSD * tasa));

      totalLitros += f.totalLitros || 0;
      totalUSD += bUSD;
      totalBrutoBs += bBs;
      totalAdelantosUSD += adUSD;
      totalAdelantosBs += adBs;
    });

    const saldoNetoRealBs = totalBrutoBs - totalAdelantosBs;
    const esDeudorTotal = (totalAdelantosUSD > totalUSD + 0.01) || (saldoNetoRealBs < -0.01);
    const deudaRestanteUSD = esDeudorTotal ? Math.round((totalAdelantosUSD - totalUSD) * 100) / 100 : 0;
    const deudaRestanteBs = esDeudorTotal ? Math.round((totalAdelantosBs - totalBrutoBs) * 100) / 100 : 0;
    const totalNetoBs = Math.max(0, saldoNetoRealBs);
    const totalNetoUSD = Math.max(0, totalUSD - totalAdelantosUSD);

    return {
      totalLitros,
      totalUSD,
      totalBrutoBs,
      totalAdelantosUSD,
      totalAdelantosBs,
      totalNetoUSD,
      totalNetoBs,
      esDeudorTotal,
      deudaRestanteUSD,
      deudaRestanteBs,
    };
  }, [fincasSeleccionadasObjetos, cicloActivo]);

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

        {/* PANEL FLOTANTE DE UNIFICACIÓN / PAGOS EN LOTE 1:1 CON V2_3_11_26 (Image 5) */}
        {fincasSeleccionadas.length > 0 && (
          <div
            id="panelBarraUnificarPagos"
            style={{
              position: 'fixed',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '95%',
              maxWidth: '1280px',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: '#ffffff',
              borderRadius: '14px',
              padding: '14px 22px',
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 0 0 1.5px #3b82f6',
              border: '1.5px solid #3b82f6',
              zIndex: 999,
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
              <div style={{ flex: 1, minWidth: '320px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span
                    className="badge"
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      padding: '3px 9px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <i className="fa-solid fa-link"></i> UNIFICACIÓN DE PAGOS
                  </span>
                  <span id="labelContadorFincasUnificar" style={{ fontWeight: 800, fontSize: '13.5px', color: '#93c5fd' }}>
                    {fincasSeleccionadasObjetos.length} Finca{fincasSeleccionadasObjetos.length > 1 ? 's' : ''} Seleccionada{fincasSeleccionadasObjetos.length > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Lista de píldoras por finca seleccionada (1:1 V2_3_11_26) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {fincasSeleccionadasObjetos.map((f) => {
                    const nom = f.fincaNombre;
                    const bUSD = Number(f.totalBrutoUSD ?? (f as any).totalUSD ?? (f as any).TotalUSD ?? ((f.totalLitros || 0) * (f.precioLitroUSD || 0)));
                    const adUSD = Number(f.totalAdelantosUSD ?? (f as any).TotalAdelantosUSD ?? 0);
                    const tasa = Number(f.tasaBCV || (f as any).tasaBcv || cicloActivo?.tasaBCVCierre || (bUSD > 0 && (f as any).totalBrutoBs ? ((f as any).totalBrutoBs / bUSD) : 1));
                    const bBs = Number((f as any).totalBrutoBs ?? (bUSD * tasa));
                    const adBs = Number((f as any).totalAdelantosBs ?? (adUSD * tasa));
                    const netoFincaBs = Math.max(0, bBs - adBs);
                    const netoFincaUSD = Math.max(0, bUSD - adUSD);
                    const esDeudorFinca = adUSD > bUSD + 0.01;
                    const remUSD = Math.max(0, adUSD - bUSD);
                    const remBs = Math.max(0, adBs - bBs);

                    if (esDeudorFinca) {
                      return (
                        <span
                          key={f.fincaId}
                          style={{
                            display: 'inline-block',
                            background: 'rgba(239, 68, 68, 0.18)',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid #ef4444',
                            fontSize: '12px',
                          }}
                        >
                          <strong style={{ color: '#ffffff' }}>{nom}:</strong>{' '}
                          <span style={{ color: '#fca5a5', fontWeight: 800 }}>Bs. 0,00 ($0.00 USD)</span>
                          <span style={{ color: '#ef4444', fontWeight: 800, display: 'block', fontSize: '10.5px' }}>
                            <i className="fa-solid fa-circle-minus"></i> Adelanto: -${adUSD.toFixed(2)} USD (-Bs. {adBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                          </span>
                          <small style={{ color: '#f87171', fontWeight: 800, display: 'block', fontSize: '10px' }}>
                            (Saldo deudor: -${remUSD.toFixed(2)} USD / -Bs. {remBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                          </small>
                        </span>
                      );
                    } else if (adUSD > 0) {
                      return (
                        <span
                          key={f.fincaId}
                          style={{
                            display: 'inline-block',
                            background: 'rgba(15, 23, 42, 0.85)',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid #3b82f6',
                            fontSize: '12px',
                          }}
                        >
                          <strong style={{ color: '#ffffff' }}>{nom}:</strong>{' '}
                          <span style={{ color: '#34d399', fontWeight: 800 }}>
                            + Bs. {netoFincaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </span>{' '}
                          <small style={{ color: '#6ee7b7', fontWeight: 700, fontSize: '11px' }}>
                            (${netoFincaUSD.toFixed(2)} USD)
                          </small>
                          <span style={{ color: '#f87171', fontWeight: 800, display: 'block', fontSize: '10.5px' }}>
                            <i className="fa-solid fa-circle-minus"></i> Adelanto: -${adUSD.toFixed(2)} USD (-Bs. {adBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                          </span>
                        </span>
                      );
                    } else {
                      return (
                        <span
                          key={f.fincaId}
                          style={{
                            display: 'inline-block',
                            background: 'rgba(15, 23, 42, 0.85)',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid #10b981',
                            fontSize: '12px',
                          }}
                        >
                          <strong style={{ color: '#ffffff' }}>{nom}:</strong>{' '}
                          <span style={{ color: '#34d399', fontWeight: 800 }}>
                            + Bs. {netoFincaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </span>{' '}
                          <small style={{ color: '#6ee7b7', fontWeight: 700, fontSize: '11px' }}>
                            (${netoFincaUSD.toFixed(2)} USD)
                          </small>
                        </span>
                      );
                    }
                  })}
                </div>

                {/* Línea de Resumen Total Bruto, Adelantos y Deudas (1:1 V2_3_11_26) */}
                <div
                  id="detalleFincasUnificarResumen"
                  style={{
                    fontSize: '12px',
                    color: '#cbd5e1',
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: '6px',
                  }}
                >
                  <span>
                    Litros: <strong style={{ color: '#38bdf8' }}>{resumenSeleccion.totalLitros.toLocaleString()} Lts</strong>
                  </span>
                  <span>
                    Total Bruto:{' '}
                    <strong style={{ color: '#38bdf8' }}>
                      ${resumenSeleccion.totalUSD.toFixed(2)} (Bs. {resumenSeleccion.totalBrutoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                    </strong>
                  </span>
                  {resumenSeleccion.totalAdelantosUSD > 0 ? (
                    <span
                      style={{
                        color: '#ef4444',
                        fontWeight: 800,
                        background: 'rgba(239, 68, 68, 0.15)',
                        padding: '2px 8px',
                        borderRadius: '5px',
                        border: '1px solid #ef4444',
                      }}
                    >
                      <i className="fa-solid fa-circle-minus"></i> Adelantos: -${resumenSeleccion.totalAdelantosUSD.toFixed(2)} (-Bs. {resumenSeleccion.totalAdelantosBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                    </span>
                  ) : (
                    <span>
                      Adelantos: <strong style={{ color: '#94a3b8' }}>$0.00</strong>
                    </span>
                  )}
                  {resumenSeleccion.esDeudorTotal && (
                    <span
                      style={{
                        color: '#fca5a5',
                        fontWeight: 800,
                        background: 'rgba(239,68,68,0.2)',
                        padding: '2px 8px',
                        borderRadius: '5px',
                        border: '1px solid #ef4444',
                      }}
                    >
                      <i className="fa-solid fa-triangle-exclamation"></i> Sigue Debiendo: -${resumenSeleccion.deudaRestanteUSD.toFixed(2)} USD (-Bs. {resumenSeleccion.deudaRestanteBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                    </span>
                  )}
                </div>
              </div>

              {/* Lado derecho: Monto Total y Botones de Acción */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right' }}>
                  <small style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, display: 'block' }}>
                    NETO TOTAL UNIFICADO:
                  </small>
                  {resumenSeleccion.esDeudorTotal ? (
                    <div>
                      <span id="montoNetoTotalUnificadoDisplay" style={{ fontSize: '20px', fontWeight: 900, color: '#f87171' }}>
                        Bs. 0,00
                      </span>
                      <small style={{ fontSize: '11px', fontWeight: 800, color: '#fca5a5', display: 'block' }}>
                        (Deuda: -${resumenSeleccion.deudaRestanteUSD.toFixed(2)} USD)
                      </small>
                    </div>
                  ) : (
                    <div>
                      <span id="montoNetoTotalUnificadoDisplay" style={{ fontSize: '20px', fontWeight: 900, color: '#34d399' }}>
                        Bs. {resumenSeleccion.totalNetoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </span>
                      <small style={{ color: '#6ee7b7', display: 'block', fontSize: '11px', fontWeight: 700 }}>
                        (${resumenSeleccion.totalNetoUSD.toFixed(2)} USD)
                      </small>
                    </div>
                  )}
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
                  id="btnEjecutarPagoUnificado"
                  onClick={ejecutarPagoUnificado}
                  disabled={procesandoLote}
                  className="btn btn-primary"
                  style={{
                    background: resumenSeleccion.esDeudorTotal ? '#ef4444' : '#10b981',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 800,
                    padding: '9px 18px',
                    borderRadius: '8px',
                    boxShadow: resumenSeleccion.esDeudorTotal ? '0 4px 12px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.3)',
                    cursor: procesandoLote ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#ffffff',
                  }}
                >
                  <i className={procesandoLote ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-credit-card'}></i>{' '}
                  {procesandoLote
                    ? 'Procesando...'
                    : resumenSeleccion.esDeudorTotal
                    ? `Compensar y Registrar Adelanto (${fincasSeleccionadasObjetos.length} Fincas)`
                    : `Realizar Pago Unificado (${fincasSeleccionadasObjetos.length} Fincas)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL COMPROBANTE OFICIAL DE PAGO Y WHATSAPP (Image 4 Redesign) */}
      {modalRecibo && fincaRecibo && (() => {
        const productor = (fincaRecibo.propietarioNombre || (fincaRecibo as any).propietario || (fincaRecibo as any).Propietario || '').trim() || fincaRecibo.fincaNombre;
        const brutoUSD = Number(fincaRecibo.totalBrutoUSD ?? (fincaRecibo as any).totalUSD ?? (fincaRecibo as any).TotalUSD ?? ((fincaRecibo.totalLitros || 0) * (fincaRecibo.precioLitroUSD || 0)));
        const adelantoUSD = Number(fincaRecibo.totalAdelantosUSD ?? (fincaRecibo as any).TotalAdelantosUSD ?? 0);
        const netoUSD = Number(fincaRecibo.totalNetoUSD !== undefined && fincaRecibo.totalNetoUSD !== null ? fincaRecibo.totalNetoUSD : Math.max(0, brutoUSD - adelantoUSD));
        const tasa = Number(fincaRecibo.tasaBCV || (fincaRecibo as any).tasaBcv || (fincaRecibo as any).TasaBcv || cicloActivo?.tasaBCVCierre || (brutoUSD > 0 && (fincaRecibo as any).totalBrutoBs ? ((fincaRecibo as any).totalBrutoBs / brutoUSD) : 1));
        const netoBs = Number(fincaRecibo.totalNetoBs || (fincaRecibo as any).TotalNetoBs || (netoUSD * tasa));

        return (
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
                border: '1px solid #e2e8f0',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              }}
            >
              {/* Header Modal */}
              <div
                style={{
                  padding: '16px 22px',
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                    }}
                  >
                    <i className="fa-solid fa-file-invoice-dollar"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                      Comprobante Oficial de Liquidación
                    </h3>
                    <p style={{ margin: '1px 0 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                      Relación oficial semanal de pago y recepción de leche
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalRecibo(false)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
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
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 800,
                    borderRadius: '8px',
                    border: tabRecibo === 'voucher' ? '1.5px solid #0f172a' : '1px solid #cbd5e1',
                    cursor: 'pointer',
                    background: tabRecibo === 'voucher' ? '#0f172a' : '#ffffff',
                    color: tabRecibo === 'voucher' ? '#ffffff' : '#64748b',
                    boxShadow: tabRecibo === 'voucher' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-receipt"></i> 1. Comprobante / Recibo
                </button>
                <button
                  type="button"
                  onClick={() => setTabRecibo('whatsapp')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 800,
                    borderRadius: '8px',
                    border: tabRecibo === 'whatsapp' ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                    cursor: 'pointer',
                    background: tabRecibo === 'whatsapp' ? '#16a34a' : '#ffffff',
                    color: tabRecibo === 'whatsapp' ? '#ffffff' : '#64748b',
                    boxShadow: tabRecibo === 'whatsapp' ? '0 2px 6px rgba(22,163,74,0.25)' : 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-brands fa-whatsapp"></i> 2. Formato WhatsApp
                </button>
              </div>

              {/* Contenido del Modal con Scroll */}
              <div style={{ padding: '20px', overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
                {tabRecibo === 'voucher' ? (
                  <div
                    id="areaImpresionReciboPago"
                    style={{
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '24px',
                      background: '#ffffff',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Membrete Oficial Dinámico */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #0f172a', paddingBottom: '14px', marginBottom: '18px' }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                          {empresaNombre}
                        </h2>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                          RIF: J-50000000-0 • Recolección &amp; Transporte de Leche
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ background: '#0f172a', color: '#ffffff', fontWeight: 900, fontSize: '12px', padding: '4px 10px', borderRadius: '6px', display: 'inline-block' }}>
                          RECIBO #{String(fincaRecibo.fincaId).padStart(5, '0')}
                        </span>
                        <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700, marginTop: '4px' }}>{semanaTextoFormateada}</div>
                      </div>
                    </div>

                    {/* Datos Productor & Finca */}
                    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                        <i className="fa-solid fa-wheat-awn" style={{ color: '#059669', marginRight: '6px' }}></i>
                        {fincaRecibo.fincaNombre}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '3px', fontWeight: 600 }}>
                        <i className="fa-regular fa-user" style={{ color: '#2563eb', marginRight: '5px' }}></i>
                        <strong>Productor:</strong> <span style={{ color: '#0f172a' }}>{productor}</span>
                      </div>
                      {(fincaRecibo.bancoNombre || fincaRecibo.numeroCuenta) && (
                        <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '4px', fontFamily: 'monospace' }}>
                          <i className="fa-solid fa-building-columns" style={{ color: '#64748b', marginRight: '5px' }}></i>
                          <strong>Cuenta:</strong> {fincaRecibo.bancoNombre ? `${fincaRecibo.bancoNombre} - ` : ''}{fincaRecibo.numeroCuenta || 'Sin cuenta'}
                        </div>
                      )}
                    </div>

                    {/* Detalle Financiero */}
                    <div style={{ border: '1.5px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '9px 14px', color: '#64748b', fontWeight: 600 }}>Total Litros Recolectados:</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#0284c7' }}>
                              {(fincaRecibo.totalLitros || 0).toLocaleString()} Lts
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '9px 14px', color: '#64748b', fontWeight: 600 }}>Precio por Litro:</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#334155' }}>
                              ${(fincaRecibo.precioLitroUSD || 0).toFixed(4)} USD
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                            <td style={{ padding: '9px 14px', color: '#475569', fontWeight: 700 }}>Total Bruto:</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#0f172a' }}>
                              ${brutoUSD.toFixed(2)} USD
                            </td>
                          </tr>
                          {adelantoUSD > 0 && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fff5f5' }}>
                              <td style={{ padding: '9px 14px', color: '#dc2626', fontWeight: 700 }}>(-) Deducción Adelantos / Préstamos:</td>
                              <td style={{ padding: '9px 14px', textAlign: 'right', color: '#dc2626', fontWeight: 800, fontFamily: 'monospace' }}>
                                -${adelantoUSD.toFixed(2)} USD
                              </td>
                            </tr>
                          )}
                          <tr style={{ background: '#ecfdf5', fontWeight: 900, borderTop: '2px solid #a7f3d0' }}>
                            <td style={{ padding: '11px 14px', color: '#065f46', fontSize: '13.5px' }}>NETO A PAGAR:</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', color: '#059669', fontSize: '16px', fontFamily: 'monospace' }}>
                              ${netoUSD.toFixed(2)} USD
                            </td>
                          </tr>
                          <tr style={{ background: '#fffbeb', fontWeight: 800 }}>
                            <td style={{ padding: '8px 14px 10px 14px', color: '#92400e', fontSize: '11.5px' }}>
                              Tasa BCV: {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/$
                            </td>
                            <td style={{ padding: '8px 14px 10px 14px', textAlign: 'right', color: '#b45309', fontSize: '14.5px', fontFamily: 'monospace' }}>
                              Bs. {netoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {fincaRecibo.referenciaPago && (
                      <div style={{ fontSize: '12px', color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '8px 12px', borderRadius: '8px', marginBottom: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa-solid fa-receipt"></i>
                        <span>Ref. de Pago Bancario: <strong>{fincaRecibo.referenciaPago}</strong></span>
                      </div>
                    )}

                    <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '8px' }}>
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
                        background: '#ffffff',
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
                  background: '#ffffff',
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
                      background: '#16a34a',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
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
        );
      })()}

      {/* MODAL REGISTRAR PAGO INDIVIDUAL (Image 2 Redesign) */}
      {modalPagar && fincaPago && (() => {
        const productor = (fincaPago.propietarioNombre || (fincaPago as any).propietario || (fincaPago as any).Propietario || '').trim();
        const brutoUSD = Number(fincaPago.totalBrutoUSD ?? (fincaPago as any).totalUSD ?? (fincaPago as any).TotalUSD ?? ((fincaPago.totalLitros || 0) * (fincaPago.precioLitroUSD || 0)));
        const adelantoUSD = Number(fincaPago.totalAdelantosUSD ?? (fincaPago as any).TotalAdelantosUSD ?? 0);
        const netoUSD = Number(fincaPago.totalNetoUSD !== undefined && fincaPago.totalNetoUSD !== null ? fincaPago.totalNetoUSD : Math.max(0, brutoUSD - adelantoUSD));
        const tasa = Number(fincaPago.tasaBCV || (fincaPago as any).tasaBcv || (fincaPago as any).TasaBcv || cicloActivo?.tasaBCVCierre || (brutoUSD > 0 && (fincaPago as any).totalBrutoBs ? ((fincaPago as any).totalBrutoBs / brutoUSD) : 1));
        const netoBs = Number(fincaPago.totalNetoBs || (fincaPago as any).TotalNetoBs || (netoUSD * tasa));

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
              padding: '16px',
            }}
          >
            <div
              className="content-card"
              style={{
                width: '100%',
                maxWidth: '460px',
                padding: '0',
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#ffffff',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                border: '1px solid #e2e8f0',
              }}
            >
              {/* Header 1:1 Image 2 */}
              <div
                style={{
                  padding: '18px 22px',
                  background: '#ffffff',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="fa-solid fa-money-bill-wave" style={{ color: '#059669', fontSize: '18px' }}></i>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Registrar Pago de Liquidación
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalPagar(false)}
                  style={{
                    color: '#94a3b8',
                    background: 'transparent',
                    border: 'none',
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    fontSize: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  &times;
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  pagarMutation.mutate({
                    fincaId: fincaPago.fincaId,
                    cicloId: cicloSeleccionadoId || cicloActivo?.id || 0,
                    referenciaPago,
                    montoUSD: netoUSD,
                    montoBs: netoBs,
                    tasaBCV: tasa,
                  });
                }}
              >
                <div style={{ padding: '20px', background: '#ffffff' }}>
                  {/* Tarjeta de Productor y Totales 1:1 Image 2 */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #f1f5f9',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '16px' }}>
                      {fincaPago.fincaNombre}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '12.5px', marginTop: '2px' }}>
                      Propietario: {productor}
                    </div>

                    <div style={{ borderTop: '1px solid #e2e8f0', margin: '12px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                        Total: ${netoUSD.toFixed(2)} USD
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#b45309', fontFamily: 'monospace' }}>
                        Bs. {netoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Input de Referencia Bancaria 1:1 Image 2 */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Referencia Bancaria / Comprobante de Pago *
                    </label>
                    <input
                      type="text"
                      value={referenciaPago}
                      onChange={(e) => setReferenciaPago(e.target.value)}
                      className="form-input"
                      placeholder="Ej: REF-84920491"
                      style={{ width: '100%', height: '42px', fontWeight: 700, fontSize: '13px', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {/* Footer 1:1 Image 2 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', background: '#ffffff', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    onClick={() => setModalPagar(false)}
                    className="btn btn-outline"
                    style={{ height: '40px', padding: '0 20px', fontWeight: 700, borderRadius: '8px', border: '1px solid #cbd5e1', color: '#334155' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={pagarMutation.isPending}
                    className="btn btn-primary"
                    style={{
                      height: '40px',
                      padding: '0 22px',
                      background: '#047857',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      borderRadius: '8px',
                      border: 'none',
                      color: '#ffffff',
                    }}
                  >
                    {pagarMutation.isPending ? 'Guardando...' : 'Confirmar Pago'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </section>
  );
};

export default LiquidacionesPage;
