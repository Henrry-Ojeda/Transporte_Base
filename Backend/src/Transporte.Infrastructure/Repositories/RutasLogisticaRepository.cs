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
    public interface IRutasLogisticaRepository
    {
        Task<IEnumerable<RutaLogisticaDto>> ObtenerRutasAsync();
        Task<RutaLogisticaDto?> ObtenerRutaPorIdAsync(int id);
        Task<int> CrearRutaAsync(GuardarRutaLogisticaDto dto);
        Task<bool> ActualizarRutaAsync(int id, GuardarRutaLogisticaDto dto);
        Task<bool> EliminarRutaAsync(int id);
        Task<IEnumerable<dynamic>> ObtenerFincasDeRutaAsync(int rutaId);
        Task<bool> AsignarFincasARutaAsync(int rutaId, List<int> fincaIds);
        Task<IEnumerable<PlanificacionRutaChoferDto>> ObtenerPlanificacionesPorFechaAsync(DateTime fecha);
        Task<int> GuardarPlanificacionChoferAsync(GuardarPlanificacionRutaChoferDto dto, int usuarioId);
        Task<bool> EliminarPlanificacionChoferAsync(int id);
        Task<IEnumerable<FincaPromedioDto>> ObtenerFincasConPromedio15DiasAsync(int? rutaId = null);
    }

    public class RutasLogisticaRepository : IRutasLogisticaRepository
    {
        private readonly string _connectionString;

        public RutasLogisticaRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_CV_PROD;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        private IDbConnection CreateConnection() => new SqlConnection(_connectionString);

        public async Task<IEnumerable<RutaLogisticaDto>> ObtenerRutasAsync()
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT 
                    r.Id,
                    r.Codigo,
                    r.Nombre,
                    r.Descripcion,
                    r.Color,
                    r.Activo,
                    r.CamionPredeterminadoId,
                    c.Placa AS CamionPlaca,
                    c.CapacidadLitros AS CapacidadCamionLitros,
                    r.ChoferPredeterminadoId,
                    u.NombreCompleto AS ChoferNombre,
                    r.CreatedAt,
                    (SELECT COUNT(*) FROM TB_FINCAS f WHERE f.RutaId = r.Id AND f.Activo = 1) AS TotalFincasAsignadas,
                    ISNULL((
                        SELECT SUM(sub.Prom)
                        FROM (
                            SELECT CAST(ROUND(AVG(CAST(rec.Litros AS FLOAT)), 0) AS INT) AS Prom
                            FROM TB_FINCAS f2
                            INNER JOIN TB_RUTAS_RECOLECCION rec ON rec.FincaId = f2.Id AND rec.Fecha >= DATEADD(day, -30, GETDATE())
                            WHERE f2.RutaId = r.Id AND f2.Activo = 1
                            GROUP BY f2.Id
                        ) sub
                    ), 0) AS TotalLitrosEstimados
                FROM TB_RUTAS_LOGISTICA r
                LEFT JOIN TB_CAMIONES c ON r.CamionPredeterminadoId = c.Id
                LEFT JOIN TB_USUARIOS u ON r.ChoferPredeterminadoId = u.Id
                ORDER BY r.Nombre ASC";
            return await connection.QueryAsync<RutaLogisticaDto>(sql);
        }

        public async Task<RutaLogisticaDto?> ObtenerRutaPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT 
                    r.Id,
                    r.Codigo,
                    r.Nombre,
                    r.Descripcion,
                    r.Color,
                    r.Activo,
                    r.CamionPredeterminadoId,
                    c.Placa AS CamionPlaca,
                    c.CapacidadLitros AS CapacidadCamionLitros,
                    r.ChoferPredeterminadoId,
                    u.NombreCompleto AS ChoferNombre,
                    r.CreatedAt,
                    (SELECT COUNT(*) FROM TB_FINCAS f WHERE f.RutaId = r.Id AND f.Activo = 1) AS TotalFincasAsignadas,
                    ISNULL((
                        SELECT SUM(sub.Prom)
                        FROM (
                            SELECT CAST(ROUND(AVG(CAST(rec.Litros AS FLOAT)), 0) AS INT) AS Prom
                            FROM TB_FINCAS f2
                            INNER JOIN TB_RUTAS_RECOLECCION rec ON rec.FincaId = f2.Id AND rec.Fecha >= DATEADD(day, -30, GETDATE())
                            WHERE f2.RutaId = r.Id AND f2.Activo = 1
                            GROUP BY f2.Id
                        ) sub
                    ), 0) AS TotalLitrosEstimados
                FROM TB_RUTAS_LOGISTICA r
                LEFT JOIN TB_CAMIONES c ON r.CamionPredeterminadoId = c.Id
                LEFT JOIN TB_USUARIOS u ON r.ChoferPredeterminadoId = u.Id
                WHERE r.Id = @id";
            return await connection.QueryFirstOrDefaultAsync<RutaLogisticaDto>(sql, new { id });
        }

        public async Task<int> CrearRutaAsync(GuardarRutaLogisticaDto dto)
        {
            using var connection = CreateConnection();
            var sql = @"
                INSERT INTO TB_RUTAS_LOGISTICA (Codigo, Nombre, Descripcion, Color, CamionPredeterminadoId, ChoferPredeterminadoId, Activo, CreatedAt)
                VALUES (@Codigo, @Nombre, @Descripcion, @Color, @CamionPredeterminadoId, @ChoferPredeterminadoId, @Activo, GETDATE());
                SELECT CAST(SCOPE_IDENTITY() AS INT);";
            return await connection.ExecuteScalarAsync<int>(sql, dto);
        }

        public async Task<bool> ActualizarRutaAsync(int id, GuardarRutaLogisticaDto dto)
        {
            using var connection = CreateConnection();
            var sql = @"
                UPDATE TB_RUTAS_LOGISTICA
                SET Codigo = @Codigo,
                    Nombre = @Nombre,
                    Descripcion = @Descripcion,
                    Color = @Color,
                    CamionPredeterminadoId = @CamionPredeterminadoId,
                    ChoferPredeterminadoId = @ChoferPredeterminadoId,
                    Activo = @Activo
                WHERE Id = @id";
            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                dto.Codigo,
                dto.Nombre,
                dto.Descripcion,
                dto.Color,
                dto.CamionPredeterminadoId,
                dto.ChoferPredeterminadoId,
                dto.Activo
            });
            return rows > 0;
        }

        public async Task<bool> EliminarRutaAsync(int id)
        {
            using var connection = CreateConnection();
            var sql = @"
                UPDATE TB_FINCAS SET RutaId = NULL WHERE RutaId = @id;
                DELETE FROM TB_RUTAS_LOGISTICA WHERE Id = @id;";
            var rows = await connection.ExecuteAsync(sql, new { id });
            return rows > 0;
        }

        public async Task<IEnumerable<dynamic>> ObtenerFincasDeRutaAsync(int rutaId)
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT 
                    f.Id, 
                    f.Codigo, 
                    f.Nombre, 
                    f.Propietario, 
                    f.RutaId,
                    CASE WHEN f.RutaId = @rutaId THEN 1 ELSE 0 END AS Asignada
                FROM TB_FINCAS f
                WHERE f.Activo = 1
                ORDER BY Asignada DESC, f.Nombre ASC";
            return await connection.QueryAsync(sql, new { rutaId });
        }

        public async Task<bool> AsignarFincasARutaAsync(int rutaId, List<int> fincaIds)
        {
            using var connection = CreateConnection();
            if (connection.State != ConnectionState.Open) connection.Open();
            using var tx = connection.BeginTransaction();
            try
            {
                if (fincaIds == null || fincaIds.Count == 0)
                {
                    await connection.ExecuteAsync("UPDATE TB_FINCAS SET RutaId = NULL WHERE RutaId = @rutaId", new { rutaId }, tx);
                }
                else
                {
                    // Desasociar fincas de esta ruta que ya no estén seleccionadas
                    await connection.ExecuteAsync(
                        "UPDATE TB_FINCAS SET RutaId = NULL WHERE RutaId = @rutaId AND Id NOT IN @fincaIds",
                        new { rutaId, fincaIds }, tx);

                    // Asociar fincas seleccionadas
                    await connection.ExecuteAsync(
                        "UPDATE TB_FINCAS SET RutaId = @rutaId WHERE Id IN @fincaIds",
                        new { rutaId, fincaIds }, tx);
                }

                tx.Commit();
                return true;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public async Task<IEnumerable<PlanificacionRutaChoferDto>> ObtenerPlanificacionesPorFechaAsync(DateTime fecha)
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT 
                    p.Id,
                    p.Fecha,
                    p.CamionId,
                    c.Placa AS CamionPlaca,
                    ISNULL(c.CapacidadLitros, p.CapacidadCamionLitros) AS CapacidadCamionLitros,
                    p.ConductorId,
                    u.NombreCompleto AS ConductorNombre,
                    p.RutaLogisticaId,
                    r.Nombre AS RutaLogisticaNombre,
                    p.RutasIds,
                    p.FincasIds,
                    p.TotalFincas,
                    p.LitrosEstimados,
                    p.PorcentajeOcupacion,
                    p.Observacion,
                    p.ControlRutaId,
                    p.Activo,
                    p.CreatedAt
                FROM TB_PLANIFICACION_RUTAS_CHOFERES p
                LEFT JOIN TB_CAMIONES c ON p.CamionId = c.Id
                LEFT JOIN TB_USUARIOS u ON p.ConductorId = u.Id
                LEFT JOIN TB_RUTAS_LOGISTICA r ON p.RutaLogisticaId = r.Id
                WHERE p.Fecha = @fecha AND p.Activo = 1
                ORDER BY p.Id ASC";
            var list = (await connection.QueryAsync<PlanificacionRutaChoferDto>(sql, new { fecha = fecha.Date })).ToList();
            foreach (var item in list)
            {
                if (!string.IsNullOrWhiteSpace(item.FincasIds))
                {
                    item.ListaFincasIds = item.FincasIds
                        .Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => int.TryParse(s.Trim(), out var val) ? val : 0)
                        .Where(x => x > 0)
                        .ToList();
                }

                // Sincronizar estado real del Ticket operativo
                var ticketSql = @"
                    SELECT TOP 1 cr.Id, cr.Estado, cr.TotalLitrosFinca
                    FROM TB_CONTROL_RUTAS cr
                    WHERE (cr.Id = @ControlRutaId OR (cr.Fecha = @Fecha AND cr.UsuarioId = @ConductorId))
                    ORDER BY cr.Id DESC";
                var ticketInfo = await connection.QueryFirstOrDefaultAsync<dynamic>(ticketSql, new
                {
                    ControlRutaId = item.ControlRutaId ?? 0,
                    Fecha = item.Fecha.Date,
                    ConductorId = item.ConductorId
                });

                if (ticketInfo != null)
                {
                    item.ControlRutaId = (long)ticketInfo.Id;
                    item.EstadoTicket = (string?)ticketInfo.Estado ?? "ABIERTO";
                    item.LitrosRecolectadosReal = (int)(ticketInfo.TotalLitrosFinca ?? 0);

                    var fincasRecSql = @"
                        SELECT DISTINCT FincaId 
                        FROM TB_RUTAS_RECOLECCION 
                        WHERE ControlRutaId = @TicketId AND FincaId IS NOT NULL";
                    var recIds = await connection.QueryAsync<int>(fincasRecSql, new { TicketId = (long)ticketInfo.Id });
                    item.FincasRecolectadasIds = recIds.ToList();
                }
                else
                {
                    item.EstadoTicket = "PLANIFICADO";
                    item.LitrosRecolectadosReal = 0;
                    item.FincasRecolectadasIds = new List<int>();
                }
            }

            // Sincronizar automáticamente tickets de la jornada creados directamente en TB_CONTROL_RUTAS
            try
            {
                var ticketsIdsExistentes = list.Where(p => p.ControlRutaId.HasValue).Select(p => p.ControlRutaId!.Value).ToHashSet();
                var ticketsSinPlanSql = @"
                    SELECT 
                        cr.Id AS ControlRutaId,
                        cr.Fecha,
                        cr.CamionId,
                        c.Placa AS CamionPlaca,
                        ISNULL(c.CapacidadLitros, 6000) AS CapacidadCamionLitros,
                        cr.UsuarioId AS ConductorId,
                        u.NombreCompleto AS ConductorNombre,
                        cr.Estado AS EstadoTicket,
                        CAST(ISNULL(cr.TotalLitrosFinca, 0) AS INT) AS LitrosRecolectadosReal,
                        cr.Observaciones AS Observacion
                    FROM TB_CONTROL_RUTAS cr
                    LEFT JOIN TB_CAMIONES c ON cr.CamionId = c.Id
                    LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                    WHERE cr.Fecha = @fecha AND (cr.IsDeleted = 0 OR cr.IsDeleted IS NULL)
                    ORDER BY cr.Id ASC";

                var ticketsDirectos = await connection.QueryAsync<dynamic>(ticketsSinPlanSql, new { fecha = fecha.Date });
                foreach (var tk in ticketsDirectos)
                {
                    long tId = (long)tk.ControlRutaId;
                    if (ticketsIdsExistentes.Contains(tId)) continue;

                    int conductorId = (int?)tk.ConductorId ?? 0;
                    int camionId = (int?)tk.CamionId ?? 0;

                    // Si ya existe una planificación para este camión en la fecha, no duplicar
                    if (list.Any(p => (camionId > 0 && p.CamionId == camionId)))
                    {
                        continue;
                    }

                    // Fincas recolectadas de este ticket
                    var fincasRecSql = @"
                        SELECT DISTINCT FincaId 
                        FROM TB_RUTAS_RECOLECCION 
                        WHERE ControlRutaId = @TicketId AND FincaId IS NOT NULL";
                    var recIds = (await connection.QueryAsync<int>(fincasRecSql, new { TicketId = tId })).ToList();

                    int capacidadCamion = (int)tk.CapacidadCamionLitros;
                    int litrosReal = (int)tk.LitrosRecolectadosReal;
                    int pct = capacidadCamion > 0 ? (int)Math.Round((double)litrosReal / capacidadCamion * 100) : 0;

                    var planVirtual = new PlanificacionRutaChoferDto
                    {
                        Id = (int)tId,
                        Fecha = (DateTime)tk.Fecha,
                        CamionId = camionId,
                        CamionPlaca = (string?)tk.CamionPlaca ?? $"Camión #{camionId}",
                        CapacidadCamionLitros = capacidadCamion,
                        ConductorId = conductorId,
                        ConductorNombre = (string?)tk.ConductorNombre ?? "Conductor",
                        ControlRutaId = tId,
                        EstadoTicket = (string?)tk.EstadoTicket ?? "ABIERTO",
                        LitrosRecolectadosReal = litrosReal,
                        ListaFincasIds = recIds,
                        FincasRecolectadasIds = recIds,
                        TotalFincas = recIds.Count,
                        LitrosEstimados = litrosReal,
                        PorcentajeOcupacion = pct,
                        Observacion = (string?)tk.Observacion,
                        Activo = true,
                        CreatedAt = (DateTime)tk.Fecha
                    };

                    list.Add(planVirtual);
                }
            }
            catch
            {
                // Silencioso para no bloquear la consulta de planificaciones
            }

            return list;
        }

        public async Task<int> GuardarPlanificacionChoferAsync(GuardarPlanificacionRutaChoferDto dto, int usuarioId)
        {
            using var connection = CreateConnection();
            var fincasIdsStr = string.Join(",", dto.FincasIds.Distinct());
            var totalFincas = dto.FincasIds.Distinct().Count();

            var capacidad = await connection.ExecuteScalarAsync<int?>(
                "SELECT CapacidadLitros FROM TB_CAMIONES WHERE Id = @CamionId", new { dto.CamionId }) ?? 10000;

            int porcentaje = capacidad > 0 ? (int)Math.Round((double)dto.LitrosEstimados / capacidad * 100) : 0;

            // 1. Sincronizar o crear el Ticket operativo en TB_CONTROL_RUTAS
            var ticketExistenteId = await connection.ExecuteScalarAsync<long?>(@"
                SELECT TOP 1 Id FROM TB_CONTROL_RUTAS 
                WHERE Fecha = @Fecha AND UsuarioId = @ConductorId
                ORDER BY Id DESC", new { Fecha = dto.Fecha.Date, ConductorId = dto.ConductorId });

            long ticketIdEfectivo;
            if (!ticketExistenteId.HasValue)
            {
                var cicloId = await connection.ExecuteScalarAsync<int?>(@"
                    SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS 
                    WHERE @Fecha BETWEEN FechaInicio AND FechaFin AND Estado = 'ABIERTO'", new { Fecha = dto.Fecha.Date });
                if (!cicloId.HasValue)
                {
                    cicloId = await connection.ExecuteScalarAsync<int?>(@"
                        SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS 
                        WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC");
                }

                var sqlCrearTicket = @"
                    INSERT INTO TB_CONTROL_RUTAS
                    (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, RutaLogisticaId, Observacion, CreatedAt, CreatedBy)
                    VALUES
                    (@Fecha, @ConductorId, @CicloId, 0, 0, 0, 0, 'ABIERTO', 1, @RutaLogisticaId, @Observacion, GETDATE(), @usuarioId);
                    SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

                ticketIdEfectivo = await connection.ExecuteScalarAsync<long>(sqlCrearTicket, new
                {
                    Fecha = dto.Fecha.Date,
                    ConductorId = dto.ConductorId,
                    CicloId = cicloId ?? 1,
                    dto.RutaLogisticaId,
                    dto.Observacion,
                    usuarioId
                });
            }
            else
            {
                ticketIdEfectivo = ticketExistenteId.Value;
                if (dto.RutaLogisticaId.HasValue && dto.RutaLogisticaId.Value > 0)
                {
                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_RUTAS
                        SET RutaLogisticaId = @RutaLogisticaId,
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @usuarioId
                        WHERE Id = @ticketIdEfectivo",
                        new { dto.RutaLogisticaId, usuarioId, ticketIdEfectivo });
                }
            }

            // 2. Guardar o actualizar la Planificación ligada al Ticket
            if (dto.Id.HasValue && dto.Id.Value > 0)
            {
                var sqlUpdate = @"
                    UPDATE TB_PLANIFICACION_RUTAS_CHOFERES
                    SET Fecha = @Fecha,
                        CamionId = @CamionId,
                        ConductorId = @ConductorId,
                        RutaLogisticaId = @RutaLogisticaId,
                        RutasIds = @RutasIds,
                        FincasIds = @FincasIds,
                        TotalFincas = @TotalFincas,
                        LitrosEstimados = @LitrosEstimados,
                        CapacidadCamionLitros = @CapacidadCamionLitros,
                        PorcentajeOcupacion = @PorcentajeOcupacion,
                        Observacion = @Observacion,
                        ControlRutaId = @ticketIdEfectivo,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @Id";
                await connection.ExecuteAsync(sqlUpdate, new
                {
                    Id = dto.Id.Value,
                    Fecha = dto.Fecha.Date,
                    dto.CamionId,
                    dto.ConductorId,
                    dto.RutaLogisticaId,
                    dto.RutasIds,
                    FincasIds = fincasIdsStr,
                    TotalFincas = totalFincas,
                    dto.LitrosEstimados,
                    CapacidadCamionLitros = capacidad,
                    PorcentajeOcupacion = porcentaje,
                    dto.Observacion,
                    ticketIdEfectivo,
                    usuarioId
                });
                return dto.Id.Value;
            }
            else
            {
                var sqlInsert = @"
                    INSERT INTO TB_PLANIFICACION_RUTAS_CHOFERES
                    (Fecha, CamionId, ConductorId, RutaLogisticaId, RutasIds, FincasIds, TotalFincas, LitrosEstimados, CapacidadCamionLitros, PorcentajeOcupacion, Observacion, ControlRutaId, Activo, CreatedAt, CreatedBy)
                    VALUES
                    (@Fecha, @CamionId, @ConductorId, @RutaLogisticaId, @RutasIds, @FincasIds, @TotalFincas, @LitrosEstimados, @CapacidadCamionLitros, @PorcentajeOcupacion, @Observacion, @ticketIdEfectivo, 1, GETDATE(), @usuarioId);
                    SELECT CAST(SCOPE_IDENTITY() AS INT);";
                return await connection.ExecuteScalarAsync<int>(sqlInsert, new
                {
                    Fecha = dto.Fecha.Date,
                    dto.CamionId,
                    dto.ConductorId,
                    dto.RutaLogisticaId,
                    dto.RutasIds,
                    FincasIds = fincasIdsStr,
                    TotalFincas = totalFincas,
                    dto.LitrosEstimados,
                    CapacidadCamionLitros = capacidad,
                    PorcentajeOcupacion = porcentaje,
                    dto.Observacion,
                    ticketIdEfectivo,
                    usuarioId
                });
            }
        }

        public async Task<bool> EliminarPlanificacionChoferAsync(int id)
        {
            using var connection = CreateConnection();
            var rows = await connection.ExecuteAsync("DELETE FROM TB_PLANIFICACION_RUTAS_CHOFERES WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<IEnumerable<FincaPromedioDto>> ObtenerFincasConPromedio15DiasAsync(int? rutaId = null)
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT 
                    f.Id AS FincaId,
                    f.Nombre AS FincaNombre,
                    f.Propietario,
                    f.RutaId,
                    CASE WHEN f.TieneDosTiposLeche = 1 THEN 'BUFALA' ELSE 'VACA' END AS TipoLeche,
                    CAST(ISNULL(p15.Promedio15Dias, ISNULL(pTotal.PromedioTotal, 0)) AS INT) AS PromedioLitros,
                    ISNULL(p15.DiasRecolectados, 0) AS DiasRecolectados15
                FROM TB_FINCAS f
                LEFT JOIN (
                    SELECT FincaId, ROUND(AVG(CAST(Litros AS FLOAT)), 0) AS Promedio15Dias, COUNT(1) AS DiasRecolectados
                    FROM TB_RUTAS_RECOLECCION
                    WHERE Fecha >= DATEADD(day, -15, CAST(GETDATE() AS DATE))
                    GROUP BY FincaId
                ) p15 ON f.Id = p15.FincaId
                LEFT JOIN (
                    SELECT FincaId, ROUND(AVG(CAST(Litros AS FLOAT)), 0) AS PromedioTotal
                    FROM TB_RUTAS_RECOLECCION
                    GROUP BY FincaId
                ) pTotal ON f.Id = pTotal.FincaId
                WHERE f.IsDeleted = 0 AND f.Activo = 1 " +
                (rutaId.HasValue && rutaId.Value > 0 ? " AND f.RutaId = @rutaId " : "") +
                " ORDER BY f.Nombre ASC";
            return await connection.QueryAsync<FincaPromedioDto>(sql, new { rutaId });
        }
    }
}
