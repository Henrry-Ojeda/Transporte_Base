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
import { catalogosApi } from '@/api/catalogos.api';
import { ticketsLocales } from './ticketsLocales';
import { movilAuditLog } from './movilAuditLog';

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
    despachosSubidos: number;
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

      let pendientesDespachos = 0;
      try {
        const rawDesp = localStorage.getItem('movil_despachos_locales_pendientes');
        if (rawDesp) {
          const listD = JSON.parse(rawDesp);
          if (Array.isArray(listD)) {
            pendientesDespachos = listD.filter((x: any) => !x.synced).length;
          }
        }
      } catch {}

      const totalPend = Math.max(conteo.total, pendientesLocalStorage) + pendientesDespachos;

      const detail: SyncStatusEvent = {
        sincronizando: this.isSyncing,
        pendientesTotal: totalPend,
        pendientesRecolecciones: Math.max(conteo.recolecciones, pendientesLocalStorage),
        pendientesCombustible: conteo.combustible,
        pendientesAverias: conteo.averias,
        pendientesReceptoria: conteo.receptoria + pendientesDespachos,
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
    despachosSubidos: number;
    totalSubidos: number;
  }> {
    if (this.isSyncing && this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.emitirEstado({ error: 'Sin conexión a internet' });
      return { recoleccionesSubidas: 0, combustibleSubido: 0, averiasSubidas: 0, receptoriaSubida: 0, despachosSubidos: 0, totalSubidos: 0 };
    }

    this.isSyncing = true;
    this.emitirEstado();

    this.activeSyncPromise = (async () => {
      let recoleccionesSubidas = 0;
      let combustibleSubido = 0;
      let averiasSubidas = 0;
      let receptoriaSubida = 0;
      let despachosSubidos = 0;
      let ticketsSubidos = 0;

      try {
        // -1. Eliminar en la central los tickets que el usuario borró en modo offline
        const ticketsEliminados = await this.sincronizarEliminacionesTickets();

        // 0. Crear en la central los tickets/turnos iniciados sin conexión (antes que sus cargas)
        ticketsSubidos = await this.sincronizarTicketsLocales();

        // 1. Sincronizar Recolecciones de Leche en Fincas (IndexedDB + respaldo LocalStorage)
        recoleccionesSubidas = await this.sincronizarRecolecciones(empresaCodigo, choferId);

        // 1.5 Sincronizar Despachos Offline a Receptoría / Compañías
        despachosSubidos = await this.sincronizarDespachosPendientes(empresaCodigo, choferId);

        // 2. Sincronizar Combustible
        combustibleSubido = await this.sincronizarCombustible(empresaCodigo);

        // 3. Sincronizar Averías mecánicas
        averiasSubidas = await this.sincronizarAverias(empresaCodigo);

        // 4. Sincronizar Descargas de Receptoría
        receptoriaSubida = await this.sincronizarReceptoria(empresaCodigo);

        const totalSubidos = recoleccionesSubidas + combustibleSubido + averiasSubidas + receptoriaSubida + despachosSubidos + ticketsSubidos + ticketsEliminados;

        // Descargar catálogos actualizados desde la central (fincas, compañías, rutas)
        await this.refrescarCatalogosOffline(empresaCodigo);

        if (totalSubidos > 0) {
          this.ultimaSincronizacion = new Date().toISOString();

          // Notificar en consola y disparar evento global para refrescar vistas
          console.log(`[SyncEngine] Sincronización exitosa: ${totalSubidos} registros subidos.`);
          window.dispatchEvent(
            new CustomEvent('transporte_sync_completada', {
              detail: { totalSubidos, recoleccionesSubidas, combustibleSubido, averiasSubidas, receptoriaSubida, despachosSubidos },
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
          despachosSubidos,
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
          despachosSubidos,
          totalSubidos: recoleccionesSubidas + combustibleSubido + averiasSubidas + receptoriaSubida + despachosSubidos + ticketsSubidos,
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
   * Envía al servidor la eliminación de tickets que el chofer/admin borró en modo offline.
   */
  async sincronizarEliminacionesTickets(): Promise<number> {
    const pendientes = ticketsLocales.listarEliminacionesPendientes();
    if (pendientes.length === 0) return 0;

    let eliminados = 0;
    for (const idTicket of pendientes) {
      try {
        await operacionesApi.eliminarControl(idTicket);
        ticketsLocales.quitarEliminacionPendiente(idTicket);
        eliminados++;
        movilAuditLog.registrar({
          tipo: 'SYNC_OK',
          ticketId: idTicket,
          detalle: `Ticket #${idTicket} eliminado en la central (encolado offline)`,
        });
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 404 || status === 400) {
          // Si ya no existe en BD o no es eliminable (ej. ya tiene litros/cerrado), quitar de cola
          ticketsLocales.quitarEliminacionPendiente(idTicket);
        } else {
          console.warn(`[SyncEngine] Reintento pendiente para eliminar Ticket #${idTicket}:`, err?.message);
        }
      }
    }
    return eliminados;
  }

  /**
   * Crea en la central los tickets (turnos) que el chofer inició sin conexión.
   * Registra la equivalencia ID local (negativo) -> ID real para sus cargas.
   */
  async sincronizarTicketsLocales(): Promise<number> {
    ticketsLocales.purgarExpirados24h();
    await dbLocal.purgarExpirados24h().catch(() => 0);
    const pendientes = ticketsLocales.listarPendientes();
    if (pendientes.length === 0) return 0;

    // Evita que dos ventanas/pestañas envíen el mismo turno al mismo tiempo (duplicaría el ticket)
    if (!ticketsLocales.tomarCandadoEnvio()) return 0;

    let exitosos = 0;
    try {
      for (const t of pendientes) {
        try {
          const fechaPaquete = t.payload?.fecha || t.ticket?.fecha?.split('T')[0] || new Date().toISOString().split('T')[0];
          const choferPaquete = Number(t.payload?.choferId || t.payload?.conductorId || t.ticket?.usuarioId || 0);
          const modoPaquete: 'RUTA' | 'LIBRE' = t.modo || (t.payload?.rutaLogisticaId ? 'RUTA' : 'LIBRE');
          const res = await operacionesApi.sincronizarPaqueteTicket({
            ticketId: null,
            localUuid: t.localUuid || (t.payload?.observaciones?.match(/\[LOCAL:([A-Za-z0-9\-]{8,64})\]/)?.[1]),
            fecha: fechaPaquete,
            choferId: choferPaquete,
            camionId: t.payload?.camionId,
            modo: modoPaquete,
            rutaLogisticaId: t.payload?.rutaLogisticaId,
            observacion: t.payload?.observaciones,
            fincas: Array.isArray(t.fincas) ? t.fincas : [],
          });
          if (res && res.ticketId) {
            ticketsLocales.marcarSincronizado(t.localId, res.ticketId);
            exitosos++;
            movilAuditLog.registrar({
              tipo: 'SYNC_OK',
              ticketId: res.ticketId,
              detalle: `Ticket local ${t.localId} sincronizado como Ticket #${res.ticketId} (${Array.isArray(t.fincas) ? t.fincas.length : 0} fincas en paquete)`,
            });
          }
        } catch (err: any) {
          const status = err?.response?.status;
          const errMsg = err?.response?.data?.message || (status ? `Error ${status} de la central` : 'Sin conexión con la central');
          console.warn(`[SyncEngine] Error en sincronizarPaqueteTicket para ${t.localId} (status ${status ?? 'sin respuesta'}):`, err?.message);
          movilAuditLog.registrar({
            tipo: 'SYNC_ERROR',
            ticketId: t.localId,
            detalle: `Fallo sincronizar-paquete ticket ${t.localId}: ${errMsg}`,
          });

          // Fallback: si falló el paquete completo (foto pesada, timeout, 413, 5xx o validación de una finca)
          // y hay conexión en el navegador, crear primero el ticket vacío para subir las fincas una a una.
          const estaEnLinea = typeof navigator === 'undefined' || navigator.onLine !== false;
          if ((status && status >= 400) || (!status && estaEnLinea)) {
            const totalLtsPaquete = Array.isArray(t.fincas)
              ? t.fincas.reduce((acc: number, f: any) => acc + Number(f?.litros || 0), 0)
              : 0;
            if (!Array.isArray(t.fincas) || t.fincas.length === 0 || totalLtsPaquete <= 0) {
              ticketsLocales.eliminarPorId(t.localId);
              continue;
            }
            try {
              const resSolo = await operacionesApi.iniciarViaje({
                fecha: t.payload?.fecha,
                choferId: Number(t.payload?.choferId || t.payload?.conductorId || t.ticket?.usuarioId || 0),
                conductorId: Number(t.payload?.conductorId || t.payload?.choferId || t.ticket?.usuarioId || 0),
                camionId: t.payload?.camionId,
                rutaLogisticaId: t.payload?.rutaLogisticaId,
                observaciones: t.payload?.observaciones,
              } as any);
              if (resSolo && resSolo.id) {
                ticketsLocales.marcarSincronizado(t.localId, resSolo.id);
                exitosos++;
                movilAuditLog.registrar({
                  tipo: 'SYNC_OK',
                  ticketId: resSolo.id,
                  detalle: `Rescate ticket local ${t.localId} -> Ticket #${resSolo.id} (fincas se subirán individualmente)`,
                });
                continue;
              }
            } catch (errFallback: any) {
              movilAuditLog.registrar({
                tipo: 'SYNC_ERROR',
                ticketId: t.localId,
                detalle: `Fallo rescate iniciarViaje ${t.localId}: ${errFallback?.response?.data?.message || errFallback?.message || 'Error'}`,
              });
            }
          }

          ticketsLocales.registrarError(t.localId, errMsg);
          // No hacer break: permitir que otros tickets/cargas pendientes sigan intentando sincronizar
          continue;
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

        // Si el ticket no es válido, no reasignar a otro ticket al azar
        if (!ticketId || ticketId <= 0) {
          huboFalloRed = true;
          continue;
        }

        if (ticketId && ticketId > 0) {
          const obsLimpia = (carga.observaciones || '').trim();
          const payloadEnvio = {
            choferId: choferId || undefined,
            fincaId: Number(carga.fincaId),
            litros: Number(carga.litros),
            esAcida: Boolean(carga.esAcida),
            esDiferido: Boolean(carga.esDiferida),
            fecha: (carga.fechaRegistro || new Date().toISOString()).split('T')[0],
            hora: (() => {
              const rawH = (carga as any).hora;
              if (rawH && /^\d{2}:\d{2}(:\d{2})?$/.test(String(rawH).trim())) return String(rawH).trim();
              if (carga.fechaRegistro) {
                const d = new Date(carga.fechaRegistro);
                if (!isNaN(d.getTime())) {
                  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                }
              }
              return rawH ? String(rawH).replace(/a\.\s*m\./gi, 'AM').replace(/p\.\s*m\./gi, 'PM').trim() : undefined;
            })(),
            tipoLeche: carga.tipoLeche || 'VACA',
            observacion: obsLimpia || undefined,
            temperatura: carga.temperatura ?? undefined,
            fotoComprobante: carga.foto && carga.foto !== '[EN_INDEXEDDB]' ? carga.foto : undefined,
            fotosEvidenciaJson: (carga as any).fotosEvidenciaJson || undefined,
            latitud: carga.latitud ?? undefined,
            longitud: carga.longitud ?? undefined,
            precisionMetros: carga.precisionMetros ?? undefined,
          };

          await operacionesApi.agregarFincaViaje(ticketId, payloadEnvio);
          await dbLocal.marcarRecoleccionSincronizada(carga.idLocal);
          subidosDbId.add(carga.idLocal);
          subidosClave.add(`${ticketId}_${Number(carga.fincaId)}_${(carga.tipoLeche || 'VACA').toUpperCase()}`);
          exitosas++;
          movilAuditLog.registrar({
            tipo: 'SYNC_OK',
            ticketId,
            fincaId: Number(carga.fincaId),
            litros: Number(carga.litros),
            detalle: `Sincronizada recolección desde IndexedDB (idLocal=${carga.idLocal}, hora=${payloadEnvio.hora || 'N/A'})`,
          });
        }
      } catch (err: any) {
        huboFalloRed = true;
        console.error(`[SyncEngine] Error subiendo recolección #${carga.idLocal}:`, err);
        await dbLocal.marcarRecoleccionError(carga.idLocal, err?.message || 'Error al conectar con servidor').catch(() => {});
        movilAuditLog.registrar({
          tipo: 'SYNC_ERROR',
          ticketId: carga.ticketId,
          fincaId: Number(carga.fincaId),
          litros: Number(carga.litros),
          detalle: `Error subiendo IndexedDB (idLocal=${carga.idLocal}): ${err?.response?.data?.message || err?.message || 'Error de red'}`,
        });
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
              const tipoCarga = (c.tipoLeche || 'VACA').toUpperCase();
              const claveYa = `${tReal}_${fId}_${tipoCarga}`;
              if ((c.dbLocalId && subidosDbId.has(Number(c.dbLocalId))) || (tReal > 0 && subidosClave.has(claveYa))) {
                listaCargas[i] = { ...c, serverTicketId: tReal > 0 ? tReal : c.serverTicketId, synced: true };
                huboCambiosCargas = true;
                continue;
              }

              if (fId > 0 && Number(c.litros) > 0) {
                if (tReal > 0) {
                  try {
                    const obsLimpia = (c.observacion || '').trim();
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
                      choferId: choferId || undefined,
                      fincaId: fId,
                      litros: Number(c.litros),
                      esAcida: Boolean(c.esAcida),
                      esDiferido: Boolean(c.esDiferido),
                      fecha: (c.fecha || new Date().toISOString()).split('T')[0],
                      hora: c.hora
                        ? String(c.hora).replace(/a\.\s*m\./gi, 'AM').replace(/p\.\s*m\./gi, 'PM').trim()
                        : undefined,
                      tipoLeche: c.tipoLeche || 'VACA',
                      observacion: obsLimpia || undefined,
                      temperatura: c.temperatura ? Number(c.temperatura) : undefined,
                      fotoComprobante,
                      fotosEvidenciaJson: (c as any).fotosEvidenciaJson || undefined,
                      latitud: c.latitud ?? undefined,
                      longitud: c.longitud ?? undefined,
                      precisionMetros: c.precisionMetros ?? undefined,
                    };

                    await operacionesApi.agregarFincaViaje(tReal, payloadEnvio);
                    const subidaOk = true;

                    if (subidaOk) {
                      listaCargas[i] = { ...c, serverTicketId: tReal, synced: true };
                      if (c.dbLocalId) {
                        await dbLocal.marcarRecoleccionSincronizada(Number(c.dbLocalId)).catch(() => {});
                      }
                      subidosClave.add(`${tReal}_${fId}_${(c.tipoLeche || 'VACA').toUpperCase()}`);
                      huboCambiosCargas = true;
                      exitosas++;
                      movilAuditLog.registrar({
                        tipo: 'SYNC_OK',
                        ticketId: tReal,
                        fincaId: fId,
                        fincaNombre: c.fincaNombre,
                        litros: Number(c.litros),
                        detalle: `Sincronizada carga local en reintento (hora=${payloadEnvio.hora || 'N/A'})`,
                      });
                    }
                  } catch (errCarga: any) {
                    huboFalloRed = true;
                    console.warn(`[SyncEngine] Pendiente reintento de carga local finca #${fId} en ticket #${tReal}:`, errCarga);
                    movilAuditLog.registrar({
                      tipo: 'SYNC_ERROR',
                      ticketId: tReal,
                      fincaId: fId,
                      fincaNombre: c.fincaNombre,
                      litros: Number(c.litros),
                      detalle: `Fallo reintento carga local: ${errCarga?.response?.data?.message || errCarga?.message || 'Error de red'}`,
                    });
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
   * Sube despachos offline a receptoría / compañías pendientes
   */
  async sincronizarDespachosPendientes(empresaCodigo?: string, choferId?: number): Promise<number> {
    if (typeof window === 'undefined') return 0;
    let raw = '';
    try {
      raw = localStorage.getItem('movil_despachos_locales_pendientes') || '';
    } catch {
      return 0;
    }
    if (!raw) return 0;

    let pendientes: any[] = [];
    try {
      pendientes = JSON.parse(raw);
    } catch {
      return 0;
    }
    if (!Array.isArray(pendientes) || pendientes.length === 0) return 0;

    let exitosos = 0;
    const restantes: any[] = [];

    for (const d of pendientes) {
      if (!d || d.synced) continue;

      let ticketId = d.ticketId;
      // Si el ticketId fue creado offline (< 0), resolver ID real asignado por el servidor
      if (ticketId && ticketId < 0) {
        const real = ticketsLocales.resolverId(ticketId);
        if (real <= 0) {
          // El ticket aún no se ha creado en el servidor, mantener pendiente para el siguiente ciclo
          restantes.push(d);
          continue;
        }
        ticketId = real;
      }

      if (!ticketId || ticketId <= 0) {
        restantes.push(d);
        continue;
      }

      try {
        const dto = {
          companiaId: Number(d.companiaId || 0),
          choferId: d.choferId ? Number(d.choferId) : undefined,
          litrosDespachados: Number(d.litrosDespachados || 0),
          observacion: d.observacion || '',
          destinos: Array.isArray(d.destinos)
            ? d.destinos.map((dest: any) => ({
                companiaId: Number(dest.companiaId),
                litros: Number(dest.litros || dest.litrosDespachados || 0),
                tipoLeche: dest.tipoLeche || 'VACA',
                observacion: dest.observacion || d.observacion || '',
              }))
            : undefined,
        };

        await operacionesApi.enviarACompania(ticketId, dto);
        exitosos++;
        console.log(`[SyncEngine] Despacho pendiente del ticket #${ticketId} enviado exitosamente.`);
      } catch (err: any) {
        const msg = String(err?.response?.data?.message || err?.message || '').toLowerCase();
        const status = err?.response?.status;
        if (msg.includes('ya') || msg.includes('cerrado') || msg.includes('finalizado') || msg.includes('recepcionado') || status === 409) {
          console.warn(`[SyncEngine] Despacho ticket #${ticketId} ya procesado en servidor.`);
          exitosos++;
        } else {
          console.error(`[SyncEngine] Error al sincronizar despacho del ticket #${ticketId}:`, err);
          restantes.push(d);
        }
      }
    }

    try {
      if (restantes.length > 0) {
        localStorage.setItem('movil_despachos_locales_pendientes', JSON.stringify(restantes));
      } else {
        localStorage.removeItem('movil_despachos_locales_pendientes');
      }
    } catch {}

    return exitosos;
  }

  /**
   * Refresca los catálogos en memoria del teléfono (Fincas, Compañías, Camiones)
   */
  async refrescarCatalogosOffline(empresaCodigo?: string): Promise<void> {
    if (typeof window === 'undefined' || !navigator.onLine) return;
    try {
      // 1. Catálogo Fincas
      const fList = await catalogosApi.getFincas().catch(() => null);
      if (Array.isArray(fList) && fList.length > 0) {
        try { localStorage.setItem('movil_fincas_cache', JSON.stringify(fList)); } catch {}
        if (empresaCodigo) await dbLocal.guardarFincasCache(empresaCodigo, fList).catch(() => {});
      }
      // 2. Catálogo Compañías
      const cList = await catalogosApi.getCompanias(true).catch(() => null);
      if (Array.isArray(cList) && cList.length > 0) {
        try { localStorage.setItem('movil_catalogo_companias', JSON.stringify(cList)); } catch {}
      }
    } catch (e) {
      console.warn('[SyncEngine] Error refrescando catálogos offline:', e);
    }
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
