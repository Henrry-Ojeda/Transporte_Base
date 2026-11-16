using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;

namespace Transporte.Infrastructure.Repositories
{
    public interface IMapaRutasRepository
    {
        Task<bool> RegistrarPuntoGpsAsync(int usuarioId, RegistrarPuntoGpsDto dto);
        Task<bool> ActualizarCoordenadasFincaAsync(int fincaId, decimal latitud, decimal longitud);
        Task<AnalisisRutasMapaDto> ObtenerAnalisisMapaRutasAsync(DateTime fechaDesde, DateTime fechaHasta, int? rutaId = null, int? camionId = null, int? choferId = null);
    }

    public class MapaRutasRepository : IMapaRutasRepository
    {
        private readonly string _connectionString;
        private readonly Transporte.Core.Interfaces.ITenantService? _tenantService;

        public MapaRutasRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _tenantService = tenantService;
            _connectionString = tenantService?.GetConnectionString()
                ?? configuration.GetConnectionString("DefaultConnection")
                ?? configuration.GetConnectionString("BD_TRANSPORTE")
                ?? "Server=localhost;Database=BD_CV_PROD;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        private IDbConnection CreateConnection()
        {
            var connStr = _tenantService?.GetConnectionString() ?? _connectionString;
            return new SqlConnection(connStr);
        }

        public async Task<bool> RegistrarPuntoGpsAsync(int usuarioId, RegistrarPuntoGpsDto dto)
        {
            if (dto.ControlRutaId <= 0) return false;
            using var connection = CreateConnection();

            // PRIVACIDAD ESTRICTA: Solo capturar ubicación si el ticket existe y está ABIERTO (ProcesoActualId = 1)
            var ticket = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                SELECT cr.Id, cr.UsuarioId, u.CamionId, cr.ProcesoActualId
                FROM TB_CONTROL_RUTAS cr
                LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                WHERE cr.Id = @ControlRutaId",
                new { dto.ControlRutaId });

            if (ticket == null || (int)ticket.ProcesoActualId != 1)
            {
                return false;
            }

            var eventoSeguro = string.IsNullOrWhiteSpace(dto.Evento) ? "ENTRADA_APP" : dto.Evento.Trim().ToUpperInvariant();
            if (eventoSeguro.Length > 30) eventoSeguro = eventoSeguro[..30];

            var fechaDisp = dto.FechaHoraDispositivo ?? DateTime.UtcNow.AddHours(-4);

            await connection.ExecuteAsync(@"
                INSERT INTO TB_GPS_PUNTOS_VIAJE
                (ControlRutaId, UsuarioId, CamionId, FincaId, Latitud, Longitud, PrecisionMetros, Evento, FechaHoraDispositivo, CreatedAt)
                VALUES
                (@ControlRutaId, @UsuarioId, @CamionId, @FincaId, @Latitud, @Longitud, @PrecisionMetros, @Evento, @FechaDisp, GETDATE())",
                new
                {
                    dto.ControlRutaId,
                    UsuarioId = (int)ticket.UsuarioId,
                    CamionId = (int?)ticket.CamionId,
                    dto.FincaId,
                    dto.Latitud,
                    dto.Longitud,
                    dto.PrecisionMetros,
                    Evento = eventoSeguro,
                    FechaDisp = fechaDisp
                });

            return true;
        }

        public async Task<bool> ActualizarCoordenadasFincaAsync(int fincaId, decimal latitud, decimal longitud)
        {
            using var connection = CreateConnection();
            var rows = await connection.ExecuteAsync(
                "UPDATE TB_FINCAS SET Latitud = @latitud, Longitud = @longitud WHERE Id = @fincaId AND IsDeleted = 0",
                new { fincaId, latitud, longitud });
            return rows > 0;
        }

        public async Task<AnalisisRutasMapaDto> ObtenerAnalisisMapaRutasAsync(DateTime fechaDesde, DateTime fechaHasta, int? rutaId = null, int? camionId = null, int? choferId = null)
        {
            using var connection = CreateConnection();

            var sqlFincas = @"
                SELECT
                    f.Id, f.Codigo, f.Nombre, f.Propietario,
                    COALESCE(f.RutaId, (SELECT TOP 1 rlf.RutaLogisticaId FROM TB_RUTAS_LOGISTICA_FINCAS rlf WHERE rlf.FincaId = f.Id ORDER BY rlf.EsPrincipal DESC, rlf.RutaLogisticaId DESC)) AS RutaId,
                    COALESCE(rl.Nombre, (SELECT TOP 1 rl2.Nombre FROM TB_RUTAS_LOGISTICA_FINCAS rlf2 INNER JOIN TB_RUTAS_LOGISTICA rl2 ON rlf2.RutaLogisticaId = rl2.Id WHERE rlf2.FincaId = f.Id ORDER BY rlf2.EsPrincipal DESC, rlf2.RutaLogisticaId DESC)) AS RutaNombre,
                    COALESCE(rl.Color, (SELECT TOP 1 rl2.Color FROM TB_RUTAS_LOGISTICA_FINCAS rlf2 INNER JOIN TB_RUTAS_LOGISTICA rl2 ON rlf2.RutaLogisticaId = rl2.Id WHERE rlf2.FincaId = f.Id ORDER BY rlf2.EsPrincipal DESC, rlf2.RutaLogisticaId DESC), '#0d9488') AS RutaColor,
                    f.Latitud, f.Longitud,
                    ISNULL((SELECT CAST(ROUND(AVG(CAST(r.Litros AS FLOAT)), 0) AS INT) FROM TB_RUTAS_RECOLECCION r WHERE r.FincaId = f.Id AND r.Fecha >= DATEADD(day, -30, GETDATE())), 0) AS PromedioLitrosDiarios,
                    f.Activo
                FROM TB_FINCAS f
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON f.RutaId = rl.Id
                WHERE f.IsDeleted = 0 AND f.Activo = 1
                ORDER BY f.Nombre ASC";

            var fincas = (await connection.QueryAsync<FincaMapaDto>(sqlFincas)).ToList();
            if (rutaId.HasValue && rutaId.Value > 0)
            {
                fincas = fincas.Where(f => f.RutaId == rutaId.Value).ToList();
            }

            var sqlViajes = @"
                SELECT
                    cr.Id AS ControlRutaId,
                    cr.Fecha,
                    cr.UsuarioId,
                    ISNULL(u.NombreCompleto, 'Conductor') AS ChoferNombre,
                    u.CamionId,
                    c.Placa AS CamionPlaca,
                    cr.RutaLogisticaId,
                    rl.Nombre AS RutaNombre,
                    ISNULL(rl.Color, '#2563eb') AS RutaColor,
                    cr.ProcesoActualId,
                    cr.Estado,
                    cr.TotalLitrosFinca
                FROM TB_CONTROL_RUTAS cr
                LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_CAMIONES c ON u.CamionId = c.Id
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON cr.RutaLogisticaId = rl.Id
                WHERE CAST(cr.Fecha AS DATE) >= CAST(@fechaDesde AS DATE)
                  AND CAST(cr.Fecha AS DATE) <= CAST(@fechaHasta AS DATE)
                  AND (@rutaId IS NULL OR @rutaId = 0 OR cr.RutaLogisticaId = @rutaId)
                  AND (@camionId IS NULL OR @camionId = 0 OR u.CamionId = @camionId)
                  AND (@choferId IS NULL OR @choferId = 0 OR cr.UsuarioId = @choferId)
                ORDER BY cr.Fecha DESC, cr.Id DESC";

            var viajes = (await connection.QueryAsync<ViajeGpsResumenDto>(sqlViajes, new { fechaDesde, fechaHasta, rutaId, camionId, choferId })).ToList();
            var viajeIds = viajes.Select(v => v.ControlRutaId).ToList();

            if (viajeIds.Count > 0)
            {
                var sqlPuntos = @"
                    SELECT
                        g.Id, g.ControlRutaId, g.UsuarioId,
                        ISNULL(u.NombreCompleto, 'Conductor') AS ChoferNombre,
                        g.CamionId, c.Placa AS CamionPlaca,
                        g.FincaId, f.Nombre AS FincaNombre,
                        g.Latitud, g.Longitud, g.PrecisionMetros,
                        g.Evento, g.FechaHoraDispositivo
                    FROM TB_GPS_PUNTOS_VIAJE g
                    LEFT JOIN TB_USUARIOS u ON g.UsuarioId = u.Id
                    LEFT JOIN TB_CAMIONES c ON g.CamionId = c.Id
                    LEFT JOIN TB_FINCAS f ON g.FincaId = f.Id
                    WHERE g.ControlRutaId IN @viajeIds
                    ORDER BY g.FechaHoraDispositivo ASC, g.Id ASC";

                var todosPuntos = (await connection.QueryAsync<PuntoGpsViajeDto>(sqlPuntos, new { viajeIds })).ToList();

                foreach (var v in viajes)
                {
                    v.Puntos = todosPuntos.Where(p => p.ControlRutaId == v.ControlRutaId).ToList();
                    v.CantidadPuntos = v.Puntos.Count;
                    if (v.Puntos.Count >= 2)
                    {
                        double distKm = 0;
                        for (int i = 1; i < v.Puntos.Count; i++)
                        {
                            distKm += CalcularDistanciaKm(
                                (double)v.Puntos[i - 1].Latitud, (double)v.Puntos[i - 1].Longitud,
                                (double)v.Puntos[i].Latitud, (double)v.Puntos[i].Longitud);
                        }
                        v.DistanciaEstimadaKm = Math.Round(distKm, 2);
                        v.DuracionMinutos = (int)Math.Max(0, Math.Round((v.Puntos.Last().FechaHoraDispositivo - v.Puntos.First().FechaHoraDispositivo).TotalMinutes));
                    }
                }
            }

            // Detectar cruces / intersecciones entre rutas logísticas (fincas georreferenciadas dentro de 600m)
            var cruces = DetectarCrucesEntreRutas(fincas);

            return new AnalisisRutasMapaDto
            {
                Fincas = fincas,
                Viajes = viajes.Where(v => v.CantidadPuntos > 0).ToList(),
                Cruces = cruces
            };
        }

        private static List<CruceRutasDto> DetectarCrucesEntreRutas(List<FincaMapaDto> fincas)
        {
            var cruces = new List<CruceRutasDto>();
            var fincasConGps = fincas.Where(f => f.Latitud.HasValue && f.Longitud.HasValue && f.RutaId.HasValue).ToList();
            var paresVistos = new HashSet<string>();

            for (int i = 0; i < fincasConGps.Count; i++)
            {
                for (int j = i + 1; j < fincasConGps.Count; j++)
                {
                    var a = fincasConGps[i];
                    var b = fincasConGps[j];
                    if (a.RutaId == b.RutaId) continue;

                    int minR = Math.Min(a.RutaId!.Value, b.RutaId!.Value);
                    int maxR = Math.Max(a.RutaId!.Value, b.RutaId!.Value);
                    var key = $"{minR}-{maxR}";

                    double distMetros = CalcularDistanciaKm((double)a.Latitud!.Value, (double)a.Longitud!.Value, (double)b.Latitud!.Value, (double)b.Longitud!.Value) * 1000.0;
                    if (distMetros <= 800.0 && !paresVistos.Contains(key))
                    {
                        paresVistos.Add(key);
                        cruces.Add(new CruceRutasDto
                        {
                            RutaAId = a.RutaId.Value,
                            RutaANombre = a.RutaNombre ?? $"Ruta #{a.RutaId}",
                            RutaAColor = a.RutaColor,
                            RutaBId = b.RutaId.Value,
                            RutaBNombre = b.RutaNombre ?? $"Ruta #{b.RutaId}",
                            RutaBColor = b.RutaColor,
                            Latitud = Math.Round((a.Latitud.Value + b.Latitud.Value) / 2m, 6),
                            Longitud = Math.Round((a.Longitud.Value + b.Longitud.Value) / 2m, 6),
                            DistanciaEntrePuntosMetros = Math.Round(distMetros, 0),
                            Descripcion = $"Cruce cercano entre {a.RutaNombre} ({a.Nombre}) y {b.RutaNombre} ({b.Nombre}) a {Math.Round(distMetros)} m"
                        });
                    }
                }
            }

            return cruces;
        }

        private static double CalcularDistanciaKm(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6371.0;
            double dLat = (lat2 - lat1) * Math.PI / 180.0;
            double dLon = (lon2 - lon1) * Math.PI / 180.0;
            double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                       Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0) *
                       Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
            return R * c;
        }
    }
}
