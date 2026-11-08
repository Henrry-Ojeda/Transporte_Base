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
        Task<bool> ModificarFincasTicketAsync(long controlRutaId, List<int> fincaIds, int usuarioId);
        Task<IEnumerable<FincaPromedioDto>> ObtenerFincasConPromedio15DiasAsync(int? rutaId = null);
    }

    public class RutasLogisticaRepository : IRutasLogisticaRepository
    {
        private readonly string _connectionString;
        private readonly Transporte.Core.Interfaces.ITenantService? _tenantService;

        public RutasLogisticaRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
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
                WHERE CAST(p.Fecha AS DATE) = CAST(@fecha AS DATE) AND p.Activo = 1
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
                    SELECT TOP 1 cr.Id, cr.Estado, cr.TotalLitrosFinca, cr.ProcesoActualId
                    FROM TB_CONTROL_RUTAS cr
                    WHERE (cr.Id = @ControlRutaId OR (CAST(cr.Fecha AS DATE) = CAST(@Fecha AS DATE) AND cr.UsuarioId = @ConductorId))
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
                    string rawEst = (string?)ticketInfo.Estado ?? "ABIERTO";
                    int procId = ticketInfo.ProcesoActualId != null ? Convert.ToInt32(ticketInfo.ProcesoActualId) : 1;
                    bool esFin = procId >= 4 || rawEst.Contains("Finaliz", StringComparison.OrdinalIgnoreCase) || rawEst.Contains("Cerrad", StringComparison.OrdinalIgnoreCase) || rawEst.StartsWith("4");
                    item.EstadoTicket = esFin ? "FINALIZADO" : rawEst;
                    item.LitrosRecolectadosReal = (int)(ticketInfo.TotalLitrosFinca ?? 0);

                    var fincasRecSql = @"
                        SELECT DISTINCT FincaId 
                        FROM TB_RUTAS_RECOLECCION 
                        WHERE ControlRutaId = @TicketId AND FincaId IS NOT NULL AND Litros > 0";
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
                        ISNULL(cam.Id, 0) AS CamionId,
                        ISNULL(cam.Placa, 'Sin Camión') AS CamionPlaca,
                        ISNULL(cam.CapacidadLitros, 6000) AS CapacidadCamionLitros,
                        cr.UsuarioId AS ConductorId,
                        ISNULL(u.NombreCompleto, 'Conductor') AS ConductorNombre,
                        cr.Estado AS EstadoTicket,
                        cr.RutaLogisticaId,
                        r.Nombre AS RutaLogisticaNombre,
                        CAST(ISNULL(cr.TotalLitrosFinca, 0) AS INT) AS LitrosRecolectadosReal,
                        cr.Observacion AS Observacion
                    FROM TB_CONTROL_RUTAS cr
                    LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                    LEFT JOIN TB_CAMIONES cam ON cam.UsuarioId = cr.UsuarioId AND cam.Activo = 1
                    LEFT JOIN TB_RUTAS_LOGISTICA r ON cr.RutaLogisticaId = r.Id
                    WHERE CAST(cr.Fecha AS DATE) = CAST(@fecha AS DATE)
                      AND ISNULL(cr.ProcesoActualId, 0) < 4
                      AND (cr.Estado IS NULL OR (cr.Estado NOT LIKE '%Finaliz%' AND cr.Estado NOT LIKE '%Cerrad%' AND cr.Estado NOT LIKE '4%'))
                    ORDER BY cr.Id ASC";

                var ticketsDirectos = await connection.QueryAsync<dynamic>(ticketsSinPlanSql, new { fecha = fecha.Date });
                foreach (var tk in ticketsDirectos)
                {
                    long tId = Convert.ToInt64(tk.ControlRutaId);
                    if (ticketsIdsExistentes.Contains(tId)) continue;

                    int conductorId = Convert.ToInt32(tk.ConductorId ?? 0);
                    int camionId = Convert.ToInt32(tk.CamionId ?? 0);

                    // Si ya existe una planificación para este camión en la fecha, no duplicar
                    if (list.Any(p => (camionId > 0 && p.CamionId == camionId)))
                    {
                        continue;
                    }

                    // Fincas recolectadas de este ticket (con leche ya pesada)
                    var fincasConLecheSql = @"
                        SELECT DISTINCT FincaId 
                        FROM TB_RUTAS_RECOLECCION 
                        WHERE ControlRutaId = @TicketId AND FincaId IS NOT NULL AND Litros > 0";
                    var recolectadasIds = (await connection.QueryAsync<int>(fincasConLecheSql, new { TicketId = tId })).ToList();

                    // TODAS las fincas asignadas al ticket (tanto pendientes como recolectadas)
                    var todasFincasTicketSql = @"
                        SELECT DISTINCT FincaId 
                        FROM TB_RUTAS_RECOLECCION 
                        WHERE ControlRutaId = @TicketId AND FincaId IS NOT NULL";
                    var todasFincasIds = (await connection.QueryAsync<int>(todasFincasTicketSql, new { TicketId = tId })).ToList();

                    // Si no tiene paradas en TB_RUTAS_RECOLECCION pero tiene RutaLogisticaId, obtener fincas de la ruta
                    int? rLogId = tk.RutaLogisticaId != null ? Convert.ToInt32(tk.RutaLogisticaId) : null;
                    if (todasFincasIds.Count == 0 && rLogId.HasValue && rLogId.Value > 0)
                    {
                        var fincasRutaSql = "SELECT Id FROM TB_FINCAS WHERE RutaId = @RutaId AND (Activo = 1 OR Activo IS NULL)";
                        var fIdsRuta = await connection.QueryAsync<int>(fincasRutaSql, new { RutaId = rLogId.Value });
                        todasFincasIds = fIdsRuta.ToList();
                    }

                    int capacidadCamion = Convert.ToInt32(tk.CapacidadCamionLitros ?? 6000);
                    int litrosReal = Convert.ToInt32(tk.LitrosRecolectadosReal ?? 0);

                    // Calcular litros proyectados con promedio de 15 días de las fincas asignadas
                    int litrosEstimados = 0;
                    if (todasFincasIds.Count > 0)
                    {
                        var sqlEstimados = @"
                            SELECT CAST(ISNULL(SUM(ISNULL(p15.Promedio15Dias, 200)), 0) AS INT)
                            FROM TB_FINCAS f
                            LEFT JOIN (
                                SELECT FincaId, ROUND(AVG(CAST(Litros AS FLOAT)), 0) AS Promedio15Dias
                                FROM TB_RUTAS_RECOLECCION
                                WHERE Fecha >= DATEADD(day, -15, CAST(GETDATE() AS DATE))
                                GROUP BY FincaId
                            ) p15 ON f.Id = p15.FincaId
                            WHERE f.Id IN @FincasIds";
                        var sumObj = await connection.ExecuteScalarAsync<object?>(sqlEstimados, new { FincasIds = todasFincasIds });
                        litrosEstimados = sumObj != null ? Convert.ToInt32(sumObj) : 0;
                    }
                    if (litrosEstimados == 0 && litrosReal > 0)
                    {
                        litrosEstimados = litrosReal;
                    }

                    int pct = capacidadCamion > 0 ? (int)Math.Round((double)(litrosEstimados > 0 ? litrosEstimados : litrosReal) / capacidadCamion * 100) : 0;
                    DateTime tkFecha = tk.Fecha is DateTime dt ? dt : Convert.ToDateTime(tk.Fecha);

                    var planVirtual = new PlanificacionRutaChoferDto
                    {
                        Id = (int)tId,
                        Fecha = tkFecha,
                        CamionId = camionId,
                        CamionPlaca = (string?)tk.CamionPlaca ?? $"Camión #{camionId}",
                        CapacidadCamionLitros = capacidadCamion,
                        ConductorId = conductorId,
                        ConductorNombre = (string?)tk.ConductorNombre ?? "Conductor",
                        RutaLogisticaId = rLogId,
                        RutaLogisticaNombre = (string?)tk.RutaLogisticaNombre,
                        ControlRutaId = tId,
                        EstadoTicket = (string?)tk.EstadoTicket ?? "ABIERTO",
                        LitrosRecolectadosReal = litrosReal,
                        ListaFincasIds = todasFincasIds,
                        FincasRecolectadasIds = recolectadasIds,
                        TotalFincas = todasFincasIds.Count,
                        LitrosEstimados = litrosEstimados,
                        PorcentajeOcupacion = pct,
                        Observacion = (string?)tk.Observacion,
                        Activo = true,
                        CreatedAt = tkFecha
                    };

                    list.Add(planVirtual);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error en sincronizacion automatica de tickets a planificacion: {ex.Message}");
                throw;
            }

            // En Planificación operativa SOLO deben mostrarse los tickets y asignaciones ACTIVAS (excluir finalizados/cerrados)
            return list.Where(p => 
                p.EstadoTicket == null || 
                (!p.EstadoTicket.Equals("FINALIZADO", StringComparison.OrdinalIgnoreCase) &&
                 !p.EstadoTicket.Contains("Finaliz", StringComparison.OrdinalIgnoreCase) &&
                 !p.EstadoTicket.Contains("Cerrad", StringComparison.OrdinalIgnoreCase) &&
                 !p.EstadoTicket.StartsWith("4"))
            ).ToList();
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
            long? ticketExistenteId = null;
            if (dto.Id.HasValue && dto.Id.Value > 0)
            {
                ticketExistenteId = await connection.ExecuteScalarAsync<long?>(
                    "SELECT ControlRutaId FROM TB_PLANIFICACION_RUTAS_CHOFERES WHERE Id = @Id", new { Id = dto.Id.Value });
            }
            if (!ticketExistenteId.HasValue || ticketExistenteId.Value <= 0)
            {
                ticketExistenteId = await connection.ExecuteScalarAsync<long?>(@"
                    SELECT TOP 1 Id FROM TB_CONTROL_RUTAS 
                    WHERE CAST(Fecha AS DATE) = CAST(@Fecha AS DATE) AND UsuarioId = @ConductorId
                    ORDER BY Id DESC", new { Fecha = dto.Fecha.Date, ConductorId = dto.ConductorId });
            }

            long ticketIdEfectivo;
            if (!ticketExistenteId.HasValue || ticketExistenteId.Value <= 0)
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
                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET UsuarioId = @ConductorId,
                        RutaLogisticaId = COALESCE(@RutaLogisticaId, RutaLogisticaId),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @ticketIdEfectivo",
                    new { dto.ConductorId, dto.RutaLogisticaId, usuarioId, ticketIdEfectivo });
            }

            // 2. Guardar o actualizar la Planificación ligada al Ticket
            int planId;
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
                var affected = await connection.ExecuteAsync(sqlUpdate, new
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

                if (affected == 0)
                {
                    // Si el ID era virtual (venía de un ticket directo), insertamos la fila
                    var sqlInsert = @"
                        INSERT INTO TB_PLANIFICACION_RUTAS_CHOFERES
                        (Fecha, CamionId, ConductorId, RutaLogisticaId, RutasIds, FincasIds, TotalFincas, LitrosEstimados, CapacidadCamionLitros, PorcentajeOcupacion, Observacion, ControlRutaId, Activo, CreatedAt, CreatedBy)
                        VALUES
                        (@Fecha, @CamionId, @ConductorId, @RutaLogisticaId, @RutasIds, @FincasIds, @TotalFincas, @LitrosEstimados, @CapacidadCamionLitros, @PorcentajeOcupacion, @Observacion, @ticketIdEfectivo, 1, GETDATE(), @usuarioId);
                        SELECT CAST(SCOPE_IDENTITY() AS INT);";
                    planId = await connection.ExecuteScalarAsync<int>(sqlInsert, new
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
                else
                {
                    planId = dto.Id.Value;
                }
            }
            else
            {
                var sqlInsert = @"
                    INSERT INTO TB_PLANIFICACION_RUTAS_CHOFERES
                    (Fecha, CamionId, ConductorId, RutaLogisticaId, RutasIds, FincasIds, TotalFincas, LitrosEstimados, CapacidadCamionLitros, PorcentajeOcupacion, Observacion, ControlRutaId, Activo, CreatedAt, CreatedBy)
                    VALUES
                    (@Fecha, @CamionId, @ConductorId, @RutaLogisticaId, @RutasIds, @FincasIds, @TotalFincas, @LitrosEstimados, @CapacidadCamionLitros, @PorcentajeOcupacion, @Observacion, @ticketIdEfectivo, 1, GETDATE(), @usuarioId);
                    SELECT CAST(SCOPE_IDENTITY() AS INT);";
                planId = await connection.ExecuteScalarAsync<int>(sqlInsert, new
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

            // 3. Sincronización UNIFICADA con TB_RUTAS_RECOLECCION (Regla de Blindaje de Leche)
            try
            {
                var paradasExistentes = (await connection.QueryAsync<(long Id, int FincaId, int? Litros)>(@"
                    SELECT Id, FincaId, Litros 
                    FROM TB_RUTAS_RECOLECCION 
                    WHERE ControlRutaId = @ticketIdEfectivo", new { ticketIdEfectivo })).ToList();

                var fincasSeleccionadas = dto.FincasIds.Distinct().ToList();

                // Regla de Blindaje:
                // - Finca con Litros > 0: NUNCA se borra ni se desasigna (queda protegida en el ticket).
                // - Finca con Litros == 0: Si el admin la quitó de la planificación, se remueve limpiamente.
                foreach (var parada in paradasExistentes)
                {
                    if ((parada.Litros ?? 0) > 0)
                    {
                        if (!fincasSeleccionadas.Contains(parada.FincaId))
                        {
                            fincasSeleccionadas.Add(parada.FincaId);
                        }
                    }
                    else
                    {
                        if (!fincasSeleccionadas.Contains(parada.FincaId))
                        {
                            await connection.ExecuteAsync(@"
                                DELETE FROM TB_RUTAS_RECOLECCION 
                                WHERE Id = @Id AND (Litros = 0 OR Litros IS NULL)",
                                new { parada.Id });
                        }
                    }
                }

                // Insertar paradas planificadas pendientes (Litros = 0) que aún no existen en el ticket
                var fincasExistentesIds = paradasExistentes.Select(p => p.FincaId).ToHashSet();
                var cicloIdEfectivo = await connection.ExecuteScalarAsync<int?>(
                    "SELECT CicloId FROM TB_CONTROL_RUTAS WHERE Id = @ticketIdEfectivo", new { ticketIdEfectivo }) ?? 1;

                foreach (var fId in fincasSeleccionadas)
                {
                    if (!fincasExistentesIds.Contains(fId))
                    {
                        var sqlInsertParada = @"
                            INSERT INTO TB_RUTAS_RECOLECCION
                            (CicloId, Fecha, FincaId, UsuarioId, Litros, EsAcida, ControlRutaId, TipoLeche, CreatedAt, CreatedBy)
                            VALUES
                            (@cicloIdEfectivo, @Fecha, @FincaId, @ConductorId, 0, 0, @ticketIdEfectivo, 'VACA', GETDATE(), @usuarioId)";
                        await connection.ExecuteAsync(sqlInsertParada, new
                        {
                            cicloIdEfectivo,
                            Fecha = dto.Fecha.Date,
                            FincaId = fId,
                            ConductorId = dto.ConductorId,
                            ticketIdEfectivo,
                            usuarioId
                        });
                    }
                }

                // Si alguna finca blindada fue preservada, reflejar la lista final en TB_PLANIFICACION_RUTAS_CHOFERES
                if (fincasSeleccionadas.Count != totalFincas)
                {
                    var fincasFinalesStr = string.Join(",", fincasSeleccionadas);
                    await connection.ExecuteAsync(@"
                        UPDATE TB_PLANIFICACION_RUTAS_CHOFERES
                        SET FincasIds = @fincasFinalesStr,
                            TotalFincas = @totalFincas
                        WHERE Id = @planId",
                        new { fincasFinalesStr, totalFincas = fincasSeleccionadas.Count, planId });
                }

                // 4. Notificar al Chofer en App Móvil
                if (dto.ConductorId > 0)
                {
                    await connection.ExecuteAsync(@"
                        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TB_NOTIFICACIONES_MOVIL')
                        BEGIN
                            INSERT INTO TB_NOTIFICACIONES_MOVIL 
                            (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                            VALUES 
                            (@ConductorId, 'RUTA_ASIGNADA', '🚛 Nuevo Ticket / Ruta Asignada', 
                             @mensaje, @Fecha, @ticketIdEfectivo, 0, GETDATE());
                        END",
                        new 
                        { 
                            dto.ConductorId, 
                            mensaje = $"Se te ha asignado el Ticket #{ticketIdEfectivo} para el {dto.Fecha:dd/MM/yyyy} con {fincasSeleccionadas.Count} fincas en recorrido.",
                            Fecha = dto.Fecha.Date,
                            ticketIdEfectivo
                        });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RutasLogisticaRepository] Error sincronizando paradas o notificaciones: {ex.Message}");
            }

            return planId;
        }

        public async Task<bool> ModificarFincasTicketAsync(long controlRutaId, List<int> fincaIds, int usuarioId)
        {
            using var connection = CreateConnection();
            var ticket = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Id, Fecha, UsuarioId, CicloId FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (ticket == null) return false;

            var paradasExistentes = (await connection.QueryAsync<(long Id, int FincaId, int? Litros)>(@"
                SELECT Id, FincaId, Litros 
                FROM TB_RUTAS_RECOLECCION 
                WHERE ControlRutaId = @controlRutaId", new { controlRutaId })).ToList();

            var fincasSeleccionadas = fincaIds.Distinct().ToList();

            // Blindaje de paradas recolectadas
            foreach (var p in paradasExistentes)
            {
                if ((p.Litros ?? 0) > 0)
                {
                    if (!fincasSeleccionadas.Contains(p.FincaId))
                    {
                        fincasSeleccionadas.Add(p.FincaId);
                    }
                }
                else
                {
                    if (!fincasSeleccionadas.Contains(p.FincaId))
                    {
                        await connection.ExecuteAsync(@"
                            DELETE FROM TB_RUTAS_RECOLECCION 
                            WHERE Id = @Id AND (Litros = 0 OR Litros IS NULL)",
                            new { p.Id });
                    }
                }
            }

            var fincasExistentesIds = paradasExistentes.Select(p => p.FincaId).ToHashSet();
            int cicloId = ticket.CicloId ?? 1;
            DateTime fecha = ticket.Fecha ?? DateTime.Today;
            int conductorId = ticket.UsuarioId ?? 1;

            foreach (var fId in fincasSeleccionadas)
            {
                if (!fincasExistentesIds.Contains(fId))
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_RUTAS_RECOLECCION
                        (CicloId, Fecha, FincaId, UsuarioId, Litros, EsAcida, ControlRutaId, TipoLeche, CreatedAt, CreatedBy)
                        VALUES
                        (@cicloId, @fecha, @fId, @conductorId, 0, 0, @controlRutaId, 'VACA', GETDATE(), @usuarioId)",
                        new { cicloId, fecha, fId, conductorId, controlRutaId, usuarioId });
                }
            }

            // Sincronizar planificación si existe
            var fincasStr = string.Join(",", fincasSeleccionadas);
            await connection.ExecuteAsync(@"
                UPDATE TB_PLANIFICACION_RUTAS_CHOFERES
                SET FincasIds = @fincasStr,
                    TotalFincas = @totalFincas,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE ControlRutaId = @controlRutaId",
                new { fincasStr, totalFincas = fincasSeleccionadas.Count, usuarioId, controlRutaId });

            // Notificar al Chofer en App Móvil
            try
            {
                if (conductorId > 0)
                {
                    await connection.ExecuteAsync(@"
                        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TB_NOTIFICACIONES_MOVIL')
                        BEGIN
                            INSERT INTO TB_NOTIFICACIONES_MOVIL 
                            (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                            VALUES 
                            (@conductorId, 'RUTA_ASIGNADA', '📋 Fincas Modificadas en tu Ruta', 
                             @mensaje, @fecha, @controlRutaId, 0, GETDATE());
                        END",
                        new 
                        { 
                            conductorId, 
                            mensaje = $"Tu recorrido en Ticket #{controlRutaId} fue actualizado: ahora tienes {fincasSeleccionadas.Count} fincas asignadas.",
                            fecha = fecha.Date,
                            controlRutaId
                        });
                }
            }
            catch { /* Tolerante */ }

            return true;
        }

        public async Task<bool> EliminarPlanificacionChoferAsync(int id)
        {
            using var connection = CreateConnection();
            var plan = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT ControlRutaId FROM TB_PLANIFICACION_RUTAS_CHOFERES WHERE Id = @id", new { id });
            if (plan != null && plan.ControlRutaId != null)
            {
                long crId = (long)plan.ControlRutaId;
                var totalLeche = await connection.ExecuteScalarAsync<int?>(
                    "SELECT SUM(Litros) FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @crId AND Litros > 0", new { crId }) ?? 0;
                if (totalLeche > 0)
                {
                    throw new InvalidOperationException($"No se puede eliminar la planificación porque el ticket #{crId} ya tiene {totalLeche:N0} litros de leche recolectados en ruta.");
                }

                // Si todas las paradas eran 0 litros, limpiar paradas vacías y el ticket abierto
                await connection.ExecuteAsync("DELETE FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @crId AND (Litros = 0 OR Litros IS NULL)", new { crId });
                await connection.ExecuteAsync("DELETE FROM TB_CONTROL_RUTAS WHERE Id = @crId AND Estado = 'ABIERTO' AND (TotalLitrosFinca = 0 OR TotalLitrosFinca IS NULL)", new { crId });
            }

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
