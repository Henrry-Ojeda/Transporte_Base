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
  private activeSyncPromise: Promise<{
    recoleccionesSubidas: number;
    combustibleSubido: number;
    averiasSubidas: number;
    receptoriaSubida: number;
    totalSubidos: number;
  }> | null = null;
  private syncTimer: any = null;
  private retryTimer: any = null;
  private ultimaSincronizacion: string | null = null;

  constructor() {
    this.iniciarListeners();
  }

  private iniciarListeners() {
    if (typeof window === 'undefined') return;

    // Cuando el teléfono recupera conexión (WiFi o Datos móviles), esperar 1.2s a que estabilice DNS/red
    window.addEventListener('online', () => {
      console.log('[SyncEngine] Conexión detectada. Esperando estabilización de red para sincronizar...');
      setTimeout(() => {
        if (navigator.onLine) {
          this.sincronizarTodo();
        }
      }, 1200);
    });

    // Monitoreo periódico cada 15 segundos si hay conexión
    if (!this.syncTimer) {
      this.syncTimer = setInterval(() => {
        if (navigator.onLine && !this.isSyncing) {
          this.sincronizarTodo(undefined, true);
        }
      }, 15000);
    }
  }

  private emitirEstado(extra?: Partial<SyncStatusEvent>) {
    if (typeof window === 'undefined') return;

    dbLocal.getConteoTotalPendientes().then((conteo) => {
      let pendientesLocalStorage = 0;
      try {
        const raw = localStorage.getItem('movil_cargas_local');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            pendientesLocalStorage = list.filter((x: any) => !x.synced).length;
          }
        }
      } catch {}

      const totalPend = Math.max(conteo.total, pendientesLocalStorage);

      const detail: SyncStatusEvent = {
        sincronizando: this.isSyncing,
        pendientesTotal: totalPend,
        pendientesRecolecciones: Math.max(conteo.recolecciones, pendientesLocalStorage),
        pendientesCombustible: conteo.combustible,
        pendientesAverias: conteo.averias,
        pendientesReceptoria: conteo.receptoria,
        ultimaSincronizacion: this.ultimaSincronizacion,
        ...extra,
      };

      window.dispatchEvent(new CustomEvent('transporte_sync_status', { detail }));
    }).catch(() => {});
  }

  private getChoferIdEfectivo(choferId?: number): number | undefined {
    if (choferId && choferId > 0) return choferId;
    if (typeof window === 'undefined') return undefined;
    try {
      const rawDev = localStorage.getItem('movil_device_info');
      if (rawDev) {
        const dev = JSON.parse(rawDev);
        if (dev && dev.id) return Number(dev.id);
      }
      const rawUser = localStorage.getItem('auth_user') || localStorage.getItem('user');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u && (u.id || u.usuarioId)) return Number(u.id || u.usuarioId);
      }
    } catch {}
    return undefined;
  }

  private async resolverViajeActivoAbierto(choferId?: number): Promise<any | null> {
    try {
      const idChofer = this.getChoferIdEfectivo(choferId);
      const v = await operacionesApi.getViajeActivo(idChofer);
      if (v && v.id) return v;
    } catch (err) {
      console.warn('[SyncEngine] Error al consultar viaje activo:', err);
    }
    return null;
  }

  /**
   * Sincroniza todos los módulos pendientes (Subida) y descarga novedades (Bajada).
   * Si ya hay una sincronización en curso, espera a que termine y devuelve su resultado
   * (evita condiciones de carrera donde el llamador cree que ya terminó con 0 subidos).
   */
  async sincronizarTodo(empresaCodigo?: string, silencioso = false, choferId?: number): Promise<{
    recoleccionesSubidas: number;
    combustibleSubido: number;
    averiasSubidas: number;
    receptoriaSubida: number;
    totalSubidos: number;
  }> {
    if (this.isSyncing && this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.emitirEstado({ error: 'Sin conexión a internet' });
      return { recoleccionesSubidas: 0, combustibleSubido: 0, averiasSubidas: 0, receptoriaSubida: 0, totalSubidos: 0 };
    }

    this.isSyncing = true;
    this.emitirEstado();

    this.activeSyncPromise = (async () => {
      let recoleccionesSubidas = 0;
      let combustibleSubido = 0;
      let averiasSubidas = 0;
      let receptoriaSubida = 0;
      let ticketsSubidos = 0;

      try {
        // 0. Crear en la central los tickets/turnos iniciados sin conexión (antes que sus cargas)
        ticketsSubidos = await this.sincronizarTicketsLocales();

        // 1. Sincronizar Recolecciones de Leche en Fincas (IndexedDB + respaldo LocalStorage)
        recoleccionesSubidas = await this.sincronizarRecolecciones(empresaCodigo, choferId);

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

        return {
          recoleccionesSubidas,
          combustibleSubido,
          averiasSubidas,
          receptoriaSubida,
          totalSubidos,
        };
      } catch (err: any) {
        console.error('[SyncEngine] Error durante sincronización:', err);
        this.emitirEstado({ error: err?.message || 'Error en sincronización' });
        return {
          recoleccionesSubidas,
          combustibleSubido,
          averiasSubidas,
          receptoriaSubida,
          totalSubidos: recoleccionesSubidas + combustibleSubido + averiasSubidas + receptoriaSubida + ticketsSubidos,
        };
      } finally {
        this.isSyncing = false;
        this.activeSyncPromise = null;
        this.emitirEstado();
      }
    })();

    return this.activeSyncPromise;
  }

  /**
   * Crea en la central los tickets (turnos) que el chofer inició sin conexión.
   * Registra la equivalencia ID local (negativo) -> ID real para sus cargas.
   */
  async sincronizarTicketsLocales(): Promise<number> {
    const pendientes = ticketsLocales.listarPendientes();
    if (pendientes.length === 0) return 0;

    // Evita que dos ventanas/pestañas envíen el mismo turno al mismo tiempo (duplicaría el ticket)
    if (!ticketsLocales.tomarCandadoEnvio()) return 0;

    let exitosos = 0;
    try {
      for (const t of pendientes) {
        try {
          const res = await operacionesApi.iniciarViaje(t.payload);
          if (res && res.id) {
            ticketsLocales.marcarSincronizado(t.localId, res.id);
            exitosos++;
          }
        } catch (err: any) {
          const status = err?.response?.status;
          // Sin red / servidor caído: reintentar luego. La central reconoce el turno por su [LOCAL:uuid],
          // así que reintentar nunca duplica el ticket.
          console.warn(`[SyncEngine] No se pudo crear el ticket local ${t.localId} (status ${status ?? 'sin respuesta'}):`, err?.message);
          ticketsLocales.registrarError(
            t.localId,
            err?.response?.data?.message || (status ? `Error ${status} de la central` : 'Sin conexión con la central')
          );
          break; // respetar el orden de creación
        }
      }
    } finally {
      ticketsLocales.soltarCandadoEnvio();
    }
    return exitosos;
  }

  /**
   * Sube recolecciones de leche pendientes a la central (desde IndexedDB y respaldo movil_cargas_local)
   */
  async sincronizarRecolecciones(empresaCodigo?: string, choferId?: number): Promise<number> {
    let exitosas = 0;
    let huboFalloRed = false;
    const subidosClave = new Set<string>();
    const subidosDbId = new Set<number>();

    // 1. Subir recolecciones pendientes desde IndexedDB
    let pendientes: RecoleccionLocal[] = [];
    try {
      pendientes = await dbLocal.getRecoleccionesPendientes(empresaCodigo);
    } catch (e) {
      console.warn('[SyncEngine] No se pudo leer IndexedDB, se usará respaldo localStorage:', e);
    }

    for (const carga of pendientes) {
      if (!carga.idLocal) continue;

      try {
        let ticketId = carga.ticketId;

        // Ticket creado sin conexión: traducir al ID real; si aún no se creó en la central, esperar
        if (ticketId && ticketId < 0) {
          const real = ticketsLocales.resolverId(ticketId);
          if (real <= 0) {
            huboFalloRed = true;
            continue;
          }
          ticketId = real;
        }

        // Si el ticket no es válido o es <= 0, resolver viaje activo abierto
        if (!ticketId || ticketId <= 0) {
          const vActivo = await this.resolverViajeActivoAbierto(choferId);
          if (vActivo && vActivo.id) {
            ticketId = vActivo.id;
          }
        }

        if (ticketId && ticketId > 0) {
          const obsConOrigen = `${carga.observaciones ? carga.observaciones + ' ' : ''}[ORIGEN_MOVIL]`.trim();
          const payloadEnvio = {
            fincaId: Number(carga.fincaId),
            litros: Number(carga.litros),
            esAcida: Boolean(carga.esAcida),
            esDiferido: Boolean(carga.esDiferida),
            fecha: (carga.fechaRegistro || new Date().toISOString()).split('T')[0],
            tipoLeche: carga.tipoLeche || 'VACA',
            observacion: obsConOrigen,
            temperatura: carga.temperatura ?? undefined,
            fotoComprobante: carga.foto && carga.foto !== '[EN_INDEXEDDB]' ? carga.foto : undefined,
          };

          let subio = false;
          try {
            await operacionesApi.agregarFincaViaje(ticketId, payloadEnvio);
            subio = true;
          } catch (errApi: any) {
            const errMsg = errApi?.response?.data?.message || errApi?.message || '';
            const status = errApi?.response?.status;
            const esTicketInvalido = status === 400 || status === 404 ||
              errMsg.toLowerCase().includes('abierto') ||
              errMsg.toLowerCase().includes('no existe') ||
              errMsg.toLowerCase().includes('finalizado') ||
              errMsg.toLowerCase().includes('cerrado');

            if (esTicketInvalido) {
              console.warn(`[SyncEngine] Ticket #${ticketId} no disponible para recolección (${errMsg}). Buscando viaje activo abierto...`);
              const vActivo = await this.resolverViajeActivoAbierto(choferId);
              if (vActivo && vActivo.id && vActivo.id !== ticketId && (vActivo.procesoActualId === 1 || !vActivo.procesoActualId)) {
                console.log(`[SyncEngine] Reasignando recolección #${carga.idLocal} a ticket activo abierto #${vActivo.id}`);
                await operacionesApi.agregarFincaViaje(vActivo.id, payloadEnvio);
                ticketId = vActivo.id;
                subio = true;
              } else {
                throw errApi;
              }
            } else {
              throw errApi;
            }
          }

          if (subio) {
            await dbLocal.marcarRecoleccionSincronizada(carga.idLocal);
            subidosDbId.add(carga.idLocal);
            subidosClave.add(`${ticketId}_${Number(carga.fincaId)}`);
            exitosas++;
          }
        }
      } catch (err: any) {
        huboFalloRed = true;
        console.error(`[SyncEngine] Error subiendo recolección #${carga.idLocal}:`, err);
        await dbLocal.marcarRecoleccionError(carga.idLocal, err?.message || 'Error al conectar con servidor').catch(() => {});
      }
    }

    // 2. Respaldo y sincronización directa de movil_cargas_local (garantiza que ninguna carga de ningún ticket se quede sin subir ni se marque synced si falló)
    if (typeof window !== 'undefined') {
      try {
        const rawCargas = localStorage.getItem('movil_cargas_local');
        if (rawCargas) {
          const listaCargas: any[] = JSON.parse(rawCargas);
          if (Array.isArray(listaCargas) && listaCargas.length > 0) {
            let huboCambiosCargas = false;

            for (let i = 0; i < listaCargas.length; i++) {
              const c = listaCargas[i];
              if (!c || c.synced) continue;

              const tOrig = Number(c.serverTicketId || 0);
              let tReal = tOrig < 0 ? ticketsLocales.resolverId(tOrig) : tOrig;
              const fId = Number(c.fincaId || 0);

              if (tOrig < 0 && tReal <= 0) {
                huboFalloRed = true;
                continue;
              }

              // Si ya se subió en el paso 1 por IndexedDB, marcarla como sincronizada
              const claveYa = `${tReal}_${fId}`;
              if ((c.dbLocalId && subidosDbId.has(Number(c.dbLocalId))) || (tReal > 0 && subidosClave.has(claveYa))) {
                listaCargas[i] = { ...c, serverTicketId: tReal > 0 ? tReal : c.serverTicketId, synced: true };
                huboCambiosCargas = true;
                continue;
              }

              if (fId > 0 && Number(c.litros) > 0) {
                // Si el ticket no es válido o es <= 0, resolver con viaje activo abierto
                if (!tReal || tReal <= 0) {
                  const vActivo = await this.resolverViajeActivoAbierto(choferId);
                  if (vActivo && vActivo.id) {
                    tReal = vActivo.id;
                  }
                }

                if (tReal > 0) {
                  try {
                    const obsConOrigen = `${c.observacion ? c.observacion + ' ' : ''}[ORIGEN_MOVIL]`.trim();
                    let fotoComprobante = c.fotoRecibo && c.fotoRecibo !== '[EN_INDEXEDDB]' ? c.fotoRecibo : undefined;

                    // Si la foto estaba en IndexedDB por cuota de localStorage, recuperarla
                    if (!fotoComprobante && c.dbLocalId) {
                      try {
                        const recDb = await dbLocal.getRecoleccion(Number(c.dbLocalId));
                        if (recDb && recDb.foto && recDb.foto !== '[EN_INDEXEDDB]') {
                          fotoComprobante = recDb.foto;
                        }
                      } catch {}
                    }

                    const payloadEnvio = {
                      fincaId: fId,
                      litros: Number(c.litros),
                      esAcida: Boolean(c.esAcida),
                      esDiferido: Boolean(c.esDiferido),
                      fecha: (c.fecha || new Date().toISOString()).split('T')[0],
                      tipoLeche: c.tipoLeche || 'VACA',
                      observacion: obsConOrigen,
                      temperatura: c.temperatura ? Number(c.temperatura) : undefined,
                      fotoComprobante,
                    };

                    let subidaOk = false;
                    try {
                      await operacionesApi.agregarFincaViaje(tReal, payloadEnvio);
                      subidaOk = true;
                    } catch (errAdd: any) {
                      const errMsg = errAdd?.response?.data?.message || errAdd?.message || '';
                      const status = errAdd?.response?.status;
                      const esInvalido = status === 400 || status === 404 ||
                        errMsg.toLowerCase().includes('abierto') ||
                        errMsg.toLowerCase().includes('no existe') ||
                        errMsg.toLowerCase().includes('finalizado') ||
                        errMsg.toLowerCase().includes('cerrado');

                      if (esInvalido) {
                        console.warn(`[SyncEngine] Ticket #${tReal} no disponible para finca #${fId} (${errMsg}). Reintentando con viaje activo abierto...`);
                        const vActivo = await this.resolverViajeActivoAbierto(choferId);
                        if (vActivo && vActivo.id && vActivo.id !== tReal && (vActivo.procesoActualId === 1 || !vActivo.procesoActualId)) {
                          console.log(`[SyncEngine] Reasignando carga #${fId} a nuevo ticket activo abierto #${vActivo.id}`);
                          await operacionesApi.agregarFincaViaje(vActivo.id, payloadEnvio);
                          tReal = vActivo.id;
                          subidaOk = true;
                        } else {
                          throw errAdd;
                        }
                      } else {
                        throw errAdd;
                      }
                    }

                    if (subidaOk) {
                      listaCargas[i] = { ...c, serverTicketId: tReal, synced: true };
                      if (c.dbLocalId) {
                        await dbLocal.marcarRecoleccionSincronizada(Number(c.dbLocalId)).catch(() => {});
                      }
                      subidosClave.add(`${tReal}_${fId}`);
                      huboCambiosCargas = true;
                      exitosas++;
                    }
                  } catch (errCarga) {
                    huboFalloRed = true;
                    console.warn(`[SyncEngine] Pendiente reintento de carga local finca #${fId} en ticket #${tReal}:`, errCarga);
                  }
                }
              } else if (tOrig < 0 && tReal <= 0) {
                huboFalloRed = true;
              }
            }

            if (huboCambiosCargas) {
              try {
                localStorage.setItem('movil_cargas_local', JSON.stringify(listaCargas));
              } catch {}
              window.dispatchEvent(new CustomEvent('transporte_cargas_actualizadas', { detail: listaCargas }));
            }
          }
        }
      } catch (e) {
        console.warn('[SyncEngine] Error procesando respaldo movil_cargas_local:', e);
      }
    }

    // Si algún envío falló porque el WiFi apenas estaba tomando IP/DNS, programar reintento automático en 4s
    if (huboFalloRed && typeof window !== 'undefined') {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        if (navigator.onLine && !this.isSyncing) {
          this.sincronizarTodo(empresaCodigo, true);
        }
      }, 4000);
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
