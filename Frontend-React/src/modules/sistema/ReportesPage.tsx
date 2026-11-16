import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import html2canvas from 'html2canvas';
import Swal from 'sweetalert2';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { sistemaApi } from '@/api/sistema.api';
import { catalogosApi } from '@/api/catalogos.api';
import { finanzasApi } from '@/api/finanzas.api';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';
import { useAuthStore } from '@/stores/authStore';

export type TipoReporteOficial =
  | 'DIARIOS'
  | 'RECEPTORIAS'
  | 'FINCAS'
  | 'CHOFERES'
  | 'BANCOS'
  | 'RELACION_PAGOS_COMPANIAS'
  | 'RELACION_CHOFER';

const CATALOGO_REPORTES: { value: TipoReporteOficial; label: string; icon: string }[] = [
  { value: 'DIARIOS', label: '1. DIARIOS', icon: 'fa-calendar-days' },
  { value: 'RECEPTORIAS', label: '2. RECEPTORIAS', icon: 'fa-warehouse' },
  { value: 'FINCAS', label: '3. FINCAS', icon: 'fa-cow' },
  { value: 'CHOFERES', label: '4. CHOFERES', icon: 'fa-user-tie' },
  { value: 'BANCOS', label: '5. BANCOS / RELACIÓN DE PAGOS A FINCAS', icon: 'fa-building-columns' },
  { value: 'RELACION_PAGOS_COMPANIAS', label: '6. RELACIÓN DE PAGOS DE COMPAÑÍAS', icon: 'fa-building-wheat' },
  { value: 'RELACION_CHOFER', label: '7. RELACIÓN CHOFER', icon: 'fa-truck-arrow-right' },
];

function formatearNumero(val: number | string | undefined | null, decimales: number = 0): string {
  const n = Number(val || 0);
  if (isNaN(n)) return '0';
  return n.toLocaleString('es-VE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

function formatearFechaLocal(fechaStr: string | undefined | null): string {
  if (!fechaStr) return '-';
  const clean = String(fechaStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return clean;
}

export const ReportesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const esChofer = (currentUser?.rol || '').toUpperCase() === 'CHOFER';
  const hasBufala = useAuthStore((state) => state.hasTenantModule('MOD_LECHE_BUFALA'));

  const catalogosDisponibles = useMemo(() => {
    if (esChofer) {
      return CATALOGO_REPORTES.filter((r) =>
        ['DIARIOS', 'RECEPTORIAS', 'FINCAS', 'CHOFERES', 'RELACION_CHOFER'].includes(r.value)
      );
    }
    return CATALOGO_REPORTES;
  }, [esChofer]);

  // Ciclo Operativo Activo (1:1 V2_3_11_26)
  const { data: cicloActivo } = useQuery({
    queryKey: ['ciclo-activo-reportes'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<any>('/ciclos/activo');
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 60 * 10,
  });

  // Estados de Filtros Principales (inicializados por el ciclo operativo activo)
  const [tipoReporte, setTipoReporte] = useState<TipoReporteOficial>('DIARIOS');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [tasaManual, setTasaManual] = useState<string>('');

  // Sincronizar fechas con el ciclo operativo activo (o cálculo estándar Martes -> Lunes)
  useEffect(() => {
    if (cicloActivo?.fechaInicio && cicloActivo?.fechaFin) {
      setFechaInicio(String(cicloActivo.fechaInicio).split('T')[0]);
      setFechaFin(String(cicloActivo.fechaFin).split('T')[0]);
    } else {
      const hoy = new Date();
      const diaSemana = hoy.getDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab
      const diffDias = diaSemana >= 2 ? diaSemana - 2 : diaSemana + 5;
      const martes = new Date(hoy);
      martes.setDate(hoy.getDate() - diffDias);
      const lunes = new Date(martes);
      lunes.setDate(martes.getDate() + 6);
      const fFormat = (d: Date) => d.toISOString().split('T')[0];
      setFechaInicio(fFormat(martes));
      setFechaFin(fFormat(lunes));
    }
  }, [cicloActivo]);

  // Subfiltros contextuales
  const [finca1Id, setFinca1Id] = useState<string>('');
  const [finca2Id, setFinca2Id] = useState<string>('');
  const [companiaId, setCompaniaId] = useState<string>('');
  const [choferId, setChoferId] = useState<string>(() => (esChofer && currentUser?.id ? String(currentUser.id) : ''));
  const [bancoId, setBancoId] = useState<string>('');

  // Estados interactivos para Reporte Fincas
  const [mostrarAdelanto, setMostrarAdelanto] = useState<boolean>(false);
  const [adelantosManuales, setAdelantosManuales] = useState<Record<number, number>>({});
  const [mostrarConsolidadoManual, setMostrarConsolidadoManual] = useState<boolean>(false);

  // Estados para Relación Compañías
  const [filtroServicioCompania, setFiltroServicioCompania] = useState<'TODOS' | 'TRANSPORTE' | 'RUTA'>('TODOS');
  const [modalEntregasCompania, setModalEntregasCompania] = useState<any | null>(null);
  const [modalHistorialPrecios, setModalHistorialPrecios] = useState<boolean>(false);

  // Estado para Relación Chofer
  const [filtroEnVivoChoferes, setFiltroEnVivoChoferes] = useState<string>('');

  // Estado para Pagos en Bancos
  const [pagosMarcados, setPagosMarcados] = useState<Record<number, boolean>>({});
  const [reciboModal, setReciboModal] = useState<any | null>(null);

  // Contenedor principal para captura unificada / impresión
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Queries de Catálogos
  const { data: fincas = [] } = useQuery({
    queryKey: ['catalogos-fincas-reportes'],
    queryFn: () => catalogosApi.getFincas(false),
    staleTime: 1000 * 60 * 10,
  });

  const { data: companias = [] } = useQuery({
    queryKey: ['catalogos-companias-reportes'],
    queryFn: () => catalogosApi.getCompanias(false),
    staleTime: 1000 * 60 * 10,
  });

  const { data: choferes = [] } = useQuery({
    queryKey: ['catalogos-choferes-reportes'],
    queryFn: () => catalogosApi.getChoferes(),
    staleTime: 1000 * 60 * 10,
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['catalogos-bancos-reportes'],
    queryFn: () => catalogosApi.getBancos(),
    staleTime: 1000 * 60 * 10,
  });

  const { data: bcvHoy } = useQuery({
    queryKey: ['bcv-hoy-reportes'],
    queryFn: () => sistemaApi.getBcvHoy(),
    staleTime: 1000 * 60 * 5,
  });

  const tasaBcvActiva = useMemo(() => {
    if (tasaManual && !isNaN(parseFloat(tasaManual)) && parseFloat(tasaManual) > 0) {
      return parseFloat(tasaManual);
    }
    return Number(bcvHoy?.tasaDolarBs || bcvHoy?.tasa || 889.5754);
  }, [tasaManual, bcvHoy]);

  // Options para SearchableSelects
  const fincasOptions = useMemo(() => {
    const opts: SelectOption[] = [];
    (fincas || []).forEach((f: any) => {
      const id = f.id ?? f.Id;
      const nom = f.nombre ?? f.Nombre ?? `Finca #${id}`;
      const prop = f.propietarioNombre || f.propietario || f.Propietario || '';
      opts.push({
        value: String(id),
        label: prop ? `${nom} (${prop})` : nom,
        subLabel: prop ? `Propietario: ${prop}` : undefined,
        badge: (hasBufala && f.tipoLeche === 'BUFALA') ? '🐃 BÚFALA' : (hasBufala && f.tieneDosTiposLeche ? 'Dual' : undefined),
      });
    });
    return opts;
  }, [fincas]);

  const companiasOptions = useMemo(() => {
    const opts: SelectOption[] = [];
    companias.forEach((c: any) => {
      opts.push({
        value: String(c.id || c.Id),
        label: `${c.nombre || c.Nombre || c.companiaNombre || c.CompaniaNombre}`,
      });
    });
    return opts;
  }, [companias]);

  const choferesOptions = useMemo(() => {
    const opts: SelectOption[] = [];
    let list = choferes;
    if (esChofer && currentUser?.id) {
      list = list.filter((ch: any) => Number(ch.id || ch.Id) === currentUser.id);
    }
    list.forEach((ch: any) => {
      opts.push({
        value: String(ch.id || ch.Id),
        label: `${ch.nombreCompleto || ch.nombre || ch.Nombre || `Chofer #${ch.id}`}`,
      });
    });
    return opts;
  }, [choferes, esChofer, currentUser]);

  const bancosOptions = useMemo(() => {
    const opts: SelectOption[] = [];
    bancos.forEach((b: any) => {
      opts.push({
        value: String(b.id || b.Id),
        label: `${b.nombre || b.Nombre}`,
      });
    });
    return opts;
  }, [bancos]);

  // Query del Reporte Activo
  const {
    data: datosReporte,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      'reporte-oficial-1-1',
      tipoReporte,
      fechaInicio,
      fechaFin,
      finca1Id,
      finca2Id,
      companiaId,
      choferId,
      bancoId,
      tasaBcvActiva,
    ],
    queryFn: async () => {
      const idChoferEfectivo = esChofer && currentUser?.id ? currentUser.id : (choferId ? Number(choferId) : undefined);
      switch (tipoReporte) {
        case 'DIARIOS':
          return await sistemaApi.getReporteDiarios(fechaInicio, fechaFin, idChoferEfectivo);
        case 'RECEPTORIAS':
          return await sistemaApi.getReporteReceptorias(fechaInicio, fechaFin, companiaId ? Number(companiaId) : undefined);
        case 'FINCAS': {
          const ids = [finca1Id, finca2Id].filter(Boolean);
          const fIdsStr = ids.length > 0 ? ids.join(',') : undefined;
          return await sistemaApi.getReporteFincas(fechaInicio, fechaFin, fIdsStr);
        }
        case 'CHOFERES':
          return await sistemaApi.getReporteChoferes(fechaInicio, fechaFin, idChoferEfectivo);
        case 'BANCOS':
          return await sistemaApi.getReporteBancos(
            fechaInicio,
            fechaFin,
            bancoId ? Number(bancoId) : undefined,
            undefined,
            tasaBcvActiva
          );
        case 'RELACION_PAGOS_COMPANIAS':
          return await sistemaApi.getReporteRelacionCompanias(
            fechaInicio,
            fechaFin,
            companiaId ? Number(companiaId) : undefined,
            undefined,
            tasaBcvActiva
          );
        case 'RELACION_CHOFER': {
          const res = await sistemaApi.getReporteRelacionChoferes(fechaInicio, fechaFin);
          if (idChoferEfectivo) {
            return (res || []).filter((r: any) => String(r.usuarioId || r.UsuarioId) === String(idChoferEfectivo));
          }
          return res;
        }
        default:
          return [];
      }
    },
    staleTime: 1000 * 60 * 3,
    enabled:
      tipoReporte === 'DIARIOS' ||
      (tipoReporte === 'FINCAS' && Boolean(finca1Id || finca2Id)) ||
      (tipoReporte === 'RECEPTORIAS' && Boolean(companiaId)) ||
      (tipoReporte === 'CHOFERES' && Boolean(esChofer ? currentUser?.id : choferId)) ||
      (tipoReporte === 'RELACION_CHOFER' && Boolean(esChofer ? currentUser?.id : choferId)) ||
      (tipoReporte === 'BANCOS' && Boolean(bancoId)) ||
      (tipoReporte === 'RELACION_PAGOS_COMPANIAS' && Boolean(companiaId)),
  });

  // Query de Historial de Precios para el modal de auditoría
  const { data: historialPrecios = [] } = useQuery({
    queryKey: ['historial-precios-reporte'],
    queryFn: () => catalogosApi.getHistorialPrecios(),
    enabled: modalHistorialPrecios,
  });

  // =========================================================================
  // CAPTURAS EN ALTA DEFINICIÓN (html2canvas) AL PORTAPAPELES O DESCARGA
  // =========================================================================
  const ejecutarCaptura = async (elemento: HTMLElement | null, nombreArchivo: string) => {
    if (!elemento) return;
    try {
      toast.info('Generando captura en alta definición...');
      const canvas = await html2canvas(elemento, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        ignoreElements: (el) => el.classList.contains('no-capture'),
      });

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            toast.success('¡Imagen copiada al portapapeles! Lista para pegar en WhatsApp (Ctrl+V)', {
              duration: 4000,
            });
            return;
          }
        } catch {
          // Fallback a descarga si el portapapeles está restringido
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nombreArchivo}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Captura descargada como ${nombreArchivo}.png`);
      }, 'image/png');
    } catch (err: any) {
      console.error('Error al capturar:', err);
      toast.error('No se pudo generar la captura: ' + (err.message || ''));
    }
  };

  // =========================================================================
  // EXPORTACIÓN A EXCEL CON DISEÑO Y ESTILOS CORPORATIVOS
  // =========================================================================
  const descargarExcelConDiseno = (htmlTablas: string, nombreArchivo: string, tituloDocumento = 'Reporte') => {
    const excelDoc = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
          <style>
              body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 10pt; color: #0f172a; margin: 15px; }
              table { border-collapse: collapse; width: 100%; margin-bottom: 22px; }
              .excel-banner-main { background-color: #1e1b4b !important; color: #ffffff !important; font-size: 14pt !important; font-weight: bold !important; text-align: center !important; padding: 12px !important; }
              .excel-banner-sub { background-color: #f1f5f9 !important; color: #1e293b !important; font-size: 10pt !important; font-weight: bold !important; padding: 8px 12px !important; border: 1px solid #cbd5e1 !important; }
              .excel-sec-header { background-color: #1e3a5f !important; color: #ffffff !important; font-size: 11pt !important; font-weight: bold !important; text-align: center !important; padding: 9px 12px !important; }
              .excel-th { background-color: #334155 !important; color: #ffffff !important; font-size: 10pt !important; font-weight: bold !important; text-align: center !important; padding: 8px 10px !important; border: 1px solid #475569 !important; }
              .excel-td { font-size: 10pt !important; padding: 6px 10px !important; border: 1px solid #cbd5e1 !important; text-align: center !important; }
              .excel-td-num { text-align: right !important; padding-right: 10px !important; font-weight: bold !important; }
              .excel-total-row td { background-color: #047857 !important; color: #ffffff !important; font-size: 10.5pt !important; font-weight: bold !important; text-align: center !important; padding: 9px 12px !important; }
          </style>
      </head>
      <body>
          ${htmlTablas}
      </body>
      </html>
    `;

    const blob = new Blob([excelDoc], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo.endsWith('.xls') ? nombreArchivo : `${nombreArchivo}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado a Excel con diseño y colores.');
  };

  const exportarReporteActualExcel = () => {
    if (!datosReporte) {
      toast.warning('No hay datos para exportar.');
      return;
    }
    const elem = contenedorRef.current;
    if (elem) {
      const clone = elem.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.no-capture, button, input').forEach((e) => e.remove());
      descargarExcelConDiseno(clone.innerHTML, `Reporte_${tipoReporte}_${fechaInicio}_al_${fechaFin}`, `Reporte ${tipoReporte}`);
    }
  };

  // =========================================================================
  // MODALES AUXILIARES INTERACTIVOS (1:1 V2_3_11_26)
  // =========================================================================

  // Ajustar precio leche ácida en caliente
  const abrirModalAjustarPrecioAcida = async (fincaId: number, fincaNombre: string) => {
    const { value: precioInput } = await Swal.fire({
      title: 'Ajuste de Liquidación',
      html: `
        <div style="text-align: left; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #cbd5e1; margin-top: 10px;">
          <div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 4px;">Finca: <span style="color: #2563eb; font-weight: 800;">${fincaNombre}</span></div>
          <p style="font-size: 12px; color: #64748b; margin: 0 0 10px 0;">Ingrese el precio en USD por litro para la leche marcada como <strong>MALA / ÁCIDA</strong>:</p>
        </div>
      `,
      input: 'text',
      inputValue: '0.65',
      inputAttributes: { inputmode: 'decimal', placeholder: 'Ej: 0.65' },
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar Precio Ácida',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      inputValidator: (val) => {
        const raw = (val || '').trim().replace(',', '.');
        const parsed = parseFloat(raw);
        if (!val || isNaN(parsed) || parsed <= 0) {
          return 'Por favor ingrese un precio válido mayor a 0.';
        }
      },
    });

    if (precioInput) {
      const parsedVal = parseFloat(precioInput.trim().replace(',', '.'));
      try {
        await catalogosApi.ajustarPrecioAcidaFinca({
          fincaId,
          precioLitroAcidaUSD: parsedVal,
        });
        toast.success(`Precio de leche ácida guardado ($${parsedVal.toFixed(4)}/L).`);
        refetch();
      } catch (err: any) {
        toast.error('No se pudo guardar el precio: ' + (err.message || ''));
      }
    }
  };

  // Ajuste de deducción/adelanto manual de finca
  const abrirModalAdelantoManualFinca = async (fincaId: number, fincaNombre: string, valorActual: number) => {
    const { value: nuevoAdelanto } = await Swal.fire({
      title: 'Adelanto / Deducción',
      html: `
        <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 12px;">
          Finca: <strong style="color: #38bdf8;">${fincaNombre}</strong>
        </div>
        <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px; text-align: left;">
          Monto del Adelanto en USD ($):
        </label>
      `,
      input: 'number',
      inputValue: valorActual || 0,
      inputAttributes: { min: '0', step: '0.01' },
      showCancelButton: true,
      confirmButtonText: 'Aplicar al Reporte',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d97706',
      cancelButtonColor: '#64748b',
      background: '#1e293b',
      color: '#fff',
    });

    if (nuevoAdelanto !== undefined && nuevoAdelanto !== null) {
      const val = parseFloat(nuevoAdelanto) || 0;
      setAdelantosManuales((prev) => ({ ...prev, [fincaId]: val }));
      setMostrarAdelanto(true);
      toast.success(`Adelanto manual de $${val.toFixed(2)} aplicado a ${fincaNombre}.`);
    }
  };

  // Actualizar tarifas de compañía (Vaca, Búfala, Ácida) en caliente
  const abrirModalActualizarPrecioCompania = async (comp: any) => {
    const compId = comp.companiaId || comp.CompaniaId || comp.id;
    const compNombre = comp.companiaNombre || comp.CompaniaNombre || comp.nombre;
    const esTransp = String(comp.tipoServicio || '').toUpperCase().includes('TRANSP');

    const pVaca = Number(comp.precioLitroUSD || comp.PrecioLitroUSD || 0.85);
    const pBufala = Number(comp.precioBufalaLitroUSD || comp.PrecioBufalaLitroUSD || pVaca);
    const pAcida = Number(comp.precioAcidaLitroUSD || comp.PrecioAcidaLitroUSD || 0);

    const { value: formValues } = await Swal.fire({
      title: `
        <div style="font-size: 17px; font-weight: 800; color: #0f172a; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <i class="fa-solid ${esTransp ? 'fa-truck-ramp-box' : 'fa-tags'}" style="color: ${esTransp ? '#7e22ce' : '#2563eb'};"></i>
          ${esTransp ? 'Actualizar Tarifas de Flete' : 'Actualizar Precios de Leche'}
        </div>
      `,
      html: `
        <div style="text-align: left; margin-top: 10px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Compañía / Planta</span>
              <span style="font-size: 10.5px; font-weight: 800; padding: 2px 7px; border-radius: 5px; background: ${esTransp ? '#f3e8ff; color: #7e22ce;' : '#e0f2fe; color: #0284c7;'}">
                ${esTransp ? 'TRANSPORTE' : 'RUTA PROPIA'}
              </span>
            </div>
            <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px;">${compNombre}</div>
          </div>

          <div style="display: grid; grid-template-columns: ${hasBufala ? '1fr 1fr 1fr' : '1fr 1fr'}; gap: 10px; margin-bottom: 14px;">
            <div>
              <label style="display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #16a34a;"></span>
                ${esTransp ? 'Flete Vaca' : 'Precio Vaca'}:
              </label>
              <input id="swalNuevoPrecioVaca" type="text" inputmode="decimal" value="${pVaca.toFixed(4)}"
                style="width: 100%; box-sizing: border-box; padding: 8px 6px; font-size: 15px; font-weight: 800; color: #047857; text-align: center; border: 1.5px solid #86efac; border-radius: 8px; outline: none; background: #f0fdf4;" />
            </div>
            ${hasBufala ? `
            <div>
              <label style="display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #7e22ce;"></span>
                ${esTransp ? 'Flete Búfala' : 'Precio Búfala'}:
              </label>
              <input id="swalNuevoPrecioBufala" type="text" inputmode="decimal" value="${pBufala.toFixed(4)}"
                style="width: 100%; box-sizing: border-box; padding: 8px 6px; font-size: 15px; font-weight: 800; color: #7e22ce; text-align: center; border: 1.5px solid #d8b4fe; border-radius: 8px; outline: none; background: #faf5ff;" />
            </div>` : ''}
            <div>
              <label style="display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #e11d48;"></span>
                ${esTransp ? 'Flete Ácida' : 'Ácida / Mala'}:
              </label>
              <input id="swalNuevoPrecioAcida" type="text" inputmode="decimal" value="${pAcida.toFixed(4)}"
                style="width: 100%; box-sizing: border-box; padding: 8px 6px; font-size: 15px; font-weight: 800; color: #e11d48; text-align: center; border: 1.5px solid #fecdd3; border-radius: 8px; outline: none; background: #fff1f2;" />
            </div>
          </div>

          <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 11.5px; font-weight: 700; color: #64748b; margin-bottom: 4px;">
              <i class="fa-solid fa-comment-dots"></i> Motivo / Observación (Opcional):
            </label>
            <input id="swalObsPrecioCompania" type="text" placeholder="Ej. Ajuste semanal de tarifa pactada"
              style="width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 12.5px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none;" />
          </div>
        </div>
      `,
      width: 520,
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar Precios',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      preConfirm: () => {
        const rawV = (document.getElementById('swalNuevoPrecioVaca') as HTMLInputElement)?.value.replace(',', '.');
        const rawB = (document.getElementById('swalNuevoPrecioBufala') as HTMLInputElement)?.value.replace(',', '.');
        const rawA = (document.getElementById('swalNuevoPrecioAcida') as HTMLInputElement)?.value.replace(',', '.');
        const obs = (document.getElementById('swalObsPrecioCompania') as HTMLInputElement)?.value || '';

        const v = parseFloat(rawV);
        const b = parseFloat(rawB);
        const a = parseFloat(rawA) || 0;

        if (isNaN(v) || v < 0) {
          Swal.showValidationMessage('Ingresa una tarifa válida para vaca.');
          return false;
        }
        return { nuevoPrecioUSD: v, nuevoPrecioBufalaUSD: isNaN(b) ? v : b, nuevoPrecioAcidaUSD: a, observacion: obs };
      },
    });

    if (formValues) {
      try {
        await catalogosApi.actualizarPrecioCompania(compId, formValues);
        toast.success(`Tarifas de ${compNombre} actualizadas exitosamente.`);
        refetch();
      } catch (err: any) {
        toast.error('Error al actualizar precios: ' + (err.message || ''));
      }
    }
  };

  // Checkbox de pago bancario
  const togglePagoFinca = async (fincaId: number, isChecked: boolean, fInfo: any) => {
    setPagosMarcados((prev) => ({ ...prev, [fincaId]: isChecked }));
    if (isChecked) {
      try {
        await finanzasApi.pagarPreliquidacion({
          fincaId,
          cicloId: fInfo.cicloId || 1,
          referenciaPago: `PAGO-REP-${Date.now().toString().slice(-6)}`,
          montoUSD: Number(fInfo.totalUSD || 0),
          montoBs: Number(fInfo.totalNetoBs || fInfo.totalBs || 0),
          tasaBCV: tasaBcvActiva,
        });
        toast.success(`Pago registrado para ${fInfo.fincaNombre || 'finca'}.`);
      } catch {
        // Marcado reactivo en UI
      }
    }
  };

  return (
    <section id="tab-reportes" className="tab-content active" style={{ display: 'block', paddingBottom: '40px' }}>
      {/* =======================================================================
          ENCABEZADO DE VISTA MAESTRO (1:1 V2_3_11_26)
         ======================================================================= */}
      <div
        className="view-header mb-4"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '22px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            }}
          >
            <i className="fa-solid fa-chart-pie"></i>
          </div>
          <div>
            <h2
              className="view-title"
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.5px',
              }}
            >
              INFORMACIÓN GENERAL / REPORTES
            </h2>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
              Generación de balances, nómina bancaria y resumen de recolección
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => window.print()}
            style={{
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 600,
              background: '#ffffff',
              borderColor: '#cbd5e1',
              color: '#334155',
            }}
          >
            <i className="fa-solid fa-print"></i> Imprimir / PDF
          </button>
          <button
            type="button"
            className="btn btn-sm btn-success"
            onClick={exportarReporteActualExcel}
            style={{
              borderRadius: '8px',
              padding: '7px 16px',
              fontSize: '13px',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
            }}
          >
            <i className="fa-solid fa-file-excel"></i> Exportar
          </button>
        </div>
      </div>

      {/* =======================================================================
          PANEL BUSCAR REPORTES (1:1 V2_3_11_26)
         ======================================================================= */}
      <div
        className="content-card"
        style={{
          marginBottom: '20px',
          padding: 0,
          overflow: 'visible',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div
          className="card-header-styled card-header-primary"
          style={{
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
            color: '#ffffff',
            borderRadius: '12px 12px 0 0',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-magnifying-glass"></i> PARÁMETROS DE BÚSQUEDA
          </span>
          <span
            className="badge badge-info"
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              background: '#38bdf8',
              color: '#0f172a',
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            {cicloActivo?.numeroSemana
              ? `Semana ${cicloActivo.numeroSemana}: (${formatearFechaLocal(fechaInicio)} al ${formatearFechaLocal(fechaFin)})`
              : `Semana Operativa: (${formatearFechaLocal(fechaInicio)} al ${formatearFechaLocal(fechaFin)})`}
          </span>
        </div>

        <div style={{ padding: '18px' }}>
          {/* FILA 1: DESDE, HASTA, TIPO, BOTÓN BUSCAR */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr)) 130px',
              gap: '16px',
              alignItems: 'flex-end',
              marginBottom: '14px',
            }}
          >
            <div>
              <label style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Desde:
              </label>
              <input
                type="date"
                className="form-input"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    refetch();
                  }
                }}
                style={{ height: '42px', fontSize: '14px', fontWeight: 600, color: '#0f172a', width: '100%', borderRadius: '8px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Hasta:
              </label>
              <input
                type="date"
                className="form-input"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    refetch();
                  }
                }}
                style={{ height: '42px', fontSize: '14px', fontWeight: 600, color: '#0f172a', width: '100%', borderRadius: '8px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Tipo de Reporte:
              </label>
              <select
                className="form-input form-select"
                value={tipoReporte}
                onChange={(e) => setTipoReporte(e.target.value as TipoReporteOficial)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    refetch();
                  }
                }}
                style={{ height: '42px', fontWeight: 700, fontSize: '13.5px', color: '#0f172a', width: '100%', borderRadius: '8px' }}
              >
                {catalogosDisponibles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => refetch()}
                style={{
                  height: '42px',
                  width: '100%',
                  fontWeight: 800,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #1e40af, #2563eb)',
                }}
              >
                <i className="fa-solid fa-magnifying-glass"></i> Buscar
              </button>
            </div>
          </div>

          {/* FILA 2: SUB-FILTROS DINÁMICOS CON BUSCADORES / COMBOBOXES (1:1 V2_3_11_26) */}
          <div style={{ paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
            {/* Subfiltro FINCAS: Finca 1 y Finca 2 */}
            {tipoReporte === 'FINCAS' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '22px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-cow" style={{ color: '#2563eb' }}></i> Finca 1 (Buscar por nombre o dueño):
                  </label>
                  <SearchableSelect
                    options={fincasOptions}
                    value={finca1Id}
                    onChange={(val) => setFinca1Id(String(val || ''))}
                    placeholder="Seleccionar Finca 1..."
                    searchPlaceholder="Buscar finca por nombre o productor..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-cow" style={{ color: '#10b981' }}></i> Finca 2 (Opcional - Comparar):
                  </label>
                  <SearchableSelect
                    options={fincasOptions}
                    value={finca2Id}
                    onChange={(val) => setFinca2Id(String(val || ''))}
                    placeholder="Seleccionar Finca 2 (Opcional)..."
                    searchPlaceholder="Buscar finca por nombre o productor..."
                  />
                </div>
              </div>
            )}

            {/* Subfiltro RECEPTORIAS: Receptoría y Tipo de Servicio */}
            {tipoReporte === 'RECEPTORIAS' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-truck" style={{ color: '#10b981' }}></i> Receptoría / Planta:
                  </label>
                  <SearchableSelect
                    options={companiasOptions}
                    value={companiaId}
                    onChange={(val) => setCompaniaId(String(val || ''))}
                    placeholder="Seleccionar Receptoría / Planta..."
                    searchPlaceholder="Buscar receptoría..."
                  />
                </div>
              </div>
            )}

            {/* Subfiltro CHOFERES: Solo Conductor (1:1 V2) */}
            {tipoReporte === 'CHOFERES' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px)', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-id-badge" style={{ color: '#0284c7' }}></i> Conductor / Chofer:
                  </label>
                  <SearchableSelect
                    options={choferesOptions}
                    value={choferId}
                    onChange={(val) => setChoferId(String(val || ''))}
                    placeholder="Seleccionar conductor..."
                    searchPlaceholder="Buscar conductor..."
                  />
                </div>
              </div>
            )}

            {/* Subfiltro BANCOS: Banco y Tasa BCV */}
            {tipoReporte === 'BANCOS' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-building-columns" style={{ color: '#d97706' }}></i> Filtrar por Banco:
                  </label>
                  <SearchableSelect
                    options={bancosOptions}
                    value={bancoId}
                    onChange={(val) => setBancoId(String(val || ''))}
                    placeholder="Seleccionar Banco..."
                    searchPlaceholder="Buscar banco..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-coins" style={{ color: '#059669' }}></i> Tasa BCV (Bs/$):
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-input"
                    placeholder={`Hoy: ${formatearNumero(bcvHoy?.tasaDolarBs || bcvHoy?.tasa || 889.5754, 2)}`}
                    value={tasaManual}
                    onChange={(e) => setTasaManual(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        refetch();
                      }
                    }}
                    style={{ height: '42px', fontSize: '14px', fontWeight: 700, color: '#047857', width: '100%', borderRadius: '8px' }}
                  />
                </div>
              </div>
            )}

            {/* Subfiltro RELACION DE PAGOS COMPAÑIAS: Compañía y Tasa BCV */}
            {tipoReporte === 'RELACION_PAGOS_COMPANIAS' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-building-wheat" style={{ color: '#9333ea' }}></i> Compañía / Planta:
                  </label>
                  <SearchableSelect
                    options={companiasOptions}
                    value={companiaId}
                    onChange={(val) => setCompaniaId(String(val || ''))}
                    placeholder="Seleccionar Compañía..."
                    searchPlaceholder="Buscar compañía..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-coins" style={{ color: '#059669' }}></i> Tasa BCV (Bs/$):
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-input"
                    placeholder={`Hoy: ${formatearNumero(bcvHoy?.tasaDolarBs || bcvHoy?.tasa || 889.5754, 2)}`}
                    value={tasaManual}
                    onChange={(e) => setTasaManual(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        refetch();
                      }
                    }}
                    style={{ height: '42px', fontSize: '14px', fontWeight: 700, color: '#047857', width: '100%', borderRadius: '8px' }}
                  />
                </div>
              </div>
            )}

            {/* Subfiltro RELACION CHOFER: Conductor */}
            {tipoReporte === 'RELACION_CHOFER' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block', fontWeight: 700 }}>
                    <i className="fa-solid fa-truck-arrow-right" style={{ color: '#ea580c' }}></i> Conductor / Chofer:
                  </label>
                  <SearchableSelect
                    options={choferesOptions}
                    value={choferId}
                    onChange={(val) => setChoferId(String(val || ''))}
                    placeholder="Seleccionar Chofer para ver Relación..."
                    searchPlaceholder="Buscar chofer..."
                  />
                </div>
              </div>
            )}
          {/* ACCIONES EXCLUSIVAS DE REPORTES FINCAS */}
          {tipoReporte === 'FINCAS' && (
            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setMostrarAdelanto(!mostrarAdelanto)}
                className="btn"
                style={{
                  background: mostrarAdelanto ? '#d97706' : '#ffffff',
                  color: mostrarAdelanto ? '#ffffff' : '#b45309',
                  border: '1.5px solid #d97706',
                  fontWeight: 800,
                  fontSize: '12px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-hand-holding-dollar"></i>
                {mostrarAdelanto ? 'Adelanto: ACTIVADO' : 'Mostrar Adelanto (Opcional)'}
              </button>

              {finca1Id && finca2Id && (
                <>
                  <button
                    type="button"
                    onClick={() => setMostrarConsolidadoManual(!mostrarConsolidadoManual)}
                    className="btn btn-outline"
                    style={{ fontWeight: 700, fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
                  >
                    <i className={`fa-solid ${mostrarConsolidadoManual ? 'fa-eye-slash' : 'fa-calculator'}`}></i>
                    {mostrarConsolidadoManual ? 'Ocultar Suma' : 'Sumar Totales (Opcional)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn btn-outline"
                    style={{ fontWeight: 700, fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
                  >
                    <i className="fa-solid fa-print"></i> Imprimir Ambas Tablas
                  </button>
                  <button
                    type="button"
                    onClick={() => ejecutarCaptura(contenedorRef.current, `Consolidado_Fincas_${fechaInicio}_al_${fechaFin}`)}
                    className="btn"
                    style={{
                      background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '12px',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
                    }}
                  >
                    <i className="fa-solid fa-camera"></i> Capturar Imagen Ambas
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* =======================================================================
          CONTENEDOR DE RESULTADOS SEGÚN EL REPORTE (1:1 V2_3_11_26)
         ======================================================================= */}
      <div ref={contenedorRef} id="contenedorResultadoReporte">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '32px', color: '#2563eb', marginBottom: '12px', display: 'block' }}></i>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>Cargando datos del reporte oficial...</div>
          </div>
        ) : tipoReporte === 'FINCAS' && !finca1Id && !finca2Id ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <i className="fa-solid fa-cow" style={{ fontSize: '40px', marginBottom: '12px', color: '#4f46e5', display: 'block' }}></i>
            <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Escriba y Seleccione una Finca</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
              Seleccione en el campo <strong>Finca Principal</strong> (y opcionalmente <strong>Comparar / 2da Finca</strong>) para consultar su reporte.
            </p>
          </div>
        ) : tipoReporte === 'RECEPTORIAS' && !companiaId ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <i className="fa-solid fa-truck" style={{ fontSize: '40px', marginBottom: '12px', color: '#059669', display: 'block' }}></i>
            <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Seleccione una Receptoría / Planta</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
              Seleccione en el campo <strong>Receptoría o Planta</strong> para buscar y consultar sus entregas.
            </p>
          </div>
        ) : tipoReporte === 'CHOFERES' && !choferId ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <i className="fa-solid fa-user-tie" style={{ fontSize: '40px', marginBottom: '12px', color: '#0284c7', display: 'block' }}></i>
            <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Seleccione un Conductor / Chofer</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
              Seleccione un chofer para visualizar el reporte detallado de recolecciones.
            </p>
          </div>
        ) : tipoReporte === 'RELACION_CHOFER' && !choferId ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <i className="fa-solid fa-truck-arrow-right" style={{ fontSize: '40px', marginBottom: '12px', color: '#ea580c', display: 'block' }}></i>
            <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Seleccione un Conductor / Chofer</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
              Seleccione un chofer para ver la relación de viajes, entregas y mermas.
            </p>
          </div>
        ) : tipoReporte === 'BANCOS' && !bancoId ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <i className="fa-solid fa-building-columns" style={{ fontSize: '40px', marginBottom: '12px', color: '#d97706', display: 'block' }}></i>
            <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Seleccione un Banco</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
              Seleccione una entidad bancaria para generar la nómina de transferencias y pagos.
            </p>
          </div>
        ) : tipoReporte === 'RELACION_PAGOS_COMPANIAS' && !companiaId ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <i className="fa-solid fa-building-wheat" style={{ fontSize: '40px', marginBottom: '12px', color: '#9333ea', display: 'block' }}></i>
            <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Seleccione una Compañía / Planta</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
              Seleccione una planta o compañía receptora para ver la relación de pagos y entregas.
            </p>
          </div>
        ) : (
          <>
            {/* 1. REPORTE DIARIOS */}
            {tipoReporte === 'DIARIOS' && (
              <RenderReporteDiarios
                data={datosReporte}
                fechaDesde={fechaInicio}
                fechaHasta={fechaFin}
                onCapturar={ejecutarCaptura}
                onExportarExcel={descargarExcelConDiseno}
              />
            )}

            {/* 2. REPORTE RECEPTORIAS */}
            {tipoReporte === 'RECEPTORIAS' && (
              <RenderReporteReceptorias
                data={datosReporte}
                fechaDesde={fechaInicio}
                fechaHasta={fechaFin}
                tasaBcv={tasaBcvActiva}
                onCapturar={ejecutarCaptura}
                onExportarExcel={descargarExcelConDiseno}
              />
            )}

            {/* 3. REPORTE FINCAS */}
            {tipoReporte === 'FINCAS' && (
              <RenderReporteFincas
                data={datosReporte}
                fechaDesde={fechaInicio}
                fechaHasta={fechaFin}
                tasaBcv={tasaBcvActiva}
                mostrarAdelanto={mostrarAdelanto}
                adelantosManuales={adelantosManuales}
                mostrarConsolidadoManual={mostrarConsolidadoManual}
                  onToggleAdelanto={() => setMostrarAdelanto(!mostrarAdelanto)}
                  onToggleConsolidado={() => setMostrarConsolidadoManual(!mostrarConsolidadoManual)}
                onCapturar={ejecutarCaptura}
                onExportarExcel={descargarExcelConDiseno}
                onAjustarPrecioAcida={abrirModalAjustarPrecioAcida}
                onAjustarAdelantoManual={abrirModalAdelantoManualFinca}
              />
            )}

            {/* 4. REPORTE CHOFERES */}
            {tipoReporte === 'CHOFERES' && (
              <RenderReporteChoferes
                data={datosReporte}
                fechaDesde={fechaInicio}
                fechaHasta={fechaFin}
                onCapturar={ejecutarCaptura}
                onExportarExcel={descargarExcelConDiseno}
              />
            )}

            {/* 5. REPORTE BANCOS */}
            {tipoReporte === 'BANCOS' && (
              <RenderReporteBancos
                data={datosReporte}
                fechaDesde={fechaInicio}
                fechaHasta={fechaFin}
                tasaBcv={tasaBcvActiva}
                pagosMarcados={pagosMarcados}
                onTogglePago={togglePagoFinca}
                onVerRecibo={(rec) => setReciboModal(rec)}
                onCapturar={ejecutarCaptura}
                onExportarExcel={descargarExcelConDiseno}
              />
            )}

            {/* 6. RELACIÓN DE PAGOS DE COMPAÑÍAS */}
            {tipoReporte === 'RELACION_PAGOS_COMPANIAS' && (
              <RenderReporteRelacionCompanias
                data={datosReporte}
                fechaDesde={fechaInicio}
                fechaHasta={fechaFin}
                tasaBcv={tasaBcvActiva}
                filtroServicio={filtroServicioCompania}
                onCambiarFiltroServicio={setFiltroServicioCompania}
                onAbrirHistorialPrecios={() => setModalHistorialPrecios(true)}
                onAjustarPrecios={abrirModalActualizarPrecioCompania}
                onVerDetalleEntregas={(comp) => setModalEntregasCompania(comp)}
                onCapturar={ejecutarCaptura}
                onExportarExcel={descargarExcelConDiseno}
              />
            )}

            {/* 7. RELACIÓN CHOFER */}
            {tipoReporte === 'RELACION_CHOFER' && (
              <RenderReporteRelacionChoferes
                data={datosReporte}
                fechaDesde={fechaInicio}
                fechaHasta={fechaFin}
                filtroTermino={filtroEnVivoChoferes}
                onCambiarFiltroTermino={setFiltroEnVivoChoferes}
                onCapturar={ejecutarCaptura}
                onExportarExcel={descargarExcelConDiseno}
              />
            )}
          </>
        )}
      </div>

      {/* MODAL DETALLE DE ENTREGAS COMPAÑÍA (900px 1:1 V2_3_11_26) */}
      {modalEntregasCompania && (
        <ModalDetalleEntregasCompania
          compania={modalEntregasCompania}
          onClose={() => setModalEntregasCompania(null)}
        />
      )}

      {/* MODAL HISTORIAL DE LOG DE PRECIOS */}
      {modalHistorialPrecios && (
        <ModalHistorialPrecios
          historial={historialPrecios}
          onClose={() => setModalHistorialPrecios(false)}
        />
      )}

      {/* MODAL RECIBO DE PAGO LIQUIDACIÓN */}
      {reciboModal && (
        <ModalReciboLiquidacion
          datos={reciboModal}
          tasaBcv={tasaBcvActiva}
          onClose={() => setReciboModal(null)}
          onCapturar={ejecutarCaptura}
        />
      )}
    </section>
  );
};

// =========================================================================
// SUBCOMPONENTES RENDER POR CADA REPORTE (1:1 V2_3_11_26)
// =========================================================================

// --- 1. RENDER REPORTE DIARIOS ---
const RenderReporteDiarios: React.FC<{
  data: any;
  fechaDesde: string;
  fechaHasta: string;
  onCapturar: (el: HTMLElement | null, titulo: string) => void;
  onExportarExcel: (html: string, nombre: string) => void;
}> = ({ data, fechaDesde, fechaHasta, onCapturar, onExportarExcel }) => {
  const tablas = [
    { titulo: 'DIARIO RUTAS', items: data?.diarioRutas || [], total: data?.totalDiarioRutas || 0 },
    { titulo: 'DIARIO RECEPTORIAS', items: data?.diarioReceptorias || [], total: data?.totalDiarioReceptorias || 0 },
    { titulo: 'DIARIO TRANSPORTE RUTAS', items: data?.diarioTransporteRutas || [], total: data?.totalDiarioTransporteRutas || 0 },
    { titulo: 'DIARIO TRANSPORTE RECEPTORIAS', items: data?.diarioTransporteReceptorias || [], total: data?.totalDiarioTransporteReceptorias || 0 },
  ];

  return (
    <div className="report-grid-cards">
      {tablas.map((t, idx) => {
        const cardRef = React.createRef<HTMLDivElement>();
        return (
          <div key={idx} ref={cardRef} className="report-card-demarcada">
            <table className="table-reporte-demarcada">
              <thead>
                <tr>
                  <th colSpan={2}>{t.titulo}</th>
                </tr>
                <tr>
                  <th style={{ width: '50%' }}>FECHA</th>
                  <th style={{ width: '50%' }}>LITROS</th>
                </tr>
              </thead>
              <tbody>
                {t.items.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ color: '#94a3b8', fontStyle: 'italic', padding: '16px' }}>
                      Sin registros en este período
                    </td>
                  </tr>
                ) : (
                  t.items.map((it: any, iIdx: number) => (
                    <tr key={iIdx}>
                      <td>{formatearFechaLocal(it.fecha)}</td>
                      <td style={{ fontWeight: 800 }}>{formatearNumero(it.litros)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL</td>
                  <td>{formatearNumero(t.total)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="no-capture" style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-exportar-card"
                onClick={() => {
                  if (cardRef.current) {
                    onExportarExcel(cardRef.current.innerHTML, `${t.titulo.replace(/\s+/g, '_')}_${fechaDesde}_al_${fechaHasta}`);
                  }
                }}
              >
                <i className="fa-solid fa-file-excel"></i> Exportar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onCapturar(cardRef.current, `${t.titulo.replace(/\s+/g, '_')}_${fechaDesde}`)}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-camera"></i> Capturar Imagen
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --- 2. RENDER REPORTE RECEPTORIAS ---
const RenderReporteReceptorias: React.FC<{
  data: any[];
  fechaDesde: string;
  fechaHasta: string;
  tasaBcv: number;
  onCapturar: (el: HTMLElement | null, titulo: string) => void;
  onExportarExcel: (html: string, nombre: string) => void;
}> = ({ data, fechaDesde, fechaHasta, tasaBcv, onCapturar, onExportarExcel }) => {
  const lista = Array.isArray(data) ? data : [];

  if (lista.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
        No se encontraron descargas o entregas en receptorías para el rango seleccionado.
      </div>
    );
  }

  return (
    <div className="report-grid-cards">
      {lista.map((comp: any, idx: number) => {
        const cardRef = React.createRef<HTMLDivElement>();
        const detalle = comp.detalle || [];
        const nom = comp.nombre || comp.companiaNombre || `Receptoría #${comp.id}`;
        const prop = comp.propietario || '';
        const totalLitros = comp.totalLitros || detalle.reduce((acc: number, d: any) => acc + Number(d.litros || 0), 0);
        const precioUSD = Number(comp.precioLitroUSD || 0.85);
        const totalUSD = comp.totalUSD || totalLitros * precioUSD;
        const totalBs = comp.totalBs || totalUSD * tasaBcv;

        return (
          <div key={idx} ref={cardRef} className="report-card-demarcada">
            <table className="table-reporte-demarcada">
              <thead>
                <tr>
                  <th colSpan={3}>
                    {nom.toUpperCase()} {prop ? `- ${prop.toUpperCase()}` : ''}
                  </th>
                </tr>
                <tr>
                  <th style={{ width: '25%' }}>FECHA</th>
                  <th style={{ width: '25%' }}>LITROS</th>
                  <th style={{ width: '50%' }}>OBSERVACION</th>
                </tr>
              </thead>
              <tbody>
                {detalle.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: '#94a3b8', fontStyle: 'italic', padding: '16px' }}>
                      Sin registros en este período
                    </td>
                  </tr>
                ) : (
                  detalle.map((d: any, dIdx: number) => (
                    <tr key={dIdx}>
                      <td>{formatearFechaLocal(d.fecha)}</td>
                      <td style={{ fontWeight: 800 }}>{formatearNumero(d.litros)}</td>
                      <td className="text-left">{(d.observacion || '').replace(/\[ORIGEN_M[OÓ]VIL\]/gi, '').trim() || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL</td>
                  <td>{formatearNumero(totalLitros)}</td>
                  <td>$ {formatearNumero(precioUSD, 4)}</td>
                </tr>
                <tr>
                  <td>Valor Dolar</td>
                  <td>$ {formatearNumero(totalUSD, 2)}</td>
                  <td>&nbsp;</td>
                </tr>
                <tr>
                  <td>Valor Bs</td>
                  <td>Bs. {formatearNumero(totalBs, 2)}</td>
                  <td>Tasa: {formatearNumero(tasaBcv, 4)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="no-capture" style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-exportar-card"
                onClick={() => {
                  if (cardRef.current) {
                    onExportarExcel(cardRef.current.innerHTML, `Receptoria_${nom.replace(/\s+/g, '_')}_${fechaDesde}`);
                  }
                }}
              >
                <i className="fa-solid fa-file-excel"></i> Exportar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onCapturar(cardRef.current, `Receptoria_${nom.replace(/\s+/g, '_')}_${fechaDesde}`)}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-camera"></i> Capturar Imagen
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --- 3. RENDER REPORTE FINCAS (1:1 EXACTO V2_3_11_26) ---
const RenderReporteFincas: React.FC<{
  data: any[];
  fechaDesde: string;
  fechaHasta: string;
  tasaBcv: number;
  mostrarAdelanto: boolean;
  adelantosManuales: Record<number, number>;
  mostrarConsolidadoManual: boolean;
  onToggleAdelanto: () => void;
  onToggleConsolidado: () => void;
  onCapturar: (el: HTMLElement | null, titulo: string) => void;
  onExportarExcel: (html: string, nombre: string) => void;
  onAjustarPrecioAcida: (id: number, nombre: string) => void;
  onAjustarAdelantoManual: (id: number, nombre: string, actual: number) => void;
}> = ({
  data,
  fechaDesde,
  fechaHasta,
  tasaBcv,
  mostrarAdelanto,
  adelantosManuales,
  mostrarConsolidadoManual,
  onToggleAdelanto,
  onToggleConsolidado,
  onCapturar,
  onExportarExcel,
  onAjustarPrecioAcida,
  onAjustarAdelantoManual,
}) => {
  const hasBufala = useAuthStore((state) => state.hasTenantModule('MOD_LECHE_BUFALA'));
  const fincasList = Array.isArray(data) ? data : [];
  const consolidadoCardRef = useRef<HTMLDivElement>(null);
  const reporteContainerRef = useRef<HTMLDivElement>(null);

  if (fincasList.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
        <i className="fa-solid fa-cow" style={{ fontSize: '32px', marginBottom: '10px', display: 'block', color: '#94a3b8' }}></i>
        No se encontraron registros de recolección en fincas en el rango seleccionado ({formatearFechaLocal(fechaDesde)} al {formatearFechaLocal(fechaHasta)}).
      </div>
    );
  }

  // Desglose de cada finca según algoritmo exacto 1:1 V2_3_11_26
  const cardsArray = fincasList.map((finca: any) => {
    const detalle = finca.detalle || finca.Detalle || [];
    let totalLitrosBuena = 0;
    let totalLitrosMala = 0;

    detalle.forEach((d: any) => {
      const obs = (d.observacion || d.Observacion || '').toUpperCase();
      const isAcida = Boolean(d.esAcida) || obs.includes('ACID') || obs.includes('MALA') || String(d.tipoLeche || '').includes('ACID');
      const lts = Number(d.litros || d.Litros || 0);

      if (isAcida) {
        totalLitrosMala += lts;
      } else {
        totalLitrosBuena += lts;
      }
    });

    const nomOriginal = (finca.nombre || finca.Nombre || '').trim();
    const soloNombreFinca = nomOriginal.split(' - ')[0].split(' (')[0].trim().toUpperCase();
    const precioBuena = Number(finca.precioLitroUSD ?? finca.PrecioLitroUSD ?? 0);
    const tienePrecioAcida = Number(finca.precioLitroAcidaUSD || finca.PrecioLitroAcidaUSD || 0) > 0;
    const precioMala = tienePrecioAcida ? Number(finca.precioLitroAcidaUSD || finca.PrecioLitroAcidaUSD) : 0.65;
    const tasaFinca = Number(finca.tasaBcv || finca.TasaBcv || tasaBcv || 0);

    const usdBuena = totalLitrosBuena * precioBuena;
    const usdMala = totalLitrosMala * (tienePrecioAcida ? precioMala : 0);
    const fincaTotalUSD = usdBuena + usdMala;
    const fincaTotalBs = fincaTotalUSD * tasaFinca;

    // Cálculo de Adelantos (Automático o Manual Ajustado)
    const adelantoManual = adelantosManuales[finca.id] !== undefined
      ? adelantosManuales[finca.id]
      : Number(finca.totalAdelantosUSD || finca.TotalAdelantosUSD || 0);

    const adelantoUSD = adelantoManual;
    const adelantoBs = (Number(finca.totalAdelantosBs || 0) > 0 && adelantosManuales[finca.id] === undefined)
      ? Number(finca.totalAdelantosBs)
      : (adelantoUSD * tasaFinca);

    const fincaNetoUSD = Math.max(0, fincaTotalUSD - adelantoUSD);
    const fincaNetoBs = Math.max(0, fincaTotalBs - adelantoBs);

    const nomNorm = nomOriginal.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const esBufala = hasBufala && (nomOriginal.includes('(Búfala)') || nomOriginal.includes('(Bufala)') || nomNorm.includes('BUFAL') || (precioBuena === 0 && Number(finca.precioBufalaLitroUSD || finca.PrecioBufalaLitroUSD || 0) > 0));

    return {
      id: String(finca.id ?? finca.Id ?? ''),
      numericId: Number(finca.id ?? finca.Id ?? 0),
      raw: finca,
      nombreOriginal: nomOriginal,
      soloNombreFinca,
      propietario: (finca.propietario || finca.Propietario || '').trim().toUpperCase(),
      esBufala,
      detalle,
      totalLitrosBuena,
      totalLitrosMala,
      totalLitros: totalLitrosBuena + totalLitrosMala,
      precioBuena,
      tienePrecioAcida,
      precioMala,
      tasaBCV: tasaFinca,
      usdBuena,
      usdMala,
      fincaTotalUSD,
      fincaTotalBs,
      adelantoUSD,
      adelantoBs,
      fincaNetoUSD,
      fincaNetoBs,
    };
  });

  const cardObj1 = cardsArray[0] || null;
  const cardObj2 = cardsArray[1] || null;
  const tieneDosTablas = Boolean(cardObj1 && cardObj2);

  // Grand Totals Consolidados (1:1 V2_3_11_26) - Sumar estrictamente las 2 fincas seleccionadas
  let grandTotalLitrosBuena = 0;
  let grandTotalLitrosMala = 0;
  let grandTotalUSD = 0;
  let grandTotalBs = 0;
  let grandTotalAdelantosUSD = 0;
  let grandTotalAdelantosBs = 0;

  const fincasParaConsolidar = tieneDosTablas ? [cardObj1, cardObj2].filter(Boolean) : cardsArray;
  fincasParaConsolidar.forEach((f) => {
    grandTotalLitrosBuena += f.totalLitrosBuena;
    grandTotalLitrosMala += f.totalLitrosMala;
    grandTotalUSD += f.fincaTotalUSD;
    grandTotalBs += f.fincaTotalBs;
    grandTotalAdelantosUSD += f.adelantoUSD;
    grandTotalAdelantosBs += f.adelantoBs;
  });

  const consolidadoNetoUSD = Math.max(0, grandTotalUSD - grandTotalAdelantosUSD);
  const consolidadoNetoBs = Math.max(0, grandTotalBs - grandTotalAdelantosBs);

  const saldoDeudaUSD = grandTotalAdelantosUSD > grandTotalUSD ? (grandTotalAdelantosUSD - grandTotalUSD) : 0;
  const saldoDeudaBs = grandTotalAdelantosBs > grandTotalBs ? (grandTotalAdelantosBs - grandTotalBs) : 0;
  const tieneSaldoDeudor = saldoDeudaUSD > 0.001 || saldoDeudaBs > 0.01;
  const tieneGrandTotalMala = grandTotalLitrosMala > 0;

  const prop1 = (cardObj1?.propietario || '').trim().toUpperCase();
  const prop2 = (cardObj2?.propietario || '').trim().toUpperCase();
  const cleanNom1 = (cardObj1?.nombreOriginal || '').replace(/BUFALA|BUFALO|\(VACA\)|\(BUFALA\)/gi, '').trim().toUpperCase();
  const cleanNom2 = (cardObj2?.nombreOriginal || '').replace(/BUFALA|BUFALO|\(VACA\)|\(BUFALA\)/gi, '').trim().toUpperCase();
  const sonMismoPropietario = Boolean(cardObj1 && cardObj2 && (
    (prop1 !== '' && prop1 === prop2) ||
    (cleanNom1.length > 3 && cleanNom1 === cleanNom2)
  ));

  let objVaca: any = null;
  let objBufala: any = null;
  if (cardObj1?.esBufala && !cardObj2?.esBufala) {
    objBufala = cardObj1;
    objVaca = cardObj2;
  } else if (cardObj2?.esBufala && !cardObj1?.esBufala) {
    objBufala = cardObj2;
    objVaca = cardObj1;
  }
  const esCasoVacaBufala = hasBufala && Boolean(objVaca && objBufala);

  const consolidadoTitulo = esCasoVacaBufala
    ? `LIQUIDACIÓN CONSOLIDADA (VACA + BÚFALA) • ${cardObj1?.propietario || cleanNom1}`
    : (sonMismoPropietario 
        ? `SUMA TOTAL CONSOLIDADA EN BS • ${cardObj1?.propietario || cleanNom1}`
        : 'SUMA TOTAL CONSOLIDADA EN BS (AMBAS FINCAS)');

  const mostrarConsolidadoCard = tieneDosTablas && (sonMismoPropietario || mostrarConsolidadoManual);

  return (
    <div ref={reporteContainerRef}>
      {/* 1:1 ACTION HEADER IDENTICO A V2_3_11_26 */}
      <div
        className="report-action-header no-capture"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          padding: '14px 20px',
          borderRadius: '12px',
          marginBottom: '18px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              background: '#eff6ff',
              color: '#2563eb',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            <i className="fa-solid fa-cow"></i>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
              Reporte de Fincas ({formatearFechaLocal(fechaDesde)} al {formatearFechaLocal(fechaHasta)})
            </div>
            <small style={{ color: sonMismoPropietario ? '#047857' : '#64748b', fontSize: '12px', fontWeight: 700 }}>
              {tieneDosTablas ? (
                sonMismoPropietario ? (
                  <>
                    <i className="fa-solid fa-circle-check" style={{ color: '#047857', marginRight: '4px' }}></i>
                    {esCasoVacaBufala ? 'Reporte Separado de Leche (VACA + BÚFALA)' : 'Fincas del Mismo Propietario'} ({cardObj1?.propietario || cleanNom1})
                  </>
                ) : (
                  'Comparativa de 2 Fincas (Propietarios Distintos)'
                )
              ) : (
                'Vista de Recolección Individual'
              )}
            </small>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            id="btnToggleAdelantoFincas"
            onClick={onToggleAdelanto}
            style={{
              background: mostrarAdelanto ? 'linear-gradient(135deg, #d97706, #b45309)' : 'linear-gradient(135deg, #475569, #334155)',
              color: '#ffffff',
              fontWeight: 800,
              padding: '9px 18px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
            title="Activar / Desactivar cálculo de adelantos en el reporte"
          >
            <i className="fa-solid fa-hand-holding-dollar"></i> {mostrarAdelanto ? 'Adelanto: ACTIVADO' : 'Mostrar Adelanto (Opcional)'}
          </button>

          {tieneDosTablas && (
            <>
              {!sonMismoPropietario && (
                <button
                  type="button"
                  className="btn"
                  id="btnSumarTotalesOpcional"
                  onClick={onToggleConsolidado}
                  style={{
                    background: 'linear-gradient(135deg, #047857, #065f46)',
                    color: '#ffffff',
                    fontWeight: 800,
                    padding: '9px 18px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(4,120,87,0.3)',
                  }}
                >
                  <i className={`fa-solid ${mostrarConsolidadoManual ? 'fa-eye-slash' : 'fa-calculator'}`}></i>
                  {mostrarConsolidadoManual ? 'Ocultar Suma' : 'Sumar Totales (Opcional)'}
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => window.print()}
                style={{
                  background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                  color: '#ffffff',
                  fontWeight: 800,
                  padding: '9px 18px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(15,23,42,0.3)',
                }}
              >
                <i className="fa-solid fa-print"></i> Imprimir Ambas Tablas
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => onCapturar(reporteContainerRef.current, `Consolidado_Fincas_${fechaDesde}_al_${fechaHasta}`)}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  color: '#ffffff',
                  fontWeight: 800,
                  padding: '9px 18px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
                }}
              >
                <i className="fa-solid fa-camera"></i> Capturar Imagen Ambas
              </button>
            </>
          )}
        </div>
      </div>

      {/* GRID DE TABLAS INDIVIDUALES (1:1 V2_3_11_26) */}
      <div className="report-grid-cards" style={{ display: 'grid', gridTemplateColumns: tieneDosTablas ? 'repeat(auto-fit, minmax(420px, 1fr))' : '1fr', gap: '20px' }}>
        {[cardObj1, cardObj2].filter(Boolean).map((finca) => {
          const cardRef = React.createRef<HTMLDivElement>();
          const tieneLecheMala = finca.totalLitrosMala > 0;
          const tieneAdelantoEstaFinca = finca.adelantoUSD > 0;

          const cardHeaderBg = finca.esBufala
            ? 'linear-gradient(135deg, #065f46 0%, #047857 100%)'
            : 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)';

          return (
            <div
              key={finca.id}
              ref={cardRef}
              className="report-card-demarcada"
              style={{
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                marginBottom: '24px',
                overflow: 'hidden',
              }}
            >
              <div className="table-responsive" style={{ margin: 0, border: 'none' }}>
                <table className="table-reporte-demarcada" style={{ width: '100%', marginBottom: 0, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th
                        colSpan={3}
                        style={{
                          background: cardHeaderBg,
                          color: '#ffffff',
                          fontSize: '15px',
                          fontWeight: 900,
                          textAlign: 'center',
                          padding: '12px 14px',
                          letterSpacing: '0.03em',
                          border: '2px solid #000000',
                        }}
                      >
                        <span style={{ color: '#ffffff', fontWeight: 900, fontSize: '15px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          {finca.soloNombreFinca} ({finca.esBufala ? 'LECHE DE BÚFALA' : 'LECHE DE VACA'})
                        </span>
                      </th>
                    </tr>
                    <tr style={{ background: '#e2e8f0', color: '#000000', fontWeight: 900, fontSize: '12px' }}>
                      <th style={{ width: '33%', textAlign: 'center', padding: '9px 8px', background: '#e2e8f0', color: '#000000', fontWeight: 900, border: '1.5px solid #000000' }}>
                        FECHA
                      </th>
                      <th style={{ width: '33%', textAlign: 'center', padding: '9px 8px', background: '#e2e8f0', color: '#000000', fontWeight: 900, border: '1.5px solid #000000' }}>
                        LITROS
                      </th>
                      <th style={{ width: '34%', textAlign: 'center', padding: '9px 8px', background: '#e2e8f0', color: '#000000', fontWeight: 900, border: '1.5px solid #000000' }}>
                        OBSERVACION
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {finca.detalle.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ color: '#94a3b8', fontStyle: 'italic', padding: '16px', textAlign: 'center', border: '1px solid #000000' }}>
                          Sin registros en este período
                        </td>
                      </tr>
                    ) : (
                      finca.detalle.map((d: any, dIdx: number) => {
                        const obs = (d.observacion || d.Observacion || '').toUpperCase();
                        const isAcida = Boolean(d.esAcida) || obs.includes('ACID') || obs.includes('MALA') || String(d.tipoLeche || '').includes('ACID');
                        let obsLimpia = (d.observacion || d.Observacion || '')
                          .replace(/\[ORIGEN_M[OÓ]VIL\]/gi, '')
                          .replace(/\[\s*BUFAL[AO]\s*\]/gi, '')
                          .replace(/\bBUFAL[AO]\b/gi, '')
                          .trim();
                        let obsDisplay = obsLimpia;
                        if (isAcida) {
                          if (!obsLimpia.toUpperCase().includes('ACID') && !obsLimpia.toUpperCase().includes('MALA')) {
                            obsDisplay = obsLimpia ? `ÁCIDA - ${obsLimpia}` : 'ÁCIDA';
                          }
                        }

                        return (
                          <tr key={dIdx} style={{ borderBottom: '1px solid #000000' }}>
                            <td style={{ fontWeight: 700, color: '#000000', textAlign: 'center', border: '1px solid #000000', padding: '8px 10px' }}>
                              {formatearFechaLocal(d.fecha)}
                            </td>
                            <td style={{ fontWeight: 900, color: '#000000', textAlign: 'center', border: '1px solid #000000', padding: '8px 10px' }}>
                              {formatearNumero(Number(d.litros || d.Litros || 0))}
                            </td>
                            <td
                              style={{
                                color: isAcida ? '#dc2626' : '#000000',
                                fontWeight: isAcida ? 900 : 700,
                                textAlign: 'left',
                                border: '1px solid #000000',
                                padding: '8px 10px',
                              }}
                            >
                              {obsDisplay || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* TFOOT EXACTO 1:1 V2_3_11_26 CON COLOR CORPORATIVO #047857 */}
                  <tfoot style={{ background: '#047857', color: '#ffffff', fontWeight: 800 }}>
                    <tr style={{ borderTop: '1.5px solid #000000' }}>
                      <td style={{ color: '#ffffff', fontWeight: 800, textAlign: 'left', padding: '7px 10px', border: '1px solid #000000' }}>
                        {tieneLecheMala ? 'TOTAL BUENA' : 'TOTAL'}
                      </td>
                      <td style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff', textAlign: 'center', padding: '7px 10px', border: '1px solid #000000' }}>
                        {formatearNumero(finca.totalLitrosBuena)}
                      </td>
                      <td style={{ fontWeight: 800, color: '#ffffff', textAlign: 'right', padding: '7px 10px', border: '1px solid #000000' }}>
                        $ {formatearNumero(finca.precioBuena, 2)} / Lt
                      </td>
                    </tr>

                    {tieneLecheMala && (
                      <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                        <td style={{ color: '#fef08a', fontWeight: 800, textAlign: 'left', padding: '7px 10px', border: '1px solid #000000' }}>
                          TOTAL MALA/ACIDA
                        </td>
                        <td style={{ fontSize: '13.5px', fontWeight: 800, color: '#fef08a', textAlign: 'center', padding: '7px 10px', border: '1px solid #000000' }}>
                          {formatearNumero(finca.totalLitrosMala)}
                        </td>
                        <td style={{ fontWeight: 800, color: '#fef08a', textAlign: 'right', padding: '7px 10px', border: '1px solid #000000' }}>
                          {finca.tienePrecioAcida ? (
                            formatearNumero(finca.precioMala, 2)
                          ) : (
                            <button
                              type="button"
                              className="no-capture"
                              onClick={() => onAjustarPrecioAcida(finca.numericId, finca.soloNombreFinca)}
                              style={{
                                background: '#f59e0b',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 800,
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 4px rgba(245,158,11,0.3)',
                              }}
                              title="Agregar precio de leche ácida"
                            >
                              <i className="fa-solid fa-plus-circle"></i> Agregar Precio
                            </button>
                          )}
                        </td>
                      </tr>
                    )}

                    <tr>
                      <td style={{ color: '#ffffff', fontWeight: 800, textAlign: 'left', padding: '7px 10px', border: '1px solid #000000' }}>
                        {mostrarAdelanto && tieneAdelantoEstaFinca ? 'Valor Dólar Bruto' : 'Valor Dolar'}
                      </td>
                      <td style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff', textAlign: 'center', padding: '7px 10px', border: '1px solid #000000' }}>
                        {formatearNumero(finca.fincaTotalUSD, 2)}
                      </td>
                      <td style={{ border: '1px solid #000000' }}>&nbsp;</td>
                    </tr>

                    {mostrarAdelanto && tieneAdelantoEstaFinca && (
                      <tr style={{ background: 'rgba(220, 38, 38, 0.28)', borderTop: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                        <td style={{ color: '#fee2e2', fontWeight: 900, textAlign: 'left', padding: '7px 10px', border: '1px solid #000000' }}>
                          <i className="fa-solid fa-circle-minus" style={{ color: '#f87171', marginRight: '3px' }}></i> (-) Adelanto USD
                          <button
                            type="button"
                            className="no-capture"
                            onClick={() => onAjustarAdelantoManual(finca.numericId, finca.soloNombreFinca, finca.adelantoUSD)}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #fca5a5',
                              color: '#dc2626',
                              fontSize: '10px',
                              fontWeight: 800,
                              borderRadius: '4px',
                              padding: '2px 6px',
                              marginLeft: '6px',
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            }}
                            title="Editar monto de adelanto"
                          >
                            <i className="fa-solid fa-pen"></i>
                          </button>
                        </td>
                        <td style={{ textAlign: 'center', padding: '7px 10px', border: '1px solid #000000' }}>
                          <span
                            style={{
                              background: '#ffffff',
                              color: '#dc2626',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontWeight: 900,
                              fontSize: '13.5px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              display: 'inline-block',
                            }}
                          >
                            -{formatearNumero(finca.adelantoUSD, 2)}
                          </span>
                        </td>
                        <td style={{ fontSize: '11.5px', fontWeight: 800, color: '#ffffff', textAlign: 'right', padding: '7px 10px', border: '1px solid #000000' }}>
                          Neto: ${formatearNumero(finca.fincaNetoUSD, 2)}
                        </td>
                      </tr>
                    )}

                    <tr>
                      <td style={{ color: '#ffffff', fontWeight: 800, textAlign: 'left', padding: '7px 10px', border: '1px solid #000000' }}>
                        {mostrarAdelanto && tieneAdelantoEstaFinca ? 'Valor Bs Bruto' : 'Valor Bs'}
                      </td>
                      <td style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff', textAlign: 'center', padding: '7px 10px', border: '1px solid #000000' }}>
                        {formatearNumero(finca.fincaTotalBs, 2)}
                      </td>
                      <td style={{ fontWeight: 800, color: '#ffffff', textAlign: 'right', padding: '7px 10px', border: '1px solid #000000' }}>
                        {formatearNumero(finca.tasaBCV, 4)}
                      </td>
                    </tr>

                    {mostrarAdelanto && (
                      <tr style={{ borderTop: '2px solid #000000', borderBottom: '2px solid #000000', background: 'rgba(0,0,0,0.32)' }}>
                        <td style={{ color: '#6ee7b7', fontWeight: 900, textAlign: 'left', padding: '8px 10px', fontSize: '13.5px', border: '1px solid #000000' }}>
                          TOTAL NETO BS
                        </td>
                        <td style={{ fontSize: '15px', fontWeight: 900, color: '#6ee7b7', textAlign: 'center', padding: '8px 10px', border: '1px solid #000000' }}>
                          {formatearNumero(tieneAdelantoEstaFinca ? finca.fincaNetoBs : finca.fincaTotalBs, 2)}
                        </td>
                        {tieneAdelantoEstaFinca ? (
                          <td style={{ textAlign: 'right', padding: '8px 10px', border: '1px solid #000000' }}>
                            <span
                              style={{
                                background: '#ffffff',
                                color: '#dc2626',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontWeight: 900,
                                fontSize: '12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                display: 'inline-block',
                              }}
                            >
                              (-) {formatearNumero(finca.adelantoBs, 2)} Bs
                            </span>
                          </td>
                        ) : (
                          <td style={{ border: '1px solid #000000' }}>&nbsp;</td>
                        )}
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              {/* ACCIONES DE CADA CARD */}
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-exportar-card no-capture"
                  onClick={() => {
                    if (cardRef.current) {
                      onExportarExcel(cardRef.current.innerHTML, `Finca_${finca.soloNombreFinca}_${fechaDesde}`);
                    }
                  }}
                  title={`Exportar ${finca.soloNombreFinca} a Excel`}
                  style={{
                    background: '#059669',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '7px 15px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                  }}
                >
                  <i className="fa-solid fa-file-excel"></i> Exportar
                </button>
                <button
                  type="button"
                  className="btn-captura-card no-capture"
                  onClick={() => onCapturar(cardRef.current, `Finca_${finca.soloNombreFinca}_${fechaDesde}`)}
                  title={`Capturar imagen de la tabla ${finca.soloNombreFinca}`}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '7px 15px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
                  }}
                >
                  <i className="fa-solid fa-camera"></i> Capturar Imagen
                </button>
                {mostrarAdelanto && finca.adelantoUSD > 0 && (
                  <button
                    type="button"
                    className="no-capture"
                    onClick={() => onAjustarAdelantoManual(finca.numericId, finca.soloNombreFinca, finca.adelantoUSD)}
                    style={{
                      background: '#fffbeb',
                      color: '#b45309',
                      border: '1px solid #fde68a',
                      fontWeight: 800,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Ver Detalle de Adelanto"
                  >
                    <i className="fa-solid fa-receipt"></i> Adelanto: ${formatearNumero(finca.adelantoUSD, 2)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* TARJETA CONSOLIDADA (1:1 EXACTO V2_3_11_26) */}
      {mostrarConsolidadoCard && (
        <div
          ref={consolidadoCardRef}
          id="cardConsolidadoAmbasFincas"
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            border: '2px solid #047857',
            color: '#ffffff',
            padding: '20px 24px',
            borderRadius: '12px',
            marginTop: '20px',
            boxShadow: '0 4px 14px rgba(4,120,87,0.3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
              borderBottom: '1px solid rgba(255,255,255,0.25)',
              paddingBottom: '10px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <h3
              style={{
                color: '#ffffff',
                fontSize: '16.5px',
                margin: 0,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <i className="fa-solid fa-calculator" style={{ color: '#a7f3d0' }}></i> {consolidadoTitulo}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  padding: '5px 14px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              >
                Tasa BCV: {formatearNumero(tasaBcv, 4)} Bs/USD
              </span>
              <button
                type="button"
                className="btn btn-sm no-capture"
                onClick={() => onCapturar(consolidadoCardRef.current, `Consolidado_Ambas_Fincas_${fechaDesde}`)}
                style={{
                  background: 'rgba(255,255,255,0.25)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.4)',
                  fontWeight: 800,
                  padding: '5px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-camera"></i> Capturar Consolidado
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: esCasoVacaBufala
                ? mostrarAdelanto
                  ? 'repeat(auto-fit, minmax(180px, 1fr))'
                  : 'repeat(auto-fit, minmax(180px, 1fr))'
                : 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
              textAlign: 'center',
            }}
          >
            {esCasoVacaBufala ? (
              <>
                <div
                  style={{
                    background: 'rgba(30,64,175,0.25)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1.5px solid rgba(147,197,253,0.4)',
                  }}
                >
                  <small style={{ color: '#bfdbfe', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                    <i className="fa-solid fa-cow"></i> Litros VACA
                  </small>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    {formatearNumero(objVaca.totalLitros)} Lts
                  </div>
                  <small style={{ fontSize: '10.5px', color: '#bfdbfe', fontWeight: 700 }}>
                    ${formatearNumero(objVaca.fincaTotalUSD, 2)}
                  </small>
                </div>
                <div
                  style={{
                    background: 'rgba(6,95,70,0.3)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1.5px solid rgba(167,243,208,0.4)',
                  }}
                >
                  <small style={{ color: '#a7f3d0', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                    <i className="fa-solid fa-leaf"></i> Litros BÚFALA
                  </small>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    {formatearNumero(objBufala.totalLitros)} Lts
                  </div>
                  <small style={{ fontSize: '10.5px', color: '#a7f3d0', fontWeight: 700 }}>
                    ${formatearNumero(objBufala.fincaTotalUSD, 2)}
                  </small>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  <small style={{ color: '#a7f3d0', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase' }}>
                    {tieneGrandTotalMala ? 'Total Litros Buena' : 'Total Litros'}
                  </small>
                  <div style={{ fontSize: '19px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    {formatearNumero(grandTotalLitrosBuena)} Lts
                  </div>
                </div>

                {tieneGrandTotalMala && (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    <small style={{ color: '#fca5a5', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase' }}>
                      Total Litros Mala / Ácida
                    </small>
                    <div style={{ fontSize: '19px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                      {formatearNumero(grandTotalLitrosMala)} Lts
                    </div>
                  </div>
                )}
              </>
            )}

            <div
              style={{
                background: 'rgba(255,255,255,0.12)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <small style={{ color: '#93c5fd', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase' }}>
                {mostrarAdelanto ? 'Total Bruto USD' : 'Total Consolidado USD'}
              </small>
              <div style={{ fontSize: '19px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                ${formatearNumero(grandTotalUSD, 2)}
              </div>
              <small style={{ fontSize: '10.5px', color: '#bfdbfe', fontWeight: 700 }}>
                Bs. {formatearNumero(grandTotalBs, 2)}
              </small>
            </div>

            {mostrarAdelanto && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.22)',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1.5px solid rgba(248,113,113,0.35)',
                }}
              >
                <small style={{ color: '#fecaca', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase' }}>
                  (-) Total Adelantos
                </small>
                <div style={{ fontSize: '17px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                  -${formatearNumero(grandTotalAdelantosUSD, 2)}
                </div>
                <small style={{ fontSize: '10.5px', color: '#fecaca', fontWeight: 700 }}>
                  -Bs. {formatearNumero(grandTotalAdelantosBs, 2)}
                </small>
                {tieneSaldoDeudor && (
                  <div
                    style={{
                      marginTop: '5px',
                      paddingTop: '5px',
                      borderTop: '1px dashed rgba(254,202,202,0.4)',
                      fontSize: '11px',
                      color: '#fef08a',
                      fontWeight: 800,
                    }}
                  >
                    Deuda Restante: -${formatearNumero(saldoDeudaUSD, 2)}
                    <br />
                    <span style={{ fontSize: '10px', color: '#fca5a5' }}>
                      (-Bs. {formatearNumero(saldoDeudaBs, 2)})
                    </span>
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                background: tieneSaldoDeudor
                  ? 'rgba(220,38,38,0.35)'
                  : mostrarAdelanto
                  ? 'rgba(255,255,255,0.32)'
                  : 'rgba(255,255,255,0.28)',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${tieneSaldoDeudor ? '#fca5a5' : '#ffffff'}`,
              }}
            >
              <small style={{ color: '#fef08a', fontSize: '11.5px', fontWeight: 900, textTransform: 'uppercase' }}>
                {mostrarAdelanto ? 'TOTAL NETO A PAGAR BS' : 'TOTAL MONTO BS'}
              </small>
              <div style={{ fontSize: '21px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                Bs. {formatearNumero(mostrarAdelanto ? consolidadoNetoBs : grandTotalBs, 2)}
              </div>
              {mostrarAdelanto && (
                tieneSaldoDeudor ? (
                  <div style={{ fontSize: '11px', color: '#fee2e2', fontWeight: 800, marginTop: '3px' }}>
                    <i className="fa-solid fa-triangle-exclamation"></i> SALDO DEUDOR (-Bs. {formatearNumero(saldoDeudaBs, 2)})
                  </div>
                ) : (
                  <small style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: 800 }}>
                    (Bruto Total: Bs. {formatearNumero(grandTotalBs, 2)})
                  </small>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 4. RENDER REPORTE CHOFERES ---
const RenderReporteChoferes: React.FC<{
  data: any[];
  fechaDesde: string;
  fechaHasta: string;
  onCapturar: (el: HTMLElement | null, titulo: string) => void;
  onExportarExcel: (html: string, nombre: string) => void;
}> = ({ data, fechaDesde, fechaHasta, onCapturar, onExportarExcel }) => {
  const choferesList = Array.isArray(data) ? data : [];

  if (choferesList.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
        No se encontraron registros de balance para los choferes en el rango seleccionado.
      </div>
    );
  }

  return (
    <div className="report-grid-cards">
      {choferesList.map((ch: any, idx: number) => {
        const cardRef = React.createRef<HTMLDivElement>();
        const detalle = ch.detalle || [];
        const nom = ch.nombre || `Chofer #${ch.id}`;
        const totalLitros = ch.totalLitros || 0;

        return (
          <div key={idx} ref={cardRef} className="report-card-demarcada">
            <table className="table-reporte-demarcada">
              <thead>
                <tr>
                  <th colSpan={3} style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', color: '#ffffff' }}>
                    {nom.toUpperCase()}
                  </th>
                </tr>
                <tr>
                  <th style={{ width: '30%' }}>FECHA</th>
                  <th style={{ width: '35%' }}>LITROS</th>
                  <th style={{ width: '35%' }}>OBSERVACION</th>
                </tr>
              </thead>
              <tbody>
                {detalle.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: '#94a3b8', fontStyle: 'italic', padding: '16px' }}>
                      Sin registros en este período
                    </td>
                  </tr>
                ) : (
                  detalle.map((d: any, dIdx: number) => {
                    const lts = Number(d.litros || 0);
                    let bgCol = '';
                    let textCol = '#334155';
                    let txt = '0';
                    if (lts < 0) {
                      bgCol = '#fee2e2';
                      textCol = '#dc2626';
                      txt = `-${formatearNumero(Math.abs(lts))}`;
                    } else if (lts > 0) {
                      bgCol = '#dcfce7';
                      textCol = '#16a34a';
                      txt = `+${formatearNumero(lts)}`;
                    }

                    return (
                      <tr key={dIdx}>
                        <td>{formatearFechaLocal(d.fecha)}</td>
                        <td style={{ background: bgCol, color: textCol, fontWeight: 800 }}>{txt}</td>
                        <td className="text-left">{(d.observacion || '').replace(/\[ORIGEN_M[OÓ]VIL\]/gi, '').trim()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL</td>
                  <td
                    style={{
                      background: totalLitros < 0 ? '#ef4444' : totalLitros > 0 ? '#10b981' : '#64748b',
                      color: '#ffffff',
                      fontWeight: 900,
                    }}
                  >
                    {totalLitros > 0 ? `+${formatearNumero(totalLitros)}` : formatearNumero(totalLitros)}
                  </td>
                  <td>&nbsp;</td>
                </tr>
              </tfoot>
            </table>

            <div className="no-capture" style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-exportar-card"
                onClick={() => {
                  if (cardRef.current) {
                    onExportarExcel(cardRef.current.innerHTML, `Chofer_${nom.replace(/\s+/g, '_')}_${fechaDesde}`);
                  }
                }}
              >
                <i className="fa-solid fa-file-excel"></i> Exportar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onCapturar(cardRef.current, `Chofer_${nom.replace(/\s+/g, '_')}_${fechaDesde}`)}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-camera"></i> Capturar Imagen
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --- 5. RENDER REPORTE BANCOS (1:1 V2_3_11_26) ---
const RenderReporteBancos: React.FC<{
  data: any[];
  fechaDesde: string;
  fechaHasta: string;
  tasaBcv: number;
  pagosMarcados: Record<number, boolean>;
  onTogglePago: (fincaId: number, isChecked: boolean, fInfo: any) => void;
  onVerRecibo: (rec: any) => void;
  onCapturar: (el: HTMLElement | null, titulo: string) => void;
  onExportarExcel: (html: string, nombre: string) => void;
}> = ({ data, fechaDesde, fechaHasta, tasaBcv, pagosMarcados, onTogglePago, onVerRecibo, onCapturar, onExportarExcel }) => {
  const fincas = Array.isArray(data) ? data : [];

  // Agrupar por Banco
  const bancosMap = useMemo(() => {
    const map = new Map<string, any[]>();
    fincas.forEach((item) => {
      const b = item.bancoNombre || item.BancoNombre || 'SIN BANCO ASIGNADO';
      const arr = map.get(b) || [];
      arr.push(item);
      map.set(b, arr);
    });
    return map;
  }, [fincas]);

  if (fincas.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
        No se encontraron registros de dispersión bancaria para el período seleccionado.
      </div>
    );
  }

  let grandTotalLitros = 0;
  let grandTotalUSD = 0;
  let grandTotalAdelUSD = 0;
  let grandTotalNetoBs = 0;

  return (
    <div>
      {Array.from(bancosMap.entries()).map(([bancoNombre, items], bIdx) => {
        const bancoCardRef = React.createRef<HTMLDivElement>();

        let subLitros = 0;
        let subUSD = 0;
        let subAdelUSD = 0;
        let subNetoBs = 0;

        items.forEach((f) => {
          const lts = Number(f.totalLitros || 0);
          const usd = Number(f.totalUSD || 0);
          const adel = Number(f.totalAdelantosUSD || 0);
          const neto = Number(f.totalNetoBs || f.totalBs || 0);

          subLitros += lts;
          subUSD += usd;
          subAdelUSD += adel;
          subNetoBs += neto;

          grandTotalLitros += lts;
          grandTotalUSD += usd;
          grandTotalAdelUSD += adel;
          grandTotalNetoBs += neto;
        });

        const pagadosCount = items.filter((f) => pagosMarcados[f.fincaId || f.id] ?? (f.esPagado || f.pagado)).length;

        return (
          <div
            key={bIdx}
            ref={bancoCardRef}
            className="content-card"
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              padding: '16px 20px',
              marginBottom: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            {/* Cabecera del Banco */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#ffffff',
                padding: '12px 18px',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="fa-solid fa-building-columns" style={{ fontSize: '16px' }}></i>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
                  BANCO: {bancoNombre.toUpperCase()}
                </h3>
                <span
                  style={{
                    background: pagadosCount === items.length ? '#10b981' : 'rgba(255,255,255,0.2)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {pagadosCount} de {items.length} Pagados
                </span>
              </div>

              <div className="no-capture" style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={() => {
                    if (bancoCardRef.current) {
                      onExportarExcel(bancoCardRef.current.innerHTML, `Banco_${bancoNombre}_${fechaDesde}`);
                    }
                  }}
                  style={{ background: '#10b981', border: 'none', fontWeight: 800, color: '#fff', padding: '4px 10px', borderRadius: '5px' }}
                >
                  <i className="fa-solid fa-file-excel"></i> Exportar Banco
                </button>
              </div>
            </div>

            {/* Tabla Bancaria */}
            <div style={{ overflowX: 'auto' }}>
              <table className="table-reporte-demarcada" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>FINCA</th>
                    <th>PROPIETARIO</th>
                    <th>C.I. / RIF</th>
                    <th>N° DE CUENTA</th>
                    <th>LITROS</th>
                    <th>PRECIO ($)</th>
                    <th>TOTAL ($)</th>
                    <th>ADEL. ($)</th>
                    <th>NETO (BS)</th>
                    <th className="no-capture">¿PAGADO?</th>
                    <th className="no-capture">RECIBO</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f: any, idx: number) => {
                    const fId = f.fincaId || f.id;
                    const estaPagado = pagosMarcados[fId] ?? (f.esPagado || f.pagado);

                    return (
                      <tr key={idx} style={{ background: estaPagado ? '#f0fdf4' : '' }}>
                        <td className="text-left" style={{ fontWeight: 800, textDecoration: estaPagado ? 'line-through' : 'none' }}>
                          {f.fincaNombre || f.nombre}
                        </td>
                        <td className="text-left">{f.propietario || '-'}</td>
                        <td style={{ fontFamily: 'monospace' }}>{f.cedulaRIF || f.cedula || '-'}</td>
                        <td style={{ fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 700 }}>
                          {f.numeroCuenta || '-'}
                        </td>
                        <td style={{ fontWeight: 800 }}>{formatearNumero(f.totalLitros)}</td>
                        <td>${formatearNumero(f.precioLitroUSD || 0.82, 4)}</td>
                        <td style={{ color: '#047857', fontWeight: 800 }}>${formatearNumero(f.totalUSD, 2)}</td>
                        <td style={{ color: '#e11d48' }}>
                          {Number(f.totalAdelantosUSD || 0) > 0 ? `-$${formatearNumero(f.totalAdelantosUSD, 2)}` : '-'}
                        </td>
                        <td style={{ color: '#b45309', fontWeight: 900 }}>
                          Bs. {formatearNumero(f.totalNetoBs || f.totalBs, 2)}
                        </td>
                        <td className="no-capture">
                          <input
                            type="checkbox"
                            checked={Boolean(estaPagado)}
                            onChange={(e) => onTogglePago(fId, e.target.checked, f)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </td>
                        <td className="no-capture">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => onVerRecibo(f)}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              fontWeight: 700,
                              borderColor: estaPagado ? '#86efac' : '#cbd5e1',
                              color: estaPagado ? '#16a34a' : '#64748b',
                            }}
                          >
                            <i className="fa-solid fa-receipt"></i> Recibo
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>SUBTOTAL {bancoNombre.toUpperCase()}</td>
                    <td>{formatearNumero(subLitros)}</td>
                    <td>&nbsp;</td>
                    <td>${formatearNumero(subUSD, 2)}</td>
                    <td>{subAdelUSD > 0 ? `-$${formatearNumero(subAdelUSD, 2)}` : '-'}</td>
                    <td>Bs. {formatearNumero(subNetoBs, 2)}</td>
                    <td colSpan={2} className="no-capture">&nbsp;</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {/* GRAN TOTAL NÓMINA GENERAL */}
      <div
        style={{
          background: 'linear-gradient(135deg, #065f46, #047857)',
          color: '#ffffff',
          borderRadius: '12px',
          padding: '18px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 4px 14px rgba(4,120,87,0.35)',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <i className="fa-solid fa-calculator" style={{ marginRight: '8px' }}></i> GRAN TOTAL NÓMINA GENERAL
        </div>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#a7f3d0', display: 'block' }}>LITROS TOTALES</span>
            <strong style={{ fontSize: '16px' }}>{formatearNumero(grandTotalLitros)} Lts</strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#a7f3d0', display: 'block' }}>TOTAL BRUTO USD</span>
            <strong style={{ fontSize: '16px' }}>${formatearNumero(grandTotalUSD, 2)}</strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#a7f3d0', display: 'block' }}>TOTAL ADELANTOS</span>
            <strong style={{ fontSize: '16px', color: '#fca5a5' }}>
              {grandTotalAdelUSD > 0 ? `-$${formatearNumero(grandTotalAdelUSD, 2)}` : '$0.00'}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#a7f3d0', display: 'block' }}>GRAN TOTAL NETO BS</span>
            <strong style={{ fontSize: '18px', color: '#fef08a' }}>Bs. {formatearNumero(grandTotalNetoBs, 2)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 6. RENDER REPORTE RELACIÓN DE COMPAÑÍAS (1:1 V2_3_11_26) ---
const RenderReporteRelacionCompanias: React.FC<{
  data: any[];
  fechaDesde: string;
  fechaHasta: string;
  tasaBcv: number;
  filtroServicio: 'TODOS' | 'TRANSPORTE' | 'RUTA';
  onCambiarFiltroServicio: (t: 'TODOS' | 'TRANSPORTE' | 'RUTA') => void;
  onAbrirHistorialPrecios: () => void;
  onAjustarPrecios: (comp: any) => void;
  onVerDetalleEntregas: (comp: any) => void;
  onCapturar: (el: HTMLElement | null, titulo: string) => void;
  onExportarExcel: (html: string, nombre: string) => void;
}> = ({
  data,
  fechaDesde,
  fechaHasta,
  tasaBcv,
  filtroServicio,
  onCambiarFiltroServicio,
  onAbrirHistorialPrecios,
  onAjustarPrecios,
  onVerDetalleEntregas,
}) => {
  const hasBufala = useAuthStore((state) => state.hasTenantModule('MOD_LECHE_BUFALA'));
  const companias = Array.isArray(data) ? data : [];

  const filtradas = useMemo(() => {
    if (filtroServicio === 'TRANSPORTE') {
      return companias.filter((c) => String(c.tipoServicio || '').toUpperCase().includes('TRANSP'));
    }
    if (filtroServicio === 'RUTA') {
      return companias.filter((c) => !String(c.tipoServicio || '').toUpperCase().includes('TRANSP'));
    }
    return companias;
  }, [companias, filtroServicio]);

  return (
    <div className="content-card" style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #cbd5e1' }}>
      {/* Banner Superior con Acceso a Historial de Precios */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
          color: '#ffffff',
          padding: '12px 18px',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        <div style={{ fontSize: '14.5px', fontWeight: 800 }}>
          <i className="fa-solid fa-building-wheat" style={{ color: '#d8b4fe', marginRight: '8px' }}></i>
          RELACIÓN DE PAGOS DE COMPAÑÍAS / PLANTAS
        </div>

        <button
          type="button"
          className="btn btn-sm"
          onClick={onAbrirHistorialPrecios}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '11.5px',
            padding: '4px 12px',
            borderRadius: '6px',
          }}
        >
          <i className="fa-solid fa-clock-rotate-left"></i> Ver Historial de Precios (Log)
        </button>
      </div>

      {/* Pestañas de Filtro Rápido: TODOS | TRANSPORTE | RUTA */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onCambiarFiltroServicio('TODOS')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            border: filtroServicio === 'TODOS' ? '1.5px solid #0f172a' : '1px solid #cbd5e1',
            background: filtroServicio === 'TODOS' ? '#0f172a' : '#ffffff',
            color: filtroServicio === 'TODOS' ? '#ffffff' : '#475569',
          }}
        >
          Todos los Servicios
        </button>
        <button
          type="button"
          onClick={() => onCambiarFiltroServicio('TRANSPORTE')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            border: filtroServicio === 'TRANSPORTE' ? '1.5px solid #7e22ce' : '1px solid #cbd5e1',
            background: filtroServicio === 'TRANSPORTE' ? '#7e22ce' : '#ffffff',
            color: filtroServicio === 'TRANSPORTE' ? '#ffffff' : '#7e22ce',
          }}
        >
          Servicio de Transporte (Fletes)
        </button>
        <button
          type="button"
          onClick={() => onCambiarFiltroServicio('RUTA')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            border: filtroServicio === 'RUTA' ? '1.5px solid #059669' : '1px solid #cbd5e1',
            background: filtroServicio === 'RUTA' ? '#059669' : '#ffffff',
            color: filtroServicio === 'RUTA' ? '#ffffff' : '#059669',
          }}
        >
          Servicio de Ruta (Venta Leche Propia)
        </button>
      </div>

      {/* Tabla Completa de Compañías */}
      <div style={{ overflowX: 'auto' }}>
        <table className="table-reporte-demarcada" style={{ fontSize: '12px' }}>
          <thead>
            <tr>
              <th>COMPAÑÍA / PLANTA</th>
              <th>ENCARGADO</th>
              <th>LITROS</th>
              <th>PRECIOS PACTADOS ($/L)</th>
              <th>DESGLOSE</th>
              <th>TOTAL BRUTO ($)</th>
              <th>TOTAL BRUTO (BS)</th>
              <th>ABONOS / DED.</th>
              <th>NETO (BS)</th>
              <th>NETO ($)</th>
              <th className="no-capture">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: '24px', color: '#94a3b8' }}>
                  Sin entregas registradas en este período.
                </td>
              </tr>
            ) : (
              filtradas.map((c: any, idx: number) => {
                const nom = c.companiaNombre || c.nombre;
                const enc = c.encargado || '-';
                const lts = Number(c.totalLitros || 0);
                const pVaca = Number(c.precioLitroUSD || 0.85);
                const pBuf = Number(c.precioBufalaLitroUSD || pVaca);
                const pAcid = Number(c.precioAcidaLitroUSD || 0);
                const bUSD = Number(c.totalUSD || 0);
                const bBs = Number(c.totalBrutoBs || bUSD * tasaBcv);
                const abUSD = Number(c.totalAbonosUSD || 0);
                const abBs = Number(c.totalAbonosBs || 0);
                const nBs = Number(c.totalNetoBs || bBs - abBs);
                const nUSD = Number(c.totalNetoUSD || bUSD - abUSD);
                const entregasCount = (c.entregasDetalle || []).length;

                return (
                  <tr key={idx}>
                    <td className="text-left" style={{ fontWeight: 800 }}>
                      {nom}
                    </td>
                    <td className="text-left">{enc}</td>
                    <td style={{ fontWeight: 800, color: '#047857' }}>{formatearNumero(lts)} L</td>
                    <td>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700 }}>
                          <span style={{ color: '#16a34a' }}>V: ${pVaca.toFixed(4)}</span>
                          {hasBufala && (
                            <>
                              {' '}| <span style={{ color: '#7e22ce' }}>B: ${pBuf.toFixed(4)}</span>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm no-capture"
                          onClick={() => onAjustarPrecios(c)}
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#eff6ff',
                            color: '#2563eb',
                            border: '1px solid #bfdbfe',
                          }}
                        >
                          Ajustar
                        </button>
                      </div>
                    </td>
                    <td className="text-left" style={{ fontSize: '11.5px' }}>
                      {lts > 0 ? `Vaca: ${formatearNumero(lts)} L` : '-'}
                    </td>
                    <td style={{ fontWeight: 800 }}>${formatearNumero(bUSD, 2)}</td>
                    <td>Bs. {formatearNumero(bBs, 2)}</td>
                    <td style={{ color: '#e11d48', fontWeight: 700 }}>
                      {abUSD > 0 ? `-$${formatearNumero(abUSD, 2)} ` : ''}
                      {abBs > 0 ? `-Bs.${formatearNumero(abBs, 2)}` : abUSD <= 0 ? '-' : ''}
                    </td>
                    <td style={{ color: '#047857', fontWeight: 900 }}>Bs. {formatearNumero(nBs, 2)}</td>
                    <td style={{ color: '#0284c7', fontWeight: 900 }}>${formatearNumero(nUSD, 2)}</td>
                    <td className="no-capture">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => onVerDetalleEntregas(c)}
                        style={{ fontSize: '11px', padding: '3px 8px', fontWeight: 700, borderRadius: '5px' }}
                      >
                        <i className="fa-solid fa-list-check"></i> {entregasCount} Entregas
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- 7. RENDER REPORTE RELACIÓN CHOFER (1:1 V2_3_11_26) ---
const RenderReporteRelacionChoferes: React.FC<{
  data: any[];
  fechaDesde: string;
  fechaHasta: string;
  filtroTermino: string;
  onCambiarFiltroTermino: (val: string) => void;
  onCapturar: (el: HTMLElement | null, titulo: string) => void;
  onExportarExcel: (html: string, nombre: string) => void;
}> = ({ data, fechaDesde, fechaHasta, filtroTermino, onCambiarFiltroTermino, onCapturar, onExportarExcel }) => {
  const lista = Array.isArray(data) ? data : [];
  const containerRef = useRef<HTMLDivElement>(null);

  // Filtrado en vivo reactivo (1:1 V2_3_11_26)
  const datosFiltrados = useMemo(() => {
    const termClean = (filtroTermino || '').trim().toLowerCase();
    if (!termClean) return lista;

    return lista
      .map((r: any) => {
        const chName = (r.chofer || '').toLowerCase();
        const fincas = r.detalleFincas || r.DetalleFincas || [];
        const fincasCoincidentes = fincas.filter((f: any) => {
          const fNom = (f.fincaNombre || f.FincaNombre || '').toLowerCase();
          const fProp = (f.propietario || f.Propietario || '').toLowerCase();
          const fTipo = (f.tipoLeche || f.TipoLeche || '').toLowerCase();
          const fObs = (f.observacion || f.Observacion || '').toLowerCase();
          const fFec = formatearFechaLocal(f.fecha || f.Fecha).toLowerCase();
          return fNom.includes(termClean) || fProp.includes(termClean) || fTipo.includes(termClean) || fObs.includes(termClean) || fFec.includes(termClean);
        });

        if (chName.includes(termClean)) {
          return r;
        }
        if (fincasCoincidentes.length > 0) {
          return { ...r, detalleFincas: fincasCoincidentes, DetalleFincas: fincasCoincidentes };
        }
        return null;
      })
      .filter(Boolean);
  }, [lista, filtroTermino]);

  // Cálculos de KPIs Superiores Globales (1:1 V2_3_11_26)
  let sumLitrosRuta = 0;
  let sumLitrosQuesera = 0;
  let sumDiferencias = 0;

  datosFiltrados.forEach((r: any) => {
    const lRuta = Number(r.litrosRuta || 0);
    const lQuesera = Number(r.litrosQuesera || 0);
    const diff = Number(r.diferencias != null ? r.diferencias : (lRuta - lQuesera));

    sumLitrosRuta += lRuta;
    sumLitrosQuesera += lQuesera;
    sumDiferencias += diff;
  });

  const pctTotalMerma = sumLitrosRuta > 0 ? ((Math.abs(sumDiferencias) / sumLitrosRuta) * 100).toFixed(2) : '0.00';

  if (lista.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', background: '#ffffff', borderRadius: '16px', border: '1.5px dashed #cbd5e1', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
        <i className="fa-solid fa-truck-ramp-box" style={{ fontSize: '38px', marginBottom: '12px', display: 'block', color: '#94a3b8' }}></i>
        <div style={{ fontWeight: 800, fontSize: '16px', color: '#1e293b' }}>No se encontraron viajes o recolecciones</div>
        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
          En el rango seleccionado ({formatearFechaLocal(fechaDesde)} al {formatearFechaLocal(fechaHasta)}).
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {/* BUSCADOR EN VIVO DE FINCA / CONDUCTOR (1:1 V2_3_11_26) */}
      <div
        style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '12px',
          padding: '10px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <i className="fa-solid fa-magnifying-glass" style={{ color: '#2563eb', fontSize: '16px' }}></i>
        <input
          type="text"
          value={filtroTermino}
          onChange={(e) => onCambiarFiltroTermino(e.target.value)}
          placeholder="Filtrar en vivo por Finca, Propietario, Conductor o Tipo de Leche..."
          style={{
            border: 'none',
            outline: 'none',
            width: '100%',
            fontSize: '13.5px',
            fontWeight: 600,
            color: '#0f172a',
            background: 'transparent',
          }}
          autoComplete="off"
        />
        {filtroTermino && (
          <button
            type="button"
            onClick={() => onCambiarFiltroTermino('')}
            title="Limpiar filtro"
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', padding: '4px' }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      {/* KPI RESUMEN SUPERIOR (1:1 V2_3_11_26) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Litros Finca</div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{formatearNumero(sumLitrosRuta)} L</div>
        </div>
        <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Litros Destino</div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>{formatearNumero(sumLitrosQuesera)} L</div>
        </div>
        <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Merma Total</div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: sumDiferencias > 0 ? '#b91c1c' : (sumDiferencias < 0 ? '#047857' : '#475569'), marginTop: '4px' }}>
            {sumDiferencias > 0 ? `+${formatearNumero(sumDiferencias)}` : formatearNumero(sumDiferencias)} L
          </div>
        </div>
        <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>% Merma Ponderado</div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: parseFloat(pctTotalMerma) > 1.0 ? '#b91c1c' : '#047857', marginTop: '4px' }}>
            {pctTotalMerma}%
          </div>
        </div>
      </div>

      {/* HEADER DE SECCIÓN */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          <i className="fa-solid fa-truck-moving" style={{ color: '#2563eb', marginRight: '6px' }}></i> RELACIÓN DE CONDUCTORES Y VIAJES
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '4px 10px', borderRadius: '8px' }}>
          <i className="fa-regular fa-calendar-check" style={{ marginRight: '4px' }}></i> Período: {formatearFechaLocal(fechaDesde)} al {formatearFechaLocal(fechaHasta)}
        </div>
      </div>

      {/* TARJETAS DE CHOFERES (1:1 V2_3_11_26) */}
      {datosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', background: '#f8fafc', borderRadius: '12px', border: '1.5px dashed #cbd5e1', color: '#64748b', fontSize: '13.5px', fontWeight: 600 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', color: '#94a3b8' }}></i>
          No se encontraron fincas o conductores que coincidan con <strong>"{filtroTermino}"</strong>.
        </div>
      ) : (
        datosFiltrados.map((r: any, idx: number) => {
          const lRuta = Number(r.litrosRuta || 0);
          const lQuesera = Number(r.litrosQuesera || 0);
          const diff = Number(r.diferencias != null ? r.diferencias : (lRuta - lQuesera));
          const pctMerma = lRuta > 0 ? ((Math.abs(diff) / lRuta) * 100).toFixed(2) : '0.00';
          const fincas = r.detalleFincas || r.DetalleFincas || [];
          const choferName = (r.chofer || 'OTROS').toUpperCase();

          let badgeBg = '#ecfdf5';
          let badgeColor = '#047857';
          let badgeBorder = '#a7f3d0';
          let statusLabel = 'Normal';
          let statusIcon = <i className="fa-solid fa-circle-check" style={{ color: '#10b981' }}></i>;

          if (diff > 0 && parseFloat(pctMerma) > 1.0) {
            badgeBg = '#fef2f2';
            badgeColor = '#b91c1c';
            badgeBorder = '#fecaca';
            statusLabel = 'Merma Alta';
            statusIcon = <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444' }}></i>;
          } else if (diff > 0 && parseFloat(pctMerma) > 0.0) {
            badgeBg = '#fffbeb';
            badgeColor = '#b45309';
            badgeBorder = '#fde68a';
            statusLabel = 'Merma Leve';
            statusIcon = <i className="fa-solid fa-circle-exclamation" style={{ color: '#f59e0b' }}></i>;
          }

          return (
            <div
              key={idx}
              style={{
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderRadius: '16px',
                marginBottom: '20px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}
            >
              {/* HEADER CHOFER CON DEGRADADO OSCURO 1:1 V2_3_11_26 */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                  color: '#ffffff',
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(37,99,235,0.25)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      color: '#60a5fa',
                    }}
                  >
                    <i className="fa-solid fa-user-gear"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.02em', color: '#ffffff' }}>
                      {choferName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                      {fincas.length} recolecciones registradas
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '12px',
                      background: badgeBg,
                      color: badgeColor,
                      border: `1px solid ${badgeBorder}`,
                    }}
                  >
                    Merma: {pctMerma}%
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#ffffff',
                      background: 'rgba(255,255,255,0.1)',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {statusIcon} {statusLabel}
                  </span>
                </div>
              </div>

              {/* RESUMEN EN CIFRAS DEL CHOFER (SIN DÓLARES) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '10px',
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderBottom: '1.5px solid #e2e8f0',
                }}
              >
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Litros Recogidos (Ruta)</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>{formatearNumero(lRuta)} L</div>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Litros Entregados (Destino)</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#2563eb', marginTop: '2px' }}>{formatearNumero(lQuesera)} L</div>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Diferencia / Merma</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: diff > 0 ? '#b91c1c' : (diff < 0 ? '#047857' : '#475569'), marginTop: '2px' }}>
                    {diff > 0 ? `+${formatearNumero(diff)}` : (diff < 0 ? formatearNumero(diff) : '0')} L
                  </div>
                </div>
              </div>

              {/* DESGLOSE DE FINCAS RECOGIDAS, FECHAS Y OBSERVACIONES */}
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-list-check" style={{ color: '#2563eb' }}></i>
                    FINCAS RECOGIDAS, FECHAS Y OBSERVACIONES
                    <span style={{ fontSize: '11px', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                      {fincas.length}
                    </span>
                  </div>
                </div>

                {/* TABLA RESPONSIVA 1:1 V2_3_11_26 */}
                <div className="table-responsive" style={{ margin: 0, border: 'none' }}>
                  <table className="table-reporte-demarcada" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '15%', padding: '9px 12px', textAlign: 'center' }}>FECHA</th>
                        <th style={{ width: '30%', padding: '9px 12px', textAlign: 'left' }}>FINCA / PROPIETARIO</th>
                        <th style={{ width: '15%', padding: '9px 12px', textAlign: 'center' }}>TIPO LECHE</th>
                        <th style={{ width: '15%', padding: '9px 12px', textAlign: 'right' }}>LITROS</th>
                        <th style={{ width: '20%', padding: '9px 12px', textAlign: 'left' }}>OBSERVACIONES</th>
                        <th style={{ width: '5%', padding: '9px 12px', textAlign: 'center' }}>TICKET</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fincas.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '18px', color: '#94a3b8', fontStyle: 'italic' }}>
                            Sin fincas registradas en este período
                          </td>
                        </tr>
                      ) : (
                        fincas.map((f: any, fIdx: number) => {
                          const fLitros = Number(f.litros || f.Litros || 0);
                          const fFecha = formatearFechaLocal(f.fecha || f.Fecha);
                          const fNombre = (f.fincaNombre || f.FincaNombre || `Finca #${f.fincaId || f.FincaId || ''}`).toUpperCase();
                          const fProp = (f.propietario || f.Propietario || '').trim();
                          const fTipo = (f.tipoLeche || f.TipoLeche || 'VACA').toUpperCase();
                          const fObs = (f.observacion || f.Observacion || '').replace(/\[ORIGEN_M[OÓ]VIL\]/gi, '').trim();
                          const fTicket = f.ticketControlId || f.TicketControlId || '';

                          let tipoBadge = (
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>
                              🥛 VACA
                            </span>
                          );
                          if (fTipo.includes('BUF') || fTipo.includes('BÚF')) {
                            tipoBadge = (
                              <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>
                                🐃 BÚFALA
                              </span>
                            );
                          } else if (fTipo.includes('ACID') || fTipo.includes('ÁCID')) {
                            tipoBadge = (
                              <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>
                                🍋 ÁCIDA
                              </span>
                            );
                          }

                          return (
                            <tr key={fIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ fontWeight: 700, color: '#334155', padding: '10px 12px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                <i className="fa-regular fa-calendar-days" style={{ color: '#2563eb', marginRight: '4px' }}></i> {fFecha}
                              </td>
                              <td style={{ fontWeight: 800, color: '#0f172a', padding: '10px 12px', textAlign: 'left' }}>
                                <div>{fNombre}</div>
                                {fProp && <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{fProp}</div>}
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                                {tipoBadge}
                              </td>
                              <td style={{ fontWeight: 900, color: '#059669', padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {formatearNumero(fLitros)} L
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'left' }}>
                                {fObs ? (
                                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '3px solid #f59e0b', borderRadius: '6px', padding: '4px 8px', fontWeight: 600, color: '#92400e' }}>
                                    <i className="fa-solid fa-comment-dots" style={{ color: '#d97706', marginRight: '4px' }}></i>
                                    {fObs}
                                  </div>
                                ) : (
                                  <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>Sin observaciones</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px 12px', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                                {fTicket ? (
                                  <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>#{fTicket}</span>
                                ) : '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* BOTONES INFERIORES */}
      <div style={{ marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }} className="no-capture">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => window.print()}
          style={{ fontWeight: 700, borderRadius: '8px', padding: '8px 16px' }}
        >
          <i className="fa-solid fa-print"></i> Imprimir Reporte
        </button>
        <button
          type="button"
          className="btn btn-success"
          onClick={() => {
            if (containerRef.current) {
              onExportarExcel(containerRef.current.innerHTML, `Relacion_Choferes_${fechaDesde}_al_${fechaHasta}`);
            }
          }}
          style={{ fontWeight: 700, borderRadius: '8px', padding: '8px 18px', background: '#059669', color: '#ffffff', border: 'none', boxShadow: '0 2px 6px rgba(16,185,129,0.3)' }}
        >
          <i className="fa-solid fa-file-excel"></i> Exportar a Excel
        </button>
      </div>
    </div>
  );
};

// =========================================================================
// MODALES ADICIONALES (ENTREGAS COMPAÑÍA, HISTORIAL PRECIOS, RECIBO)
// =========================================================================

const ModalDetalleEntregasCompania: React.FC<{ compania: any; onClose: () => void }> = ({ compania, onClose }) => {
  const entregas = compania.entregasDetalle || [];
  const compNombre = compania.companiaNombre || compania.nombre;
  const totalLitros = entregas.reduce((acc: number, e: any) => acc + Number(e.litros || 0), 0);
  const cantViajes = entregas.length;
  const promedio = cantViajes > 0 ? Math.round(totalLitros / cantViajes) : 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '900px',
          background: '#ffffff',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            padding: '16px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#ffffff',
          }}
        >
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Entregas:</span>
              <span style={{ color: '#38bdf8' }}>{compNombre}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Recepciones y despachos registrados en planta</div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '4px 10px', borderRadius: '6px', textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: '#6ee7b7' }}>TOTAL</div>
              <strong style={{ color: '#34d399', fontSize: '14px' }}>{formatearNumero(totalLitros)} L</strong>
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '4px 10px', borderRadius: '6px', textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: '#93c5fd' }}>VIAJES</div>
              <strong style={{ color: '#60a5fa', fontSize: '14px' }}>{cantViajes}</strong>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '4px 10px', borderRadius: '6px', textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: '#cbd5e1' }}>PROMEDIO</div>
              <strong style={{ color: '#f8fafc', fontSize: '14px' }}>{formatearNumero(promedio)} L</strong>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '22px', cursor: 'pointer', marginLeft: '8px' }}
            >
              &times;
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 20px', maxHeight: '420px', overflowY: 'auto' }}>
          <table className="table-reporte-demarcada" style={{ fontSize: '12.5px' }}>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Fecha</th>
                <th style={{ width: '110px' }}>Litros</th>
                <th style={{ width: '190px' }}>Chofer</th>
                <th>Observación / Detalles</th>
              </tr>
            </thead>
            <tbody>
              {entregas.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '24px', color: '#94a3b8' }}>
                    No hay entregas registradas en este período.
                  </td>
                </tr>
              ) : (
                entregas.map((e: any, idx: number) => (
                  <tr key={idx}>
                    <td>{formatearFechaLocal(e.fecha)}</td>
                    <td style={{ fontWeight: 800, color: '#047857' }}>{formatearNumero(e.litros)} L</td>
                    <td>{e.conductorNombre || e.choferNombre || 'OTROS'}</td>
                    <td className="text-left">{e.observacion || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ fontSize: '12px', padding: '6px 14px' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

const ModalHistorialPrecios: React.FC<{ historial: any[]; onClose: () => void }> = ({ historial, onClose }) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          background: '#ffffff',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#ffffff',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 800 }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: '8px' }}></i> Historial de Precios y Tarifas (Log)
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '22px', cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        <div style={{ padding: '16px 20px', maxHeight: '400px', overflowY: 'auto' }}>
          <table className="table-reporte-demarcada" style={{ fontSize: '12px' }}>
            <thead>
              <tr>
                <th>Fecha/Hora</th>
                <th>Entidad / Finca</th>
                <th>Precio Ant.</th>
                <th>Precio Nuevo</th>
                <th>Usuario</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', color: '#94a3b8' }}>
                    Sin registros en el log de auditoría.
                  </td>
                </tr>
              ) : (
                historial.map((h: any, idx: number) => (
                  <tr key={idx}>
                    <td>{formatearFechaLocal(h.fechaCambio || h.fecha)}</td>
                    <td className="text-left" style={{ fontWeight: 700 }}>{h.entidadNombre || h.nombreFinca || '-'}</td>
                    <td>${Number(h.precioAnteriorUSD || 0).toFixed(4)}</td>
                    <td style={{ color: '#047857', fontWeight: 800 }}>${Number(h.precioNuevoUSD || 0).toFixed(4)}</td>
                    <td>{h.usuarioNombre || 'Admin'}</td>
                    <td className="text-left">{h.observacion || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

const ModalReciboLiquidacion: React.FC<{
  datos: any;
  tasaBcv: number;
  onClose: () => void;
  onCapturar: (el: HTMLElement | null, titulo: string) => void;
}> = ({ datos, tasaBcv, onClose, onCapturar }) => {
  const reciboRef = useRef<HTMLDivElement>(null);
  const nomFinca = datos.fincaNombre || datos.nombre;
  const prop = datos.propietario || '';
  const litros = Number(datos.totalLitros || 0);
  const totalUSD = Number(datos.totalUSD || 0);
  const adelUSD = Number(datos.totalAdelantosUSD || 0);
  const netoUSD = Math.max(0, totalUSD - adelUSD);
  const netoBs = Number(datos.totalNetoBs || netoUSD * tasaBcv);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#ffffff',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div ref={reciboRef} style={{ padding: '24px' }}>
          <div style={{ textAlign: 'center', borderBottom: '2px dashed #cbd5e1', paddingBottom: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>RECIBO OFICIAL DE LIQUIDACIÓN</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Transporte de Leche & Control de Pagos</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Finca:</span>
              <strong style={{ color: '#0f172a' }}>{nomFinca}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Propietario:</span>
              <span style={{ fontWeight: 700 }}>{prop || '-'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>C.I. / RIF:</span>
              <span style={{ fontFamily: 'monospace' }}>{datos.cedulaRIF || datos.cedula || '-'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Cuenta Bancaria:</span>
              <span style={{ fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 700 }}>{datos.numeroCuenta || '-'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
              <span style={{ color: '#64748b' }}>Litros Entregados:</span>
              <strong style={{ color: '#047857' }}>{formatearNumero(litros)} L</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Monto Bruto USD:</span>
              <strong>${formatearNumero(totalUSD, 2)}</strong>
            </div>
            {adelUSD > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e11d48' }}>
                <span>(-) Adelantos Descontados:</span>
                <strong>-${formatearNumero(adelUSD, 2)}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Tasa BCV Aplicada:</span>
              <span>Bs. {formatearNumero(tasaBcv, 4)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '2px solid #0f172a',
                paddingTop: '10px',
                marginTop: '6px',
                fontSize: '15px',
              }}
            >
              <strong style={{ color: '#0f172a' }}>TOTAL NETO PAGADO:</strong>
              <strong style={{ color: '#047857', fontSize: '17px' }}>Bs. {formatearNumero(netoBs, 2)}</strong>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onCapturar(reciboRef.current, `Recibo_${nomFinca.replace(/\s+/g, '_')}`)}
            style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)' }}
          >
            <i className="fa-solid fa-camera"></i> Capturar Recibo
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportesPage;
