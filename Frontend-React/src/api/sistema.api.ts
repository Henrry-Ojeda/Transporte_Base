import apiClient from './client';
import { catalogosApi } from './catalogos.api';
import type {
  UsuarioDto,
  GuardarUsuarioDto,
  PermisoModuloDto,
  RolDto,
} from '@/types';

export const sistemaApi = {
  // ROLES (CRUD SUPERADMIN)
  getRoles: async (soloActivos = false): Promise<RolDto[]> => {
    const res = await apiClient.get<RolDto[]>('/permisos/roles', { params: { soloActivos } });
    return Array.isArray(res.data) ? res.data : [];
  },

  crearRol: async (dto: { codigo: string; nombre: string; descripcion?: string; activo?: boolean }): Promise<{ id: number; message: string }> => {
    const res = await apiClient.post('/permisos/roles', dto);
    return res.data;
  },

  actualizarRol: async (id: number, dto: { codigo: string; nombre: string; descripcion?: string; activo?: boolean }): Promise<{ message: string }> => {
    const res = await apiClient.put(`/permisos/roles/${id}`, dto);
    return res.data;
  },

  eliminarRol: async (id: number): Promise<{ message: string }> => {
    const res = await apiClient.delete(`/permisos/roles/${id}`);
    return res.data;
  },

  // USUARIOS
  getUsuarios: async (rol?: string, soloActivos = false): Promise<UsuarioDto[]> => {
    const params: Record<string, any> = { soloActivos };
    if (rol) params.rol = rol;
    const res = await apiClient.get<UsuarioDto[]>('/usuarios', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getUsuarioPorId: async (id: number): Promise<UsuarioDto> => {
    const res = await apiClient.get<UsuarioDto>(`/usuarios/${id}`);
    return res.data;
  },

  crearUsuario: async (dto: GuardarUsuarioDto): Promise<{ id: number; message: string }> => {
    const rawUsername = (dto as any).username || (dto as any).Username || dto.nombreUsuario || '';
    const payload = {
      ...dto,
      username: rawUsername,
      Username: rawUsername,
      nombreUsuario: rawUsername,
    };
    const res = await apiClient.post('/usuarios', payload);
    return res.data;
  },

  actualizarUsuario: async (id: number, dto: Partial<GuardarUsuarioDto>): Promise<{ success: boolean; message: string }> => {
    const rawUsername = (dto as any).username || (dto as any).Username || dto.nombreUsuario || undefined;
    const payload = {
      ...dto,
      ...(rawUsername ? { username: rawUsername, Username: rawUsername, nombreUsuario: rawUsername } : {}),
    };
    const res = await apiClient.put(`/usuarios/${id}`, payload);
    return res.data;
  },

  actualizarPassword: async (id: number, nuevaPassword: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put(`/usuarios/${id}/password`, {
      nuevaPassword,
      nuevoPassword: nuevaPassword,
      password: nuevaPassword,
    });
    return res.data;
  },

  actualizarPermisoCrearViaje: async (id: number, permisoCrearViaje: boolean): Promise<{ success: boolean; message: string; permisoCrearViaje: boolean }> => {
    const res = await apiClient.patch(`/usuarios/${id}/permiso-crear-viaje`, { permisoCrearViaje });
    return res.data;
  },

  eliminarUsuario: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete(`/usuarios/${id}`);
    return res.data;
  },

  // PERMISOS & ROLES RBAC
  getMatrizPermisos: async (): Promise<PermisoModuloDto[]> => {
    const res = await apiClient.get<PermisoModuloDto[]>('/permisos/matriz');
    return Array.isArray(res.data) ? res.data : [];
  },

  actualizarPermisoRol: async (rol: string, moduloCodigo: string, acciones: { puedeVer: boolean; puedeEditar: boolean; puedeAgregar: boolean; puedeEliminar: boolean }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.put('/permisos/rol-modulo', { rol, moduloCodigo, ...acciones });
    return res.data;
  },

  // CONFIGURACIÓN GLOBAL
  getConfiguracion: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/configuracion/parametros');
    return Array.isArray(res.data) ? res.data : [];
  },

  guardarParametro: async (clave: string, valor: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/configuracion/parametros', { clave, valor });
    return res.data;
  },

  getTiposLeche: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/configuracion/tipos-leche');
    return Array.isArray(res.data) ? res.data : [];
  },

  toggleTipoLeche: async (id: number, activo: boolean): Promise<any> => {
    const res = await apiClient.put(`/configuracion/tipos-leche/${id}/toggle`, activo);
    return res.data;
  },

  getModulosAdmin: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/configuracion/modulos-admin');
    return Array.isArray(res.data) ? res.data : [];
  },

  toggleModulo: async (id: number, activo: boolean): Promise<any> => {
    const res = await apiClient.put(`/configuracion/modulos/${id}/toggle`, activo);
    return res.data;
  },

  // LICENCIA Y EMPRESA (SISTEMA TENANT)
  getEmpresaConfig: async (): Promise<any> => {
    const res = await apiClient.get('/empresa');
    return res.data;
  },

  actualizarLicencia: async (fechaVencimiento: string): Promise<{ mensaje: string; fechaVencimiento: string }> => {
    const res = await apiClient.put('/empresa/licencia', { fechaVencimiento });
    return res.data;
  },

  // REPORTES INTEGRALES (8 REPORTES OFICIALES)
  getDashboardAvanzado: async (semanas = 8): Promise<any> => {
    const res = await apiClient.get('/reportes/dashboard-avanzado', { params: { semanas } });
    return res.data;
  },

  getReporteDiarios: async (fechaInicio: string, fechaFin: string, choferId?: number): Promise<any> => {
    const params: Record<string, any> = { fechaInicio, fechaFin };
    if (choferId) params.choferId = choferId;
    const res = await apiClient.get<any>('/reportes/diarios', { params });
    return res.data || {
      diarioRutas: [],
      totalDiarioRutas: 0,
      diarioReceptorias: [],
      totalDiarioReceptorias: 0,
      diarioTransporteRutas: [],
      totalDiarioTransporteRutas: 0,
      diarioTransporteReceptorias: [],
      totalDiarioTransporteReceptorias: 0,
    };
  },

  getReporteReceptorias: async (fechaInicio: string, fechaFin: string, companiaId?: number): Promise<any[]> => {
    const params: Record<string, any> = { fechaInicio, fechaFin };
    if (companiaId) params.companiaId = companiaId;
    const res = await apiClient.get<any[]>('/reportes/receptorias', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getReporteFincas: async (fechaInicio: string, fechaFin: string, fincaIds?: string): Promise<any[]> => {
    try {
      const params: Record<string, any> = { fechaInicio, fechaFin };
      if (fincaIds) params.fincaIds = fincaIds;
      const resBackend = await apiClient.get<any[]>('/reportes/fincas', { params }).catch(() => null);
      if (resBackend && Array.isArray(resBackend.data) && resBackend.data.length > 0) {
        return resBackend.data;
      }
    } catch {
      // Si falla endpoint backend, se procesa agregación local
    }

    try {
      const [rutasRes, fincasList, bcvRes, adelantosRes] = await Promise.all([
        apiClient.get<any[]>('/rutas/hoy', { params: { fechaInicio, fechaFin } }).catch(() => ({ data: [] })),
        catalogosApi.getFincas(false).catch(() => []),
        apiClient.get<any>('/bcv/hoy').catch(() => ({ data: { tasaDolarBs: 889.5754 } })),
        apiClient.get<any[]>('/adelantos', { params: { tipoEntidad: 'FINCA' } }).catch(() => ({ data: [] })),
      ]);

      const rutas = Array.isArray(rutasRes.data) ? rutasRes.data : [];
      const fincas = Array.isArray(fincasList) ? fincasList : [];
      const tasaBcv = Number(bcvRes.data?.tasaDolarBs || bcvRes.data?.tasa || 889.5754);
      const adelantos = Array.isArray(adelantosRes.data) ? adelantosRes.data : [];

      const filtroIds = fincaIds
        ? fincaIds
            .split(',')
            .map((x) => Number(x.trim()))
            .filter((n) => n > 0)
        : [];

      const fincasMap = new Map<number, any>();
      fincas.forEach((f: any) => fincasMap.set(Number(f.id), f));

      // Agrupar recolecciones por fincaId (solo fincas activas)
      const recoleccionesPorFinca = new Map<number, any[]>();
      rutas.forEach((r: any) => {
        const fId = Number(r.fincaId);
        if (!fId || fId === 68) return;
        const fInfo = fincasMap.get(fId);
        if (fInfo && fInfo.activo === false) return;
        if (filtroIds.length > 0 && !filtroIds.includes(fId)) return;
        const arr = recoleccionesPorFinca.get(fId) || [];
        arr.push(r);
        recoleccionesPorFinca.set(fId, arr);
      });

      const resultado: any[] = [];
      const idsToProcess =
        filtroIds.length > 0 ? filtroIds : Array.from(recoleccionesPorFinca.keys());

      idsToProcess.forEach((fId) => {
        const recs = recoleccionesPorFinca.get(fId) || [];
        if (recs.length === 0) return;

        const fincaInfo = fincasMap.get(fId) || {};
        const nombre = fincaInfo.nombre || recs[0]?.fincaNombre || `Finca #${fId}`;
        const propietario = fincaInfo.propietario || fincaInfo.propietarioNombre || recs[0]?.propietario || '';
        const cedulaRIF = fincaInfo.cedulaRIF || '';
        const precioLitroUSD = Number(fincaInfo.precioLitroUSD || recs[0]?.precioLitroUSD || 0.82);
        const precioLitroAcidaUSD = Number(fincaInfo.precioLitroAcidaUSD || 0);
        const precioBufalaLitroUSD = Number(fincaInfo.precioBufalaLitroUSD || 0);
        const tieneDosTipos = Boolean(fincaInfo.tieneDosTiposLeche);

        const detalle = recs.map((r: any) => {
          const fechaStr = r.fecha ? String(r.fecha).split('T')[0] : '';
          const litros = Number(r.litros || 0);
          const esAcida = Boolean(r.esAcida);
          const tipoLeche = String(r.tipoLeche || 'VACA').toUpperCase();
          const precioAplicado = esAcida
            ? precioLitroAcidaUSD
            : tipoLeche === 'BUFALA' && precioBufalaLitroUSD > 0
            ? precioBufalaLitroUSD
            : Number(r.precioLitroUSD || precioLitroUSD);

          return {
            fecha: fechaStr,
            litros,
            esAcida,
            tipoLeche,
            precioLitroUSDAplicado: precioAplicado,
            observacion: r.observacion || '',
            choferNombre: r.conductorNombre || '',
            entidadNombre: nombre,
          };
        });

        // Adelantos de la finca
        const adelantosFinca = adelantos.filter(
          (a: any) =>
            Number(a.entidadId || a.fincaId) === fId &&
            a.estado !== 'ANULADO' &&
            a.estado !== 'PAGADO'
        );
        const totalAdelantosUSD = adelantosFinca.reduce(
          (acc: number, a: any) => acc + Number(a.montoCuotaUSD || a.saldoPendienteUSD || 0),
          0
        );
        const totalAdelantosBs = totalAdelantosUSD * tasaBcv;

        if (tieneDosTipos) {
          const detVaca = detalle.filter((d) => d.tipoLeche !== 'BUFALA');
          const detBufala = detalle.filter((d) => d.tipoLeche === 'BUFALA');

          if (detVaca.length > 0 || detBufala.length === 0) {
            const totalLitros = detVaca.reduce((acc, d) => acc + d.litros, 0);
            const totalUSD = detVaca.reduce((acc, d) => acc + d.litros * d.precioLitroUSDAplicado, 0);
            resultado.push({
              id: fId,
              nombre: `${nombre} (Vaca)`,
              propietario,
              cedulaRIF,
              tipoServicioId: fincaInfo.tipoServicioId || 1,
              tipoServicioNombre: fincaInfo.tipoServicioNombre || 'RUTA',
              precioLitroUSD,
              precioLitroAcidaUSD,
              tasaBcv,
              detalle: detVaca,
              totalLitros,
              totalUSD,
              totalBs: totalUSD * tasaBcv,
              totalAdelantosUSD,
              totalAdelantosBs,
              esPagado: false,
            });
          }

          if (detBufala.length > 0) {
            const totalLitros = detBufala.reduce((acc, d) => acc + d.litros, 0);
            const totalUSD = detBufala.reduce((acc, d) => acc + d.litros * d.precioLitroUSDAplicado, 0);
            resultado.push({
              id: fId,
              nombre: `${nombre} (Búfala)`,
              propietario,
              cedulaRIF,
              tipoServicioId: fincaInfo.tipoServicioId || 1,
              tipoServicioNombre: fincaInfo.tipoServicioNombre || 'RUTA',
              precioLitroUSD: precioBufalaLitroUSD > 0 ? precioBufalaLitroUSD : precioLitroUSD,
              precioLitroAcidaUSD,
              tasaBcv,
              detalle: detBufala,
              totalLitros,
              totalUSD,
              totalBs: totalUSD * tasaBcv,
              totalAdelantosUSD: 0,
              totalAdelantosBs: 0,
              esPagado: false,
            });
          }
        } else {
          const totalLitros = detalle.reduce((acc, d) => acc + d.litros, 0);
          const totalUSD = detalle.reduce((acc, d) => acc + d.litros * d.precioLitroUSDAplicado, 0);
          resultado.push({
            id: fId,
            nombre,
            propietario,
            cedulaRIF,
            tipoServicioId: fincaInfo.tipoServicioId || 1,
            tipoServicioNombre: fincaInfo.tipoServicioNombre || 'RUTA',
            precioLitroUSD,
            precioLitroAcidaUSD,
            tasaBcv,
            detalle,
            totalLitros,
            totalUSD,
            totalBs: totalUSD * tasaBcv,
            totalAdelantosUSD,
            totalAdelantosBs,
            esPagado: false,
          });
        }
      });

      if (filtroIds.length === 0) {
        resultado.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      }
      return resultado;
    } catch {
      return [];
    }
  },

  getReporteChoferes: async (fechaInicio: string, fechaFin: string, choferId?: number): Promise<any[]> => {
    const params: Record<string, any> = { fechaInicio, fechaFin };
    if (choferId) params.choferId = choferId;
    const res = await apiClient.get<any[]>('/reportes/choferes', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getReporteBancos: async (fechaInicio: string, fechaFin: string, bancoId?: number, cicloId?: number, tasaBcv?: number): Promise<any[]> => {
    const params: Record<string, any> = { fechaInicio, fechaFin };
    if (bancoId) params.bancoId = bancoId;
    if (cicloId) params.cicloId = cicloId;
    if (tasaBcv) params.tasaBcv = tasaBcv;
    const res = await apiClient.get<any[]>('/reportes/bancos', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getReporteCompanias: async (fechaInicio: string, fechaFin: string, companiaId?: number, cicloId?: number, tasaBcv?: number): Promise<any[]> => {
    const params: Record<string, any> = { fechaInicio, fechaFin };
    if (companiaId) params.companiaId = companiaId;
    if (cicloId) params.cicloId = cicloId;
    if (tasaBcv) params.tasaBcv = tasaBcv;
    const res = await apiClient.get<any[]>('/reportes/relacion-companias', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getReporteRelacionChoferes: async (fechaInicio: string, fechaFin: string): Promise<any[]> => {
    const params: Record<string, any> = { fechaInicio, fechaFin };
    const res = await apiClient.get<any[]>('/reportes/relacion-choferes', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getReporteRelacionCompanias: async (fechaInicio: string, fechaFin: string, companiaId?: number, cicloId?: number, tasaBcv?: number): Promise<any[]> => {
    const params: Record<string, any> = { fechaInicio, fechaFin };
    if (companiaId) params.companiaId = companiaId;
    if (cicloId) params.cicloId = cicloId;
    if (tasaBcv) params.tasaBcv = tasaBcv;
    const res = await apiClient.get<any[]>('/reportes/relacion-companias', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getReporteRelacionPagos: async (fechaInicio?: string, fechaFin?: string, bancoId?: number, cicloId?: number): Promise<any[]> => {
    const params: Record<string, any> = {};
    if (fechaInicio) params.fechaInicio = fechaInicio;
    if (fechaFin) params.fechaFin = fechaFin;
    if (bancoId) params.bancoId = bancoId;
    if (cicloId) params.cicloId = cicloId;
    const res = await apiClient.get<any[]>('/reportes/bancos', { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  getBcvHoy: async (): Promise<any> => {
    const res = await apiClient.get<any>('/bcv/hoy').catch(() => ({ data: { tasaDolarBs: 889.5754, tasa: 889.5754 } }));
    return res.data;
  },
};
