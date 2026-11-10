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
        Task<bool> AsignarFincasARutaAsync(int rutaId, List<int> fincaIds, List<int>? habitualesIds = null, List<int>? alternasIds = null);
        Task<bool> AsignarFincaDirectaAsync(int rutaId, int fincaId);
        Task<IEnumerable<PlanificacionRutaChoferDto>> ObtenerPlanificacionesPorFechaAsync(DateTime fecha);
        Task<int> GuardarPlanificacionChoferAsync(GuardarPlanificacionRutaChoferDto dto, int usuarioId);
        Task<bool> EliminarPlanificacionChoferAsync(int id);
        Task<bool> ModificarFincasTicketAsync(long controlRutaId, List<int> fincaIds, int usuarioId);
        Task<IEnumerable<FincaPromedioDto>> ObtenerFincasConPromedio15DiasAsync(int? rutaId = null);
        Task<IEnumerable<RecoleccionFincaResumenDto>> ObtenerRecoleccionesHoyFincasAsync(DateTime? fecha = null);
        Task<long> SolicitarRecoleccionExtraordinariaAsync(CrearSolicitudExtraordinariaDto dto, int choferId);
        Task<IEnumerable<SolicitudRecoleccionExtraordinariaDto>> ObtenerSolicitudesExtraordinariasHoyAsync(DateTime? fecha = null);
        Task<bool> ResponderSolicitudExtraordinariaAsync(long solicitudId, int usuarioId, bool aprobar);
    }

    public class RutasLogisticaRepository : IRutasLogisticaRepository
    {
        private readonly string _connectionString;
        private readonly Transporte.Core.Interfaces.ITenantService? _tenantService;
        private readonly INotificacionesRepository? _notificacionesRepo;

        public RutasLogisticaRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null, INotificacionesRepository? notificacionesRepo = null)
        {
            _tenantService = tenantService;
            _notificacionesRepo = notificacionesRepo;
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

        private static bool _tablesChecked = false;
        private async Task EnsureTablesAsync(IDbConnection connection)
        {
            if (_tablesChecked) return;
            try
            {
                var sql = @"
                    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TB_RUTAS_LOGISTICA_FINCAS' AND xtype='U')
                    BEGIN
                        CREATE TABLE TB_RUTAS_LOGISTICA_FINCAS (
                            RutaLogisticaId INT NOT NULL,
                            FincaId INT NOT NULL,
                            EsPrincipal BIT NOT NULL DEFAULT 1,
                            Orden INT NULL DEFAULT 0,
                            CreatedAt DATETIME2 DEFAULT GETDATE(),
                            CONSTRAINT PK_TB_RUTAS_LOGISTICA_FINCAS PRIMARY KEY (RutaLogisticaId, FincaId)
                        );
                        INSERT INTO TB_RUTAS_LOGISTICA_FINCAS (RutaLogisticaId, FincaId, EsPrincipal, Orden, CreatedAt)
                        SELECT f.RutaId, f.Id, 1, 0, GETDATE()
                        FROM TB_FINCAS f
                        WHERE f.RutaId IS NOT NULL AND f.RutaId > 0;
                    END;

                    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TB_SOLICITUDES_RECOLECCION_EXTRAORDINARIA' AND xtype='U')
                    BEGIN
                        CREATE TABLE TB_SOLICITUDES_RECOLECCION_EXTRAORDINARIA (
                            Id BIGINT IDENTITY(1,1) PRIMARY KEY,
                            Fecha DATE NOT NULL,
                            FincaId INT NOT NULL,
                            RutaLogisticaId INT NULL,
                            ControlRutaId BIGINT NULL,
                            ChoferSolicitanteId INT NOT NULL,
                            Motivo NVARCHAR(250) NULL,
                            Estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
                            AprobadoPorUsuarioId INT NULL,
                            FechaAprobacion DATETIME2 NULL,
                            CreatedAt DATETIME2 DEFAULT GETDATE()
                        );
                    END;";
                await connection.ExecuteAsync(sql);
                _tablesChecked = true;
            }
            catch { /* Tolerante */ }
        }

        public async Task<IEnumerable<RutaLogisticaDto>> ObtenerRutasAsync()
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
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
                    (SELECT COUNT(*) FROM TB_RUTAS_LOGISTICA_FINCAS rlf JOIN TB_FINCAS f ON rlf.FincaId = f.Id WHERE rlf.RutaLogisticaId = r.Id AND f.Activo = 1) AS TotalFincasAsignadas,
                    (SELECT COUNT(*) FROM TB_RUTAS_LOGISTICA_FINCAS rlf JOIN TB_FINCAS f ON rlf.FincaId = f.Id WHERE rlf.RutaLogisticaId = r.Id AND rlf.EsPrincipal = 1 AND f.Activo = 1) AS TotalFincasHabituales,
                    (SELECT COUNT(*) FROM TB_RUTAS_LOGISTICA_FINCAS rlf JOIN TB_FINCAS f ON rlf.FincaId = f.Id WHERE rlf.RutaLogisticaId = r.Id AND rlf.EsPrincipal = 0 AND f.Activo = 1) AS TotalFincasAlternas,
                    ISNULL((
                        SELECT SUM(sub.Prom)
                        FROM (
                            SELECT CAST(ROUND(AVG(CAST(rec.Litros AS FLOAT)), 0) AS INT) AS Prom
                            FROM TB_RUTAS_LOGISTICA_FINCAS rlf2
                            JOIN TB_FINCAS f2 ON rlf2.FincaId = f2.Id
                            INNER JOIN TB_RUTAS_RECOLECCION rec ON rec.FincaId = f2.Id AND rec.Fecha >= DATEADD(day, -30, GETDATE())
                            WHERE rlf2.RutaLogisticaId = r.Id AND rlf2.EsPrincipal = 1 AND f2.Activo = 1
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
            await EnsureTablesAsync(connection);
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
                    (SELECT COUNT(*) FROM TB_RUTAS_LOGISTICA_FINCAS rlf JOIN TB_FINCAS f ON rlf.FincaId = f.Id WHERE rlf.RutaLogisticaId = r.Id AND f.Activo = 1) AS TotalFincasAsignadas,
                    (SELECT COUNT(*) FROM TB_RUTAS_LOGISTICA_FINCAS rlf JOIN TB_FINCAS f ON rlf.FincaId = f.Id WHERE rlf.RutaLogisticaId = r.Id AND rlf.EsPrincipal = 1 AND f.Activo = 1) AS TotalFincasHabituales,
                    (SELECT COUNT(*) FROM TB_RUTAS_LOGISTICA_FINCAS rlf JOIN TB_FINCAS f ON rlf.FincaId = f.Id WHERE rlf.RutaLogisticaId = r.Id AND rlf.EsPrincipal = 0 AND f.Activo = 1) AS TotalFincasAlternas,
                    ISNULL((
                        SELECT SUM(sub.Prom)
                        FROM (
                            SELECT CAST(ROUND(AVG(CAST(rec.Litros AS FLOAT)), 0) AS INT) AS Prom
                            FROM TB_RUTAS_LOGISTICA_FINCAS rlf2
                            JOIN TB_FINCAS f2 ON rlf2.FincaId = f2.Id
                            INNER JOIN TB_RUTAS_RECOLECCION rec ON rec.FincaId = f2.Id AND rec.Fecha >= DATEADD(day, -30, GETDATE())
                            WHERE rlf2.RutaLogisticaId = r.Id AND rlf2.EsPrincipal = 1 AND f2.Activo = 1
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
            await EnsureTablesAsync(connection);
            var sql = @"
                INSERT INTO TB_RUTAS_LOGISTICA (Codigo, Nombre, Descripcion, Color, CamionPredeterminadoId, ChoferPredeterminadoId, Activo, CreatedAt)
                VALUES (@Codigo, @Nombre, @Descripcion, @Color, @CamionPredeterminadoId, @ChoferPredeterminadoId, @Activo, GETDATE());
                SELECT CAST(SCOPE_IDENTITY() AS INT);";
            return await connection.ExecuteScalarAsync<int>(sql, dto);
        }

        public async Task<bool> ActualizarRutaAsync(int id, GuardarRutaLogisticaDto dto)
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
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
            await EnsureTablesAsync(connection);
            var sql = @"
                DELETE FROM TB_RUTAS_LOGISTICA_FINCAS WHERE RutaLogisticaId = @id;
                UPDATE TB_FINCAS SET RutaId = NULL WHERE RutaId = @id;
                DELETE FROM TB_RUTAS_LOGISTICA WHERE Id = @id;";
            var rows = await connection.ExecuteAsync(sql, new { id });
            return rows > 0;
        }

        public async Task<IEnumerable<dynamic>> ObtenerFincasDeRutaAsync(int rutaId)
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
            var sql = @"
                SELECT 
                    f.Id, 
                    f.Codigo, 
                    f.Nombre, 
                    f.Propietario, 
                    f.RutaId AS RutaPrincipalId,
                    rp.Nombre AS RutaPrincipalNombre,
                    CASE WHEN rlf.FincaId IS NOT NULL THEN 1 ELSE 0 END AS Asignada,
                    ISNULL(rlf.EsPrincipal, CASE WHEN f.RutaId = @rutaId THEN 1 ELSE 0 END) AS EsPrincipal,
                    CASE 
                        WHEN rlf.FincaId IS NOT NULL AND rlf.EsPrincipal = 1 THEN 'HABITUAL'
                        WHEN rlf.FincaId IS NOT NULL AND rlf.EsPrincipal = 0 THEN 'ALTERNA'
                        ELSE 'NO_ASIGNADA'
                    END AS TipoAsignacion
                FROM TB_FINCAS f
                LEFT JOIN TB_RUTAS_LOGISTICA rp ON f.RutaId = rp.Id
                LEFT JOIN TB_RUTAS_LOGISTICA_FINCAS rlf ON rlf.FincaId = f.Id AND rlf.RutaLogisticaId = @rutaId
                WHERE f.Activo = 1 AND f.IsDeleted = 0
                ORDER BY Asignada DESC, EsPrincipal DESC, f.Nombre ASC";
            return await connection.QueryAsync(sql, new { rutaId });
        }

        public async Task<bool> AsignarFincasARutaAsync(int rutaId, List<int> fincaIds, List<int>? habitualesIds = null, List<int>? alternasIds = null)
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
            if (connection.State != ConnectionState.Open) connection.Open();
            using var tx = connection.BeginTransaction();
            try
            {
                // Si vienen listas explícitas de Habituales y Alternas
                if (habitualesIds != null || alternasIds != null)
                {
                    var hab = habitualesIds ?? new List<int>();
                    var alt = (alternasIds ?? new List<int>()).Where(x => !hab.Contains(x)).ToList();
                    var total = hab.Concat(alt).Distinct().ToList();

                    await connection.ExecuteAsync(
                        "DELETE FROM TB_RUTAS_LOGISTICA_FINCAS WHERE RutaLogisticaId = @rutaId AND FincaId NOT IN @total",
                        new { rutaId, total = total.Count > 0 ? total : new List<int> { -1 } }, tx);

                    await connection.ExecuteAsync(
                        "UPDATE TB_FINCAS SET RutaId = NULL WHERE RutaId = @rutaId AND Id NOT IN @total",
                        new { rutaId, total = total.Count > 0 ? total : new List<int> { -1 } }, tx);

                    foreach (var fId in hab)
                    {
                        await connection.ExecuteAsync("UPDATE TB_FINCAS SET RutaId = @rutaId WHERE Id = @fId", new { rutaId, fId }, tx);
                        await connection.ExecuteAsync(@"
                            IF EXISTS (SELECT 1 FROM TB_RUTAS_LOGISTICA_FINCAS WHERE RutaLogisticaId = @rutaId AND FincaId = @fId)
                                UPDATE TB_RUTAS_LOGISTICA_FINCAS SET EsPrincipal = 1 WHERE RutaLogisticaId = @rutaId AND FincaId = @fId;
                            ELSE
                                INSERT INTO TB_RUTAS_LOGISTICA_FINCAS (RutaLogisticaId, FincaId, EsPrincipal, Orden, CreatedAt)
                                VALUES (@rutaId, @fId, 1, 0, GETDATE());", new { rutaId, fId }, tx);
                    }

                    foreach (var fId in alt)
                    {
                        await connection.ExecuteAsync(@"
                            IF EXISTS (SELECT 1 FROM TB_RUTAS_LOGISTICA_FINCAS WHERE RutaLogisticaId = @rutaId AND FincaId = @fId)
                                UPDATE TB_RUTAS_LOGISTICA_FINCAS SET EsPrincipal = 0 WHERE RutaLogisticaId = @rutaId AND FincaId = @fId;
                            ELSE
                                INSERT INTO TB_RUTAS_LOGISTICA_FINCAS (RutaLogisticaId, FincaId, EsPrincipal, Orden, CreatedAt)
                                VALUES (@rutaId, @fId, 0, 0, GETDATE());", new { rutaId, fId }, tx);
                    }
                }
                else
                {
                    // Manejo tolerante con lista simple fincaIds
                    if (fincaIds == null || fincaIds.Count == 0)
                    {
                        await connection.ExecuteAsync("DELETE FROM TB_RUTAS_LOGISTICA_FINCAS WHERE RutaLogisticaId = @rutaId", new { rutaId }, tx);
                        await connection.ExecuteAsync("UPDATE TB_FINCAS SET RutaId = NULL WHERE RutaId = @rutaId", new { rutaId }, tx);
                    }
                    else
                    {
                        await connection.ExecuteAsync(
                            "DELETE FROM TB_RUTAS_LOGISTICA_FINCAS WHERE RutaLogisticaId = @rutaId AND FincaId NOT IN @fincaIds",
                            new { rutaId, fincaIds }, tx);

                        await connection.ExecuteAsync(
                            "UPDATE TB_FINCAS SET RutaId = NULL WHERE RutaId = @rutaId AND Id NOT IN @fincaIds",
                            new { rutaId, fincaIds }, tx);

                        var fincasActuales = (await connection.QueryAsync<dynamic>(
                            "SELECT Id, RutaId FROM TB_FINCAS WHERE Id IN @fincaIds", new { fincaIds }, tx)).ToList();

                        foreach (var f in fincasActuales)
                        {
                            int fId = Convert.ToInt32(f.Id);
                            int? curRuta = f.RutaId != null ? Convert.ToInt32(f.RutaId) : (int?)null;
                            bool esPrincipal = (curRuta == null || curRuta == rutaId || curRuta == 0);

                            if (esPrincipal && curRuta != rutaId)
                            {
                                await connection.ExecuteAsync("UPDATE TB_FINCAS SET RutaId = @rutaId WHERE Id = @fId", new { rutaId, fId }, tx);
                            }

                            var sqlUpsert = @"
                                IF EXISTS (SELECT 1 FROM TB_RUTAS_LOGISTICA_FINCAS WHERE RutaLogisticaId = @rutaId AND FincaId = @fId)
                                BEGIN
                                    UPDATE TB_RUTAS_LOGISTICA_FINCAS 
                                    SET EsPrincipal = CASE WHEN @esPrincipal = 1 THEN 1 ELSE EsPrincipal END
                                    WHERE RutaLogisticaId = @rutaId AND FincaId = @fId;
                                END
                                ELSE
                                BEGIN
                                    INSERT INTO TB_RUTAS_LOGISTICA_FINCAS (RutaLogisticaId, FincaId, EsPrincipal, Orden, CreatedAt)
                                    VALUES (@rutaId, @fId, @esPrincipal, 0, GETDATE());
                                END";

                            await connection.ExecuteAsync(sqlUpsert, new { rutaId, fId, esPrincipal = esPrincipal ? 1 : 0 }, tx);
                        }
                    }
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

        public async Task<bool> AsignarFincaDirectaAsync(int rutaId, int fincaId)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var tx = connection.BeginTransaction();
            try
            {
                // 1. Actualizar la finca con la nueva ruta asignada
                await connection.ExecuteAsync(
                    "UPDATE TB_FINCAS SET RutaId = @rutaId WHERE Id = @fincaId",
                    new { rutaId, fincaId }, tx);

                // 2. Desmarcar como principal en otras rutas si existiera
                await connection.ExecuteAsync(
                    "UPDATE TB_RUTAS_LOGISTICA_FINCAS SET EsPrincipal = 0 WHERE FincaId = @fincaId AND RutaLogisticaId != @rutaId",
                    new { rutaId, fincaId }, tx);

                // 3. Insertar o actualizar la relación en la ruta seleccionada
                var sqlUpsert = @"
                    IF EXISTS (SELECT 1 FROM TB_RUTAS_LOGISTICA_FINCAS WHERE RutaLogisticaId = @rutaId AND FincaId = @fincaId)
                    BEGIN
                        UPDATE TB_RUTAS_LOGISTICA_FINCAS 
                        SET EsPrincipal = 1 
                        WHERE RutaLogisticaId = @rutaId AND FincaId = @fincaId;
                    END
                    ELSE
                    BEGIN
                        INSERT INTO TB_RUTAS_LOGISTICA_FINCAS (RutaLogisticaId, FincaId, EsPrincipal, Orden, CreatedAt)
                        VALUES (@rutaId, @fincaId, 1, 0, GETDATE());
                    END";

                await connection.ExecuteAsync(sqlUpsert, new { rutaId, fincaId }, tx);

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
                    item.ControlRutaId = Convert.ToInt64(ticketInfo.Id);
                    string rawEst = (string?)ticketInfo.Estado ?? "ABIERTO";
                    int procId = ticketInfo.ProcesoActualId != null ? Convert.ToInt32(ticketInfo.ProcesoActualId) : 1;
                    bool esFin = procId >= 4 || rawEst.Contains("Finaliz", StringComparison.OrdinalIgnoreCase) || rawEst.Contains("Cerrad", StringComparison.OrdinalIgnoreCase) || rawEst.StartsWith("4");
                    item.EstadoTicket = esFin ? "FINALIZADO" : rawEst;
                    item.LitrosRecolectadosReal = Convert.ToInt32(ticketInfo.TotalLitrosFinca ?? 0);

                    var fincasRecSql = @"
                        SELECT DISTINCT FincaId 
                        FROM TB_RUTAS_RECOLECCION 
                        WHERE ControlRutaId = @TicketId AND FincaId IS NOT NULL AND Litros > 0";
                    var recIds = await connection.QueryAsync<int>(fincasRecSql, new { TicketId = Convert.ToInt64(ticketInfo.Id) });
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

                var procesoAbiertoId = await connection.ExecuteScalarAsync<int?>(@"
                    SELECT TOP 1 Id FROM TB_PROCESOS_TICKET 
                    WHERE UPPER(Codigo) = 'ABIERTO' OR UPPER(Nombre) = 'ABIERTO'") ?? 1;

                var sqlCrearTicket = @"
                    INSERT INTO TB_CONTROL_RUTAS
                    (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, RutaLogisticaId, Observacion, CreatedAt, CreatedBy)
                    VALUES
                    (@Fecha, @ConductorId, @CicloId, 0, 0, 0, 0, 'ABIERTO', @procesoAbiertoId, @RutaLogisticaId, @Observacion, GETDATE(), @usuarioId);
                    SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

                ticketIdEfectivo = await connection.ExecuteScalarAsync<long>(sqlCrearTicket, new
                {
                    Fecha = dto.Fecha.Date,
                    ConductorId = dto.ConductorId,
                    CicloId = cicloId ?? 1,
                    procesoAbiertoId,
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

            // 2. Guardar o actualizar la Planificación ligada al Ticket (PREVINIENDO DUPLICADOS)
            int planId;
            int? planExistenteId = null;

            if (dto.Id.HasValue && dto.Id.Value > 0)
            {
                var existe = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_PLANIFICACION_RUTAS_CHOFERES WHERE Id = @Id", new { Id = dto.Id.Value });
                if (existe.HasValue) planExistenteId = existe.Value;
            }

            if (!planExistenteId.HasValue)
            {
                // Buscar si ya existe una planificación para este Ticket o para (Fecha, CamionId, ConductorId)
                planExistenteId = await connection.ExecuteScalarAsync<int?>(@"
                    SELECT TOP 1 Id FROM TB_PLANIFICACION_RUTAS_CHOFERES 
                    WHERE ControlRutaId = @ticketIdEfectivo
                       OR (CAST(Fecha AS DATE) = CAST(@Fecha AS DATE) AND CamionId = @CamionId AND ConductorId = @ConductorId)
                    ORDER BY Activo DESC, Id DESC",
                    new { ticketIdEfectivo, Fecha = dto.Fecha.Date, dto.CamionId, dto.ConductorId });
            }

            if (planExistenteId.HasValue && planExistenteId.Value > 0)
            {
                planId = planExistenteId.Value;
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
                        Activo = 1,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @planId";
                await connection.ExecuteAsync(sqlUpdate, new
                {
                    planId,
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

            // Desactivar estrictamente cualquier otro registro duplicado para el mismo Ticket o (Fecha, Camion, Conductor)
            await connection.ExecuteAsync(@"
                UPDATE TB_PLANIFICACION_RUTAS_CHOFERES
                SET Activo = 0, ModifiedAt = GETDATE(), ModifiedBy = @usuarioId
                WHERE Id <> @planId AND (
                    ControlRutaId = @ticketIdEfectivo 
                    OR (CAST(Fecha AS DATE) = CAST(@Fecha AS DATE) AND CamionId = @CamionId AND ConductorId = @ConductorId)
                )",
                new { planId, ticketIdEfectivo, Fecha = dto.Fecha.Date, dto.CamionId, dto.ConductorId, usuarioId });

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
                // - Finca con Litros == 0 o NULL: Si el admin la quitó de la planificación, se remueve limpiamente.
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
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_RUTAS_RECOLECCION
                            (CicloId, Fecha, FincaId, UsuarioId, Litros, EsAcida, ControlRutaId, TipoLeche, CreatedAt, CreatedBy)
                            VALUES
                            (@cicloIdEfectivo, @Fecha, @fId, @ConductorId, 0, 0, @ticketIdEfectivo, 'VACA', GETDATE(), @usuarioId)",
                            new { cicloIdEfectivo, Fecha = dto.Fecha.Date, fId, dto.ConductorId, ticketIdEfectivo, usuarioId });
                    }
                }

                // Asegurar que FincasIds en la planificación refleje las fincas reales
                var fincasAjustadasStr = string.Join(",", fincasSeleccionadas.Distinct());
                await connection.ExecuteAsync(@"
                    UPDATE TB_PLANIFICACION_RUTAS_CHOFERES
                    SET FincasIds = @fincasAjustadasStr, TotalFincas = @totalFincas
                    WHERE Id = @planId",
                    new { fincasAjustadasStr, totalFincas = fincasSeleccionadas.Distinct().Count(), planId });

                // 4. Notificación automática directa al Chofer en App Móvil
                if (dto.ConductorId > 0)
                {
                    var camionPlaca = await connection.ExecuteScalarAsync<string?>(
                        "SELECT Placa FROM TB_CAMIONES WHERE Id = @CamionId", new { dto.CamionId }) ?? "cisterna";

                    string tituloNotif = (dto.Id.HasValue && dto.Id.Value > 0)
                        ? "📋 Recorrido Actualizado por Supervisor"
                        : "🚛 Nueva Ruta Asignada";

                    string mensajeNotif = (dto.Id.HasValue && dto.Id.Value > 0)
                        ? $"Tu recorrido fue actualizado: ahora tienes {fincasSeleccionadas.Count} fincas asignadas en el camión {camionPlaca}."
                        : $"Se te asignó una nueva ruta con {fincasSeleccionadas.Count} fincas en el camión {camionPlaca}.";

                    await connection.ExecuteAsync(@"
                        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TB_NOTIFICACIONES_MOVIL')
                        BEGIN
                            INSERT INTO TB_NOTIFICACIONES_MOVIL 
                            (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                            VALUES 
                            (@ConductorId, 'RUTA_ASIGNADA', @tituloNotif, 
                             @mensajeNotif, @Fecha, @ticketIdEfectivo, 0, GETDATE());
                        END",
                        new 
                        { 
                            dto.ConductorId, 
                            tituloNotif,
                            mensajeNotif,
                            Fecha = dto.Fecha.Date,
                            ticketIdEfectivo
                        });

                    if (_notificacionesRepo != null)
                    {
                        _ = Task.Run(() => _notificacionesRepo.EnviarWebPushAsync(dto.ConductorId, tituloNotif, mensajeNotif, "/movil"));
                    }
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
                            (@conductorId, 'RUTA_ASIGNADA', '📋 Recorrido Actualizado por Supervisor', 
                             @mensaje, @fecha, @controlRutaId, 0, GETDATE());
                        END",
                        new 
                        { 
                            conductorId, 
                            mensaje = $"Tu recorrido en Ticket #{controlRutaId} fue actualizado: ahora tienes {fincasSeleccionadas.Count} fincas asignadas.",
                            fecha = fecha.Date,
                            controlRutaId
                        });

                    if (_notificacionesRepo != null)
                    {
                        var msgPush = $"Tu recorrido en Ticket #{controlRutaId} fue actualizado: ahora tienes {fincasSeleccionadas.Count} fincas asignadas.";
                        _ = Task.Run(() => _notificacionesRepo.EnviarWebPushAsync(conductorId, "📋 Recorrido Actualizado por Supervisor", msgPush, "/movil"));
                    }
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
                long crId = Convert.ToInt64(plan.ControlRutaId);
                var totalLeche = await connection.ExecuteScalarAsync<int?>(
                    "SELECT SUM(Litros) FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @crId AND Litros > 0", new { crId }) ?? 0;
                if (totalLeche > 0)
                {
                    throw new InvalidOperationException($"No se puede eliminar la planificación porque el ticket #{crId} ya tiene {totalLeche:N0} litros de leche recolectados en ruta.");
                }

                // 1. Desvincular de planificaciones para evitar conflicto de FK
                try { await connection.ExecuteAsync("UPDATE TB_PLANIFICACION_RUTAS_CHOFERES SET ControlRutaId = NULL WHERE ControlRutaId = @crId", new { crId }); } catch { }

                // 2. Limpiar paradas vacías (0 litros)
                try { await connection.ExecuteAsync("DELETE FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @crId AND (Litros = 0 OR Litros IS NULL)", new { crId }); } catch { }

                // 3. Limpiar logs y tablas hijas con FK hacia TB_CONTROL_RUTAS
                try { await connection.ExecuteAsync("DELETE FROM TB_LOG_MODIFICACIONES_CONTROL WHERE ControlRutaId = @crId", new { crId }); } catch { }
                try { await connection.ExecuteAsync("DELETE FROM TB_HISTORIAL_PROCESOS_TICKET WHERE ControlRutaId = @crId", new { crId }); } catch { }
                try { await connection.ExecuteAsync("DELETE FROM TB_NOTIFICACIONES_PUSH WHERE TicketId = @crId", new { crId }); } catch { }
                try { await connection.ExecuteAsync("DELETE FROM TB_ENTREGAS_COMPANIA WHERE ControlRutaId = @crId", new { crId }); } catch { }
                try { await connection.ExecuteAsync("DELETE FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @crId", new { crId }); } catch { }

                // 4. Eliminar el ticket abierto vacío
                try { await connection.ExecuteAsync("DELETE FROM TB_CONTROL_RUTAS WHERE Id = @crId AND Estado = 'ABIERTO' AND (TotalLitrosFinca = 0 OR TotalLitrosFinca IS NULL)", new { crId }); } catch { }
            }

            var rows = await connection.ExecuteAsync("DELETE FROM TB_PLANIFICACION_RUTAS_CHOFERES WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<IEnumerable<FincaPromedioDto>> ObtenerFincasConPromedio15DiasAsync(int? rutaId = null)
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
            var sql = @"
                SELECT 
                    f.Id AS FincaId,
                    f.Nombre AS FincaNombre,
                    f.Propietario,
                    f.RutaId,
                    rp.Nombre AS RutaPrincipalNombre,
                    CASE WHEN f.TieneDosTiposLeche = 1 THEN 'BUFALA' ELSE 'VACA' END AS TipoLeche,
                    CAST(ISNULL(p15.Promedio15Dias, ISNULL(pTotal.PromedioTotal, 0)) AS INT) AS PromedioLitros,
                    ISNULL(p15.DiasRecolectados, 0) AS DiasRecolectados15,
                    ISNULL(
                        (SELECT STRING_AGG(CAST(rlf.RutaLogisticaId AS VARCHAR), ',') 
                         FROM TB_RUTAS_LOGISTICA_FINCAS rlf 
                         WHERE rlf.FincaId = f.Id), 
                        CAST(ISNULL(f.RutaId, 0) AS VARCHAR)
                    ) AS RutasAsignadasStr,
                    CASE 
                        WHEN @rutaId IS NOT NULL AND EXISTS (
                            SELECT 1 FROM TB_RUTAS_LOGISTICA_FINCAS rlf2 
                            WHERE rlf2.FincaId = f.Id AND rlf2.RutaLogisticaId = @rutaId AND rlf2.EsPrincipal = 0
                        ) THEN 1 
                        ELSE 0 
                    END AS EsAlterna
                FROM TB_FINCAS f
                LEFT JOIN TB_RUTAS_LOGISTICA rp ON f.RutaId = rp.Id
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
                (rutaId.HasValue && rutaId.Value > 0 
                    ? " AND (EXISTS (SELECT 1 FROM TB_RUTAS_LOGISTICA_FINCAS rlf3 WHERE rlf3.FincaId = f.Id AND rlf3.RutaLogisticaId = @rutaId) OR f.RutaId = @rutaId) " 
                    : "") +
                " ORDER BY f.Nombre ASC";

            var rows = await connection.QueryAsync<dynamic>(sql, new { rutaId });
            var list = new List<FincaPromedioDto>();
            foreach (var r in rows)
            {
                var dto = new FincaPromedioDto
                {
                    FincaId = Convert.ToInt32(r.FincaId),
                    FincaNombre = Convert.ToString(r.FincaNombre) ?? "",
                    Propietario = Convert.ToString(r.Propietario),
                    RutaId = r.RutaId != null ? Convert.ToInt32(r.RutaId) : null,
                    RutaPrincipalNombre = Convert.ToString(r.RutaPrincipalNombre),
                    TipoLeche = Convert.ToString(r.TipoLeche),
                    PromedioLitros = Convert.ToInt32(r.PromedioLitros),
                    DiasRecolectados15 = Convert.ToInt32(r.DiasRecolectados15),
                    EsAlterna = Convert.ToInt32(r.EsAlterna) == 1,
                };
                string rutasStr = Convert.ToString(r.RutasAsignadasStr) ?? "";
                if (!string.IsNullOrWhiteSpace(rutasStr))
                {
                    dto.RutasAsignadasIds = rutasStr.Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => int.TryParse(s, out var rid) ? rid : 0)
                        .Where(rid => rid > 0)
                        .Distinct()
                        .ToList();
                }
                list.Add(dto);
            }
            return list;
        }

        public async Task<IEnumerable<RecoleccionFincaResumenDto>> ObtenerRecoleccionesHoyFincasAsync(DateTime? fecha = null)
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
            var fechaTarget = (fecha ?? DateTime.Today).Date;
            var sql = @"
                SELECT 
                    r.Id AS RecoleccionId,
                    r.FincaId AS FincaId,
                    f.Nombre AS FincaNombre,
                    r.ControlRutaId AS ControlRutaId,
                    CAST(r.ControlRutaId AS VARCHAR) AS TicketCodigo,
                    r.UsuarioId AS ConductorId,
                    u.NombreCompleto AS ConductorNombre,
                    ISNULL(c.Placa, 'Sin Camión') AS CamionPlaca,
                    ISNULL(r.Litros, 0) AS Litros,
                    ISNULL(r.EsAcida, 0) AS EsAcida,
                    ISNULL(r.TipoLeche, 'VACA') AS TipoLeche,
                    r.CreatedAt AS CreatedAt
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON r.ControlRutaId = cr.Id
                LEFT JOIN TB_CAMIONES c ON c.UsuarioId = r.UsuarioId AND c.Activo = 1
                WHERE CAST(r.Fecha AS DATE) = @fechaTarget
                ORDER BY r.CreatedAt DESC, r.Id DESC";
            return await connection.QueryAsync<RecoleccionFincaResumenDto>(sql, new { fechaTarget });
        }

        public async Task<long> SolicitarRecoleccionExtraordinariaAsync(CrearSolicitudExtraordinariaDto dto, int choferId)
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
            var sql = @"
                INSERT INTO TB_SOLICITUDES_RECOLECCION_EXTRAORDINARIA (
                    Fecha, FincaId, RutaLogisticaId, ControlRutaId, ChoferSolicitanteId, Motivo, Estado, CreatedAt
                ) VALUES (
                    CAST(GETDATE() AS DATE), @FincaId, @RutaLogisticaId, @ControlRutaId, @ChoferSolicitanteId, @Motivo, 'PENDIENTE', GETDATE()
                );
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var id = await connection.ExecuteScalarAsync<long>(sql, new
            {
                FincaId = dto.FincaId,
                RutaLogisticaId = dto.RutaLogisticaId,
                ControlRutaId = dto.ControlRutaId,
                ChoferSolicitanteId = choferId,
                Motivo = dto.Motivo ?? "Recolección Extraordinaria / Emergencia"
            });

            // Emitir notificación a supervisores y administradores
            try
            {
                if (_notificacionesRepo != null)
                {
                    var fNom = await connection.ExecuteScalarAsync<string>("SELECT Nombre FROM TB_FINCAS WHERE Id = @id", new { id = dto.FincaId });
                    var chNom = await connection.ExecuteScalarAsync<string>("SELECT NombreCompleto FROM TB_USUARIOS WHERE Id = @id", new { id = choferId });
                    await _notificacionesRepo.CrearNotificacionAsync(new CrearNotificacionMovilDto
                    {
                        UsuarioId = 0,
                        Titulo = $"🚨 Solicitud 2da Recogida: {fNom ?? "Finca"}",
                        Mensaje = $"{chNom ?? "Chofer"} solicita recoger nuevamente la finca '{fNom}' por motivo: {dto.Motivo}. Requiere aprobación.",
                        Tipo = "SOLICITUD_EXTRAORDINARIA",
                        ReferenciaId = id
                    });
                }
            }
            catch { /* Tolerante */ }

            return id;
        }

        public async Task<IEnumerable<SolicitudRecoleccionExtraordinariaDto>> ObtenerSolicitudesExtraordinariasHoyAsync(DateTime? fecha = null)
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
            var fechaTarget = (fecha ?? DateTime.Today).Date;
            var sql = @"
                SELECT 
                    s.Id,
                    s.Fecha,
                    s.FincaId,
                    f.Nombre AS FincaNombre,
                    s.RutaLogisticaId,
                    rl.Nombre AS RutaNombre,
                    s.ControlRutaId,
                    s.ChoferSolicitanteId,
                    u.NombreCompleto AS ChoferSolicitanteNombre,
                    c.Placa AS CamionPlaca,
                    s.Motivo,
                    s.Estado,
                    s.AprobadoPorUsuarioId,
                    uAprob.NombreCompleto AS AprobadoPorNombre,
                    s.FechaAprobacion,
                    s.CreatedAt
                FROM TB_SOLICITUDES_RECOLECCION_EXTRAORDINARIA s
                INNER JOIN TB_FINCAS f ON s.FincaId = f.Id
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON s.RutaLogisticaId = rl.Id
                LEFT JOIN TB_USUARIOS u ON s.ChoferSolicitanteId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON s.ControlRutaId = cr.Id
                LEFT JOIN TB_CAMIONES c ON c.UsuarioId = s.ChoferSolicitanteId AND c.Activo = 1
                LEFT JOIN TB_USUARIOS uAprob ON s.AprobadoPorUsuarioId = uAprob.Id
                WHERE CAST(s.Fecha AS DATE) = @fechaTarget
                ORDER BY s.Id DESC";
            return await connection.QueryAsync<SolicitudRecoleccionExtraordinariaDto>(sql, new { fechaTarget });
        }

        public async Task<bool> ResponderSolicitudExtraordinariaAsync(long solicitudId, int usuarioId, bool aprobar)
        {
            using var connection = CreateConnection();
            await EnsureTablesAsync(connection);
            var nuevoEstado = aprobar ? "APROBADA" : "RECHAZADA";
            var sql = @"
                UPDATE TB_SOLICITUDES_RECOLECCION_EXTRAORDINARIA
                SET Estado = @nuevoEstado,
                    AprobadoPorUsuarioId = @usuarioId,
                    FechaAprobacion = GETDATE()
                WHERE Id = @solicitudId";

            var rows = await connection.ExecuteAsync(sql, new { solicitudId, nuevoEstado, usuarioId });

            if (rows > 0 && _notificacionesRepo != null)
            {
                try
                {
                    var sol = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT ChoferSolicitanteId, FincaId FROM TB_SOLICITUDES_RECOLECCION_EXTRAORDINARIA WHERE Id = @solicitudId", new { solicitudId });
                    if (sol != null)
                    {
                        int chId = Convert.ToInt32(sol.ChoferSolicitanteId);
                        int fId = Convert.ToInt32(sol.FincaId);
                        var fNom = await connection.ExecuteScalarAsync<string>("SELECT Nombre FROM TB_FINCAS WHERE Id = @id", new { id = fId });
                        await _notificacionesRepo.CrearNotificacionAsync(new CrearNotificacionMovilDto
                        {
                            UsuarioId = chId,
                            Titulo = aprobar ? $"⚡ Solicitud Aprobada: {fNom}" : $"❌ Solicitud Rechazada: {fNom}",
                            Mensaje = aprobar 
                                ? $"El supervisor autorizó la 2da recolección de '{fNom}'. Ya puedes cargar litros." 
                                : $"La solicitud de recolección para '{fNom}' no fue aprobada.",
                            Tipo = "RESPUESTA_EXTRAORDINARIA",
                            ReferenciaId = solicitudId
                        });
                    }
                }
                catch { /* Tolerante */ }
            }

            return rows > 0;
        }
    }
}
