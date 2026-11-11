/**
 * Motor de Sincronización Bidireccional (Sync Engine)
 * 
 * Gestiona la sincronización automática de subida y bajada entre
 * IndexedDB y el backend de SQL Server / API REST:
 * - Sube recolecciones de leche, combustible, averías y receptoría guardadas sin señal.
 * - Descarga actualizaciones de la central (rutas, fincas agregadas/removidas, notificaciones).
 * - Dispara notificaciones y eventos reactivos cuando se sincronizan los datos.
 */

import { dbLocal, type RecoleccionLocal, type CombustibleLocal, type AveriaLocal, type ReceptoriaDescargaLocal } from './dbLocal';
import { operacionesApi } from '@/api/operaciones.api';
import { combustibleApi } from '@/api/combustible.api';
import { mantenimientoApi } from '@/api/mantenimiento.api';
import { notificacionesApi } from '@/api/notificaciones.api';
import { ticketsLocales } from './ticketsLocales';

export interface SyncStatusEvent {
  sincronizando: boolean;
  pendientesTotal: number;
  pendientesRecolecciones: number;
  pendientesCombustible: number;
  pendientesAverias: number;
  pendientesReceptoria: number;
  ultimaSincronizacion: string | null;
  error?: string | null;
}

class SyncEngine {
  private isSyncing = false;
  private syncTimer: any = null;
  private ultimaSincronizacion: string | null = null;

  constructor() {
    this.iniciarListeners();
  }

  private iniciarListeners() {
    if (typeof window === 'undefined') return;

    // Cuando el teléfono recupera conexión (WiFi o Datos móviles)
    window.addEventListener('online', () => {
      console.log('[SyncEngine] Conexión detectada. Iniciando sincronización automática...');
      this.sincronizarTodo();
    });

    // Monitoreo periódico cada 20 segundos si hay conexión
    if (!this.syncTimer) {
      this.syncTimer = setInterval(() => {
        if (navigator.onLine && !this.isSyncing) {
          this.sincronizarTodo(undefined, true);
        }
      }, 20000);
    }
  }

  private emitirEstado(extra?: Partial<SyncStatusEvent>) {
    if (typeof window === 'undefined') return;

    dbLocal.getConteoTotalPendientes().then((conteo) => {
      const detail: SyncStatusEvent = {
        sincronizando: this.isSyncing,
        pendientesTotal: conteo.total,
        pendientesRecolecciones: conteo.recolecciones,
        pendientesCombustible: conteo.combustible,
        pendientesAverias: conteo.averias,
        pendientesReceptoria: conteo.receptoria,
        ultimaSincronizacion: this.ultimaSincronizacion,
        ...extra,
      };

      window.dispatchEvent(new CustomEvent('transporte_sync_status', { detail }));
    }).catch(() => {});
  }

  /**
   * Sincroniza todos los módulos pendientes (Subida) y descarga novedades (Bajada)
   */
  async sincronizarTodo(empresaCodigo?: string, silencioso = false): Promise<{
    recoleccionesSubidas: number;
    combustibleSubido: number;
    averiasSubidas: number;
    receptoriaSubida: number;
    totalSubidos: number;
  }> {
    if (this.isSyncing) {
      return { recoleccionesSubidas: 0, combustibleSubido: 0, averiasSubidas: 0, receptoriaSubida: 0, totalSubidos: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.emitirEstado({ error: 'Sin conexión a internet' });
      return { recoleccionesSubidas: 0, combustibleSubido: 0, averiasSubidas: 0, receptoriaSubida: 0, totalSubidos: 0 };
    }

    this.isSyncing = true;
    this.emitirEstado();

    let recoleccionesSubidas = 0;
    let combustibleSubido = 0;
    let averiasSubidas = 0;
    let receptoriaSubida = 0;
    let ticketsSubidos = 0;

    try {
      // 0. Crear en la central los tickets/turnos iniciados sin conexión (antes que sus cargas)
      ticketsSubidos = await this.sincronizarTicketsLocales();

      // 1. Sincronizar Recolecciones de Leche en Fincas
      recoleccionesSubidas = await this.sincronizarRecolecciones(empresaCodigo);

      // 2. Sincronizar Combustible
      combustibleSubido = await this.sincronizarCombustible(empresaCodigo);

      // 3. Sincronizar Averías mecánicas
      averiasSubidas = await this.sincronizarAverias(empresaCodigo);

      // 4. Sincronizar Descargas de Receptoría
      receptoriaSubida = await this.sincronizarReceptoria(empresaCodigo);

      const totalSubidos = recoleccionesSubidas + combustibleSubido + averiasSubidas + receptoriaSubida + ticketsSubidos;

      if (totalSubidos > 0) {
        this.ultimaSincronizacion = new Date().toISOString();

        // Notificar en consola y disparar evento global para refrescar vistas
        console.log(`[SyncEngine] Sincronización exitosa: ${totalSubidos} registros subidos.`);
        window.dispatchEvent(
          new CustomEvent('transporte_sync_completada', {
            detail: { totalSubidos, recoleccionesSubidas, combustibleSubido, averiasSubidas, receptoriaSubida },
          })
        );

        // Notificación visual si no es silencioso
        if (!silencioso && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('transporte_notificacion_alerta', {
              detail: {
                titulo: '¡Sincronización Exitosa!',
                mensaje: `Se subieron ${totalSubidos} registro(s) a la central.`,
                tipo: 'SUCCESS',
              },
            })
          );
        }
      }

      this.isSyncing = false;
      this.emitirEstado();

      return {
        recoleccionesSubidas,
        combustibleSubido,
        averiasSubidas,
        receptoriaSubida,
        totalSubidos,
      };
    } catch (err: any) {
      console.error('[SyncEngine] Error durante sincronización:', err);
      this.isSyncing = false;
      this.emitirEstado({ error: err?.message || 'Error en sincronización' });
      return {
        recoleccionesSubidas,
        combustibleSubido,
        averiasSubidas,
        receptoriaSubida,
        totalSubidos: recoleccionesSubidas + combustibleSubido + averiasSubidas + receptoriaSubida + ticketsSubidos,
      };
    }
  }

  /**
   * Crea en la central los tickets (turnos) que el chofer inició sin conexión.
   * Registra la equivalencia ID local (negativo) -> ID real para sus cargas.
   */
  async sincronizarTicketsLocales(): Promise<number> {
    const pendientes = ticketsLocales.listarPendientes();
    if (pendientes.length === 0) return 0;

    let exitosos = 0;
    for (const t of pendientes) {
      try {
        const res = await operacionesApi.iniciarViaje(t.payload);
        if (res && res.id) {
          ticketsLocales.marcarSincronizado(t.localId, res.id);
          exitosos++;
        }
      } catch (err: any) {
        const status = err?.response?.status;
        // Sin red / servidor caído: reintentar luego. Cualquier otro error se deja pendiente también
        // (no se descarta información del chofer).
        console.warn(`[SyncEngine] No se pudo crear el ticket local ${t.localId} (status ${status ?? 'sin respuesta'}):`, err?.message);
        ticketsLocales.registrarError(
          t.localId,
          err?.response?.data?.message || (status ? `Error ${status} de la central` : 'Sin conexión con la central')
        );
        break; // respetar el orden de creación
      }
    }
    return exitosos;
  }

  /**
   * Sube recolecciones de leche pendientes a la central
   */
  async sincronizarRecolecciones(empresaCodigo?: string): Promise<number> {
    const pendientes = await dbLocal.getRecoleccionesPendientes(empresaCodigo);
    if (pendientes.length === 0) return 0;

    let exitosas = 0;

    for (const carga of pendientes) {
      if (!carga.idLocal) continue;

      try {
        let ticketId = carga.ticketId;

        // Ticket creado sin conexión: traducir al ID real; si aún no se creó en la central, esperar
        if (ticketId && ticketId < 0) {
          const real = ticketsLocales.resolverId(ticketId);
          if (real <= 0) continue;
          ticketId = real;
        }

        // Si el ticket no es válido o es 0, buscar o crear viaje activo
        if (!ticketId || ticketId <= 0) {
          const vActivo = await operacionesApi.getViajeActivo();
          if (vActivo && vActivo.id) {
            ticketId = vActivo.id;
          }
        }

        if (ticketId && ticketId > 0) {
          const obsConOrigen = `${carga.observaciones ? carga.observaciones + ' ' : ''}[ORIGEN_MOVIL]`.trim();

          await operacionesApi.agregarFincaViaje(ticketId, {
            fincaId: carga.fincaId,
            litros: carga.litros,
            esAcida: carga.esAcida,
            esDiferido: carga.esDiferida,
            fecha: carga.fechaRegistro.split('T')[0],
            tipoLeche: carga.tipoLeche,
            observacion: obsConOrigen,
            temperatura: carga.temperatura ?? undefined,
            fotoComprobante: carga.foto ?? undefined,
          });

          await dbLocal.marcarRecoleccionSincronizada(carga.idLocal);
          exitosas++;
        }
      } catch (err: any) {
        console.error(`[SyncEngine] Error subiendo recolección #${carga.idLocal}:`, err);
        await dbLocal.marcarRecoleccionError(carga.idLocal, err?.message || 'Error al conectar con servidor');
      }
    }

    return exitosas;
  }

  /**
   * Sube despachos de combustible pendientes
   */
  async sincronizarCombustible(empresaCodigo?: string): Promise<number> {
    const pendientes = await dbLocal.getCombustiblesPendientes(empresaCodigo);
    if (pendientes.length === 0) return 0;

    let exitosas = 0;

    for (const item of pendientes) {
      if (!item.idLocal) continue;

      try {
        await combustibleApi.registrarDespacho({
          camionId: item.camionId,
          tipoCombustible: item.tipoCombustible,
          litros: item.litros,
          odometroKm: item.odometroKm,
          fecha: item.fecha.split('T')[0],
          observaciones: `[ORIGEN_MOVIL] ${item.estacion || ''}`.trim(),
        });

        await dbLocal.marcarCombustibleSincronizado(item.idLocal);
        exitosas++;
      } catch (err: any) {
        console.error(`[SyncEngine] Error subiendo combustible #${item.idLocal}:`, err);
      }
    }

    return exitosas;
  }

  /**
   * Sube averías reportadas pendientes
   */
  async sincronizarAverias(empresaCodigo?: string): Promise<number> {
    const pendientes = await dbLocal.getAveriasPendientes(empresaCodigo);
    if (pendientes.length === 0) return 0;

    let exitosas = 0;

    for (const item of pendientes) {
      if (!item.idLocal) continue;

      try {
        await mantenimientoApi.reportarIncidente({
          camionId: item.camionId,
          titulo: item.titulo,
          descripcion: `[ORIGEN_MOVIL] ${item.descripcion}`.trim(),
          urgencia: item.urgencia,
          odometroKm: item.odometroKm ?? undefined,
        });

        await dbLocal.marcarAveriaSincronizada(item.idLocal);
        exitosas++;
      } catch (err: any) {
        console.error(`[SyncEngine] Error subiendo avería #${item.idLocal}:`, err);
      }
    }

    return exitosas;
  }

  /**
   * Sube descargas de receptoría pendientes
   */
  async sincronizarReceptoria(empresaCodigo?: string): Promise<number> {
    const pendientes = await dbLocal.getDescargasReceptoriaPendientes(empresaCodigo);
    if (pendientes.length === 0) return 0;

    let exitosas = 0;

    for (const item of pendientes) {
      if (!item.idLocal) continue;

      try {
        await operacionesApi.guardarEntrega({
          companiaId: item.siloId,
          litros: item.litrosDescargados,
          usuarioId: item.operadorId || 1,
          fecha: item.fecha.split('T')[0],
          observacion: `[ORIGEN_MOVIL] Silo ${item.siloId}`,
        });

        await dbLocal.marcarDescargaReceptoriaSincronizada(item.idLocal);
        exitosas++;
      } catch (err: any) {
        console.error(`[SyncEngine] Error subiendo descarga receptoría #${item.idLocal}:`, err);
      }
    }

    return exitosas;
  }

  /**
   * Descarga actualizaciones del viaje activo y notificaciones del servidor
   */
  async refrescarBajada(empresaCodigo: string, choferId?: number): Promise<{
    viajeActualizado: boolean;
    fincasNuevas: number;
  }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { viajeActualizado: false, fincasNuevas: 0 };
    }

    try {
      // 1. Obtener viaje activo del chofer
      const vActivo: any = await operacionesApi.getViajeActivo(choferId);
      if (vActivo && vActivo.id) {
        await dbLocal.guardarViajeCache({
          idKey: `${empresaCodigo}_${vActivo.id}`,
          empresaCodigo,
          ticketId: vActivo.id,
          numeroTicket: vActivo.numeroTicket || `#${vActivo.id}`,
          conductorId: vActivo.conductorId || vActivo.usuarioId || choferId || 0,
          conductorNombre: vActivo.conductorNombre || vActivo.choferNombre || '',
          camionId: vActivo.camionId || 0,
          camionPlaca: vActivo.camionPlaca || '',
          rutaNombre: vActivo.rutaNombre || '',
          estado: vActivo.estado || 'Abierto',
          totalLitros: vActivo.totalLitros || vActivo.litrosTotal || 0,
          fecha: vActivo.fecha || new Date().toISOString(),
          paradas: vActivo.paradas || [],
          updatedAt: new Date().toISOString(),
        });

        return { viajeActualizado: true, fincasNuevas: (vActivo.paradas || []).length };
      }

      // 2. Descargar notificaciones recientes
      const notifsServidor = await notificacionesApi.getMisNotificaciones(20);
      if (Array.isArray(notifsServidor) && notifsServidor.length > 0) {
        await dbLocal.guardarNotificaciones(
          notifsServidor.map((n) => ({
            idKey: `${empresaCodigo}_${n.id}`,
            empresaCodigo,
            usuarioId: choferId || 0,
            notificacionId: n.id,
            titulo: n.titulo,
            mensaje: n.mensaje,
            tipo: n.tipo,
            leida: Boolean(n.leido),
            fecha: n.createdAt || new Date().toISOString(),
          }))
        );
      }

      return { viajeActualizado: false, fincasNuevas: 0 };
    } catch (err) {
      console.warn('[SyncEngine] Fallo al refrescar datos de bajada (tolerante):', err);
      return { viajeActualizado: false, fincasNuevas: 0 };
    }
  }
}

export const syncEngine = new SyncEngine();
