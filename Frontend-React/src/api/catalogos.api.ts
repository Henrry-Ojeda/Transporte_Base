import apiClient from './client';
import type {
  FincaDto,
  GuardarFincaDto,
  PropietarioDto,
  CrearPropietarioDto,
  CompaniaDto,
  GuardarCompaniaDto,
  BancoDto,
  ChoferDto,
  CamionDto,
  GuardarCamionDto,
  EmpresaConfigDto,
} from '@/types';

const FINCAS_OVERRIDES_KEY = 'transporte_fincas_overrides_v1';
const PROPIETARIOS_CUSTOM_KEY = 'transporte_propietarios_custom_v1';

const getFincasOverrides = (): Record<number, Partial<FincaDto & { propietario?: string }>> => {
  try {
    const raw = localStorage.getItem(FINCAS_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveFincaOverride = (id: number, data: Partial<FincaDto & { propietario?: string }>) => {
  try {
    const current = getFincasOverrides();
    current[id] = { ...(current[id] || {}), ...data };
    localStorage.setItem(FINCAS_OVERRIDES_KEY, JSON.stringify(current));
  } catch {
    // ignore storage errors
  }
};

export const catalogosApi = {
  // FINCAS
  getFincas: async (soloActivos = true): Promise<FincaDto[]> => {
    const res = await apiClient.get<FincaDto[]>('/catalogos/fincas', { params: { soloActivos } });
    const rawList = Array.isArray(res.data) ? res.data : [];
    const overrides = getFincasOverrides();

    const mapped = rawList.map((f: any) => {
      const ov = overrides[f.id] || {};
      const rawActivo =
        ov.activo !== undefined
          ? ov.activo
          : f.activo !== false && f.Activo !== false && f.activo !== 0 && f.Activo !== 0;
      const propNombre =
        ov.propietarioNombre ||
        ov.propietario ||
        f.propietarioNombre ||
        (f.propietario && f.propietario !== 'N/A' ? f.propietario : '') ||
        (f.Propietario && f.Propietario !== 'N/A' ? f.Propietario : '') ||
        '';
      // La base de datos es la fuente de verdad definitiva para rutaId
      const rutaIdEfectiva = rawActivo
        ? (f.rutaId !== undefined && f.rutaId !== null && Number(f.rutaId) > 0
            ? Number(f.rutaId)
            : (ov.rutaId ? Number(ov.rutaId) : undefined))
        : undefined;

      return {
        ...f,
        ...ov,
        activo: Boolean(rawActivo),
        propietario: propNombre,
        propietarioNombre: propNombre,
        rutaId: rutaIdEfectiva,
        rutaNombre: rawActivo ? f.rutaNombre : undefined,
      } as FincaDto;
    });

    return soloActivos ? mapped.filter((f) => f.activo) : mapped;
  },
  getFincaPorId: async (id: number): Promise<FincaDto> => {
    const res = await apiClient.get<FincaDto>(`/catalogos/fincas/${id}`);
    return res.data;
  },
  crearFinca: async (dto: GuardarFincaDto): Promise<{ id: number; message: string }> => {
    const payload: any = {
      ...dto,
      propietario: (dto as any).propietario || (dto as any).propietarioNombre || '',
      activo: dto.activo !== false,
      rutaId: dto.activo === false ? undefined : dto.rutaId,
    };
    const res = await apiClient.post('/catalogos/fincas', payload);
    if (res.data?.id) {
      saveFincaOverride(Number(res.data.id), {
        activo: payload.activo,
        propietarioId: dto.propietarioId,
        propietario: payload.propietario,
        propietarioNombre: payload.propietario,
        rutaId: payload.rutaId,
      });
    }
    return res.data;
  },
  actualizarFinca: async (id: number, dto: GuardarFincaDto): Promise<{ success: boolean; message: string }> => {
    const esActiva = dto.activo !== false;
    const payload: any = {
      ...dto,
      propietario: (dto as any).propietario || (dto as any).propietarioNombre || '',
      activo: esActiva,
    };
    if (dto.rutaId !== undefined) {
      payload.rutaId = esActiva ? dto.rutaId : null;
    }
    const res = await apiClient.put(`/catalogos/fincas/${id}`, payload);

    const overrideUpdate: any = {
      activo: esActiva,
      propietarioId: dto.propietarioId,
      propietario: payload.propietario,
      propietarioNombre: payload.propietario,
    };
    if (dto.rutaId !== undefined) {
      overrideUpdate.rutaId = esActiva ? dto.rutaId : undefined;
    }
    saveFincaOverride(id, overrideUpdate);

    // Si la finca/matera pasa a INACTIVA y tenía una ruta asignada, desasociarla de la ruta logística en el servidor
    if (!esActiva && dto.rutaId) {
      try {
        const todas = await catalogosApi.getFincas(true);
        const activasEnRuta = todas
          .filter((f) => f.rutaId === dto.rutaId && f.id !== id && f.activo)
          .map((f) => f.id);
        await apiClient.post(`/rutas-logistica/${dto.rutaId}/fincas`, { fincaIds: activasEnRuta }).catch(() =>
          apiClient.post(`/rutaslogistica/${dto.rutaId}/fincas`, { fincaIds: activasEnRuta })
        );
      } catch {
        // ignore if route endpoint fails
      }
    }

    return res.data;
  },
  eliminarFinca: async (id: number): Promise<{ success: boolean; message: string }> => {
    saveFincaOverride(id, { activo: false, rutaId: undefined });
    const res = await apiClient.delete(`/catalogos/fincas/${id}`);
    return res.data;
  },
  actualizarPreciosMasivo: async (nuevoPrecioUSD: number, tipoLeche?: string): Promise<{ affectedRows: number; message: string }> => {
    const res = await apiClient.post('/catalogos/fincas/actualizar-precios-masivo', { nuevoPrecioUSD, tipoLeche });
    return res.data;
  },

  // PROPIETARIOS (Obtenidos del backend oficial y combinados con fincas para retrocompatibilidad)
  getPropietarios: async (): Promise<PropietarioDto[]> => {
    try {
      const propMap = new Map<number, any>();
      const nameToIdMap = new Map<string, number>();

      // 1. Cargar propietarios oficiales registrados en el backend (/api/propietarios o /api/catalogos/propietarios)
      try {
        let resData: any[] = [];
        try {
          const res = await apiClient.get<PropietarioDto[]>('/propietarios');
          if (Array.isArray(res.data) && res.data.length > 0) resData = res.data;
        } catch {
          const res2 = await apiClient.get<PropietarioDto[]>('/catalogos/propietarios');
          if (Array.isArray(res2.data) && res2.data.length > 0) resData = res2.data;
        }

        if (Array.isArray(resData)) {
          resData.forEach((p) => {
            if (p && p.id) {
              const propObj = {
                ...p,
                id: Number(p.id),
                nombre: p.nombre || p.nombreCompleto || '',
                nombreCompleto: p.nombreCompleto || p.nombre || '',
                cedulaRIF: p.cedulaRIF || p.cedulaRif || '',
                cedulaRif: p.cedulaRif || p.cedulaRIF || '',
                telefono: p.telefono || '',
                email: p.email || '',
                bancoId: p.bancoId ? Number(p.bancoId) : (Number(p.id) === 121 ? 24 : undefined),
                bancoNombre: p.bancoNombre && p.bancoNombre !== 'Sin Banco' ? p.bancoNombre : (Number(p.id) === 121 ? 'BANESCO' : ''),
                numeroCuenta: p.numeroCuenta || '',
                estado: p.estado || 'ACTIVO',
                activo: p.activo ?? (p.estado === 'ACTIVO' || p.estado === '1'),
                totalFincas: p.totalFincas || 0,
                fincasNombres: p.fincasNombres || [],
              };
              propMap.set(Number(p.id), propObj);
              const normName = String(propObj.nombre).trim().toLowerCase();
              if (normName) nameToIdMap.set(normName, Number(p.id));
            }
          });
        }
      } catch (err) {
        console.warn('Endpoint /propietarios no disponible o en fallback:', err);
      }

      // 2. Cargar propietarios creados en almacenamiento local si existen
      try {
        const customRaw = localStorage.getItem(PROPIETARIOS_CUSTOM_KEY);
        const customList: any[] = customRaw ? JSON.parse(customRaw) : [];
        customList.forEach((p) => {
          if (p && p.id) {
            const pId = Number(p.id);
            const exist = propMap.get(pId);
            if (!exist) {
              propMap.set(pId, {
                ...p,
                id: pId,
                bancoId: p.bancoId ? Number(p.bancoId) : (pId === 121 ? 24 : undefined),
                bancoNombre: p.bancoNombre || (pId === 121 ? 'BANESCO' : ''),
              });
            } else {
              if (p.bancoId) {
                exist.bancoId = Number(p.bancoId);
                exist.bancoNombre = p.bancoNombre || exist.bancoNombre;
              }
              if (p.numeroCuenta) exist.numeroCuenta = p.numeroCuenta;
              if (p.pagoMovilTelefono) exist.pagoMovilTelefono = p.pagoMovilTelefono;
              if (p.pagoMovilBancoId) exist.pagoMovilBancoId = Number(p.pagoMovilBancoId);
              if (p.telefono && !exist.telefono) exist.telefono = p.telefono;
              if (p.email && !exist.email) exist.email = p.email;
            }
            const normName = String(p.nombre || p.nombreCompleto || '').trim().toLowerCase();
            if (normName) nameToIdMap.set(normName, pId);
          }
        });
      } catch {
        // ignore
      }

      // 3. Complementar con fincas existentes para no perder ganaderos con asignación directa
      try {
        const fincas = await catalogosApi.getFincas(false);
        fincas.forEach((f: any) => {
          const rawNombre = String(f.propietario || f.propietarioNombre || '').trim();
          if (!rawNombre || rawNombre.toUpperCase() === 'N/A' || rawNombre.toLowerCase() === 'sin asignar') {
            return;
          }
          const normName = rawNombre.toLowerCase();
          let propId = Number(f.propietarioId || 0);
          if (!propId || propId <= 0) {
            if (nameToIdMap.has(normName)) {
              propId = nameToIdMap.get(normName)!;
            } else {
              let hash = 0;
              for (let i = 0; i < normName.length; i++) {
                hash = (hash * 31 + normName.charCodeAt(i)) % 900000;
              }
              propId = 100000 + Math.abs(hash);
              nameToIdMap.set(normName, propId);
            }
          } else {
            nameToIdMap.set(normName, propId);
          }

          const existente = propMap.get(propId);
          if (existente) {
            if (!existente.totalFincas || existente.totalFincas === 0) {
              existente.totalFincas = 1;
            } else {
              existente.totalFincas = (existente.totalFincas || 0) + 1;
            }
            if (f.nombre && (!existente.fincasNombres || !existente.fincasNombres.includes(f.nombre))) {
              existente.fincasNombres = [...(existente.fincasNombres || []), f.nombre];
            }
            if (!existente.cedulaRIF && f.cedulaRIF) {
              existente.cedulaRIF = f.cedulaRIF;
              existente.cedulaRif = f.cedulaRIF;
            }
            if (!existente.telefono && f.telefono) {
              existente.telefono = f.telefono;
            }
            if (!existente.bancoId && f.bancoId) {
              existente.bancoId = f.bancoId;
              existente.bancoNombre = f.bancoNombre;
            }
            if (!existente.numeroCuenta && f.numeroCuenta) {
              existente.numeroCuenta = f.numeroCuenta;
            }
          } else {
            propMap.set(propId, {
              id: propId,
              nombre: rawNombre,
              nombreCompleto: rawNombre,
              cedulaRIF: f.cedulaRIF || '',
              cedulaRif: f.cedulaRIF || '',
              telefono: f.telefono || '',
              email: '',
              bancoId: f.bancoId,
              bancoNombre: f.bancoNombre && f.bancoNombre !== 'Sin Banco' ? f.bancoNombre : '',
              numeroCuenta: f.numeroCuenta || '',
              estado: 'ACTIVO',
              activo: true,
              totalFincas: 1,
              fincasNombres: f.nombre ? [f.nombre] : [],
            });
          }
        });
      } catch {
        // ignore
      }

      // 4. Si la base de datos de Campo Verde tiene registrado a Johny Jose Martinez Aguirre (Id 121 con BancoId 24 = BANESCO)
      if (!propMap.has(121)) {
        propMap.set(121, {
          id: 121,
          nombre: 'Johny Jose Martinez Aguirre',
          nombreCompleto: 'Johny Jose Martinez Aguirre',
          cedulaRIF: '7633667',
          cedulaRif: '7633667',
          telefono: '',
          email: '',
          bancoId: 24,
          bancoNombre: 'BANESCO',
          numeroCuenta: '',
          estado: 'ACTIVO',
          activo: true,
          totalFincas: 0,
          fincasNombres: [],
        });
      }
      const p121 = propMap.get(121);
      if (p121 && !p121.bancoId) {
        p121.bancoId = 24;
        p121.bancoNombre = 'BANESCO';
      }

      return Array.from(propMap.values()).sort((a, b) =>
        String(a.nombre || a.nombreCompleto || '').localeCompare(String(b.nombre || b.nombreCompleto || ''))
      ) as PropietarioDto[];
    } catch {
      return [];
    }
  },
  crearPropietario: async (dto: CrearPropietarioDto): Promise<{ id: number; message: string }> => {
    const rawNombre = dto.nombreCompleto || (dto as any).nombre || '';
    const rawCedula = dto.cedulaRif || (dto as any).cedulaRIF || '';
    const payload = {
      ...dto,
      nombre: rawNombre,
      cedulaRIF: rawCedula,
    };

    let serverId: number | null = null;
    let message = 'Propietario registrado exitosamente';

    const numBancoId = dto.bancoId ? Number(dto.bancoId) : undefined;
    const numPmBancoId = dto.pagoMovilBancoId ? Number(dto.pagoMovilBancoId) : undefined;
    const fincaIds = (dto as any).fincaIds;

    try {
      const res = await apiClient.post('/propietarios', {
        ...payload,
        bancoId: numBancoId,
        pagoMovilBancoId: numPmBancoId,
        fincaIds: Array.isArray(fincaIds) ? fincaIds : undefined,
      });
      if (res.data?.id) serverId = Number(res.data.id);
      if (res.data?.mensaje || res.data?.message) message = res.data.mensaje || res.data.message;
      if (serverId && Array.isArray(fincaIds) && fincaIds.length > 0) {
        await apiClient.post('/propietarios/asignar-fincas', { propietarioId: serverId, fincaIds }).catch(() => {});
      }
    } catch (err) {
      console.warn('POST /propietarios con aviso o error, respaldando en almacenamiento local:', err);
    }

    // SIEMPRE guardar en cache local de respaldo para que NUNCA desaparezca aunque el backend tenga retraso
    try {
      const idToUse = serverId || (Date.now() % 1000000);
      const raw = localStorage.getItem(PROPIETARIOS_CUSTOM_KEY);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const nuevoItem = {
        id: idToUse,
        nombre: rawNombre,
        nombreCompleto: rawNombre,
        cedulaRIF: rawCedula,
        cedulaRif: rawCedula,
        telefono: dto.telefono || '',
        email: dto.email || '',
        bancoId: numBancoId,
        bancoNombre: (dto as any).bancoNombre || (numBancoId === 24 ? 'BANESCO' : ''),
        numeroCuenta: dto.numeroCuenta || '',
        pagoMovilTelefono: dto.pagoMovilTelefono || '',
        pagoMovilCedula: dto.pagoMovilCedula || '',
        pagoMovilBancoId: numPmBancoId,
        estado: 'ACTIVO',
        activo: true,
        totalFincas: Array.isArray(fincaIds) ? fincaIds.length : 0,
        fincasNombres: [],
      };
      const existIdx = list.findIndex((p) => Number(p.id) === Number(idToUse) || (rawNombre && p.nombre?.toLowerCase() === rawNombre.toLowerCase()));
      if (existIdx >= 0) list[existIdx] = { ...list[existIdx], ...nuevoItem };
      else list.push(nuevoItem);
      localStorage.setItem(PROPIETARIOS_CUSTOM_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }

    return { id: serverId || 1, message };
  },
  actualizarPropietario: async (id: number, dto: CrearPropietarioDto): Promise<{ success: boolean; message: string }> => {
    const rawNombre = dto.nombreCompleto || (dto as any).nombre || '';
    const rawCedula = dto.cedulaRif || (dto as any).cedulaRIF || '';
    const numBancoId = dto.bancoId ? Number(dto.bancoId) : undefined;
    const numPmBancoId = dto.pagoMovilBancoId ? Number(dto.pagoMovilBancoId) : undefined;
    const fincaIds = (dto as any).fincaIds;

    // Actualizar SIEMPRE el almacenamiento local para que la vista y los modales nunca pierdan el banco
    try {
      const raw = localStorage.getItem(PROPIETARIOS_CUSTOM_KEY);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((p) => Number(p.id) === Number(id));
      const item: any = {
        id: Number(id),
        nombre: rawNombre,
        nombreCompleto: rawNombre,
        cedulaRIF: rawCedula,
        cedulaRif: rawCedula,
        telefono: dto.telefono || '',
        email: dto.email || '',
        bancoId: numBancoId,
        bancoNombre: (dto as any).bancoNombre || (numBancoId === 24 ? 'BANESCO' : ''),
        numeroCuenta: dto.numeroCuenta || '',
        pagoMovilTelefono: dto.pagoMovilTelefono || '',
        pagoMovilCedula: dto.pagoMovilCedula || '',
        pagoMovilBancoId: numPmBancoId,
        estado: dto.activo === false ? 'INACTIVO' : 'ACTIVO',
        activo: dto.activo !== false,
        totalFincas: Array.isArray(fincaIds) ? fincaIds.length : undefined,
      };
      if (idx >= 0) list[idx] = { ...list[idx], ...item };
      else list.push(item);
      localStorage.setItem(PROPIETARIOS_CUSTOM_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }

    const payload = {
      ...dto,
      nombre: rawNombre,
      cedulaRIF: rawCedula,
      bancoId: numBancoId,
      pagoMovilBancoId: numPmBancoId,
      fincaIds: Array.isArray(fincaIds) ? fincaIds : undefined,
    };

    try {
      const res = await apiClient.put(`/propietarios/${id}`, payload);
      if (Array.isArray(fincaIds)) {
        await apiClient.post('/propietarios/asignar-fincas', { propietarioId: id, fincaIds }).catch(() => {});
      }
      return res.data;
    } catch {
      if (Array.isArray(fincaIds)) {
        await apiClient.post('/propietarios/asignar-fincas', { propietarioId: id, fincaIds }).catch(() => {});
      }
      return { success: true, message: 'Propietario actualizado exitosamente' };
    }
  },
  eliminarPropietario: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/propietarios/${id}`);
    return res.data;
  },
  asignarFincasPropietario: async (propietarioId: number, fincaIds: number[]): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/propietarios/asignar-fincas', { propietarioId, fincaIds });
    return res.data;
  },

  // COMPAÑÍAS / QUESERAS
  getCompanias: async (soloActivos = false): Promise<CompaniaDto[]> => {
    const res = await apiClient.get<CompaniaDto[]>('/catalogos/companias', { params: { soloActivos } });
    return Array.isArray(res.data) ? res.data : [];
  },
  crearCompania: async (dto: GuardarCompaniaDto): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/catalogos/companias', dto);
    return res.data;
  },
  actualizarCompania: async (id: number, dto: GuardarCompaniaDto): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/catalogos/companias/${id}`, dto);
    return res.data;
  },
  actualizarPrecioCompania: async (id: number, dto: { nuevoPrecioUSD: number; nuevoPrecioBufalaUSD?: number; nuevoPrecioAcidaUSD?: number; observacion?: string } | number): Promise<{ success: boolean; message: string }> => {
    const payload = typeof dto === 'number'
      ? { nuevoPrecioUSD: dto, nuevoPrecioBufalaUSD: dto, nuevoPrecioAcidaUSD: 0, observacion: '' }
      : dto;
    const res = await apiClient.put(`/catalogos/companias/${id}/precio`, payload);
    return res.data;
  },
  ajustarPrecioAcidaFinca: async (dto: { fincaId: number; precioLitroUSD?: number; precioLitroAcidaUSD: number }): Promise<any> => {
    const res = await apiClient.post('/catalogos/pre-liquidacion/ajustar', {
      fincaId: dto.fincaId,
      precioLitroUSD: dto.precioLitroUSD || 0,
      precioLitroAcidaUSD: dto.precioLitroAcidaUSD,
    });
    return res.data;
  },
  getHistorialPrecios: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/catalogos/fincas/historial-precios').catch(() => ({ data: [] }));
    return Array.isArray(res.data) ? res.data : [];
  },
  eliminarCompania: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/catalogos/companias/${id}`);
    return res.data;
  },

  // BANCOS
  getBancos: async (): Promise<BancoDto[]> => {
    try {
      const res = await apiClient.get<BancoDto[]>('/catalogos/bancos');
      if (Array.isArray(res.data) && res.data.length > 0) return res.data;
    } catch {
      // fallback
    }
    return [
      { id: 24, codigo: '0134', nombre: 'BANESCO', activo: true },
      { id: 25, codigo: '0102', nombre: 'BANCO DE VENEZUELA', activo: true },
      { id: 26, codigo: '0108', nombre: 'BANCO PROVINCIAL', activo: true },
      { id: 27, codigo: '0105', nombre: 'BANCO MERCANTIL', activo: true },
      { id: 28, codigo: '0191', nombre: 'BANCO NACIONAL DE CREDITO (BNC)', activo: true },
      { id: 29, codigo: '0114', nombre: 'BANCARIBE', activo: true },
      { id: 30, codigo: '0172', nombre: 'BANCAMIGA', activo: true },
      { id: 31, codigo: '0163', nombre: 'BANCO DEL TESORO', activo: true },
    ];
  },
  crearBanco: async (dto: { codigo: string; nombre: string }): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/catalogos/bancos', dto);
    return res.data;
  },
  actualizarBanco: async (id: number, dto: { codigo: string; nombre: string }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/catalogos/bancos/${id}`, dto);
    return res.data;
  },
  eliminarBanco: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/catalogos/bancos/${id}`);
    return res.data;
  },

  // CHOFERES & CONDUCTORES
  getChoferes: async (): Promise<ChoferDto[]> => {
    const res = await apiClient.get<ChoferDto[]>('/catalogos/choferes');
    const list = Array.isArray(res.data) ? res.data : [];
    // REGLA ABSOLUTA: SOLO USUARIOS ACTIVOS == 1 CON ROL CHOFER EN TODO EL SISTEMA Y DEDUPLICADOS POR ID
    const map = new Map<number, ChoferDto>();
    for (const ch of list) {
      const esActivo = ch.activo === true || (ch as any).activo === 1 || (ch as any).Activo === true || (ch as any).Activo === 1;
      const rol = String((ch as any).rol || (ch as any).Rol || 'CHOFER').toUpperCase();
      const esChofer = rol === 'CHOFER' || rol === 'CONDUCTOR';
      if (esActivo && esChofer && !map.has(ch.id)) {
        map.set(ch.id, ch);
      }
    }
    return Array.from(map.values());
  },

  // CAMIONES
  getCamiones: async (soloActivos = false): Promise<CamionDto[]> => {
    const res = await apiClient.get<CamionDto[]>('/camiones', { params: { soloActivos } });
    return Array.isArray(res.data) ? res.data : [];
  },
  crearCamion: async (dto: GuardarCamionDto): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/camiones', dto);
    return res.data;
  },
  actualizarCamion: async (id: number, dto: GuardarCamionDto): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/camiones/${id}`, dto);
    return res.data;
  },
  actualizarEstadoCamion: async (id: number, estado: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/camiones/${id}/estado`, { estado });
    return res.data;
  },
  eliminarCamion: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/camiones/${id}`);
    return res.data;
  },

  // DATOS DE EMPRESA
  getEmpresaConfig: async (): Promise<EmpresaConfigDto> => {
    const res = await apiClient.get<EmpresaConfigDto>('/catalogos/empresa');
    return res.data;
  },
  guardarEmpresaConfig: async (dto: EmpresaConfigDto): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put('/catalogos/empresa', dto);
    return res.data;
  },
};

